"use client";
import Link from "next/link";
import { History } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { PLATFORM_LABEL, Thumb, type PostRow } from "@/components/post-bits";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/ui";

export default function HistoryPage() {
  const { data } = useApi<{ posts: PostRow[] }>("/api/content/posts?status=published,failed");
  return (
    <div>
      <PageHeader title="Post History" icon={<History className="h-6 w-6" />} subtitle="Every published post with platform, date, link and status." />
      <Card className="divide-y divide-line">
        {data && !data.posts.length && <Empty title="Nothing published yet" />}
        {data?.posts.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row">
            <Thumb fileId={p.image_file_id} className="h-20 w-16 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <Link href={`/content/posts/${p.id}`} className="font-medium hover:underline">
                {p.title}
              </Link>
              <div className="text-xs text-muted">
                {fmtDate(p.published_at ?? p.scheduled_at ?? p.created_at)} · {p.brand_name} · {p.product_name ?? p.content_category}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(p.jobs ?? []).map((j) => (
                  <span key={j.platform} className="inline-flex items-center gap-1 text-xs">
                    {PLATFORM_LABEL[j.platform]} <StatusBadge status={j.status} />
                    {j.url && (
                      <a href={j.url} target="_blank" rel="noreferrer" className="text-accent">
                        ↗
                      </a>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
