"use client";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { ApprovalCard, type ApprovalItem } from "@/components/approval-card";
import { Card, Empty, PageHeader, StatusBadge, Tabs } from "@/components/ui";

export default function ApprovalsPage() {
  const [status, setStatus] = useState("pending");
  const { data, reload } = useApi<{ approvals: (ApprovalItem & { status: string; decided_at: string | null; decision_note: string | null })[] }>(`/api/approvals?status=${status}`, 4000);
  return (
    <div>
      <PageHeader
        title="Approval Center"
        icon={<ShieldCheck className="h-6 w-6" />}
        subtitle="Medium-risk actions wait for your approval. High-risk actions need you to type CONFIRM. Every decision is logged."
      />
      <div className="mb-4">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "History" },
          ]}
        />
      </div>
      {data && !data.approvals.length && (
        <Card>
          <Empty title={status === "pending" ? "Nothing needs your approval" : "No records"} icon={<ShieldCheck className="h-5 w-5" />}>
            When the AI wants to send, publish, move many files, or change something important, it will ask here first.
          </Empty>
        </Card>
      )}
      <div className="space-y-3">
        {data?.approvals.map((a) =>
          a.status === "pending" ? (
            <div key={a.id}>
              <ApprovalCard a={a} onDone={reload} />
              {a.run_id && (
                <Link href={`/runs/${a.run_id}`} className="mt-1 inline-block px-2 text-xs text-muted hover:text-accent">
                  Part of: {a.run_title}
                </Link>
              )}
            </div>
          ) : (
            <Card key={a.id} className="flex flex-wrap items-center gap-3 p-4">
              <StatusBadge status={a.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.title}</div>
                <div className="text-xs text-muted">
                  {a.tool_name} · {a.risk_level} risk · decided {fmtDate(a.decided_at)}
                  {a.decision_note ? ` · ${a.decision_note}` : ""}
                </div>
              </div>
              {a.run_id && (
                <Link href={`/runs/${a.run_id}`} className="text-xs text-accent">
                  View run
                </Link>
              )}
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
