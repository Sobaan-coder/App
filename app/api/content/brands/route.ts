import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { brandSchema } from "@/services/content/schemas";


export const GET = route({}, async ({ user }) => ({
  brands: await withUser(user.id, (db) => db.query("select b.*, (select count(*)::int from products p where p.brand_id = b.id) as product_count from brands b order by is_default desc, name")),
}));

export const POST = route({ rateLimit: 30 }, async ({ req, user }) => {
  const b = await body(req, brandSchema);
  return withUser(user.id, async (db) => {
    if (b.is_default) await db.query("update brands set is_default = false");
    const brand = await db.one(
      `insert into brands(user_id, project_id, name, legal_name, tagline, description, colors, font_preferences, visual_style, tone, location, currency, contact, website, social_links, default_hashtags, posting_time, is_default)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
      [user.id, b.project_id ?? null, b.name, b.legal_name, b.tagline, b.description, b.colors, b.font_preferences, b.visual_style, b.tone, b.location, b.currency, JSON.stringify(b.contact), b.website, JSON.stringify(b.social_links), b.default_hashtags.map((h) => h.replace(/^#/, "")), b.posting_time, b.is_default],
    );
    return { brand };
  });
});
