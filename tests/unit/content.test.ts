import { describe, expect, it } from "vitest";
import { buildImagePrompt, chooseTemplate } from "@/services/content/prompt-engine";
import { offlineCaptions, buildHashtags } from "@/services/content/captions";
import { extractPrices, runQualityChecks } from "@/services/content/quality";
import { detectPlatforms } from "@/services/content/posts";
import { renderBrandCardSvg } from "@/services/image-generation/providers/builtin";
import { PLATFORM_LIMITS, type Brand, type Product } from "@/services/content/types";

const brand: Brand = {
  id: "b",
  user_id: "u",
  name: "Merchants",
  legal_name: "THE MERCHANTS' COMPANY",
  tagline: "TRADING FLAVORS SINCE 2026",
  description: "",
  logo_file_id: null,
  colors: ["#2b1a0f", "#8a4b1c", "#e8b04b"],
  font_preferences: "",
  visual_style: "warm merchant aesthetic",
  tone: "playful",
  location: "Lahore",
  currency: "PKR",
  contact: { phone: "0300-0000000" },
  website: "",
  social_links: {},
  default_hashtags: ["merchants"],
  posting_time: "19:00",
  is_default: true,
};
const pizza: Product = { id: "p", user_id: "u", brand_id: "b", name: "Merchants Crown Crust Pizza", category: "Pizza", description: "Cheese-stuffed crown crust", price: 1499, ingredients: ["mozzarella"], image_file_id: null, special_offer: "", available: true, marketing_notes: "" };

describe("image prompt engine", () => {
  it("fills the FOOD HERO template with brand + product details", () => {
    const s = buildImagePrompt({ brand, product: pizza, platform: "instagram", seed: "x" });
    expect(s.template).toBe("food_hero");
    expect(s.prompt).toContain("Merchants Crown Crust Pizza");
    expect(s.prompt).toContain("#2b1a0f");
    expect(s.prompt).toMatch(/Avoid: .*distorted food/);
    expect([s.width, s.height, s.aspectRatio]).toEqual([1080, 1350, "4:5"]);
  });
  it("picks deal / behind-the-scenes templates", () => {
    expect(chooseTemplate("Deals", "Buy 1 Get 1 Pizza")).toBe("deal_poster");
    expect(chooseTemplate("Kitchen", "pizza making")).toBe("behind_the_scenes");
  });
  it("vertical size for TikTok/Shorts", () => expect(buildImagePrompt({ brand, product: pizza, platform: "tiktok" }).aspectRatio).toBe("9:16"));
});

describe("captions", () => {
  const caps = offlineCaptions(brand, pizza, "", "Pizza", ["instagram", "facebook", "tiktok", "youtube", "snapchat"], "s");
  it("writes a different caption per platform", () => {
    expect(new Set(caps.map((c) => c.caption)).size).toBe(5);
    expect(caps.find((c) => c.platform === "youtube")!.title).toMatch(/#shorts/);
    expect(caps.find((c) => c.platform === "tiktok")!.extra?.videoConcept).toBeDefined();
  });
  it("respects platform limits", () => {
    for (const c of caps) {
      expect(c.hashtags.length).toBeLessThanOrEqual(PLATFORM_LIMITS[c.platform].hashtags);
      expect(c.caption.length).toBeLessThanOrEqual(PLATFORM_LIMITS[c.platform].caption);
    }
  });
  it("uses the database price exactly", () => expect(caps[0].caption).toContain("PKR 1,499"));
  it("never mentions a price when none is stored", () => {
    const c = offlineCaptions(brand, { ...pizza, price: null }, "", "Pizza", ["instagram"]);
    expect(extractPrices(c[0].caption)).toEqual([]);
  });
  it("hashtags include brand, product and location", () => {
    const h = buildHashtags(brand, pizza, "Pizza", "instagram");
    expect(h).toContain("#merchants");
    expect(h).toContain("#lahore");
  });
});

describe("quality control", () => {
  const caps = offlineCaptions(brand, pizza, "", "Pizza", ["instagram", "facebook"]);
  const ok = runQualityChecks({ brand, product: pizza, captions: caps, image: { exists: true, width: 1080, height: 1350, provider: "gemini" } });
  it("passes a correct post", () => expect(ok.passed).toBe(true));
  it("fails a wrong price", () => {
    const bad = caps.map((c) => ({ ...c, caption: c.caption.replace("1,499", "999") }));
    const r = runQualityChecks({ brand, product: pizza, captions: bad, image: { exists: true } });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name === "Price check")!.status).toBe("fail");
  });
  it("fails when promoting an unavailable product and asks the user", () => {
    const r = runQualityChecks({ brand, product: { ...pizza, available: false }, captions: caps, image: { exists: true } });
    expect(r.passed).toBe(false);
    expect(r.questions.length).toBeGreaterThan(0);
  });
  it("flags unverified claims and duplicates", () => {
    const claim = caps.map((c) => ({ ...c, caption: `${c.caption} Free delivery!` }));
    const r = runQualityChecks({ brand, product: pizza, captions: claim, image: { exists: true }, previousCaptions: [claim[0].caption] });
    expect(r.checks.find((c) => c.name === "Claims check")!.status).toBe("warn");
    expect(r.checks.find((c) => c.name === "Duplicate check")!.status).toBe("fail");
  });
  it("fails without an image", () => expect(runQualityChecks({ brand, product: pizza, captions: caps, image: null }).passed).toBe(false));
  it("extracts prices in many formats", () => expect(extractPrices("Only Rs. 1,299 or $12.99 or 500 PKR")).toEqual([1299, 12.99, 500]));
});

describe("platform detection & renderer", () => {
  it("detects platforms", () => expect(detectPlatforms("publish to Instagram, FB and YouTube shorts")).toEqual(["instagram", "facebook", "youtube"]));
  it("built-in renderer escapes text and uses brand colors", () => {
    const svg = renderBrandCardSvg({ spec: buildImagePrompt({ brand, product: { ...pizza, name: "<script>" } }), brand, product: { ...pizza, name: "<script>" }, currency: "PKR" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("#e8b04b");
  });
});
