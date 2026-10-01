import { query, route } from "@/lib/api";
import { withUser } from "@/lib/db";

export const GET = route({}, async ({ req, user }) => {
  const status = query(req, "status") ?? "pending";
  const approvals = await withUser(user.id, (db) =>
    db.query(
      `select a.*, r.title as run_title, r.status as run_status from approvals a left join automation_runs r on r.id = a.run_id
       where ($1 = 'all' or a.status = $1) order by a.created_at desc limit 100`,
      [status],
    ),
  );
  return { approvals };
});
