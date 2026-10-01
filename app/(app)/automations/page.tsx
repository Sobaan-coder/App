"use client";
import Link from "next/link";
import { useState } from "react";
import { Pause, Play, Plus, Sparkles, Workflow } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Input, Label, Modal, PageHeader, StatusBadge, Textarea, Toggle, useToast } from "@/components/ui";

interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: { description?: string; cron?: string; event?: string; extensions?: string[] };
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  run_count: number;
  consecutive_failures: number;
}
interface Template {
  key: string;
  name: string;
  description: string;
  group: string;
  triggerLabel: string;
  params?: { key: string; label: string; placeholder?: string; required?: boolean }[];
}
interface Draft {
  name: string;
  description: string;
  trigger: { type: string; description?: string };
  steps: { id: string; action: string; tool?: string }[];
}

function triggerText(a: Automation) {
  if (a.trigger_type === "schedule") return a.trigger_config.description ?? `cron ${a.trigger_config.cron}`;
  if (a.trigger_type === "file_added") return `When a file is added ${a.trigger_config.extensions?.join(", ") ?? ""}`;
  if (a.trigger_type === "event") return a.trigger_config.event === "deal_added" ? "When a deal is added" : "When a product is added";
  return a.trigger_type === "webhook" ? "Webhook" : "Manual";
}

export default function AutomationsPage() {
  const toast = useToast();
  const list = useApi<{ automations: Automation[] }>("/api/automations", 10_000);
  const tpl = useApi<{ templates: Template[] }>("/api/automations/templates");
  const settings = useApi<{ settings: { automation: { paused: boolean } } }>("/api/settings");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [useTpl, setUseTpl] = useState<Template | null>(null);
  const paused = settings.data?.settings.automation.paused;

  const preview = async () => {
    setBusy(true);
    try {
      const r = await api<{ draft: Draft | null; triggerLabel: string | null }>("/api/automations/preview", { body: { text } });
      if (!r.draft) toast("I couldn't find steps in that. Try: “Every Monday at 8am check my unfinished tasks and notify me.”", "bad");
      setDraft(r.draft ? { ...r.draft, trigger: { ...r.draft.trigger, description: r.triggerLabel ?? undefined } } : null);
    } finally {
      setBusy(false);
    }
  };
  const create = async (body: unknown) => {
    try {
      const r = await api<{ automation: { id: string } }>("/api/automations", { body });
      toast("Automation created", "ok");
      window.location.href = `/automations/${r.automation.id}`;
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automations"
        icon={<Workflow className="h-6 w-6" />}
        subtitle="Recurring, triggered and on-demand workflows. Sensitive steps still ask for approval."
        actions={
          <>
            <Button
              onClick={async () => {
                await api("/api/settings", { method: "PUT", body: { automation: { paused: !paused } } });
                settings.reload();
                toast(paused ? "Automations resumed" : "All automations paused", "ok");
              }}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? "Resume all" : "Pause all"}
            </Button>
            <Link href="/automations/new" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink">
              <Plus className="h-4 w-4" /> Build visually
            </Link>
          </>
        }
      />
      {paused && <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn">All automations are paused — nothing runs on schedules or triggers until you resume.</div>}

      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-accent" /> Describe an automation in plain English
        </div>
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Every Monday morning, check my unfinished tasks, identify the important ones, create a schedule for the week, and notify me." />
        <div className="mt-2 flex justify-end">
          <Button variant="primary" loading={busy} onClick={preview} disabled={text.trim().length < 5}>
            Design it
          </Button>
        </div>
        {draft && (
          <div className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft/30 p-4">
            <div className="text-sm font-semibold">{draft.name}</div>
            <ol className="mt-3 space-y-1 text-sm">
              <li className="font-medium text-accent">Trigger: {draft.trigger.description ?? draft.trigger.type}</li>
              {draft.steps.map((s) => (
                <li key={s.id} className="pl-3">
                  ↓ {s.action} {s.tool && <span className="text-xs text-muted">({s.tool})</span>}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm">Create this automation?</span>
              <Button variant="primary" onClick={() => create({ draft })}>
                CREATE
              </Button>
              <Link href={`/automations/new?draft=${encodeURIComponent(JSON.stringify(draft))}`} className="text-sm text-accent">
                Customise first
              </Link>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Your automations" />
        <div className="divide-y divide-line">
          {list.data && !list.data.automations.length && <Empty title="No automations yet">Describe one above or start from a template below.</Empty>}
          {list.data?.automations.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <Link href={`/automations/${a.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  {a.consecutive_failures > 0 && <Badge tone="bad">{a.consecutive_failures} failures</Badge>}
                </div>
                <div className="truncate text-xs text-muted">
                  {triggerText(a)}
                  {a.enabled && a.next_run_at ? ` · next ${timeAgo(a.next_run_at)}` : ""} · {a.run_count} runs{a.last_run_at ? ` · last ${timeAgo(a.last_run_at)}` : ""}
                </div>
              </Link>
              <div className="flex items-center gap-3">
                {a.last_status && <StatusBadge status={a.last_status} />}
                <Toggle
                  checked={a.enabled}
                  label={<span className="text-xs text-muted">{a.enabled ? "Active" : "Paused"}</span>}
                  onChange={async (v) => {
                    await api(`/api/automations/${a.id}`, { method: "PATCH", body: { enabled: v } });
                    list.reload();
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Ready-made templates</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tpl.data?.templates.map((t) => (
            <Card key={t.key} className="flex flex-col p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{t.name}</span>
                <Badge className="ml-auto">{t.group}</Badge>
              </div>
              <p className="mt-1 flex-1 text-xs text-muted">{t.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-muted">{t.triggerLabel}</span>
                <Button size="sm" onClick={() => (t.params?.length ? setUseTpl(t) : create({ templateKey: t.key, params: {} }))}>
                  Use template
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal open={!!useTpl} onClose={() => setUseTpl(null)} title={useTpl?.name ?? ""}>
        {useTpl && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void create({ templateKey: useTpl.key, params: Object.fromEntries(useTpl.params!.map((p) => [p.key, String(f.get(p.key) ?? "")])) });
            }}
          >
            {useTpl.params?.map((p) => (
              <div key={p.key}>
                <Label>{p.label}</Label>
                <Input name={p.key} placeholder={p.placeholder} required={p.required} />
              </div>
            ))}
            <Button variant="primary" type="submit" className="w-full">
              Create automation
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
