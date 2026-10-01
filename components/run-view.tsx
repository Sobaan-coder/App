"use client";
import Link from "next/link";
import { useState } from "react";
import { Ban, CheckCircle2, Circle, CircleDashed, Download, ExternalLink, Loader2, RotateCcw, SkipForward, Sparkles, TriangleAlert, Workflow, XCircle } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Markdown } from "./markdown";
import { ApprovalCard, type ApprovalItem } from "./approval-card";
import { Badge, Button, Card, StatusBadge, cx, useToast } from "./ui";

interface RunData {
  run: {
    id: string;
    title: string;
    status: string;
    progress: number;
    source: string;
    intent: string | null;
    command_text: string | null;
    error: string | null;
    created_at: string;
    finished_at: string | null;
    automation_id: string | null;
    result: { summary?: string; markdown?: string; files?: { id: string; name: string }[]; warnings?: string[]; proposal?: Proposal; postId?: string } | null;
  };
  planSteps: { id: string; action: string; tool?: string; kind: string; risk: string | null }[];
  steps: { step_key: string; status: string; error: string | null; attempts: number; summary: string | null }[];
  approvals: (ApprovalItem & { status: string })[];
}

interface Proposal {
  name: string;
  description: string;
  trigger: { type: string; description?: string; cron?: string };
  steps: { id: string; action: string; tool?: string }[];
}

const ACTIVE = ["queued", "running", "waiting", "approval_required"];

function StepIcon({ status }: { status?: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-ok" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-bad" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
    case "waiting_approval":
      return <TriangleAlert className="h-4 w-4 text-warn" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-muted" />;
    case "cancelled":
      return <Ban className="h-4 w-4 text-muted" />;
    default:
      return <Circle className="h-4 w-4 text-line" />;
  }
}

export function RunView({ runId, compact, onChange }: { runId: string; compact?: boolean; onChange?: () => void }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const { data, reload } = useApi<RunData>(`/api/runs/${runId}`, 1200);
  if (!data)
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Card>
    );
  const { run, planSteps, steps, approvals } = data;
  const active = ACTIVE.includes(run.status);
  const stepStatus = (id: string) => steps.find((s) => s.step_key === id);
  const pending = approvals.filter((a) => a.status === "pending");
  const result = run.result;

  const createAutomation = async () => {
    if (!result?.proposal) return;
    setCreating(true);
    try {
      const r = await api<{ automation: { id: string } }>("/api/automations", { body: { draft: result.proposal } });
      toast("Automation created and active", "ok");
      window.location.href = `/automations/${r.automation.id}`;
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-accent" />
              <Link href={`/runs/${run.id}`} className="truncate text-sm font-semibold hover:underline">
                {run.title}
              </Link>
            </div>
            {run.command_text && !compact && <div className="mt-0.5 truncate text-xs text-muted">“{run.command_text}”</div>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            {active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api(`/api/runs/${run.id}`, { body: { action: "cancel" } });
                  reload();
                  onChange?.();
                }}
              >
                Cancel
              </Button>
            )}
            {(run.status === "failed" || run.status === "cancelled") && (
              <Button
                size="sm"
                onClick={async () => {
                  const r = await api<{ newRunId?: string }>(`/api/runs/${run.id}`, { body: { action: "retry" } });
                  if (r.newRunId) window.location.href = `/runs/${r.newRunId}`;
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div className={cx("h-full rounded-full transition-all duration-500", run.status === "failed" ? "bg-bad" : run.status === "completed" ? "bg-ok" : "bg-accent")} style={{ width: `${run.status === "completed" ? 100 : Math.max(4, run.progress)}%` }} />
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,15rem)_1fr]">
        <ol className="space-y-0.5 border-b border-line p-3 md:border-r md:border-b-0">
          <li className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Plan</li>
          {planSteps.map((p, i) => {
            const s = stepStatus(p.id);
            return (
              <li key={p.id} className={cx("flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs", s?.status === "running" && "bg-accent-soft")}>
                <span className="mt-0.5">
                  <StepIcon status={s?.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block", s?.status === "skipped" && "text-muted line-through")}>
                    {i + 1}. {p.action}
                  </span>
                  {p.tool && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted">
                      {p.tool}
                      {p.risk && p.risk !== "low" && <Badge tone={p.risk === "high" ? "bad" : "warn"}>{p.risk}</Badge>}
                      {s && s.attempts > 1 && <span>· {s.attempts} attempts</span>}
                    </span>
                  )}
                  {s?.error && <span className="mt-0.5 block text-[11px] text-bad">{s.error}</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 space-y-3 p-4 sm:p-5">
          {pending.map((a) => (
            <ApprovalCard
              key={a.id}
              a={a}
              onDone={() => {
                reload();
                onChange?.();
              }}
            />
          ))}
          {run.status === "queued" && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <CircleDashed className="h-4 w-4 animate-spin" /> Got it. Queued — starting in a moment…
            </div>
          )}
          {run.status === "running" && !result?.markdown && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Working on it…
            </div>
          )}
          {run.status === "failed" && <div className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{run.error ?? "Something went wrong."}</div>}
          {result?.markdown && <Markdown>{result.markdown}</Markdown>}
          {!result?.markdown && result?.summary && run.status === "completed" && <p className="text-sm">{result.summary}</p>}

          {result?.proposal && run.status === "completed" && (
            <div className="flex flex-wrap gap-2 rounded-xl border border-accent/30 bg-accent-soft/50 p-3">
              <Button variant="primary" loading={creating} onClick={createAutomation}>
                <Workflow className="h-4 w-4" /> CREATE
              </Button>
              <Button onClick={() => (window.location.href = `/automations/new?draft=${encodeURIComponent(JSON.stringify(result.proposal))}`)}>Customise first</Button>
            </div>
          )}
          {result?.postId && (
            <Link href={`/content/posts/${result.postId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              <ExternalLink className="h-4 w-4" /> Open the post (preview, edit, approve & publish)
            </Link>
          )}
          {!!result?.files?.length && (
            <div className="flex flex-wrap gap-2">
              {result.files.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs hover:border-accent">
                  <Download className="h-3.5 w-3.5" /> {f.name}
                </a>
              ))}
            </div>
          )}
          {!!result?.warnings?.length && (
            <details className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-warn">{result.warnings.length} note(s)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {!compact && <div className="text-[11px] text-muted">Started {timeAgo(run.created_at)}{run.finished_at ? ` · finished ${timeAgo(run.finished_at)}` : ""} · {run.source}{run.intent ? ` · ${run.intent}` : ""}</div>}
        </div>
      </div>
    </Card>
  );
}
