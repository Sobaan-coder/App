import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { projectCreate } from "@/tools/impl/tasks";
import { getSettings } from "@/lib/settings";

export const GET = route({}, async ({ user }) => {
  const projects = await withUser(user.id, (db) =>
    db.query(
      `select p.*, (select count(*)::int from tasks t where t.project_id = p.id and t.status in ('todo','in_progress','waiting')) as open_tasks,
         (select count(*)::int from tasks t where t.project_id = p.id and t.status = 'completed') as done_tasks,
         (select count(*)::int from files f where f.project_id = p.id and not f.archived) as files,
         (select min(t.due_at) from tasks t where t.project_id = p.id and t.status in ('todo','in_progress','waiting') and t.due_at > now()) as next_deadline
       from projects p where p.status <> 'archived' order by p.created_at`,
    ),
  );
  return { projects };
});

export const POST = route({ rateLimit: 30 }, async ({ req, user }) => {
  const i = await body(req, z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(2000).default(""), kind: z.enum(["general", "business", "study", "personal"]).default("general") }));
  return withUser(user.id, async (db) => projectCreate.execute(i, { userId: user.id, db, settings: await getSettings(db), log: async () => {} }));
});
