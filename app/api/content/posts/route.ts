import { z } from "zod";
import { body, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { startRun } from "@/automations/service";
import { stepSchema } from "@/workflows/types";
import { PLATFORMS } from "@/services/content/types";

export const GET = route({}, async ({ req, user }) => {
  const from = query(req, "from");
  const to = query(req, "to");
  const status = query(req, "status");
  const posts = await withUser(user.id, (db) =>
    db.query(
      `select p.*, b.name as brand_name, pr.name as product_name, gi.file_id as image_file_id, gi.provider as image_provider,
         (select json_agg(json_build_object('platform', j.platform, 'status', j.status, 'url', j.url, 'error', j.error)) from publishing_jobs j where j.post_id = p.id) as jobs
       from content_posts p left join brands b on b.id = p.brand_id left join products pr on pr.id = p.product_id left join generated_images gi on gi.id = p.image_id
       where ($1::timestamptz is null or coalesce(p.scheduled_at, p.created_at) >= $1) and ($2::timestamptz is null or coalesce(p.scheduled_at, p.created_at) < $2)
         and ($3::text[] is null or p.status = any($3))
       order by coalesce(p.scheduled_at, p.created_at) desc limit 300`,
      [from ?? null, to ?? null, status ? status.split(",") : null],
    ),
  );
  return { posts };
});

/** CREATE: generates a post as a run (visible in the work queue); never publishes. */
export const POST = route({ rateLimit: 20 }, async ({ req, user }) => {
  const i = await body(
    req,
    z.object({ text: z.string().max(1000).default(""), brandName: z.string().optional(), productName: z.string().optional(), idea: z.string().max(500).optional(), category: z.string().max(60).optional(), platforms: z.array(z.enum(PLATFORMS)).optional(), postId: z.string().uuid().optional() }),
  );
  const runId = await startRun({
    userId: user.id,
    title: i.postId ? "Regenerate post" : `Create content${i.productName ? `: ${i.productName}` : ""}`,
    source: "content",
    plan: {
      goal: "Create social content",
      intent: "content_create",
      requiresApproval: false,
      steps: [stepSchema.parse({ id: "create", action: "Plan content, generate image & platform captions, run quality checks", tool: "content_generate", input: i })],
    },
  });
  return { runId };
});
