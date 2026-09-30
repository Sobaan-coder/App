import fs from "node:fs";
import path from "node:path";
import { withTx, sql } from "@/lib/db";

const DIR = path.join(process.cwd(), "database", "migrations");

/** Apply pending SQL migrations in filename order. Idempotent. */
export async function migrate(log: (m: string) => void = console.log): Promise<string[]> {
  await sql.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await sql.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const text = fs.readFileSync(path.join(DIR, f), "utf8");
    await withTx(async (db) => {
      await db.query(text);
      await db.query("insert into schema_migrations(name) values ($1)", [f]);
    });
    log(`  ✓ applied ${f}`);
    ran.push(f);
  }
  return ran;
}

/** DESTRUCTIVE: drops every table in the public schema. Refuses in production. */
export async function resetDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  await sql.query("drop schema public cascade; create schema public; grant all on schema public to public;");
}
