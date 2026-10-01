import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { recheckPost } from "@/services/content/posts";
import { PLATFORMS } from "@/services/content/types";
import { SOCIAL_ADAPTERS } from "@/integrations/social";

export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const post = await db.one<{ image_id: string | null }>(
      "select p.*, b.name as brand_name, b.currency, pr.name as product_name, pr.price as product_price, pr.available as product_available from content_posts p left join brands b on b.id = p.brand_id left join products pr on pr.id = p.product_id where p.id = $1",
      [params.id],
    );
    if (!post) throw notFound("Post");
    const [captions, images, jobs, analytics, pendingApproval] = await Promise.all([
      db.query("select * from captions where post_id = $1 order by platform", [params.id]),
      db.query("select id, file_id, provider, status, created_at, width, height, spec->'attempts' as attempts from generated_images where post_id = $1 order by created_at desc", [params.id]),
      db.query("select * from publishing_jobs where post_id = $1 order by platform", [params.id]),
      db.query("select a.* from analytics a join publishing_jobs j on j.id = a.publishing_job_id where j.post_id = $1 order by a.fetched_at desc", [params.id]),
      db.one("select id, title from approvals where status = 'pending' and tool_name = 'social_publish' and payload->'input'->>'postId' = $1 limit 1", [params.id]),
    ]);
    const accounts = await db.query<{ platform: string; status: string; account_name: string; auto_publish: boolean }>("select platform, status, account_name, auto_publish from social_accounts");
    const capabilities = PLATFORMS.map((p) => ({ platform: p, automation: SOCIAL_ADAPTERS[p].automation, note: SOCIAL_ADAPTERS[p].honestNote, account: accounts.find((a) => a.platform === p) ?? null }));
    return { post, captions, images, jobs, analytics, pendingApproval, capabilities };
  });
});

/** EDIT: captions, hashtags, title, platforms, schedule date (drag & drop on the calendar). */
export const PATCH = route<{ id: string }>({ rateLimit: 120 }, async ({ req, user, params }) => {
  const p = await body(
    req,
    z.object({
      title: z.string().min(1).max(200).optional(),
      idea: z.string().max(1000).optional(),
      scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
      platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
      captions: z.array(z.object({ platform: z.enum(PLATFORMS), title: z.string().max(200).default(""), caption: z.string().max(63000), hashtags: z.array(z.string().max(60)).max(40).default([]) })).optional(),
    }),
  );
  return withUser(user.id, async (db) => {
    const post = await db.one<{ id: string; status: string }>(
      `update content_posts set title = coalesce($2, title), idea = coalesce($3, idea), scheduled_at = case when $4::boolean then $5::timestamptz else scheduled_at end,
         platforms = coalesce($6, platforms), status = case when status = 'idea' and $7 then 'draft' else status end where id = $1 returning *`,
      [params.id, p.title ?? null, p.idea ?? null, p.scheduledAt !== undefined, p.scheduledAt ?? null, p.platforms ?? null, Boolean(p.captions?.length)],
    );
    if (!post) throw notFound("Post");
    for (const c of p.captions ?? []) {
      const tags = c.hashtags.map((h) => `#${h.replace(/^#/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 1);
      await db.query(
        `insert into captions(user_id, post_id, platform, title, caption, hashtags) values ($1,$2,$3,$4,$5,$6)
         on conflict (post_id, platform) do update set title = excluded.title, caption = excluded.caption, hashtags = excluded.hashtags, updated_at = now()`,
        [user.id, params.id, c.platform, c.title, c.caption, tags],
      );
    }
    const quality = p.captions || p.platforms ? await recheckPost(db, params.id) : undefined;
    return { post, quality };
  });
});

export const DELETE = route<{ id: string }>({}, async ({ user, params }) => {
  const r = await withUser(user.id, (db) => db.one("delete from content_posts where id = $1 and status <> 'published' returning id", [params.id]));
  if (!r) throw notFound("Post (published posts are kept for history)");
  return { ok: true };
});
