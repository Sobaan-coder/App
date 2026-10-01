import { route } from "@/lib/api";
import { withUser } from "@/lib/db";

export const GET = route({}, async ({ user }) => ({
  suggestions: await withUser(user.id, (db) => db.query("select * from automation_suggestions where status = 'pending' order by updated_at desc")),
}));
