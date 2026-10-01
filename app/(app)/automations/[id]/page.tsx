"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Play, Save, Trash2 } from "lucide-react";
import { api, fmtDate, timeAgo, useApi } from "@/lib/client";
import { WorkflowBuilder, type BStep, type BTrigger } from "@/components/workflow-builder";
import { Button, Card, CardHeader, Empty, Input, Label, PageHeader, StatusBadge, Textarea, Toggle, useToast } from "@/components/ui";

interface Data {
  automation: {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    workflow: { steps: BStep[] };
    next_run_at: string | null;
    last_run_at: string | null;
    webhook_token: string | null;
    consecutive_failures: number;
  };
  runs: { id: string; status: string; created_at: string; finished_at: string | null; error: string | null; summary: string | null }[];
}

export default function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, reload } = useApi<Data>(`/api/automations/${id}`, 8000);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<BTrigger | null>(null);
  const [steps, setSteps] = useState<BStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || dirty) return;
    const a = data.automation;
    setName(a.name);
    setDescription(a.description);
    setTrigger({ ...(a.trigger_config as object), type: a.trigger_type } as BTrigger);
    setSteps(a.workflow.steps);
  }, [data, dirty]);

  if (!data || !trigger) return <div className="text-sm text-muted">Loading…</div>;
  const a = data.automation;
  const webhookUrl = a.webhook_token ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/hooks/${a.webhook_token}` : null;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/automations/${id}`, { method: "PATCH", body: { name, description, trigger, steps } });
      toast("Saved", "ok");
      setDirty(false);
      reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <PageHeader
          title={a.name}
          subtitle={a.enabled ? (a.next_run_at ? `Next run ${timeAgo(a.next_run_at)} (${fmtDate(a.next_run_at)})` : "Active") : "Paused"}
          actions={
            <>
              <Toggle
                checked={a.enabled}
                label={<span className="text-sm">{a.enabled ? "Active" : "Paused"}</span>}
                onChange={async (v) => {
                  await api(`/api/automations/${id}`, { method: "PATCH", body: { enabled: v } });
                  reload();
                }}
              />
              <Button
                onClick={async () => {
                  const r = await api<{ runId: string }>(`/api/automations/${id}/run`, { body: { triggerData: {} } });
                  window.location.href = `/runs/${r.runId}`;
                }}
              >
                <Play className="h-4 w-4" /> Run now
              </Button>
              <Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </>
          }
        />
        <Card className="mb-4 space-y-3 p-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </Card>
        <WorkflowBuilder
          trigger={trigger}
          steps={steps}
          webhookUrl={webhookUrl}
          onTrigger={(t) => {
            setTrigger(t);
            setDirty(true);
          }}
          onSteps={(s) => {
            setSteps(s);
            setDirty(true);
          }}
        />
        <div className="mt-6">
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm(`Delete automation "${a.name}"? Its run history is kept.`)) return;
              await api(`/api/automations/${id}`, { method: "DELETE" });
              window.location.href = "/automations";
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete automation
          </Button>
        </div>
      </div>
      <div>
        <Card className="lg:sticky lg:top-20">
          <CardHeader title="Run history" subtitle={a.consecutive_failures ? `${a.consecutive_failures} consecutive failures` : undefined} />
          <div className="max-h-[70vh] divide-y divide-line overflow-y-auto scrollbar-thin">
            {!data.runs.length && <Empty title="Never run yet" />}
            {data.runs.map((r) => (
              <Link key={r.id} href={`/runs/${r.id}`} className="block px-4 py-2.5 hover:bg-panel-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{fmtDate(r.created_at)}</span>
                  <StatusBadge status={r.status} />
                </div>
                {(r.error || r.summary) && <div className={`mt-1 line-clamp-2 text-xs ${r.error ? "text-bad" : ""}`}>{r.error ?? r.summary}</div>}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
