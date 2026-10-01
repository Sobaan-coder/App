"use client";
import { use } from "react";
import { useApi, fmtDate } from "@/lib/client";
import { RunView } from "@/components/run-view";
import { Card, CardHeader, PageHeader, cx } from "@/components/ui";

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useApi<{ activity: { created_at: string; message: string; status: string; tool: string | null }[] }>(`/api/runs/${id}`, 3000);
  return (
    <div className="space-y-4">
      <PageHeader title="Run details" subtitle="Plan, live progress, approvals, result and full audit trail." />
      <RunView runId={id} />
      <Card>
        <CardHeader title="Audit trail" />
        <ol className="space-y-1.5 px-5 pb-5 text-xs">
          {data?.activity.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-36 shrink-0 text-muted tabular-nums">{fmtDate(a.created_at, { timeStyle: "medium", dateStyle: "short" })}</span>
              <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", a.status === "error" ? "bg-bad" : a.status === "warning" ? "bg-warn" : a.status === "success" ? "bg-ok" : "bg-muted")} />
              <span className="min-w-0 break-words">
                {a.message}
                {a.tool && <span className="ml-1 text-muted">· {a.tool}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
