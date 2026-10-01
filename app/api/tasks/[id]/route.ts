import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { logActivity } from "@/lib/activity";
import { completeAwareUpdate } from "@/tools/impl/tasks";
import type { Task } from "@/services/tasks/types";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["todo", "in_progress", "waiting", "completed", "failed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  estimatedMinutes: z.number().int().positive().max(10000).nullable().optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
});

export const PATCH = route<{ id: string }>({ rateLimit: 120 }, async ({ req, user, params }) => {
  const p = await body(req, patchSchema);
  return withUser(user.id, async (db) => {
    const task = await db.one<Task>("select * from tasks where id = $1", [params.id]);
    if (!task) throw notFound("Task");
    const updated = await completeAwareUpdate(db, user.id, task, p);
    if (p.status && p.status !== task.status) await logActivity(db, { userId: user.id, category: "tasks", action: "task.status", message: `Task "${task.title}" → ${p.status.replace("_", " ")}` });
    return { task: updated };
  });
});

export const DELETE = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const t = await db.one<{ title: string }>("delete from tasks where id = $1 returning title", [params.id]);
    if (!t) throw notFound("Task");
    await logActivity(db, { userId: user.id, category: "tasks", action: "task.deleted", message: `Deleted task "${t.title}"` });
    return { ok: true };
  });
});
