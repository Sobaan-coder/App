"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowUp, Mic, CheckSquare, ChevronRight, Clock, FileSearch, FolderSync, Lightbulb, ListTodo, Megaphone, Repeat, Search, ShieldCheck, Sparkles, Sun, Workflow } from "lucide-react";
import { api, fmtDate, timeAgo, useApi } from "@/lib/client";
import { RunView } from "@/components/run-view";
import { ApprovalCard, type ApprovalItem } from "@/components/approval-card";
import { useVoice } from "@/components/voice/voice-assistant";
import { Badge, Button, Card, CardHeader, Empty, Modal, Select, StatusBadge, cx, useToast } from "@/components/ui";

interface Dashboard {
  user: { name: string };
  profile: { timezone: string };
  counts: Record<string, number>;
  queue: { id: string; title: string; status: string; progress: number; current_action: string | null; total_steps: number; current_step: number; created_at: string; summary: string | null }[];
  approvals: ApprovalItem[];
  tasks: { id: string; title: string; priority: string; status: string; due_at: string | null; project_name: string | null }[];
  activity: { id: string; created_at: string; message: string; status: string; run_id: string | null }[];
  suggestion: { id: string; example_command: string; occurrences: number } | null;
  status: { ai: string; worker: string; automationsPaused: boolean; allowPaid: boolean };
  firstRun: boolean;
}

const EXAMPLES = [
  "Prepare today's work plan.",
  "Summarize the documents I added today.",
  "Create 5 Instagram captions for Merchants.",
  "Find all unfinished tasks.",
  "Prepare tomorrow's schedule.",
  "Research free local AI models and create a report.",
  "Check my project deadlines.",
  "Organize my files.",
  "Create today's Merchants content.",
  "What should I work on next?",
];

const ONBOARDING = [
  { icon: Sun, text: "I want my daily work planned automatically.", template: "daily_planner" },
  { icon: FolderSync, text: "I want my files organized.", template: "file_organizer" },
  { icon: FileSearch, text: "I want documents summarized automatically.", template: "document_processor" },
  { icon: Repeat, text: "I want recurring tasks handled.", command: "Remind me every Friday to prepare the weekly report" },
  { icon: Megaphone, text: "I want my business workflows automated.", template: "daily_content" },
  { icon: Search, text: "I want research reports created automatically.", command: "Research the best free tools for small business automation" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const priorityTone = { urgent: "bad", high: "warn", medium: "neutral", low: "neutral" } as const;

export default function Home() {
  const toast = useToast();
  const dash = useApi<Dashboard>("/api/dashboard", 5000);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [understood, setUnderstood] = useState<string | null>(null);
  const voice = useVoice();
  const [suggestion, setSuggestion] = useState<Dashboard["suggestion"]>(null);
  const [welcome, setWelcome] = useState(false);
  const [cron, setCron] = useState("0 9 * * 1-5");
  const ref = useRef<HTMLTextAreaElement>(null);
  const d = dash.data;

  useEffect(() => {
    if (d?.firstRun) setWelcome(true);
  }, [d?.firstRun]);
  useEffect(() => {
    if (d?.suggestion) setSuggestion(d.suggestion);
  }, [d?.suggestion]);

  const send = async (cmd?: string) => {
    const t = (cmd ?? text).trim();
    if (t.length < 2) return;
    setBusy(true);
    try {
      const r = await api<{ runId: string; goal: string; steps: unknown[]; requiresApproval: boolean; reply: string; lang: string; understoodAs: string; suggestion: Dashboard["suggestion"] | { id: string; example: string; occurrences: number } }>("/api/command", { body: { text: t } });
      setUnderstood(r.lang !== "en" && r.understoodAs !== t ? r.understoodAs : null);
      setRunId(r.runId);
      setAck(
        r.lang === "en"
          ? `Got it. I'll ${r.goal.charAt(0).toLowerCase()}${r.goal.slice(1).replace(/[.]$/, "")} — ${r.steps.length} step${r.steps.length === 1 ? "" : "s"}${r.requiresApproval ? ", I'll ask before anything sensitive" : ""}.`
          : r.reply,
      );
      if (r.suggestion) setSuggestion({ id: r.suggestion.id, example_command: "example" in r.suggestion ? r.suggestion.example : r.suggestion.example_command, occurrences: r.suggestion.occurrences });
      setText("");
      dash.reload();
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const useTemplate = async (o: (typeof ONBOARDING)[number]) => {
    if (o.template) {
      try {
        const r = await api<{ automation: { id: string; name: string } }>("/api/automations", { body: { templateKey: o.template, params: {} } });
        toast(`Automation “${r.automation.name}” created`, "ok");
        await api("/api/auth/me", { method: "PATCH", body: { onboardingCompleted: true } });
        window.location.href = `/automations/${r.automation.id}`;
      } catch (err) {
        toast((err as Error).message, "bad");
      }
    } else if (o.command) {
      setWelcome(false);
      await api("/api/auth/me", { method: "PATCH", body: { onboardingCompleted: true } });
      void send(o.command);
    }
  };

  const stats = [
    { label: "Open tasks", value: d?.counts.open_tasks, sub: d?.counts.overdue_tasks ? `${d.counts.overdue_tasks} overdue` : `${d?.counts.done_today ?? 0} done today`, href: "/tasks", icon: CheckSquare, tone: d?.counts.overdue_tasks ? "text-bad" : "text-muted" },
    { label: "Approvals", value: d?.counts.pending_approvals, sub: "waiting for you", href: "/approvals", icon: ShieldCheck, tone: d?.counts.pending_approvals ? "text-warn" : "text-muted" },
    { label: "Automations", value: d?.counts.active_automations, sub: d?.status.automationsPaused ? "PAUSED" : `${d?.counts.active_runs ?? 0} running now`, href: "/automations", icon: Workflow, tone: d?.status.automationsPaused ? "text-warn" : "text-muted" },
    { label: "Content", value: d?.counts.content_ready, sub: `${d?.counts.content_scheduled ?? 0} scheduled`, href: "/content", icon: Megaphone, tone: "text-muted" },
  ];

  return (
    <div className="space-y-6">
      {/* COMMAND BOX */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel p-4 shadow-card sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className={cx("h-2 w-2 rounded-full", d?.status.ai === "model" ? "bg-ok" : "bg-gold")} />
            {d ? (d.status.ai === "model" ? "AI online" : "AI online · free offline engine (connect Ollama for smarter writing)") : "Connecting…"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}
            {d?.user.name ? `, ${d.user.name}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted">{voice?.settings?.name ? <>I'm <b className="text-ink">{voice.settings.name}</b>{voice.settings.urduName ? <span className="urdu mx-1">({voice.settings.urduName})</span> : null}. </> : null}Tell me what you need — in English or Urdu, typed or spoken. I'll plan it, do it, and ask before anything sensitive.</p>
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-bg p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--ring)]">
              <textarea
                dir="auto"
                ref={ref}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="What do you want me to do?  ·  کیا کرنا ہے؟"
                aria-label="What do you want me to do?"
                className="max-h-48 min-h-[3rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted/70"
              />
              {voice?.supported && (
                <button type="button" onClick={() => voice.listenNow()} aria-label="Speak a command" title={`Talk to ${voice.settings?.name ?? "your assistant"} (English or Urdu)`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-accent hover:text-accent">
                  <Mic className="h-5 w-5" />
                </button>
              )}
              <button type="submit" disabled={busy} aria-label="Run command" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-sm transition hover:brightness-110 disabled:opacity-60">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </div>
          </form>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => void send(e)} className="shrink-0 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-ink">
                {e}
              </button>
            ))}
          </div>
        </div>
      </section>

      {ack && runId && (
        <section className="space-y-3">
          <p dir="auto" className={cx("text-sm font-medium", /[\u0600-\u06FF]/.test(ack) && "urdu text-base")}>{ack}</p>
          {understood && <p className="-mt-2 text-xs text-muted">Understood as: “{understood}”</p>}
          <RunView runId={runId} onChange={dash.reload} />
        </section>
      )}

      {suggestion && (
        <Card className="border-accent/30 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl bg-accent-soft p-2 text-accent">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">You perform this task frequently. Would you like me to create an automation?</div>
              <div className="truncate text-xs text-muted">
                “{suggestion.example_command}” · {suggestion.occurrences} times recently
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={cron} onChange={(e) => setCron(e.target.value)} className="h-9 w-44 text-xs">
                <option value="0 9 * * 1-5">Weekdays at 09:00</option>
                <option value="0 8 * * *">Every day at 08:00</option>
                <option value="0 18 * * *">Every day at 18:00</option>
                <option value="0 9 * * 1">Mondays at 09:00</option>
                <option value="0 17 * * 5">Fridays at 17:00</option>
              </Select>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  const r = await api<{ automation: { id: string } }>(`/api/suggestions/${suggestion.id}`, { body: { action: "accept", cron } });
                  toast("Automation created", "ok");
                  window.location.href = `/automations/${r.automation.id}`;
                }}
              >
                Create Automation
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api(`/api/suggestions/${suggestion.id}`, { body: { action: "dismiss" } });
                  setSuggestion(null);
                }}
              >
                Not Now
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group rounded-2xl border border-line bg-panel p-4 shadow-card transition hover:border-accent/50">
            <div className="flex items-center justify-between text-xs text-muted">
              {s.label}
              <s.icon className="h-4 w-4 opacity-60 transition group-hover:text-accent group-hover:opacity-100" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value ?? "–"}</div>
            <div className={cx("text-[11px]", s.tone)}>{s.sub}</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {!!d?.approvals.length && (
            <Card>
              <CardHeader title="Waiting for your approval" icon={<ShieldCheck className="h-4 w-4" />} action={<Link href="/approvals" className="text-xs text-accent">All approvals</Link>} />
              <div className="space-y-3 px-4 pb-4 sm:px-5">
                {d.approvals.slice(0, 3).map((a) => (
                  <ApprovalCard key={a.id} a={a} compact onDone={dash.reload} />
                ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="AI Work Queue" icon={<ListTodo className="h-4 w-4" />} action={<Link href="/queue" className="text-xs text-accent">Open queue</Link>} />
            <div className="divide-y divide-line">
              {!d && <div className="p-5 text-xs text-muted">Loading…</div>}
              {d && !d.queue.length && <Empty title="No work yet" icon={<Sparkles className="h-5 w-5" />}>Type a command above — it will appear here with live progress.</Empty>}
              {d?.queue.map((r) => (
                <Link key={r.id} href={`/runs/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted">
                      {["running", "queued", "waiting", "approval_required"].includes(r.status) ? `Step ${Math.min(r.current_step + 1, r.total_steps)}/${r.total_steps}: ${r.current_action ?? "…"}` : (r.summary ?? "")} · {timeAgo(r.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Up next" icon={<Clock className="h-4 w-4" />} action={<Link href="/tasks" className="text-xs text-accent">All tasks</Link>} />
            <div className="divide-y divide-line">
              {d && !d.tasks.length && <Empty title="All clear">No open tasks. Try “Remind me tomorrow to …”.</Empty>}
              {d?.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <button
                    aria-label="Mark complete"
                    className="h-4 w-4 shrink-0 rounded-md border border-line hover:border-ok"
                    onClick={async () => {
                      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: "completed" } });
                      toast(`Completed: ${t.title}`, "ok");
                      dash.reload();
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{t.title}</div>
                    <div className="text-[11px] text-muted">
                      {t.due_at ? (new Date(t.due_at) < new Date() ? <span className="text-bad">Overdue · {fmtDate(t.due_at)}</span> : `Due ${fmtDate(t.due_at)}`) : "No due date"}
                      {t.project_name ? ` · ${t.project_name}` : ""}
                    </div>
                  </div>
                  {t.priority !== "medium" && <Badge tone={priorityTone[t.priority as keyof typeof priorityTone] ?? "neutral"}>{t.priority}</Badge>}
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Activity" icon={<Sparkles className="h-4 w-4" />} action={<Link href="/activity" className="text-xs text-accent">Full log</Link>} />
            <ol className="relative space-y-3 px-4 pb-4 sm:px-5">
              {d?.activity.map((a) => (
                <li key={a.id} className="flex gap-3 text-xs">
                  <span className="w-16 shrink-0 pt-0.5 text-[11px] whitespace-nowrap text-muted tabular-nums">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", a.status === "error" ? "bg-bad" : a.status === "warning" ? "bg-warn" : a.status === "success" ? "bg-ok" : "bg-muted")} />
                  {a.run_id ? (
                    <Link href={`/runs/${a.run_id}`} className="min-w-0 flex-1 break-words hover:underline">
                      {a.message}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 break-words">{a.message}</span>
                  )}
                </li>
              ))}
              {d && !d.activity.length && <li className="text-xs text-muted">No activity yet.</li>}
            </ol>
          </Card>
        </div>
      </section>

      <Modal
        open={welcome}
        onClose={async () => {
          setWelcome(false);
          await api("/api/auth/me", { method: "PATCH", body: { onboardingCompleted: true } }).catch(() => {});
        }}
        title="WELCOME TO YOUR AI COMMAND CENTER"
        wide
      >
        <div className="text-center">
          <h2 className="text-xl font-semibold">What do you want to automate?</h2>
          <p className="mt-1 text-sm text-muted">Pick one to set it up in one click — you can change everything later. Nothing sensitive ever runs without your approval.</p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {ONBOARDING.map((o) => (
            <button key={o.text} onClick={() => useTemplate(o)} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 text-left text-sm transition hover:border-accent hover:bg-accent-soft/40">
              <span className="rounded-xl bg-accent-soft p-2 text-accent">
                <o.icon className="h-4 w-4" />
              </span>
              <span className="flex-1">“{o.text}”</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-between gap-2 text-xs text-muted">
          <span>Everything runs at $0 by default — local and free tools first.</span>
          <button
            className="text-accent"
            onClick={async () => {
              setWelcome(false);
              await api("/api/auth/me", { method: "PATCH", body: { onboardingCompleted: true } });
              ref.current?.focus();
            }}
          >
            I'll explore myself
          </button>
        </div>
      </Modal>
    </div>
  );
}
