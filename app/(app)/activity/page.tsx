"use client";
import Link from "next/link";
import { useState } from "react";
import { Activity } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { Card, Empty, Input, PageHeader, Select, cx } from "@/components/ui";

interface Item {
  id: string;
  created_at: string;
  category: string;
  action: string;
  tool: string | null;
  status: string;
  message: string;
  run_id: string | null;
}

export default function ActivityPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data } = useApi<{ items: Item[] }>(`/api/activity?limit=300${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, 5000);
  let lastDay = "";
  return (
    <div>
      <PageHeader title="Activity Log" icon={<Activity className="h-6 w-6" />} subtitle="Complete audit history: every command, tool call, approval, error and result." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search activity…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-44">
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="info">Info</option>
          <option value="warning">Warnings</option>
          <option value="error">Errors</option>
        </Select>
      </div>
      <Card className="p-2 sm:p-4">
        {data && !data.items.length && <Empty title="No activity" />}
        <ol>
          {data?.items.map((a) => {
            const day = new Date(a.created_at).toDateString();
            const header = day !== lastDay;
            lastDay = day;
            return (
              <li key={a.id}>
                {header && <div className="px-2 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{fmtDate(a.created_at, { dateStyle: "full" })}</div>}
                <div className="flex gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel-2">
                  <span className="w-14 shrink-0 text-xs text-muted tabular-nums">{fmtDate(a.created_at, { timeStyle: "short" })}</span>
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.status === "error" ? "bg-bad" : a.status === "warning" ? "bg-warn" : a.status === "success" ? "bg-ok" : "bg-muted/60")} />
                  <span className="min-w-0 flex-1 break-words">
                    {a.run_id ? (
                      <Link href={`/runs/${a.run_id}`} className="hover:underline">
                        {a.message}
                      </Link>
                    ) : (
                      a.message
                    )}
                    <span className="ml-2 text-[11px] text-muted">
                      {a.category}
                      {a.tool ? ` · ${a.tool}` : ""}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
