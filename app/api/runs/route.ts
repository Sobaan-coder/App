import { pageParams, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";

export const GET = route({}, async ({ req, user }) => {
  const { limit, offset } = pageParams(req, 30);
  const status = query(req, "status");
  const automationId = query(req, "automationId");
  const statuses = status === "active" ? ["queued", "running", "waiting", "approval_required"] : status ? status.split(",") : null;
  const runs = await withUser(user.id, (db) =>
    db.query(
      `select r.id, r.title, r.status, r.source, r.intent, r.progress, r.current_step, r.error, r.created_at, r.started_at, r.finished_at, r.automation_id,
         jsonb_array_length(r.plan->'steps') as total_steps, r.plan->'steps'->r.current_step->>'action' as current_action, r.result->>'summary' as summary
       from automation_runs r
       where ($1::text[] is null or r.status = any($1)) and ($2::uuid is null or r.automation_id = $2)
       order by r.created_at desc limit $3 offset $4`,
      [statuses, automationId ?? null, limit, offset],
    ),
  );
  return { runs };
});
