import { route } from "@/lib/api";
import { withUser } from "@/lib/db";

/** Analytics — only real numbers from platform APIs. Missing data stays null ("Data unavailable"). */
export const GET = route({}, async ({ user }) => {
  return withUser(user.id, async (db) => {
    const [counts] = await db.query<Record<string, number>>(
      `select count(*)::int as posts, count(*) filter (where status = 'published')::int as published, count(*) filter (where status = 'failed')::int as failed,
         count(*) filter (where status = 'scheduled')::int as scheduled from content_posts`,
    );
    const latest = await db.query(
      `select distinct on (a.publishing_job_id) a.*, j.platform, j.url, p.title, p.id as post_id
       from analytics a join publishing_jobs j on j.id = a.publishing_job_id join content_posts p on p.id = j.post_id
       order by a.publishing_job_id, a.fetched_at desc`,
    );
    const available = latest.filter((l) => (l as { available: boolean }).available);
    const sum = (k: string) => (available.length ? available.reduce((acc, r) => acc + Number((r as Record<string, unknown>)[k] ?? 0), 0) : null);
    const byPlatform = await db.query("select platform, status, count(*)::int as n from publishing_jobs group by platform, status order by platform");
    return { counts, totals: { reach: sum("reach"), views: sum("views"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares") }, latest, byPlatform, dataAvailable: available.length > 0 };
  });
});
