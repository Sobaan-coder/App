import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { TASK_SELECT } from "@/services/tasks/repo";

export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const project = await db.one("select * from projects where id = $1", [params.id]);
    if (!project) throw notFound("Project");
    const [tasks, files, memories, automations, activity, brands] = await Promise.all([
      db.query(`${TASK_SELECT} where t.project_id = $1 order by case when t.status in ('completed','cancelled') then 1 else 0 end, t.due_at nulls last limit 200`, [params.id]),
      db.query("select id, name, folder, mime, size_bytes, created_at from files where project_id = $1 and not archived order by created_at desc limit 100", [params.id]),
      db.query("select id, category, subject, content, updated_at from memories where project_id = $1 order by updated_at desc", [params.id]),
      db.query("select id, name, enabled, trigger_type, last_run_at from automations where project_id = $1", [params.id]),
      db.query("select a.created_at, a.message, a.status from activity_logs a join automation_runs r on r.id = a.run_id where r.project_id = $1 order by a.created_at desc limit 30", [params.id]),
      db.query("select id, name from brands where project_id = $1", [params.id]),
    ]);
    return { project, tasks, files, memories, automations, activity, brands };
  });
});

export const PATCH = route<{ id: string }>({}, async ({ req, user, params }) => {
  const p = await body(
    req,
    z.object({ name: z.string().min(1).max(80).optional(), description: z.string().max(2000).optional(), status: z.enum(["active", "paused", "completed", "archived"]).optional(), deadline: z.string().date().nullable().optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }),
  );
  const project = await withUser(user.id, (db) =>
    db.one(
      `update projects set name = coalesce($2, name), description = coalesce($3, description), status = coalesce($4, status),
         deadline = case when $5::boolean then $6::date else deadline end, color = coalesce($7, color) where id = $1 returning *`,
      [params.id, p.name ?? null, p.description ?? null, p.status ?? null, p.deadline !== undefined, p.deadline ?? null, p.color ?? null],
    ),
  );
  if (!project) throw notFound("Project");
  return { project };
});
