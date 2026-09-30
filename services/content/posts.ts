import { SignJWT, jwtVerify } from "jose";
import JSZip from "jszip";
import { decryptJson } from "@/lib/crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { backoffMs, sleep } from "@/lib/circuit";
import type { Db } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { zonedTime, localDateParts, parseHHMM } from "@/lib/time";
import { getFile, readFileData, type FileRow } from "@/services/storage";
import { generateImage, MANUAL_GEMINI_STEPS, type ImageResult } from "@/services/image-generation";
import { SOCIAL_ADAPTERS } from "@/integrations/social";
import { PublishError, type PublishOutcome } from "@/integrations/social/types";
import { brandMentionedIn, getBrand, listProducts, matchProduct } from "./brand";
import { generateCaptions } from "./captions";
import { buildImagePrompt, type ImagePromptSpec } from "./prompt-engine";
import { runQualityChecks, type QualityReport } from "./quality";
import { PLATFORM_LIMITS, PLATFORMS, type Brand, type CaptionSet, type ContentPost, type Platform, type Product } from "./types";

export interface CreatePostInput {
  text?: string;
  brandName?: string;
  productName?: string;
  idea?: string;
  category?: string;
  platforms?: Platform[];
  scheduledAt?: string | null;
  withImage?: boolean;
  runId?: string | null;
  postId?: string | null; // regenerate an existing post
}

export interface CreatedPost {
  post: ContentPost;
  brand: Brand;
  product: Product | null;
  captions: CaptionSet[];
  image: ImageResult | null;
  imageError?: string;
  quality: QualityReport;
  captionEngine: string;
  spec: ImagePromptSpec;
}

export function detectPlatforms(text: string): Platform[] {
  const t = text.toLowerCase();
  const found = PLATFORMS.filter((p) => t.includes(p) || (p === "youtube" && /\bshorts?\b|\byt\b/.test(t)) || (p === "instagram" && /\binsta\b|\big\b/.test(t)) || (p === "facebook" && /\bfb\b/.test(t)));
  if (/all platforms|every platform|everywhere/.test(t)) return [...PLATFORMS];
  return found;
}

async function previousCaptions(db: Db, excludePostId?: string | null): Promise<string[]> {
  const rows = await db.query<{ caption: string }>(
    "select c.caption from captions c join content_posts p on p.id = c.post_id where c.platform = 'instagram' and ($1::uuid is null or p.id <> $1) order by p.created_at desc limit 30",
    [excludePostId ?? null],
  );
  return rows.map((r) => r.caption);
}

export async function imageInfo(db: Db, imageId: string | null): Promise<{ exists: boolean; width?: number; height?: number; provider?: string; file?: FileRow } | null> {
  if (!imageId) return null;
  const gi = await db.one<{ file_id: string | null; provider: string; width: number | null; height: number | null }>("select file_id, provider, width, height from generated_images where id = $1", [imageId]);
  if (!gi?.file_id) return { exists: false };
  const file = await db.one<FileRow>("select * from files where id = $1", [gi.file_id]);
  if (!file) return { exists: false };
  let width = gi.width ?? undefined;
  let height = gi.height ?? undefined;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(await readFileData(file)).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    /* keep stored dims */
  }
  return { exists: true, width, height, provider: gi.provider, file };
}

/** CONTENT PLANNER → AI WRITER → IMAGE GENERATOR → OPTIMIZER → QUALITY CHECK (stops before approval). */
export async function createContentPost(db: Db, userId: string, input: CreatePostInput): Promise<CreatedPost> {
  const text = input.text ?? [input.brandName, input.productName, input.idea].filter(Boolean).join(" ");
  const existing = input.postId ? await db.one<ContentPost>("select * from content_posts where id = $1", [input.postId]) : null;
  if (input.postId && !existing) throw new AppError("Post not found", 404);

  const brand = (existing?.brand_id ? await getBrand(db, existing.brand_id) : null) ?? (input.brandName ? await getBrand(db, input.brandName) : null) ?? (await brandMentionedIn(db, text)) ?? (await getBrand(db));
  if (!brand) throw new AppError("No brand set up yet. Create a brand in Content Studio → Brands first.");
  const products = await listProducts(db, brand.id);
  let product: Product | null = null;
  if (existing?.product_id) product = products.find((p) => p.id === existing.product_id) ?? null;
  else if (input.productName) product = matchProduct(products, input.productName);
  else product = matchProduct(products, text);
  if (!product && /\b(today'?s|daily|content)\b/i.test(text) && products.length) {
    // "Create today's content": rotate through available products, least recently posted first
    const recent = await db.query<{ product_id: string }>("select product_id from content_posts where product_id is not null order by created_at desc limit 20");
    const avail = products.filter((p) => p.available);
    product = avail.sort((a, b) => recent.findIndex((r) => r.product_id === a.id) - recent.findIndex((r) => r.product_id === b.id)).find((p) => !recent.slice(0, 3).some((r) => r.product_id === p.id)) ?? avail[0] ?? null;
  }
  const settingsPlatforms = (await db.one<{ value: { defaultPlatforms?: Platform[] } }>("select value from settings where key = 'content'"))?.value?.defaultPlatforms;
  const platforms = input.platforms?.length ? input.platforms : existing?.platforms?.length ? existing.platforms : detectPlatforms(text).length ? detectPlatforms(text) : settingsPlatforms ?? [...PLATFORMS];
  const category = input.category ?? existing?.content_category ?? product?.category ?? "Brand";
  const idea = input.idea ?? existing?.idea ?? (product ? `${product.name}${product.special_offer ? ` — ${product.special_offer}` : ""}` : text || `${brand.name} brand post`);
  const seed = `${Date.now()}`;
  const spec = buildImagePrompt({ brand, product, idea, category, platform: platforms.includes("instagram") || platforms.includes("facebook") ? "instagram" : platforms[0], seed });

  const post =
    existing ??
    (await db.one<ContentPost>(
      `insert into content_posts(user_id, brand_id, product_id, title, idea, content_category, status, platforms, scheduled_at, image_prompt, run_id)
       values ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10) returning *`,
      [userId, brand.id, product?.id ?? null, product?.name ?? idea.slice(0, 80), idea, category, platforms, input.scheduledAt ?? null, JSON.stringify(spec), input.runId ?? null],
    ))!;

  let image: ImageResult | null = null;
  let imageError: string | undefined;
  if (input.withImage !== false) {
    try {
      image = await generateImage(db, userId, { spec, brand, product, currency: brand.currency }, { postId: post.id });
    } catch (err) {
      imageError = (err as Error).message;
    }
  }
  const { captions, engine } = await generateCaptions(db, userId, { brand, product, idea, category, platforms, seed });
  for (const c of captions) {
    await db.query(
      `insert into captions(user_id, post_id, platform, title, caption, hashtags, extra) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (post_id, platform) do update set title = excluded.title, caption = excluded.caption, hashtags = excluded.hashtags, extra = excluded.extra, updated_at = now()`,
      [userId, post.id, c.platform, c.title, c.caption, c.hashtags, JSON.stringify(c.extra ?? {})],
    );
  }
  await db.query("delete from captions where post_id = $1 and platform <> all($2)", [post.id, platforms]);
  const imageId = image ? (await db.one<{ id: string }>("select id from generated_images where file_id = $1", [image.fileId]))?.id ?? null : existing?.image_id ?? null;
  const quality = runQualityChecks({ brand, product, captions, image: await imageInfo(db, imageId), previousCaptions: await previousCaptions(db, post.id) });
  const updated = await db.one<ContentPost>(
    `update content_posts set image_id = $2, quality_report = $3, image_prompt = $4, platforms = $5, status = case when status in ('published') then status else 'approval' end where id = $1 returning *`,
    [post.id, imageId, JSON.stringify(quality), JSON.stringify({ ...spec, attempts: image?.attempts ?? [], manual: { url: "https://gemini.google.com", steps: MANUAL_GEMINI_STEPS } }), platforms],
  );
  return { post: updated!, brand, product, captions, image, imageError, quality, captionEngine: engine, spec };
}

/** Re-run quality checks for a post (after edits). */
export async function recheckPost(db: Db, postId: string): Promise<QualityReport> {
  const post = await db.one<ContentPost>("select * from content_posts where id = $1", [postId]);
  if (!post) throw new AppError("Post not found", 404);
  const brand = post.brand_id ? await getBrand(db, post.brand_id) : null;
  if (!brand) throw new AppError("Post has no brand");
  const product = post.product_id ? await db.one<Product>("select * from products where id = $1", [post.product_id]) : null;
  const captions = await db.query<CaptionSet>("select platform, title, caption, hashtags, extra from captions where post_id = $1", [postId]);
  const quality = runQualityChecks({ brand, product, captions, image: await imageInfo(db, post.image_id), previousCaptions: await previousCaptions(db, postId) });
  await db.query("update content_posts set quality_report = $2 where id = $1", [postId, JSON.stringify(quality)]);
  return quality;
}

export function postMarkdown(c: CreatedPost): string {
  const icon = { pass: "✅", warn: "⚠️", fail: "❌" } as const;
  const lines = [
    `## Content ready: ${c.post.title}`,
    `**Brand:** ${c.brand.name}${c.product ? ` · **Product:** ${c.product.name}` : ""} · **Captions:** ${c.captionEngine}`,
    "",
    `**IMAGE** — ${c.image ? `generated with ${c.image.provider}` : `not generated (${c.imageError ?? "skipped"})`}`,
    ...(c.image?.attempts.filter((a) => !a.ok && !a.skipped).map((a) => `- ${a.provider}: ${a.message}`) ?? []),
    "",
    ...c.captions.map((cap) => `**${PLATFORM_LIMITS[cap.platform].label.toUpperCase()}** — Ready\n> ${cap.caption.split("\n")[0].slice(0, 140)}`),
    "",
    `### Quality control — ${c.quality.passed ? "passed" : "needs attention"}`,
    ...c.quality.checks.map((q) => `- ${icon[q.status]} **${q.name}:** ${q.message}`),
    ...(c.quality.questions.length ? ["", "### Questions for you", ...c.quality.questions.map((q) => `- ${q}`)] : []),
  ];
  return lines.join("\n");
}

// ── public media URLs (Instagram / TikTok fetch images by URL) ────────────────
function mediaSecret() {
  return new TextEncoder().encode(`media:${env().AUTH_SECRET}`);
}

export async function publicMediaUrl(fileId: string): Promise<string | null> {
  const base = env().PUBLIC_BASE_URL;
  if (!base || !/^https:\/\//.test(base)) return null;
  const token = await new SignJWT({ fid: fileId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("24h").sign(mediaSecret());
  return `${base.replace(/\/+$/, "")}/api/public/media/${token}`;
}

export async function verifyMediaToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, mediaSecret(), { algorithms: ["HS256"] });
    return typeof payload.fid === "string" ? payload.fid : null;
  } catch {
    return null;
  }
}

// ── publishing ────────────────────────────────────────────────────────────────
export interface PublishResult {
  platform: Platform;
  status: "published" | "manual_required" | "failed" | "skipped";
  url?: string;
  externalId?: string;
  message: string;
  hint?: string;
  attempts: number;
}

/** SOCIAL PUBLISHER → POST VERIFICATION. Publishes only to the selected platforms. */
export async function publishPost(db: Db, userId: string, postId: string, only?: Platform[], log?: (m: string) => Promise<void>): Promise<PublishResult[]> {
  const post = await db.one<ContentPost>("select * from content_posts where id = $1", [postId]);
  if (!post) throw new AppError("Post not found", 404);
  const quality = post.quality_report as QualityReport | null;
  if (quality && !quality.passed) throw new AppError(`Quality checks failed — fix these first: ${quality.checks.filter((c) => c.status === "fail").map((c) => c.message).join(" ")}`);
  const platforms = (only?.length ? only : post.platforms).filter((p) => post.platforms.includes(p));
  const captions = await db.query<CaptionSet>("select platform, title, caption, hashtags, extra from captions where post_id = $1", [postId]);
  const img = await imageInfo(db, post.image_id);
  const imageMedia = img?.file ? { data: await readFileData(img.file), mime: img.file.mime, fileName: img.file.name, publicUrl: await publicMediaUrl(img.file.id) } : null;
  const results: PublishResult[] = [];

  for (const platform of platforms) {
    const caption = captions.find((c) => c.platform === platform);
    if (!caption) {
      results.push({ platform, status: "skipped", message: "No caption for this platform", attempts: 0 });
      continue;
    }
    const account = await db.one<{ id: string; credentials_encrypted: string | null; config: Record<string, unknown>; status: string }>(
      "select id, credentials_encrypted, config, status from social_accounts where platform = $1",
      [platform],
    );
    const job = await db.one<{ id: string; attempts: number; status: string }>(
      `insert into publishing_jobs(user_id, post_id, platform, social_account_id, status) values ($1,$2,$3,$4,'publishing')
       on conflict (post_id, platform) do update set status = case when publishing_jobs.status = 'published' then 'published' else 'publishing' end, social_account_id = excluded.social_account_id
       returning id, attempts, status`,
      [userId, postId, platform, account?.id ?? null],
    );
    if (job!.status === "published") {
      results.push({ platform, status: "published", message: "Already published", attempts: job!.attempts });
      continue;
    }
    const adapter = SOCIAL_ADAPTERS[platform];
    const creds = account?.status === "connected" ? decryptJson<Record<string, string>>(account.credentials_encrypted) : null;
    let outcome: PublishOutcome | null = null;
    let lastErr: PublishError | Error | null = null;
    let attempts = job!.attempts;
    for (let a = 1; a <= 3; a++) {
      attempts++;
      try {
        outcome = await adapter.publish({ caption, image: imageMedia, video: null, credentials: creds, config: account?.config ?? {} });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err as Error;
        await log?.(`${adapter.label}: attempt ${a} failed — ${(err as Error).message}`);
        if (!(err instanceof PublishError && err.retryable) || a === 3) break;
        await sleep(backoffMs(a, 1000));
      }
    }
    if (outcome?.status === "published") {
      await db.query("update publishing_jobs set status='published', attempts=$2, external_post_id=$3, url=$4, error=null, error_hint=$5, published_at=now() where id=$1", [
        job!.id,
        attempts,
        outcome.externalId,
        outcome.url ?? null,
        outcome.note ?? null,
      ]);
      results.push({ platform, status: "published", url: outcome.url, externalId: outcome.externalId, message: outcome.note ?? "Published", attempts });
    } else if (outcome?.status === "manual_required") {
      await db.query("update publishing_jobs set status='manual_required', attempts=$2, error=null, error_hint=$3 where id=$1", [job!.id, attempts, outcome.reason]);
      results.push({ platform, status: "manual_required", message: outcome.reason, attempts });
    } else {
      const hint = lastErr instanceof PublishError ? lastErr.hint : "Check the platform connection and try again.";
      await db.query("update publishing_jobs set status='failed', attempts=$2, error=$3, error_hint=$4 where id=$1", [job!.id, attempts, lastErr?.message ?? "Unknown error", hint]);
      results.push({ platform, status: "failed", message: lastErr?.message ?? "Unknown error", hint, attempts });
    }
  }
  const anyFailed = results.some((r) => r.status === "failed");
  const anyPublished = results.some((r) => r.status === "published");
  await db.query("update content_posts set status = $2, published_at = case when $3 then coalesce(published_at, now()) else published_at end where id = $1", [
    postId,
    anyFailed ? "failed" : anyPublished || results.every((r) => r.status === "manual_required" || r.status === "skipped") ? "published" : post.status,
    anyPublished,
  ]);
  return results;
}

export function publishMarkdown(results: PublishResult[]): string {
  const icon = { published: "✅", manual_required: "📦", failed: "❌", skipped: "⏭️" } as const;
  const auto = results.filter((r) => r.status === "published").map((r) => PLATFORM_LIMITS[r.platform].label);
  const manual = results.filter((r) => r.status === "manual_required").map((r) => PLATFORM_LIMITS[r.platform].label);
  const head = auto.length
    ? `Published successfully to ${auto.join(", ")}.${manual.length ? ` ${manual.join(", ")} ${manual.length > 1 ? "have" : "has"} been prepared for manual posting (download the package).` : ""}`
    : manual.length
      ? `Nothing could be auto-published right now. ${manual.join(", ")} ${manual.length > 1 ? "are" : "is"} prepared for manual posting — download the content package.`
      : "Publishing did not complete.";
  return `${head}\n\n${results
    .map((r) => `- ${icon[r.status]} **${PLATFORM_LIMITS[r.platform].label}** — ${r.status.replace("_", " ")}: ${r.message}${r.url ? ` ([view](${r.url}))` : ""}${r.hint && r.status === "failed" ? `\n  - Recommended action: ${r.hint}` : ""}`)
    .join("\n")}`;
}

// ── content package (always works, even with no APIs) ─────────────────────────
export async function buildContentPackage(db: Db, postId: string): Promise<{ name: string; data: Buffer }> {
  const post = await db.one<ContentPost>("select * from content_posts where id = $1", [postId]);
  if (!post) throw new AppError("Post not found", 404);
  const captions = await db.query<CaptionSet>("select platform, title, caption, hashtags, extra from captions where post_id = $1", [postId]);
  const brand = post.brand_id ? await getBrand(db, post.brand_id) : null;
  const img = await imageInfo(db, post.image_id);
  const zip = new JSZip();
  const folderName = `${(brand?.name ?? "content").replace(/[^\w-]+/g, "-")}-${post.title.replace(/[^\w-]+/g, "-")}-${new Date(post.created_at).toISOString().slice(0, 10)}`.toLowerCase();
  const dir = zip.folder(folderName)!;
  if (img?.file) dir.file(`image${img.file.name.match(/\.\w+$/)?.[0] ?? ".png"}`, await readFileData(img.file));
  for (const c of captions) {
    const extra = c.extra as { videoConcept?: string[]; tags?: string[] } | undefined;
    const body =
      c.platform === "youtube"
        ? `TITLE:\n${c.title}\n\nDESCRIPTION:\n${c.caption}\n\nTAGS:\n${(extra?.tags ?? c.hashtags.map((h) => h.slice(1))).join(", ")}\n\nPRIVACY: start as Private/Unlisted, publish when ready.\nNOTE: Shorts need a vertical video (≤60s). Use the image + a short clip.`
        : `${c.caption}\n\n${c.hashtags.join(" ")}${extra?.videoConcept ? `\n\nVIDEO CONCEPT:\n${extra.videoConcept.map((s) => `- ${s}`).join("\n")}` : ""}`;
    dir.file(`${c.platform}.txt`, body);
  }
  const spec = post.image_prompt as (ImagePromptSpec & { manual?: { steps: string[] } }) | null;
  if (spec?.prompt) dir.file("image-prompt.txt", `${spec.prompt}\n\nNEGATIVE PROMPT:\n${spec.negativePrompt}\n\nMANUAL GEMINI WORKFLOW:\n${MANUAL_GEMINI_STEPS.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  const jobs = await db.query("select platform, status, url, error from publishing_jobs where post_id = $1", [postId]);
  dir.file(
    "metadata.json",
    JSON.stringify(
      { post: { id: post.id, title: post.title, idea: post.idea, category: post.content_category, status: post.status, scheduledAt: post.scheduled_at, platforms: post.platforms }, brand: brand ? { name: brand.name, tagline: brand.tagline } : null, quality: post.quality_report, publishing: jobs, generatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  dir.file(
    "README.txt",
    `HOW TO POST MANUALLY\n\nInstagram: open the app → + → Post → pick image → paste instagram.txt.\nFacebook: open your Page → Create post → Photo → paste facebook.txt.\nTikTok: + → Upload → Photo mode → pick image → paste tiktok.txt.\nYouTube Shorts: needs a short vertical video; use youtube.txt for title/description/tags.\nSnapchat: create a Story/Spotlight with the image and snapchat.txt.\n`,
  );
  return { name: `${folderName}.zip`, data: Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })) };
}

// ── AI content strategist: weekly plan ────────────────────────────────────────
const WEEK_PLAN: { day: number; category: string; idea: string }[] = [
  { day: 1, category: "Burger", idea: "Burger spotlight" },
  { day: 2, category: "Pizza", idea: "Pizza hero shot" },
  { day: 3, category: "Behind the scenes", idea: "Behind the scenes in our kitchen" },
  { day: 4, category: "Customers", idea: "Customer experience moment" },
  { day: 5, category: "Deals", idea: "Weekend deal" },
  { day: 6, category: "Kitchen", idea: "Pizza making process" },
  { day: 0, category: "Brand", idea: "Our brand story" },
];

export async function createWeeklyPlan(db: Db, userId: string, opts: { brandName?: string; startDate?: Date } = {}) {
  const brand = await getBrand(db, opts.brandName);
  if (!brand) throw new AppError("No brand set up yet. Create a brand first.");
  const products = (await listProducts(db, brand.id)).filter((p) => p.available);
  const profile = await getProfile(db);
  const start = opts.startDate ?? new Date(Date.now() + 86400_000);
  const postMin = parseHHMM(brand.posting_time.slice(0, 5));
  const created: ContentPost[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start.getTime() + i * 86400_000);
    const { y, m, d, dow } = localDateParts(profile.timezone, day);
    const slot = WEEK_PLAN.find((w) => w.day === dow)!;
    const product = products.find((p) => p.category.toLowerCase() === slot.category.toLowerCase()) ?? (["Deals", "Kitchen"].includes(slot.category) ? products.find((p) => p.special_offer) ?? products[i % Math.max(1, products.length)] : null) ?? null;
    const when = zonedTime(profile.timezone, y, m, d, Math.floor(postMin / 60), postMin % 60);
    const post = await db.one<ContentPost>(
      `insert into content_posts(user_id, brand_id, product_id, title, idea, content_category, status, platforms, scheduled_at)
       values ($1,$2,$3,$4,$5,$6,'idea',$7,$8) returning *`,
      [userId, brand.id, product?.id ?? null, product ? `${slot.idea}: ${product.name}` : slot.idea, slot.idea, slot.category, [...PLATFORMS], when.toISOString()],
    );
    created.push(post!);
  }
  return { brand, posts: created };
}
