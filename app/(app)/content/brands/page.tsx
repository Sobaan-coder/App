"use client";
import { useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Input, Label, Modal, PageHeader, Textarea, useToast } from "@/components/ui";

interface Brand {
  id: string;
  name: string;
  legal_name: string;
  tagline: string;
  description: string;
  colors: string[];
  font_preferences: string;
  visual_style: string;
  tone: string;
  location: string;
  currency: string;
  contact: Record<string, string>;
  website: string;
  social_links: Record<string, string>;
  default_hashtags: string[];
  posting_time: string;
  is_default: boolean;
  product_count: number;
}
interface Product {
  id: string;
  brand_id: string;
  name: string;
  category: string;
  description: string;
  price: string | null;
  ingredients: string[];
  special_offer: string;
  available: boolean;
  marketing_notes: string;
  currency: string;
}

const splitList = (s: string) => s.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);

export default function BrandsPage() {
  const toast = useToast();
  const brands = useApi<{ brands: Brand[] }>("/api/content/brands");
  const [brandId, setBrandId] = useState<string | null>(null);
  const active = brands.data?.brands.find((b) => b.id === brandId) ?? brands.data?.brands[0];
  const products = useApi<{ products: Product[] }>(active ? `/api/content/products?brandId=${active.id}` : null);
  const [editBrand, setEditBrand] = useState<Partial<Brand> | null>(null);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);

  const saveBrand = async (f: FormData) => {
    const body = {
      name: f.get("name"),
      legal_name: f.get("legal_name"),
      tagline: f.get("tagline"),
      description: f.get("description"),
      colors: splitList(String(f.get("colors"))),
      font_preferences: f.get("font_preferences"),
      visual_style: f.get("visual_style"),
      tone: f.get("tone"),
      location: f.get("location"),
      currency: f.get("currency") || "USD",
      website: f.get("website"),
      contact: { phone: String(f.get("phone") ?? ""), email: String(f.get("email") ?? "") },
      default_hashtags: splitList(String(f.get("hashtags")).replace(/#/g, "")),
      posting_time: f.get("posting_time") || "19:00",
      is_default: f.get("is_default") === "on",
    };
    try {
      if (editBrand?.id) await api(`/api/content/brands/${editBrand.id}`, { method: "PATCH", body });
      else await api("/api/content/brands", { body });
      setEditBrand(null);
      brands.reload();
      toast("Brand saved", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const saveProduct = async (f: FormData) => {
    const price = String(f.get("price") ?? "").trim();
    const body = {
      brand_id: active!.id,
      name: f.get("name"),
      category: f.get("category"),
      description: f.get("description"),
      price: price === "" ? null : Number(price),
      ingredients: splitList(String(f.get("ingredients"))),
      special_offer: f.get("special_offer"),
      available: f.get("available") === "on",
      marketing_notes: f.get("marketing_notes"),
    };
    try {
      if (editProduct?.id) await api(`/api/content/products/${editProduct.id}`, { method: "PATCH", body });
      else await api("/api/content/products", { body });
      setEditProduct(null);
      products.reload();
      toast("Product saved", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Brands & Products"
        icon={<Package className="h-6 w-6" />}
        subtitle="Brand memory the content bot always follows. Prices here are the single source of truth — captions are checked against them."
        actions={
          <Button variant="primary" onClick={() => setEditBrand({ colors: [], default_hashtags: [], contact: {}, currency: "USD", posting_time: "19:00" })}>
            <Plus className="h-4 w-4" /> New brand
          </Button>
        }
      />
      <div className="flex gap-2 overflow-x-auto scrollbar-thin">
        {brands.data?.brands.map((b) => (
          <button key={b.id} onClick={() => setBrandId(b.id)} className={`shrink-0 rounded-xl border px-4 py-2 text-sm ${active?.id === b.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-panel"}`}>
            {b.name} {b.is_default && "★"}
          </button>
        ))}
      </div>
      {active && (
        <Card>
          <CardHeader title={active.legal_name || active.name} subtitle={active.tagline} action={<Button size="sm" onClick={() => setEditBrand(active)}>Edit brand</Button>} />
          <div className="grid gap-3 px-5 pb-5 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted">Colors</div>
              <div className="mt-1 flex gap-1.5">
                {active.colors.map((c) => (
                  <span key={c} className="h-7 w-7 rounded-lg border border-line" style={{ background: c }} title={c} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Visual style</div>
              <div>{active.visual_style || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Tone</div>
              <div>{active.tone || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Fonts</div>
              <div>{active.font_preferences || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Location · Contact · Website</div>
              <div>{[active.location, active.contact?.phone, active.website].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Hashtags · Posting time · Currency</div>
              <div>
                {active.default_hashtags.map((h) => `#${h}`).join(" ")} · {active.posting_time.slice(0, 5)} · {active.currency}
              </div>
            </div>
          </div>
        </Card>
      )}
      {active && (
        <Card>
          <CardHeader title="Products" action={<Button size="sm" variant="primary" onClick={() => setEditProduct({ available: true, ingredients: [] })}><Plus className="h-3.5 w-3.5" /> Add product</Button>} />
          {products.data && !products.data.products.length && <Empty title="No products" />}
          <div className="divide-y divide-line">
            {products.data?.products.map((p) => (
              <button key={p.id} onClick={() => setEditProduct(p)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-panel-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted">
                    {p.category} · {p.description}
                  </div>
                </div>
                {p.special_offer && <Badge tone="gold">{p.special_offer}</Badge>}
                {p.price === null ? <Badge tone="warn">no price set</Badge> : <Badge>{`${p.currency} ${Number(p.price).toLocaleString()}`}</Badge>}
                {!p.available && <Badge tone="bad">unavailable</Badge>}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!editBrand} onClose={() => setEditBrand(null)} title={editBrand?.id ? "Edit brand" : "New brand"} wide>
        {editBrand && (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveBrand(new FormData(e.currentTarget));
            }}
          >
            {[
              ["name", "Brand name", editBrand.name],
              ["legal_name", "Full name (e.g. THE MERCHANTS' COMPANY)", editBrand.legal_name],
              ["tagline", "Tagline", editBrand.tagline],
              ["colors", "Colors (hex, comma separated)", editBrand.colors?.join(", ")],
              ["font_preferences", "Font preferences", editBrand.font_preferences],
              ["visual_style", "Visual style", editBrand.visual_style],
              ["tone", "Tone of voice", editBrand.tone],
              ["location", "Location", editBrand.location],
              ["phone", "Phone", editBrand.contact?.phone],
              ["email", "Email", editBrand.contact?.email],
              ["website", "Website", editBrand.website],
              ["hashtags", "Default hashtags", editBrand.default_hashtags?.join(", ")],
              ["currency", "Currency (e.g. PKR, USD)", editBrand.currency],
              ["posting_time", "Default posting time (HH:MM)", editBrand.posting_time?.slice(0, 5)],
            ].map(([k, l, v]) => (
              <div key={k}>
                <Label>{l}</Label>
                <Input name={k as string} defaultValue={(v as string) ?? ""} required={k === "name"} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea name="description" rows={3} defaultValue={editBrand.description ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_default" defaultChecked={editBrand.is_default} /> Default brand
            </label>
            <div className="flex justify-end sm:col-span-2">
              <Button variant="primary" type="submit">
                Save brand
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title={editProduct?.id ? "Edit product" : "New product"} wide>
        {editProduct && (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProduct(new FormData(e.currentTarget));
            }}
          >
            <div>
              <Label>Name</Label>
              <Input name="name" required defaultValue={editProduct.name ?? ""} />
            </div>
            <div>
              <Label>Category</Label>
              <Input name="category" defaultValue={editProduct.category ?? "Pizza"} list="cats" />
              <datalist id="cats">
                {["Pizza", "Burger", "Wrap", "Shawarma", "Deals", "Drinks", "Sides"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label hint="(leave empty if unknown — captions won't mention a price)">Price ({active?.currency})</Label>
              <Input name="price" type="number" step="0.01" min={0} defaultValue={editProduct.price ?? ""} />
            </div>
            <div>
              <Label hint="(adding one triggers Deal Promotion automations)">Special offer</Label>
              <Input name="special_offer" defaultValue={editProduct.special_offer ?? ""} placeholder="Buy 1 Get 1 Free" />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea name="description" rows={2} defaultValue={editProduct.description ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Label>Ingredients (comma separated)</Label>
              <Input name="ingredients" defaultValue={editProduct.ingredients?.join(", ") ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Label>Marketing notes</Label>
              <Textarea name="marketing_notes" rows={2} defaultValue={editProduct.marketing_notes ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="available" defaultChecked={editProduct.available} /> Available (unavailable products are never promoted)
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              {editProduct.id && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    if (!confirm("Delete this product?")) return;
                    await api(`/api/content/products/${editProduct.id}`, { method: "DELETE" });
                    setEditProduct(null);
                    products.reload();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="primary" type="submit">
                Save product
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
