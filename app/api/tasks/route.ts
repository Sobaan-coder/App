import { z } from "zod";
import { body, pageParams, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { parseTaskText } from "@/services/tasks/parse";
import { findProjectByName, insertTask, TASK_SELECT } from "@/services/tasks/repo";

export const GET = route({}, async ({ req, user }) => {
  const { limit, offset } = pageParams(req, 100);
  const status = query(req, "status");
  const projectId = query(req, "projectId");
  const q = query(req, "q");
  const statuses = status === "open" ? ["todo", "in_progress", "waiting"] : status ? status.split(",") : null;
  const tasks = await withUser(user.id, (db) =>
    db.query(
      `${TASK_SELECT} where ($1::text[] is null or t.status = any($1)) and ($2::uuid is null or t.project_id = $2) and ($3::text is null or t.title ilike $3)
       order by case when t.status in ('completed','cancelled','failed') then 1 else 0 end, t.due_at nulls last,
         case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, t.created_at desc
       limit $4 offset $5`,
      [statuses, projectId ?? null, q ? `%${q.replace(/[%_]/g, "")}%` : null, limit, offset],
    ),
  );
  return { tasks };
});

const createSchema = z.object({
  text: z.string().max(1000).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  projectId: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in_progress", "waiting", "completed", "failed", "cancelled"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  estimatedMinutes: z.number().int().positive().max(10000).nullable().optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  recurrence: z.string().max(60).nullable().optional(),
  dependsOn: z.array(z.string().uuid()).max(20).optional(),
});

/** Create from structured fields, or from natural language in `text` ("remind me tomorrow to …"). */
export const POST = route({ rateLimit: 60 }, async ({ req, user }) => {
  const i = await body(req, createSchema);
  return withUser(user.id, async (db) => {
    const profile = await getProfile(db);
    const parsed = i.text ? parseTaskText(i.text, { timezone: profile.timezone, workStart: profile.work_start }) : null;
    const projectId = i.projectId ?? (parsed?.projectName ? (await findProjectByName(db, parsed.projectName))?.id : null) ?? null;
    const task = await insertTask(db, user.id, {
      title: i.title ?? parsed?.title ?? "Untitled task",
      description: i.description,
      projectId,
      priority: i.priority ?? parsed?.priority,
      status: i.status,
      dueAt: i.dueAt ?? parsed?.dueAt,
      remindAt: parsed?.remindAt,
      estimatedMinutes: i.estimatedMinutes ?? parsed?.estimatedMinutes,
      tags: i.tags ?? parsed?.tags,
      recurrence: i.recurrence ?? parsed?.recurrence,
      source: "user",
    });
    for (const dep of i.dependsOn ?? []) await db.query("insert into task_dependencies(task_id, depends_on_task_id, user_id) values ($1,$2,$3) on conflict do nothing", [task.id, dep, user.id]);
    return { task, parsed };
  });
});
