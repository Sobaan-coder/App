import { pick, seeded } from "@/services/ai/offline";
import type { Brand, Platform, Product } from "./types";

/**
 * IMAGE PROMPT ENGINE — turns brand + product + idea into a complete, structured
 * image-generation brief (concept, camera, lighting, composition, typography, negatives, size).
 */

export type ImageTemplateKey = "food_hero" | "flat_lay" | "deal_poster" | "lifestyle" | "behind_the_scenes" | "brand_story";

export interface ImagePromptSpec {
  template: ImageTemplateKey;
  concept: string;
  prompt: string;
  negativePrompt: string;
  composition: string;
  camera: string;
  lens: string;
  lighting: string;
  foodStyling: string;
  background: string;
  typography: string;
  brandInstructions: string;
  mood: string;
  aspectRatio: string;
  width: number;
  height: number;
}

const NEGATIVES = [
  "distorted food",
  "duplicate products",
  "incorrect ingredients",
  "extra products",
  "unreadable text",
  "fake logos",
  "deformed hands",
  "unrealistic cheese",
  "floating objects",
  "excessive text",
  "watermarks",
  "low resolution",
  "oversaturated colors",
];

export const SIZES: Record<Platform | "square", { w: number; h: number; ratio: string }> = {
  instagram: { w: 1080, h: 1350, ratio: "4:5" },
  facebook: { w: 1080, h: 1350, ratio: "4:5" },
  tiktok: { w: 1080, h: 1920, ratio: "9:16" },
  youtube: { w: 1080, h: 1920, ratio: "9:16" },
  snapchat: { w: 1080, h: 1920, ratio: "9:16" },
  square: { w: 1080, h: 1080, ratio: "1:1" },
};

const CAMERAS = ["45-degree hero angle", "eye-level close-up", "low three-quarter angle", "overhead top-down"];
const LENSES = ["100mm macro, f/2.8", "85mm, f/1.8 shallow depth of field", "50mm, f/4"];
const LIGHTING = [
  "warm key light from the left with soft golden rim light, gentle steam visible",
  "moody low-key lighting with warm amber highlights",
  "soft diffused window light with warm bounce",
  "dramatic side light with rich shadows and glowing highlights",
];

export function chooseTemplate(category: string, idea: string, product?: Product | null): ImageTemplateKey {
  const t = `${category} ${idea}`.toLowerCase();
  if (/deal|offer|discount|buy 1|bogo|promo|sale|% off/.test(t) || product?.special_offer) return "deal_poster";
  if (/behind|kitchen|making|chef|staff|prep/.test(t)) return "behind_the_scenes";
  if (/customer|people|friends|family|lifestyle|experience/.test(t)) return "lifestyle";
  if (/story|brand|history|about us|since/.test(t)) return "brand_story";
  if (/flat ?lay|spread|menu|combo|platter/.test(t)) return "flat_lay";
  return "food_hero";
}

export function buildImagePrompt(opts: {
  brand: Brand;
  product?: Product | null;
  idea?: string;
  category?: string;
  platform?: Platform | "square";
  template?: ImageTemplateKey;
  seed?: string;
}): ImagePromptSpec {
  const { brand, product } = opts;
  const rnd = seeded(opts.seed ?? `${brand.name}:${product?.name ?? ""}:${opts.idea ?? ""}`);
  const template = opts.template ?? chooseTemplate(opts.category ?? product?.category ?? "", opts.idea ?? "", product);
  const size = SIZES[opts.platform ?? "instagram"];
  const subject = product?.name ?? opts.idea ?? `${brand.name} signature dish`;
  const details = [product?.description, product?.ingredients?.length ? `made with ${product.ingredients.join(", ")}` : ""].filter(Boolean).join("; ");
  const colors = brand.colors.length ? brand.colors.join(", ") : "warm neutrals";
  const brandStyle = `${brand.visual_style || "modern premium food advertising"}; brand palette ${colors}`;
  const camera = template === "flat_lay" ? "overhead top-down" : pick(CAMERAS.slice(0, 3), rnd);
  const lens = template === "flat_lay" ? "35mm, f/5.6, everything in focus" : pick(LENSES, rnd);
  const lighting = pick(LIGHTING, rnd);

  const byTemplate: Record<ImageTemplateKey, { concept: string; composition: string; background: string; mood: string; typography: string }> = {
    food_hero: {
      concept: `Hero shot of ${subject} as the single star of the frame`,
      composition: "single product centred slightly low, rule of thirds, generous negative space at the top for a headline",
      background: `dark textured surface (aged wood or slate) with subtle ${brand.visual_style.includes("merchant") || /merchant/i.test(brand.name) ? "trading-house props: brass scales, spice sacks, parchment" : "complementary props"}, softly out of focus`,
      mood: "appetising, premium, irresistible",
      typography: `optional short headline "${product?.name ?? brand.name}" in the top negative space, bold modern sans-serif, max 4 words`,
    },
    flat_lay: {
      concept: `Styled flat-lay of ${subject} with complementary sides and ingredients`,
      composition: "top-down grid composition, main product centred, supporting items around the edges",
      background: "clean textured tabletop in brand colours",
      mood: "abundant, shareable, social",
      typography: "no text in image (captions carry the message)",
    },
    deal_poster: {
      concept: `Promotional poster for ${subject}${product?.special_offer ? ` — ${product.special_offer}` : ""}`,
      composition: "product on the lower two thirds, large clear space top for the offer headline, strong visual hierarchy",
      background: `bold gradient in brand colours (${colors}) with subtle texture`,
      mood: "energetic, urgent, exciting",
      typography: `large legible offer text${product?.special_offer ? ` "${product.special_offer}"` : ""}, brand name small at the bottom; spell every word exactly`,
    },
    lifestyle: {
      concept: `Candid moment of friends enjoying ${subject}`,
      composition: "product in sharp focus in the foreground, happy people softly blurred behind, natural poses",
      background: "cosy modern restaurant interior with warm bokeh lights",
      mood: "warm, social, authentic Gen-Z energy",
      typography: "no text in image",
    },
    behind_the_scenes: {
      concept: `Behind the scenes: ${subject} being prepared by hand in the kitchen`,
      composition: "action shot, hands and product in frame, motion (flour dust, steam, cheese pull)",
      background: "clean professional kitchen, stainless steel, warm lights",
      mood: "craft, authenticity, care",
      typography: "no text in image",
    },
    brand_story: {
      concept: `Brand story visual for ${brand.name}${brand.tagline ? ` — "${brand.tagline}"` : ""}`,
      composition: "symbolic still life with signature product and heritage props, centred",
      background: `rich textured backdrop in ${colors}`,
      mood: "heritage, trust, premium",
      typography: brand.tagline ? `tagline "${brand.tagline}" in elegant serif, spelled exactly` : "brand name only",
    },
  };
  const t = byTemplate[template];
  const foodStyling =
    template === "lifestyle" || template === "brand_story"
      ? "food looks fresh and realistic"
      : "fresh, glossy, realistic textures; accurate ingredients only; natural cheese stretch; crisp edges; no extra items";
  const brandInstructions = `Brand: ${brand.name}${brand.legal_name ? ` (${brand.legal_name})` : ""}${brand.tagline ? `, tagline "${brand.tagline}"` : ""}. Style: ${brandStyle}. Do not invent or alter logos.`;

  const prompt = [
    `Create a photorealistic premium commercial food photograph of: ${subject}.`,
    details ? `Main subject details: ${details}.` : "",
    `Quantity: exactly one ${subject}${template === "flat_lay" ? " plus complementary sides" : ""}.`,
    `Concept: ${t.concept}.`,
    `Food appearance: ${foodStyling}.`,
    `Camera: ${camera}. Lens: ${lens}.`,
    `Lighting: ${lighting}.`,
    `Composition: ${t.composition}.`,
    `Background: ${t.background}.`,
    `Brand aesthetic: ${brandStyle}.`,
    `Mood: ${t.mood}.`,
    `Typography: ${t.typography}.`,
    `Aspect ratio: ${size.ratio} (${size.w}x${size.h}).`,
    `Avoid: ${NEGATIVES.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    template,
    concept: t.concept,
    prompt,
    negativePrompt: NEGATIVES.join(", "),
    composition: t.composition,
    camera,
    lens,
    lighting,
    foodStyling,
    background: t.background,
    typography: t.typography,
    brandInstructions,
    mood: t.mood,
    aspectRatio: size.ratio,
    width: size.w,
    height: size.h,
  };
}
