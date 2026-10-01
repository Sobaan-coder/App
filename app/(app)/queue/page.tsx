"use client";
import Link from "next/link";
import { useState } from "react";
import { ListOrdered } from "lucide-react";
import { timeAgo, useApi } from "@/lib/client";
import { Card, Empty, PageHeader, StatusBadge, Tabs } from "@/components/ui";

interface Run {
  id: string;
  title: string;
  status: string;
  source: string;
  progress: number;
  current_step: number;
  total_steps: number;
  current_action: string | null;
  summary: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const FILTERS = [
  { value: "", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "waiting", label: "Waiting" },
  { value: "approval_required", label: "Approval Required" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export default function QueuePage() {
  const [f, setF] = useState("");
  const { data } = useApi<{ runs: Run[] }>(`/api/runs?limit=100${f ? `&status=${f}` : ""}`, 2500);
  return (
    <div>
      <PageHeader title="AI Work Queue" icon={<ListOrdered className="h-6 w-6" />} subtitle="Everything your assistant is doing, waiting on, or has finished." />
      <div className="mb-4">
        <Tabs value={f} onChange={setF} items={FILTERS} />
      </div>
      <Card className="overflow-hidden">
        {data && !data.runs.length && <Empty title="Nothing here">Runs appear when you give a command or an automation fires.</Empty>}
        <div className="hidden grid-cols-[1fr_9rem_10rem_8rem_7rem] gap-3 border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid">
          <span>Task</span>
          <span>Progress</span>
          <span>Current step</span>
          <span>Started</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-line">
          {data?.runs.map((r) => {
            const active = ["queued", "running", "waiting", "approval_required"].includes(r.status);
            return (
              <Link key={r.id} href={`/runs/${r.id}`} className="grid gap-2 px-5 py-3 hover:bg-panel-2 md:grid-cols-[1fr_9rem_10rem_8rem_7rem] md:items-center md:gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="truncate text-xs text-muted">{r.error ?? r.summary ?? r.source}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                    <div className={`h-full ${r.status === "failed" ? "bg-bad" : r.status === "completed" ? "bg-ok" : "bg-accent"}`} style={{ width: `${r.status === "completed" ? 100 : r.progress}%` }} />
                  </div>
                  <span className="w-8 text-right text-[11px] text-muted tabular-nums">{r.status === "completed" ? 100 : r.progress}%</span>
                </div>
                <div className="truncate text-xs text-muted">{active ? `${Math.min(r.current_step + 1, r.total_steps)}/${r.total_steps} · ${r.current_action ?? ""}` : `${r.total_steps} steps`}</div>
                <div className="text-xs text-muted">{timeAgo(r.started_at ?? r.created_at)}</div>
                <div>
                  <StatusBadge status={r.status} />
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
