import { sql, withTx, withUser, type Db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { isValidTimezone } from "@/lib/time";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  token_version: number;
  password_hash: string;
}

export async function signup(input: { email: string; password: string; name?: string; timezone?: string }): Promise<UserRow> {
  const email = input.email.trim().toLowerCase();
  const problem = passwordProblems(input.password);
  if (problem) throw new AppError(problem);
  const count = await sql.one<{ n: number }>("select count(*)::int as n from users");
  const first = (count?.n ?? 0) === 0;
  if (!first && !env().ALLOW_SIGNUP) throw new AppError("Sign-ups are closed. Ask the admin to create your account (ALLOW_SIGNUP=false).", 403, "signup_closed");
  const exists = await sql.one("select 1 from users where email = $1", [email]);
  if (exists) throw new AppError("An account with this email already exists", 409, "exists");
  const hash = await hashPassword(input.password);
  const tz = input.timezone && isValidTimezone(input.timezone) ? input.timezone : env().DEFAULT_TIMEZONE;
  const user = await withTx(async (db) => {
    const u = await db.one<UserRow>("insert into users(email, password_hash, name, role) values ($1,$2,$3,$4) returning *", [email, hash, input.name?.trim() || email.split("@")[0], first ? "admin" : "member"]);
    await db.query("insert into profiles(user_id, display_name, timezone) values ($1,$2,$3)", [u!.id, u!.name, tz]);
    return u!;
  });
  await withUser(user.id, (db) => seedUserWorkspace(db, user.id));
  return user;
}

export async function login(emailRaw: string, password: string): Promise<UserRow> {
  const email = emailRaw.trim().toLowerCase();
  const u = await sql.one<UserRow>("select * from users where email = $1", [email]);
  // constant-ish time: always run bcrypt
  const ok = await verifyPassword(password, u?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!u || !ok) throw new AppError("Wrong email or password", 401, "invalid_credentials");
  await sql.query("update users set last_login_at = now() where id = $1", [u.id]);
  return u;
}

/** Invalidate every session of a user (logout everywhere). */
export async function revokeSessions(userId: string) {
  await sql.query("update users set token_version = token_version + 1 where id = $1", [userId]);
}

/**
 * Starter workspace: example projects (MERCHANTS business + STUDY), the Merchants brand and
 * products. Products have NO prices on purpose — the system never invents prices; you add them.
 * Idempotent.
 */
export async function seedUserWorkspace(db: Db, userId: string) {
  const merchants = await db.one<{ id: string }>(
    `insert into projects(user_id, name, description, kind, color, sections) values ($1,'Merchants','Food brand: social content, products, deals and operations.','business','#b45309',
      '{Tasks,Files,Notes,Documents,Products,Content,Automations,Deadlines,Activity}')
     on conflict (user_id, name) do update set name = excluded.name returning id`,
    [userId],
  );
  await db.query(
    `insert into projects(user_id, name, description, kind, color, sections) values ($1,'Study','Subjects, chapters, notes, past papers, assignments, exams and revision plans.','study','#2563eb',
      '{Subjects,Chapters,Notes,"Past papers",Assignments,Exams,"Revision plans"}')
     on conflict (user_id, name) do nothing`,
    [userId],
  );
  const brand = await db.one<{ id: string }>(
    `insert into brands(user_id, project_id, name, legal_name, tagline, description, colors, font_preferences, visual_style, tone, default_hashtags, is_default, currency)
     values ($1,$2,'Merchants','THE MERCHANTS'' COMPANY','TRADING FLAVORS SINCE 2026',
       'A modern food brand with a warm merchant / trading-house identity.',
       '{#2b1a0f,#8a4b1c,#e8b04b}','Bold modern sans-serif headlines, elegant serif accents',
       'Modern, premium, Gen-Z food advertising with a warm merchant/trading-house aesthetic',
       'Confident, playful, premium — short punchy lines, tasteful emojis',
       '{merchants,tradingflavors}', true, 'PKR')
     on conflict (user_id, name) do update set name = excluded.name returning id`,
    [userId, merchants!.id],
  );
  const products: [string, string, string, string[]][] = [
    ["Merchants Crown Crust Pizza", "Pizza", "Signature pizza with a golden, cheese-stuffed crown crust.", ["mozzarella", "tomato sauce", "stuffed crust"]],
    ["Zinger Burger", "Burger", "Crispy fried chicken fillet burger with house sauce.", ["crispy chicken", "lettuce", "house sauce", "brioche bun"]],
    ["Special Pizza", "Pizza", "House special pizza loaded with toppings.", ["mozzarella", "chicken", "peppers", "olives"]],
    ["Chicken Shawarma Wrap", "Wrap", "Grilled chicken shawarma wrapped with garlic sauce.", ["chicken", "garlic sauce", "pickles", "flatbread"]],
  ];
  for (const [name, category, description, ingredients] of products) {
    await db.query(
      `insert into products(user_id, brand_id, name, category, description, ingredients, marketing_notes) values ($1,$2,$3,$4,$5,$6,'Set the price in Products before promoting it.')
       on conflict (brand_id, name) do nothing`,
      [userId, brand!.id, name, category, description, ingredients],
    );
  }
  const hasTasks = await db.one("select 1 from tasks limit 1");
  if (!hasTasks) {
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();
    await db.query(
      `insert into tasks(user_id, project_id, title, priority, due_at, source, tags) values
        ($1, $2, 'Set prices for Merchants products', 'high', $3, 'ai', '{setup}'),
        ($1, null, 'Try the command box: "Plan my day"', 'medium', null, 'ai', '{onboarding}')`,
      [userId, merchants!.id, tomorrow],
    );
  }
  for (const p of ["instagram", "facebook", "tiktok", "youtube", "snapchat"]) {
    await db.query("insert into social_accounts(user_id, brand_id, platform, status) values ($1,$2,$3,'manual') on conflict (user_id, platform) do nothing", [userId, brand!.id, p]);
  }
}
