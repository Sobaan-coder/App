import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";

export const GET = route({}, async ({ user }) => {
  return withUser(user.id, async (db) => ({
    notifications: await db.query("select id, title, body, level, link, channels, read_at, created_at from notifications order by created_at desc limit 50"),
    unread: (await db.one<{ n: number }>("select count(*)::int as n from notifications where read_at is null"))?.n ?? 0,
  }));
});

export const POST = route({}, async ({ req, user }) => {
  const p = await body(req, z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }));
  await withUser(user.id, (db) =>
    p.all ? db.query("update notifications set read_at = now() where read_at is null") : db.query("update notifications set read_at = now() where id = any($1)", [p.ids ?? []]),
  );
  return { ok: true };
});
