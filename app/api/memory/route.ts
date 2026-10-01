import { z } from "zod";
import { body, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/activity";

const SECRET_RE = /\b(password|passcode|pin code|cvv|card number|ssn|social security|private key|seed phrase|api[_ ]?key)\b/i;

export const GET = route({}, async ({ req, user }) => {
  const category = query(req, "category");
  const q = query(req, "q");
  const memories = await withUser(user.id, (db) =>
    db.query(
      `select m.*, p.name as project_name from memories m left join projects p on p.id = m.project_id
       where ($1::text is null or m.category = $1) and ($2::text is null or m.subject ilike $2 or m.content ilike $2)
       order by m.category, m.importance desc, m.updated_at desc`,
      [category ?? null, q ? `%${q.replace(/[%_]/g, "")}%` : null],
    ),
  );
  return { memories };
});

export const POST = route({ rateLimit: 60 }, async ({ req, user }) => {
  const m = await body(
    req,
    z.object({ category: z.enum(["preference", "project", "business", "task", "general"]), subject: z.string().min(1).max(120), content: z.string().min(1).max(4000), projectId: z.string().uuid().nullable().optional(), importance: z.number().int().min(1).max(5).default(3) }),
  );
  if (SECRET_RE.test(m.content)) throw new AppError("Memory must not contain passwords, keys or card numbers.");
  return withUser(user.id, async (db) => {
    const row = await db.one("insert into memories(user_id, project_id, category, subject, content, importance) values ($1,$2,$3,$4,$5,$6) returning *", [
      user.id,
      m.projectId ?? null,
      m.category,
      m.subject,
      m.content,
      m.importance,
    ]);
    await logActivity(db, { userId: user.id, category: "memory", action: "memory.saved", message: `Remembered: ${m.subject}` });
    return { memory: row };
  });
});
