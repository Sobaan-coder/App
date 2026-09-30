import type { Db } from "@/lib/db";
import type { Brand, Product } from "./types";

export async function getBrand(db: Db, nameOrId?: string | null): Promise<Brand | null> {
  if (nameOrId) {
    const b = await db.one<Brand>("select * from brands where id::text = $1 or lower(name) = lower($1) or lower(name) like lower($2) order by is_default desc limit 1", [
      nameOrId,
      `%${nameOrId.replace(/[%_]/g, "")}%`,
    ]);
    if (b) return b;
  }
  return db.one<Brand>("select * from brands order by is_default desc, created_at limit 1");
}

/** Find a brand whose name appears in free text. */
export async function brandMentionedIn(db: Db, text: string): Promise<Brand | null> {
  const brands = await db.query<Brand>("select * from brands");
  const lower = text.toLowerCase();
  return brands.find((b) => lower.includes(b.name.toLowerCase().replace(/^the\s+/, "").replace(/['’]s?\b/g, "").trim())) ?? null;
}

export async function listProducts(db: Db, brandId: string): Promise<Product[]> {
  return db.query<Product>("select * from products where brand_id = $1 order by name", [brandId]);
}

/** Best product match for free text: longest product-name overlap, then category keyword. */
export function matchProduct(products: Product[], text: string): Product | null {
  const t = text.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  let best: { p: Product; score: number } | null = null;
  for (const p of products) {
    const words = norm(p.name).split(" ").filter((w) => w.length > 2 && !["merchants", "the", "and"].includes(w));
    const hits = words.filter((w) => new RegExp(`\\b${w}`).test(norm(t))).length;
    const score = norm(t).includes(norm(p.name)) ? 100 : hits / Math.max(1, words.length);
    if (score > 0.5 && (!best || score > best.score)) best = { p, score };
  }
  if (best) return best.p;
  const cat = products.find((p) => t.includes(p.category.toLowerCase()));
  return cat ?? null;
}

export function formatPrice(product: Product, currency: string): string | null {
  if (product.price === null || product.price === undefined || product.price === "") return null;
  const n = Number(product.price);
  if (!isFinite(n)) return null;
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
