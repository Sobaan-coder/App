import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { logActivity } from "@/lib/activity";
import { fireEvent } from "@/automations/service";
import { productSchema } from "@/services/content/schemas";

export const PATCH = route<{ id: string }>({ rateLimit: 60 }, async ({ req, user, params }) => {
  const p = await body(req, productSchema.partial());
  const { product, newOffer } = await withUser(user.id, async (db) => {
    const before = await db.one<{ special_offer: string; price: string | null; name: string }>("select special_offer, price, name from products where id = $1", [params.id]);
    if (!before) throw notFound("Product");
    const sets: string[] = [];
    const vals: unknown[] = [params.id];
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue;
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
    const product = sets.length ? await db.one<{ id: string; name: string; special_offer: string }>(`update products set ${sets.join(", ")} where id = $1 returning *`, vals) : await db.one<{ id: string; name: string; special_offer: string }>("select * from products where id = $1", [params.id]);
    if (p.price !== undefined && String(p.price) !== String(before.price ?? null))
      await logActivity(db, { userId: user.id, category: "content", action: "product.price_changed", status: "warning", message: `Price of ${before.name} changed: ${before.price ?? "—"} → ${p.price ?? "—"}` });
    return { product: product!, newOffer: Boolean(p.special_offer && p.special_offer !== before.special_offer) };
  });
  if (newOffer) await fireEvent(user.id, "deal_added", { productId: product.id, productName: product.name, offer: product.special_offer });
  return { product };
});

export const DELETE = route<{ id: string }>({}, async ({ user, params }) => {
  const r = await withUser(user.id, (db) => db.one("delete from products where id = $1 returning id", [params.id]));
  if (!r) throw notFound("Product");
  return { ok: true };
});
