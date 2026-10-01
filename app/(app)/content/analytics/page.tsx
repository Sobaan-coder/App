"use client";
import Link from "next/link";
import { PieChart } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { PLATFORM_LABEL } from "@/components/post-bits";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";

interface A {
  counts: { posts: number; published: number; failed: number; scheduled: number };
  totals: Record<string, number | null>;
  latest: { post_id: string; title: string; platform: string; url: string | null; available: boolean; reach: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; note: string | null; fetched_at: string }[];
  byPlatform: { platform: string; status: string; n: number }[];
  dataAvailable: boolean;
}

const v = (n: number | null | undefined) => (n === null || n === undefined ? "Data unavailable" : n.toLocaleString());

export default function AnalyticsPage() {
  const { data } = useApi<A>("/api/content/analytics");
  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" icon={<PieChart className="h-6 w-6" />} subtitle="Only real numbers from official platform APIs. Nothing is estimated or invented." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Posts", data?.counts.posts],
          ["Published", data?.counts.published],
          ["Scheduled", data?.counts.scheduled],
          ["Failed", data?.counts.failed],
        ].map(([l, n]) => (
          <Card key={l as string} className="p-4">
            <div className="text-xs text-muted">{l}</div>
            <div className="mt-1 text-2xl font-semibold">{(n as number) ?? "–"}</div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {["reach", "views", "likes", "comments", "shares"].map((k) => (
          <Card key={k} className="p-4">
            <div className="text-xs text-muted capitalize">{k}</div>
            <div className={`mt-1 font-semibold ${data?.totals[k] == null ? "text-sm text-muted" : "text-2xl"}`}>{v(data?.totals[k])}</div>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Top posts (latest metrics)" subtitle="Open a published post and click “Refresh analytics” to fetch numbers." />
        {data && !data.latest.length && <Empty title="Data unavailable">No metrics have been fetched yet — connect accounts and publish via official APIs.</Empty>}
        <div className="divide-y divide-line">
          {[...(data?.latest ?? [])]
            .sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1))
            .map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Link href={`/content/posts/${r.post_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {r.title}
                </Link>
                <span className="text-xs text-muted">{PLATFORM_LABEL[r.platform]}</span>
                <span className="text-xs">{r.available ? `reach ${v(r.reach)} · likes ${v(r.likes)} · comments ${v(r.comments)} · shares ${v(r.shares)}` : <span className="text-muted">Data unavailable{r.note ? ` — ${r.note}` : ""}</span>}</span>
                <span className="text-[10px] text-muted">{fmtDate(r.fetched_at)}</span>
              </div>
            ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Publishing results by platform" />
        <div className="grid gap-2 px-5 pb-5 sm:grid-cols-3">
          {(data?.byPlatform ?? []).map((b, i) => (
            <div key={i} className="rounded-xl bg-panel-2 px-3 py-2 text-xs">
              {PLATFORM_LABEL[b.platform] ?? b.platform} · {b.status.replace("_", " ")}: <b>{b.n}</b>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
