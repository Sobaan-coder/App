import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { brandSchema } from "@/services/content/schemas";

export const PATCH = route<{ id: string }>({ rateLimit: 60 }, async ({ req, user, params }) => {
  const b = await body(req, brandSchema.partial());
  return withUser(user.id, async (db) => {
    if (b.is_default) await db.query("update brands set is_default = false where id <> $1", [params.id]);
    const sets: string[] = [];
    const vals: unknown[] = [params.id];
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      vals.push(k === "contact" || k === "social_links" ? JSON.stringify(v) : k === "default_hashtags" ? (v as string[]).map((h) => h.replace(/^#/, "")) : v);
      sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) return { brand: await db.one("select * from brands where id = $1", [params.id]) };
    const brand = await db.one(`update brands set ${sets.join(", ")} where id = $1 returning *`, vals);
    if (!brand) throw notFound("Brand");
    return { brand };
  });
});

export const DELETE = route<{ id: string }>({}, async ({ user, params }) => {
  const r = await withUser(user.id, (db) => db.one("delete from brands where id = $1 returning id", [params.id]));
  if (!r) throw notFound("Brand");
  return { ok: true };
});
