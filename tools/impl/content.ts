import { z } from "zod";
import { defineTool } from "../types";
import { AppError } from "@/lib/errors";
import { formatLocal } from "@/lib/time";
import { getProfile } from "@/lib/profile";
import { saveFile } from "@/services/storage";
import { buildContentPackage, createContentPost, createWeeklyPlan, postMarkdown, publishMarkdown, publishPost } from "@/services/content/posts";
import { PLATFORM_LIMITS, PLATFORMS, type ContentPost } from "@/services/content/types";
import { getBrand, listProducts, matchProduct } from "@/services/content/brand";
import { buildImagePrompt } from "@/services/content/prompt-engine";
import { generateImage } from "@/services/image-generation";

const platformEnum = z.enum(PLATFORMS);

export const contentGenerate = defineTool({
  name: "content_generate",
  description: "Create a social media post: idea, image, platform-specific captions, hashtags and quality checks (does not publish).",
  category: "content",
  risk: "low",
  timeoutMs: 600_000,
  input: z.object({
    text: z.string().default(""),
    brandName: z.string().optional(),
    productName: z.string().optional(),
    idea: z.string().optional(),
    category: z.string().optional(),
    platforms: z.array(platformEnum).optional(),
    withImage: z.boolean().default(true),
    postId: z.string().uuid().optional(),
  }),
  async execute(i, ctx) {
    const c = await createContentPost(ctx.db, ctx.userId, { ...i, runId: ctx.runId });
    await ctx.log(`Content "${c.post.title}" prepared (${c.captions.length} platforms, image: ${c.image?.provider ?? "none"})`, c.quality.passed ? "success" : "warning");
    return {
      postId: c.post.id,
      title: c.post.title,
      platforms: c.post.platforms,
      qualityPassed: c.quality.passed,
      image: c.image ? { fileId: c.image.fileId, provider: c.image.provider } : null,
      files: c.image ? [{ id: c.image.fileId, name: c.image.fileName }] : [],
      summary: `Content ready for ${c.post.platforms.length} platform(s)${c.quality.passed ? "" : " — quality checks need attention"}`,
      markdown: postMarkdown(c),
      warnings: c.quality.checks.filter((q) => q.status !== "pass").map((q) => `${q.name}: ${q.message}`),
    };
  },
});

export const socialPublish = defineTool({
  name: "social_publish",
  description: "Publish an approved post to the selected platforms via official APIs; others get a manual package. Requires approval.",
  category: "content",
  risk: "medium",
  timeoutMs: 900_000,
  input: z.object({ postId: z.string().uuid(), platforms: z.array(platformEnum).optional() }),
  describe: (i) => `Publish post ${i.postId}${i.platforms?.length ? ` to ${i.platforms.map((p) => PLATFORM_LIMITS[p].label).join(", ")}` : ""}`,
  /** AUTO MODE: only when enabled in Settings, the brand already has a published post, and every target account allows auto-publish. */
  async autoApprove(i, ctx) {
    if (!ctx.settings.content.autoPublish) return false;
    const post = await ctx.db.one<ContentPost>("select * from content_posts where id = $1", [i.postId]);
    if (!post?.brand_id) return false;
    const prior = await ctx.db.one<{ n: number }>("select count(*)::int as n from content_posts where brand_id = $1 and status = 'published' and id <> $2", [post.brand_id, post.id]);
    if (!prior?.n) return false; // never auto-publish a brand's first post
    const targets = i.platforms?.length ? i.platforms : post.platforms;
    const accounts = await ctx.db.query<{ platform: string; auto_publish: boolean }>("select platform, auto_publish from social_accounts where platform = any($1)", [targets]);
    return targets.every((t) => accounts.find((a) => a.platform === t)?.auto_publish);
  },
  async execute(i, ctx) {
    const results = await publishPost(ctx.db, ctx.userId, i.postId, i.platforms, (m) => ctx.log(m, "warning"));
    for (const r of results) await ctx.log(`${PLATFORM_LIMITS[r.platform].label}: ${r.status.replace("_", " ")} — ${r.message}`, r.status === "failed" ? "error" : r.status === "published" ? "success" : "info");
    return {
      results,
      postId: i.postId,
      summary: `${results.filter((r) => r.status === "published").length} published, ${results.filter((r) => r.status === "manual_required").length} manual, ${results.filter((r) => r.status === "failed").length} failed`,
      markdown: publishMarkdown(results),
    };
  },
});

export const contentPackage = defineTool({
  name: "content_package",
  description: "Build a downloadable ZIP with the image, per-platform captions, prompt and metadata for manual posting.",
  category: "content",
  risk: "low",
  input: z.object({ postId: z.string().uuid() }),
  async execute(i, ctx) {
    const pkg = await buildContentPackage(ctx.db, i.postId);
    const f = await saveFile(ctx.db, ctx.userId, { name: pkg.name, folder: "outputs", data: pkg.data, mime: "application/zip", tags: ["content-package"] });
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Package ${f.name} ready`, markdown: `📦 Content package ready: **${f.name}**` };
  },
});

export const contentPlanWeek = defineTool({
  name: "content_plan_week",
  description: "Create a 7-day content calendar (ideas scheduled at the brand's posting time).",
  category: "content",
  risk: "low",
  input: z.object({ brandName: z.string().optional() }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const { brand, posts } = await createWeeklyPlan(ctx.db, ctx.userId, { brandName: i.brandName });
    const md = `## Content plan for ${brand.name}\n\n| Day | Post | Category |\n|---|---|---|\n${posts
      .map((p) => `| ${formatLocal(p.scheduled_at!, profile.timezone, { weekday: "long", hour: "2-digit", minute: "2-digit" })} | ${p.title} | ${p.content_category} |`)
      .join("\n")}\n\nOpen **Content → Calendar** to edit, drag to another day, or generate each post.`;
    return { postIds: posts.map((p) => p.id), summary: `7-day plan created for ${brand.name}`, markdown: md };
  },
});

export const imageGenerate = defineTool({
  name: "image_generate",
  description: "Generate a brand image for a product or idea (Gemini → local SD → Pollinations → built-in), plus the full prompt.",
  category: "content",
  risk: "low",
  timeoutMs: 600_000,
  input: z.object({ text: z.string().default(""), brandName: z.string().optional(), platform: platformEnum.default("instagram") }),
  async execute(i, ctx) {
    const brand = await getBrand(ctx.db, i.brandName);
    if (!brand) throw new AppError("Create a brand first (Content → Brands).");
    const product = matchProduct(await listProducts(ctx.db, brand.id), i.text);
    const spec = buildImagePrompt({ brand, product, idea: i.text, platform: i.platform, seed: `${Date.now()}` });
    const img = await generateImage(ctx.db, ctx.userId, { spec, brand, product, currency: brand.currency });
    return {
      fileId: img.fileId,
      files: [{ id: img.fileId, name: img.fileName }],
      prompt: spec.prompt,
      summary: `Image generated with ${img.provider}`,
      markdown: `🖼️ Image generated with **${img.provider}** (${spec.width}×${spec.height}).\n\n${img.attempts.filter((a) => !a.ok && !a.skipped).map((a) => `- ${a.provider}: ${a.message}`).join("\n")}\n\n**Image prompt**\n\n\`\`\`\n${spec.prompt}\n\`\`\``,
    };
  },
});

export const contentList = defineTool({
  name: "content_list",
  description: "List content posts by status (scheduled, failed, published, drafts…).",
  category: "content",
  risk: "low",
  input: z.object({ status: z.string().optional() }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const map: Record<string, string[]> = { scheduled: ["scheduled", "approved"], failed: ["failed"], published: ["published"], pending: ["approval", "draft", "idea"] };
    const statuses = i.status ? (map[i.status] ?? [i.status]) : null;
    const rows = await ctx.db.query<ContentPost>("select * from content_posts where ($1::text[] is null or status = any($1)) order by coalesce(scheduled_at, created_at) desc limit 50", [statuses]);
    const md = rows.length
      ? rows.map((p) => `- **[${p.title}](/content/posts/${p.id})** · ${p.status}${p.scheduled_at ? ` · ${formatLocal(p.scheduled_at, profile.timezone)}` : ""} · ${p.platforms.join(", ")}`).join("\n")
      : `No ${i.status ?? ""} posts.`;
    return { posts: rows, summary: `${rows.length} post(s)`, markdown: md };
  },
});

export const contentTools = [contentGenerate, socialPublish, contentPackage, contentPlanWeek, imageGenerate, contentList];
