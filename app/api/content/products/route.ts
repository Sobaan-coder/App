import { body, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { fireEvent } from "@/automations/service";
import { productSchema } from "@/services/content/schemas";


export const GET = route({}, async ({ req, user }) => {
  const brandId = query(req, "brandId");
  return { products: await withUser(user.id, (db) => db.query("select p.*, b.name as brand_name, b.currency from products p join brands b on b.id = p.brand_id where ($1::uuid is null or p.brand_id = $1) order by b.name, p.category, p.name", [brandId ?? null])) };
});

export const POST = route({ rateLimit: 60 }, async ({ req, user }) => {
  const p = await body(req, productSchema);
  const product = await withUser(user.id, async (db) => {
    const row = await db.one<{ id: string; name: string }>(
      `insert into products(user_id, brand_id, name, category, description, price, ingredients, special_offer, available, marketing_notes, image_file_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [user.id, p.brand_id, p.name, p.category, p.description, p.price, p.ingredients, p.special_offer, p.available, p.marketing_notes, p.image_file_id ?? null],
    );
    await logActivity(db, { userId: user.id, category: "content", action: "product.created", message: `Product added: ${p.name}` });
    return row!;
  });
  // PRODUCT LAUNCH / DEAL PROMOTION automations
  await fireEvent(user.id, "product_added", { productId: product.id, productName: product.name });
  if (p.special_offer) await fireEvent(user.id, "deal_added", { productId: product.id, productName: product.name, offer: p.special_offer });
  return { product };
});
