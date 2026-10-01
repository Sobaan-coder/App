import { z } from "zod";
import { body, route } from "@/lib/api";
import { userDb, withUser } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { logActivity } from "@/lib/activity";
import { decryptJson } from "@/lib/crypto";
import { startRun } from "@/automations/service";
import { decideApproval } from "@/services/approvals";
import { resumeAfterDecision } from "@/workflows/engine";
import { stepSchema } from "@/workflows/types";
import { enqueue } from "@/workers/queue";
import { recheckPost } from "@/services/content/posts";
import { getBrand, listProducts } from "@/services/content/brand";
import { buildImagePrompt } from "@/services/content/prompt-engine";
import { generateImage } from "@/services/image-generation";
import { PLATFORMS, type ContentPost, type Product } from "@/services/content/types";
import type { QualityReport } from "@/services/content/quality";
import { SOCIAL_ADAPTERS } from "@/integrations/social";
import type { Metrics } from "@/integrations/social/types";

const actionSchema = z.object({
  action: z.enum(["approve_publish", "schedule", "reject", "regenerate", "regenerate_image", "recheck", "fetch_analytics"]),
  platforms: z.array(z.enum(PLATFORMS)).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  provider: z.enum(["gemini", "local_sd", "pollinations", "builtin"]).optional(),
});

export const POST = route<{ id: string }>({ rateLimit: 30 }, async ({ req, user, params }) => {
  const a = await body(req, actionSchema);
  const db = userDb(user.id);
  const post = await db.one<ContentPost>("select * from content_posts where id = $1", [params.id]);
  if (!post) throw notFound("Post");
  const quality = post.quality_report as QualityReport | null;
  const failing = quality?.checks.filter((c) => c.status === "fail") ?? [];

  switch (a.action) {
    // [APPROVE & PUBLISH] — your click IS the approval. Publishes only to the selected platforms.
    case "approve_publish": {
      if (failing.length) throw new AppError(`Fix the quality issues first: ${failing.map((c) => c.message).join(" ")}`);
      const platforms = a.platforms?.length ? a.platforms : post.platforms;
      const pending = await db.one<{ id: string }>("select id from approvals where status = 'pending' and tool_name = 'social_publish' and payload->'input'->>'postId' = $1 limit 1", [post.id]);
      if (pending) {
        const out = await withUser(user.id, (tx) => decideApproval(tx, user.id, pending.id, { decision: "approve", editedInput: { postId: post.id, platforms } }));
        if (out.runId) await resumeAfterDecision(out.runId, user.id);
        return { runId: out.runId };
      }
      const runId = await startRun({
        userId: user.id,
        title: `Publish: ${post.title}`,
        source: "content",
        plan: { goal: "Publish post", intent: "content_publish", requiresApproval: true, steps: [stepSchema.parse({ id: "publish", action: "Publish to selected platforms", tool: "social_publish", input: { postId: post.id, platforms } })] },
        defer: true,
      });
      // Record the user's click as the approval for this exact input, so the engine runs it.
      await db.query(
        `insert into approvals(user_id, run_id, step_key, tool_name, kind, title, reason, risk_level, payload, status, decided_at)
         values ($1,$2,'publish','social_publish','content_publish',$3,'Approved from the post page','medium',$4,'approved', now())`,
        [user.id, runId, `Publish "${post.title}" to ${platforms.join(", ")}`, JSON.stringify({ tool: "social_publish", input: { postId: post.id, platforms } })],
      );
      await db.query("update content_posts set status = 'approved' where id = $1", [post.id]);
      await logActivity(db, { userId: user.id, category: "approval", action: "approval.approved", status: "success", message: `You approved publishing "${post.title}" to ${platforms.join(", ")}` });
      await enqueue("run.advance", { runId }, { userId: user.id });
      return { runId };
    }
    case "schedule": {
      if (failing.length) throw new AppError(`Fix the quality issues first: ${failing.map((c) => c.message).join(" ")}`);
      const when = a.scheduledAt ?? post.scheduled_at;
      if (!when || new Date(when).getTime() < Date.now() - 60_000) throw new AppError("Pick a future date and time");
      await db.query("update content_posts set status = 'scheduled', scheduled_at = $2, platforms = coalesce($3, platforms) where id = $1", [post.id, when, a.platforms ?? null]);
      await db.query("update approvals set status = 'expired', decision_note = 'Scheduled instead' where status = 'pending' and tool_name = 'social_publish' and payload->'input'->>'postId' = $1", [post.id]);
      await logActivity(db, { userId: user.id, category: "approval", action: "post.scheduled", status: "success", message: `You approved and scheduled "${post.title}" for ${new Date(when).toUTCString()}` });
      return { ok: true };
    }
    case "reject": {
      await db.query("update content_posts set status = 'rejected' where id = $1", [post.id]);
      const pending = await db.one<{ id: string }>("select id from approvals where status = 'pending' and tool_name = 'social_publish' and payload->'input'->>'postId' = $1 limit 1", [post.id]);
      if (pending) {
        const out = await withUser(user.id, (tx) => decideApproval(tx, user.id, pending.id, { decision: "reject" }));
        if (out.runId) await resumeAfterDecision(out.runId, user.id);
      }
      await logActivity(db, { userId: user.id, category: "content", action: "post.rejected", message: `You rejected "${post.title}"` });
      return { ok: true };
    }
    case "regenerate": {
      const runId = await startRun({
        userId: user.id,
        title: `Regenerate: ${post.title}`,
        source: "content",
        plan: { goal: "Regenerate post", intent: "content_create", requiresApproval: false, steps: [stepSchema.parse({ id: "create", action: "Regenerate image & captions", tool: "content_generate", input: { postId: post.id, text: post.idea } })] },
      });
      return { runId };
    }
    case "regenerate_image": {
      const brand = post.brand_id ? await getBrand(db, post.brand_id) : null;
      if (!brand) throw new AppError("This post has no brand");
      const product = post.product_id ? ((await listProducts(db, brand.id)).find((p: Product) => p.id === post.product_id) ?? null) : null;
      const spec = buildImagePrompt({ brand, product, idea: post.idea, category: post.content_category, seed: `${Date.now()}` });
      const img = await generateImage(db, user.id, { spec, brand, product, currency: brand.currency }, { postId: post.id, only: a.provider });
      const gi = await db.one<{ id: string }>("select id from generated_images where file_id = $1", [img.fileId]);
      await db.query("update content_posts set image_id = $2 where id = $1", [post.id, gi!.id]);
      return { image: img, quality: await recheckPost(db, post.id) };
    }
    case "recheck":
      return { quality: await recheckPost(db, post.id) };
    case "fetch_analytics": {
      const jobs = await db.query<{ id: string; platform: keyof typeof SOCIAL_ADAPTERS; external_post_id: string | null; status: string }>(
        "select id, platform, external_post_id, status from publishing_jobs where post_id = $1 and status = 'published'",
        [post.id],
      );
      const out = [];
      for (const j of jobs) {
        const adapter = SOCIAL_ADAPTERS[j.platform];
        const acct = await db.one<{ credentials_encrypted: string | null }>("select credentials_encrypted from social_accounts where platform = $1 and status = 'connected'", [j.platform]);
        const creds = decryptJson<Record<string, string>>(acct?.credentials_encrypted);
        let m: Metrics = { available: false, note: "Data unavailable — this platform's API doesn't provide metrics for this post." };
        if (adapter.fetchMetrics && creds && j.external_post_id) {
          try {
            m = await adapter.fetchMetrics(j.external_post_id, creds);
          } catch (err) {
            m = { available: false, note: `Data unavailable: ${(err as Error).message}` };
          }
        }
        await db.query(
          "insert into analytics(user_id, publishing_job_id, platform, reach, views, likes, comments, shares, saves, raw, available, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [user.id, j.id, j.platform, m.reach ?? null, m.views ?? null, m.likes ?? null, m.comments ?? null, m.shares ?? null, m.saves ?? null, m.raw ? JSON.stringify(m.raw) : null, m.available, m.note ?? null],
        );
        out.push({ platform: j.platform, ...m, raw: undefined });
      }
      return { analytics: out };
    }
  }
});
