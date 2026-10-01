"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { WorkflowBuilder, type BStep, type BTrigger } from "@/components/workflow-builder";
import { Button, Card, Input, Label, PageHeader, Textarea, useToast } from "@/components/ui";

function NewAutomation() {
  const toast = useToast();
  const params = useSearchParams();
  const initial = (() => {
    try {
      return params.get("draft") ? (JSON.parse(params.get("draft")!) as { name: string; description: string; trigger: BTrigger; steps: BStep[] }) : null;
    } catch {
      return null;
    }
  })();
  const [name, setName] = useState(initial?.name ?? "My automation");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [trigger, setTrigger] = useState<BTrigger>(initial?.trigger ?? { type: "schedule", cron: "0 8 * * *", description: "Every day at 08:00" });
  const [steps, setSteps] = useState<BStep[]>((initial?.steps ?? []).map((s) => ({ ...s, kind: s.kind ?? "tool" })));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ automation: { id: string } }>("/api/automations", { body: { draft: { name, description, trigger, steps } } });
      window.location.href = `/automations/${r.automation.id}`;
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Workflow builder" subtitle="Trigger → actions → conditions → result. Drag steps to reorder." actions={<Button variant="primary" loading={busy} onClick={save} disabled={!steps.length}>Create automation</Button>} />
      <Card className="mb-4 space-y-3 p-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </Card>
      <WorkflowBuilder trigger={trigger} steps={steps} onTrigger={setTrigger} onSteps={setSteps} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <NewAutomation />
    </Suspense>
  );
}
