"use client";
import { useState } from "react";
import { AlertTriangle, Check, Eye, Pencil, ShieldAlert, X } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import { Badge, Button, Input, Textarea, cx, useToast } from "./ui";

export interface ApprovalItem {
  id: string;
  title: string;
  reason: string;
  risk_level: string;
  requires_confirmation: boolean;
  kind: string;
  tool_name?: string | null;
  payload?: { tool?: string; input?: unknown };
  status?: string;
  created_at: string;
  run_id?: string | null;
  run_title?: string | null;
}

/** APPROVAL REQUIRED · [View Details] [Approve] [Reject] [Edit] */
export function ApprovalCard({ a, onDone, compact }: { a: ApprovalItem; onDone?: () => void; compact?: boolean }) {
  const toast = useToast();
  const [view, setView] = useState(false);
  const [edit, setEdit] = useState(false);
  const [json, setJson] = useState(JSON.stringify(a.payload?.input ?? {}, null, 2));
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const high = a.requires_confirmation;

  const decide = async (decision: "approve" | "reject") => {
    let editedInput: unknown;
    if (edit && decision === "approve") {
      try {
        editedInput = JSON.parse(json);
      } catch {
        toast("The edited values are not valid JSON", "bad");
        return;
      }
    }
    setBusy(decision);
    try {
      await api(`/api/approvals/${a.id}`, { body: { decision, editedInput, confirmText: high ? confirm : undefined } });
      toast(decision === "approve" ? "Approved — continuing the work" : "Rejected — nothing was executed", decision === "approve" ? "ok" : "info");
      onDone?.();
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cx("rounded-2xl border p-4", high ? "border-bad/40 bg-bad/5" : "border-warn/40 bg-warn/5")}>
      <div className="flex items-start gap-3">
        <div className={cx("rounded-xl p-2", high ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn")}>{high ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("text-[11px] font-bold tracking-wider", high ? "text-bad" : "text-warn")}>{high ? "EXPLICIT CONFIRMATION REQUIRED" : "APPROVAL REQUIRED"}</span>
            <Badge tone={a.risk_level === "high" ? "bad" : a.risk_level === "medium" ? "warn" : "ok"}>{a.risk_level} risk</Badge>
            {a.tool_name && <Badge>{a.tool_name}</Badge>}
            <span className="text-[11px] text-muted">{timeAgo(a.created_at)}</span>
          </div>
          <div className="mt-1 text-sm font-semibold break-words">AI wants to: {a.title}</div>
          {!compact && <div className="mt-0.5 text-xs text-muted">Reason: {a.reason}</div>}
          {view && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-panel-2 p-3 text-[11px] scrollbar-thin">{JSON.stringify(a.payload ?? {}, null, 2)}</pre>
          )}
          {edit && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-muted">Edit what will be executed (validated before running):</div>
              <Textarea rows={8} value={json} onChange={(e) => setJson(e.target.value)} className="font-mono text-[11px]" />
            </div>
          )}
          {high && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-bad">This action is high-risk. Type CONFIRM to allow it.</div>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="CONFIRM" className="max-w-40" />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="success" loading={busy === "approve"} onClick={() => decide("approve")} disabled={high && confirm !== "CONFIRM"}>
              <Check className="h-3.5 w-3.5" /> {edit ? "Approve edited" : "Approve"}
            </Button>
            <Button size="sm" variant="danger" loading={busy === "reject"} onClick={() => decide("reject")}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            {a.payload?.input !== undefined && (
              <Button size="sm" variant="ghost" onClick={() => setEdit((v) => !v)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setView((v) => !v)}>
              <Eye className="h-3.5 w-3.5" /> {view ? "Hide details" : "View details"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
