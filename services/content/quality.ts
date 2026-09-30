import { jaccard } from "@/services/ai/offline";
import { PLATFORM_LIMITS, type Brand, type CaptionSet, type Product } from "./types";

export type CheckStatus = "pass" | "warn" | "fail";

export interface QualityCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface QualityReport {
  passed: boolean;
  checks: QualityCheck[];
  questions: string[];
  checkedAt: string;
}

/** Money amounts in text: "Rs 1,299", "PKR 999", "$12.99", "12.99 USD", "Rs. 500/-". */
export function extractPrices(text: string): number[] {
  const re = /(?:(?:rs\.?|pkr|usd|us\$|\$|€|£|aed|inr|₹|sar)\s?(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s?(?:rs\.?|pkr|usd|dollars?|rupees?|aed|inr|sar)\b)/gi;
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (isFinite(n)) out.push(n);
  }
  return out;
}

const CLAIMS: [RegExp, string][] = [
  [/free delivery/i, "free delivery"],
  [/\b24\/7\b|open 24 hours/i, "24/7 opening"],
  [/\bhalal\b/i, "halal"],
  [/\bvegan\b/i, "vegan"],
  [/gluten[- ]free/i, "gluten-free"],
  [/\b(best|#1|number one) (in|of) (town|the city|pakistan|the country|the world)/i, "“best in …” superlative"],
  [/\b\d{1,2}\s?%\s?off\b/i, "percentage discount"],
  [/buy\s?1\s?get\s?1|bogo/i, "buy-1-get-1 offer"],
];

export function runQualityChecks(input: {
  brand: Brand;
  product: Product | null;
  captions: CaptionSet[];
  image?: { exists: boolean; width?: number; height?: number; provider?: string } | null;
  previousCaptions?: string[];
}): QualityReport {
  const { brand, product, captions } = input;
  const checks: QualityCheck[] = [];
  const questions: string[] = [];
  const add = (name: string, status: CheckStatus, message: string) => checks.push({ name, status, message });
  const allText = captions.map((c) => `${c.title}\n${c.caption}`).join("\n");

  // IMAGE CHECK
  if (!input.image?.exists) add("Image check", "fail", "No image attached to this post.");
  else if (input.image.width && input.image.height && Math.min(input.image.width, input.image.height) < 600)
    add("Image check", "warn", `Image is small (${input.image.width}×${input.image.height}); platforms prefer ≥1080px.`);
  else add("Image check", "pass", `Image ready${input.image.provider ? ` (${input.image.provider})` : ""}${input.image.width ? `, ${input.image.width}×${input.image.height}` : ""}.`);
  if (input.image?.provider === "builtin") add("Image style", "warn", "Using the built-in brand card (graphic, not a photo). Generate with Gemini/local SD or upload a photo for best results.");

  // CAPTION CHECK
  const empty = captions.filter((c) => !c.caption.trim());
  add("Caption check", empty.length ? "fail" : "pass", empty.length ? `Empty caption for ${empty.map((c) => c.platform).join(", ")}.` : `Captions ready for ${captions.length} platform(s).`);

  // PLATFORM FORMATTING
  const formatIssues: string[] = [];
  for (const c of captions) {
    const lim = PLATFORM_LIMITS[c.platform];
    const full = `${c.caption}\n\n${c.hashtags.join(" ")}`;
    if (full.length > lim.caption) formatIssues.push(`${lim.label}: ${full.length}/${lim.caption} characters`);
    if (lim.title && c.title.length > lim.title) formatIssues.push(`${lim.label}: title ${c.title.length}/${lim.title} characters`);
    if (c.hashtags.length > lim.hashtags) formatIssues.push(`${lim.label}: ${c.hashtags.length}/${lim.hashtags} hashtags`);
    if (c.hashtags.some((h) => /\s/.test(h))) formatIssues.push(`${lim.label}: hashtag contains spaces`);
  }
  add("Platform formatting", formatIssues.length ? "fail" : "pass", formatIssues.length ? formatIssues.join("; ") : "Lengths and hashtag counts are within each platform's limits.");

  // BRAND CHECK
  const brandName = brand.name.toLowerCase();
  const missingBrand = captions.filter((c) => ["instagram", "facebook"].includes(c.platform) && !`${c.caption} ${c.hashtags.join(" ")}`.toLowerCase().includes(brandName.replace(/\s+/g, "")) && !c.caption.toLowerCase().includes(brandName));
  add("Brand check", missingBrand.length ? "warn" : "pass", missingBrand.length ? `Brand name "${brand.name}" is missing from: ${missingBrand.map((c) => c.platform).join(", ")}.` : `Brand identity "${brand.name}" is consistent.`);

  // PRODUCT ACCURACY + AVAILABILITY
  if (product) {
    if (!product.available) {
      add("Availability", "fail", `${product.name} is marked UNAVAILABLE — it must not be promoted as available.`);
      questions.push(`${product.name} is unavailable. Promote a different product, or mark it available in Products?`);
    } else add("Availability", "pass", `${product.name} is available.`);
    const mentions = captions.filter((c) => c.caption.toLowerCase().includes(product.name.toLowerCase().split(" ").slice(-2).join(" ")));
    add("Product accuracy", mentions.length ? "pass" : "warn", mentions.length ? `Product "${product.name}" is named correctly.` : `Captions don't name "${product.name}" explicitly.`);
  }

  // PRICE CHECK — every price in the copy must match the database
  const prices = extractPrices(allText);
  if (prices.length) {
    const dbPrice = product?.price !== null && product?.price !== undefined && product?.price !== "" ? Number(product.price) : null;
    if (dbPrice === null) {
      add("Price check", "fail", `Captions mention a price (${prices.join(", ")}) but no price is stored for ${product?.name ?? "this post"}.`);
      questions.push(`What is the correct price for ${product?.name ?? "this item"}? (Or remove the price from the captions.)`);
    } else {
      const wrong = prices.filter((p) => Math.abs(p - dbPrice) > 0.009);
      add("Price check", wrong.length ? "fail" : "pass", wrong.length ? `Price mismatch: captions say ${wrong.join(", ")} but the database price is ${dbPrice}.` : `Price ${dbPrice} matches the database.`);
    }
  } else add("Price check", "pass", "No prices mentioned.");

  // UNVERIFIED CLAIMS
  const known = `${brand.description} ${brand.tagline} ${product?.description ?? ""} ${product?.special_offer ?? ""} ${product?.marketing_notes ?? ""}`;
  const claims = CLAIMS.filter(([re]) => re.test(allText) && !re.test(known)).map(([, label]) => label);
  if (claims.length) {
    add("Claims check", "warn", `Unverified claims: ${claims.join(", ")}. They are not in your brand/product info.`);
    questions.push(`Can you confirm these claims are true: ${claims.join(", ")}?`);
  } else add("Claims check", "pass", "No unverified claims.");

  // DUPLICATE CONTENT
  const ig = captions.find((c) => c.platform === "instagram")?.caption ?? captions[0]?.caption ?? "";
  const maxSim = Math.max(0, ...(input.previousCaptions ?? []).map((p) => jaccard(ig, p)));
  add("Duplicate check", maxSim >= 0.85 ? "fail" : maxSim >= 0.6 ? "warn" : "pass", maxSim >= 0.6 ? `Very similar (${Math.round(maxSim * 100)}%) to a previous post — consider regenerating.` : "Not a duplicate of recent posts.");

  return { passed: !checks.some((c) => c.status === "fail"), checks, questions, checkedAt: new Date().toISOString() };
}
