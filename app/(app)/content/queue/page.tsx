"use client";
import Link from "next/link";
import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { PLATFORM_LABEL, PostStatus, Thumb, type PostRow } from "@/components/post-bits";
import { Card, Empty, PageHeader, StatusBadge, Tabs } from "@/components/ui";

export default function ContentQueue() {
  const [status, setStatus] = useState("idea,draft,approval,approved,scheduled,failed");
  const { data } = useApi<{ posts: PostRow[] }>(`/api/content/posts?status=${status}`, 10_000);
  const rows = (data?.posts ?? []).flatMap((p) => p.platforms.map((pl) => ({ p, platform: pl, job: p.jobs?.find((j) => j.platform === pl) })));
  return (
    <div>
      <PageHeader title="Content Queue" icon={<LayoutGrid className="h-6 w-6" />} subtitle="Every post × platform with its schedule and status." />
      <div className="mb-4">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: "idea,draft,approval,approved,scheduled,failed", label: "Upcoming" },
            { value: "approval,draft", label: "Waiting" },
            { value: "approved,scheduled", label: "Approved / scheduled" },
            { value: "failed", label: "Failed" },
            { value: "published", label: "Published" },
          ]}
        />
      </div>
      <Card className="overflow-x-auto">
        {data && !rows.length && <Empty title="Queue is empty" />}
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-panel-2 text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              {["Post", "Platform", "Date", "Time", "Image", "Caption", "Status"].map((h) => (
                <th key={h} className="px-4 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ p, platform, job }) => {
              const at = p.scheduled_at ?? p.created_at;
              return (
                <tr key={`${p.id}-${platform}`} className="hover:bg-panel-2">
                  <td className="px-4 py-2">
                    <Link href={`/content/posts/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{PLATFORM_LABEL[platform]}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDate(at, { dateStyle: "medium" })}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDate(at, { timeStyle: "short" })}</td>
                  <td className="px-4 py-2">
                    <Thumb fileId={p.image_file_id} className="h-9 w-9 rounded-lg" />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{p.status === "idea" ? "not written yet" : "ready"}</td>
                  <td className="px-4 py-2">{job ? <StatusBadge status={job.status} /> : <PostStatus status={p.status === "approval" ? "approval" : p.status} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
