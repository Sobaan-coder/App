import { pageParams, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";

export const GET = route({}, async ({ req, user }) => {
  const { limit, offset } = pageParams(req, 100);
  const status = query(req, "status");
  const category = query(req, "category");
  const q = query(req, "q");
  const items = await withUser(user.id, (db) =>
    db.query(
      `select id, created_at, category, action, tool, status, message, run_id, details from activity_logs
       where ($1::text is null or status = $1) and ($2::text is null or category = $2) and ($3::text is null or message ilike $3)
       order by created_at desc limit $4 offset $5`,
      [status ?? null, category ?? null, q ? `%${q.replace(/[%_]/g, "")}%` : null, limit, offset],
    ),
  );
  return { items };
});
