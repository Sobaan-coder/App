import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { logActivity } from "@/lib/activity";

export const PATCH = route<{ id: string }>({}, async ({ req, user, params }) => {
  const p = await body(req, z.object({ subject: z.string().min(1).max(120).optional(), content: z.string().min(1).max(4000).optional(), category: z.enum(["preference", "project", "business", "task", "general"]).optional(), importance: z.number().int().min(1).max(5).optional() }));
  const m = await withUser(user.id, (db) =>
    db.one("update memories set subject = coalesce($2, subject), content = coalesce($3, content), category = coalesce($4, category), importance = coalesce($5, importance) where id = $1 returning *", [
      params.id,
      p.subject ?? null,
      p.content ?? null,
      p.category ?? null,
      p.importance ?? null,
    ]),
  );
  if (!m) throw notFound("Memory");
  return { memory: m };
});

/** "Forget this." */
export const DELETE = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const m = await db.one<{ subject: string }>("delete from memories where id = $1 returning subject", [params.id]);
    if (!m) throw notFound("Memory");
    await logActivity(db, { userId: user.id, category: "memory", action: "memory.forgotten", message: `Forgot: ${m.subject}` });
    return { ok: true };
  });
});
