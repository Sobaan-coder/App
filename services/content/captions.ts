import { z } from "zod";
import type { Db } from "@/lib/db";
import { generateJson } from "@/services/ai/router";
import { pick, seeded } from "@/services/ai/offline";
import { formatPrice } from "./brand";
import { PLATFORM_LIMITS, type Brand, type CaptionSet, type Platform, type Product } from "./types";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildHashtags(brand: Brand, product: Product | null, category: string, platform: Platform): string[] {
  const base = brand.default_hashtags.map((h) => h.replace(/^#/, ""));
  const cat = slug(product?.category ?? category);
  const topical = cat ? [cat, `${cat}lover`, `${cat}time`] : [];
  const prod = product ? [slug(product.name).slice(0, 30)] : [];
  const loc = brand.location
    .split(/[,\s]+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .flatMap((w) => [slug(w), `${slug(w)}food`]);
  const plat: Record<Platform, string[]> = {
    instagram: ["foodie", "instafood", "foodphotography"],
    facebook: [],
    tiktok: ["foodtok", "fyp"],
    youtube: ["shorts", "food"],
    snapchat: [],
  };
  const all = [...new Set([slug(brand.name), ...base, ...prod, ...topical, ...loc, ...plat[platform]].filter((h) => h && h.length >= 3))];
  return all.slice(0, Math.min(PLATFORM_LIMITS[platform].hashtags, platform === "instagram" ? 15 : platform === "facebook" ? 4 : platform === "snapchat" ? 2 : 6)).map((h) => `#${h}`);
}

const HOOKS = [
  "Warning: this might ruin every other {cat} for you.",
  "Your cravings called. We answered.",
  "This is your sign to treat yourself today.",
  "Fresh out of the oven and straight to your feed.",
  "Some things are worth the hype. This is one of them.",
  "Stop scrolling — dinner is sorted.",
];
const CTAS = ["Order now", "Come hungry", "Tag the friend you'd share this with (or not 👀)", "Tap to order", "Visit us today"];

/** Deterministic, brand-aware caption writer (used when no AI model is configured). */
export function offlineCaptions(brand: Brand, product: Product | null, idea: string, category: string, platforms: Platform[], seed = ""): CaptionSet[] {
  const rnd = seeded(`${brand.name}${product?.name}${idea}${seed}`);
  const cat = (product?.category ?? category ?? "food").toLowerCase();
  const name = product?.name ?? idea ?? brand.name;
  const price = product && product.available ? formatPrice(product, brand.currency) : null;
  const offer = product?.special_offer?.trim();
  const desc = product?.description?.trim() || idea;
  const ingredients = product?.ingredients?.length ? product.ingredients.slice(0, 5).join(", ") : "";
  const hook = pick(HOOKS, rnd).replace("{cat}", cat);
  const cta = pick(CTAS, rnd);
  const contact = [brand.location && `📍 ${brand.location}`, brand.contact?.phone && `📞 ${brand.contact.phone}`, brand.website && `🌐 ${brand.website}`].filter(Boolean).join("\n");
  const sig = brand.tagline ? `${brand.name} — ${brand.tagline}` : brand.name;

  return platforms.map((platform) => {
    const tags = buildHashtags(brand, product, category, platform);
    switch (platform) {
      case "instagram":
        return {
          platform,
          title: name,
          caption: [hook, "", `✨ ${name}${desc && desc !== name ? ` — ${desc}` : ""}`, ingredients ? `🧀 ${ingredients}` : "", offer ? `🔥 ${offer}` : "", price ? `💰 ${price}` : "", "", `${cta} 👇`, contact, "", sig]
            .filter((l, i, a) => l !== "" || a[i - 1] !== "")
            .join("\n")
            .trim(),
          hashtags: tags,
        };
      case "facebook":
        return {
          platform,
          title: name,
          caption: [`${hook}`, "", `Meet ${name}. ${desc && desc !== name ? desc : ""}`.trim(), ingredients ? `Made with ${ingredients}.` : "", offer ? `Right now: ${offer}.` : "", price ? `Price: ${price}.` : "", "", `${cta}!`, contact, "", sig]
            .filter((l, i, a) => l !== "" || a[i - 1] !== "")
            .join("\n")
            .trim(),
          hashtags: tags,
        };
      case "tiktok":
        return {
          platform,
          title: name,
          caption: `${pick(["POV:", "Rate this 1-10:", "Wait for it…", "Tell me you're hungry without telling me"], rnd)} ${name}${offer ? ` (${offer})` : ""} 🤤`,
          hashtags: tags,
          extra: {
            videoConcept: [
              "0-1s: extreme close-up hook (cheese pull / sizzle / steam)",
              `1-4s: quick cuts of ${name} being prepared`,
              "4-7s: hero reveal on the table, slow push-in",
              `7-9s: text overlay "${brand.name}"${offer ? ` + "${offer}"` : ""}`,
              "Audio: trending upbeat sound (pick in the TikTok app)",
            ],
          },
        };
      case "youtube":
        return {
          platform,
          title: `${name} | ${brand.name} #shorts`.slice(0, 100),
          caption: [`${name} — ${desc || "made fresh"}.`, offer ? `${offer}.` : "", price ? `Price: ${price}.` : "", "", `${brand.name}${brand.tagline ? ` · ${brand.tagline}` : ""}`, contact].filter(Boolean).join("\n"),
          hashtags: tags,
          extra: { tags: tags.map((t) => t.slice(1)), privacyStatus: "private" },
        };
      case "snapchat":
        return { platform, title: name, caption: `${name}${offer ? ` · ${offer}` : ""} 🔥 ${brand.name}`.slice(0, 240), hashtags: tags };
    }
  });
}

const aiSchema = z.object({
  instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) }).optional(),
  facebook: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) }).optional(),
  tiktok: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]), video_concept: z.array(z.string()).default([]) }).optional(),
  youtube: z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()).default([]) }).optional(),
  snapchat: z.object({ caption: z.string() }).optional(),
});

/** Platform-optimised captions: AI when available (facts from YOUR database only), else offline templates. */
export async function generateCaptions(
  db: Db,
  userId: string,
  opts: { brand: Brand; product: Product | null; idea: string; category: string; platforms: Platform[]; seed?: string },
): Promise<{ captions: CaptionSet[]; engine: string }> {
  const { brand, product, platforms } = opts;
  const offline = offlineCaptions(brand, product, opts.idea, opts.category, platforms, opts.seed);
  const price = product && product.available ? formatPrice(product, brand.currency) : null;
  const facts = {
    brand: { name: brand.name, legal_name: brand.legal_name, tagline: brand.tagline, tone: brand.tone, style: brand.visual_style, location: brand.location, website: brand.website, phone: brand.contact?.phone },
    product: product ? { name: product.name, category: product.category, description: product.description, ingredients: product.ingredients, price, special_offer: product.special_offer || null, available: product.available } : null,
    idea: opts.idea,
  };
  const ai = await generateJson(
    db,
    userId,
    {
      task: "caption_generate",
      tier: "fast",
      temperature: 0.8,
      system: `You are a social media copywriter. Write DIFFERENT captions optimised for each platform: ${platforms.join(", ")}.
Rules: use ONLY the facts provided. If price is null, do not mention any price. Never invent offers, discounts, claims (e.g. "free delivery", "halal", "best in town") or contact details. Keep brand name spelled exactly. Tone: ${brand.tone || "friendly, modern"}.
Limits: instagram ≤ 2200 chars + up to 15 hashtags; facebook conversational + up to 4 hashtags; tiktok short punchy caption + 3-6 hashtags + 4-6 shot video concept; youtube title ≤ 90 chars (include #shorts) + description + tags; snapchat ≤ 200 chars.
Respond with JSON: {"instagram":{"caption","hashtags"},"facebook":{"caption","hashtags"},"tiktok":{"caption","hashtags","video_concept"},"youtube":{"title","description","tags"},"snapchat":{"caption"}} (only the requested platforms).`,
      prompt: `Facts (from the business database, trusted):\n${JSON.stringify(facts, null, 2)}`,
    },
    (v) => {
      const p = aiSchema.safeParse(v);
      return p.success ? p.data : null;
    },
  );
  if (!ai) return { captions: offline, engine: "offline (templates)" };
  const fixTags = (tags: string[], p: Platform) => {
    const clean = tags.map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`).filter((t) => t.length > 2);
    return (clean.length ? clean : offline.find((o) => o.platform === p)!.hashtags).slice(0, PLATFORM_LIMITS[p].hashtags);
  };
  const captions = offline.map((o): CaptionSet => {
    const v = ai.value;
    switch (o.platform) {
      case "instagram":
        return v.instagram ? { ...o, caption: v.instagram.caption, hashtags: fixTags(v.instagram.hashtags, "instagram") } : o;
      case "facebook":
        return v.facebook ? { ...o, caption: v.facebook.caption, hashtags: fixTags(v.facebook.hashtags, "facebook") } : o;
      case "tiktok":
        return v.tiktok ? { ...o, caption: v.tiktok.caption, hashtags: fixTags(v.tiktok.hashtags, "tiktok"), extra: { videoConcept: v.tiktok.video_concept.length ? v.tiktok.video_concept : o.extra?.videoConcept } } : o;
      case "youtube":
        return v.youtube ? { ...o, title: v.youtube.title.slice(0, 100), caption: v.youtube.description, hashtags: fixTags(v.youtube.tags, "youtube"), extra: { tags: v.youtube.tags, privacyStatus: "private" } } : o;
      case "snapchat":
        return v.snapchat ? { ...o, caption: v.snapchat.caption.slice(0, 250) } : o;
    }
  });
  return { captions, engine: `${ai.provider}:${ai.model}` };
}
