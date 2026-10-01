"use client";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { ArrowDown, Bell, ChevronDown, Clock, Copy, Flag, GitBranch, GripVertical, Hand, Plus, Trash2, Wrench, Zap } from "lucide-react";
import { useApi } from "@/lib/client";
import { Badge, Button, Input, Label, Select, Textarea, cx } from "./ui";

export interface BStep {
  id: string;
  kind: "tool" | "condition" | "delay" | "approval";
  action: string;
  tool?: string;
  input?: Record<string, unknown>;
  forEach?: string;
  when?: { left: string; op: string; right?: unknown };
  condition?: { left: string; op: string; right?: unknown };
  onFalse?: "stop" | "skip_next";
  delayMinutes?: number;
  message?: string;
  retries?: number;
  onError?: "stop" | "continue";
}

export type BTrigger =
  | { type: "schedule"; cron: string; description?: string; timezone?: string }
  | { type: "webhook" }
  | { type: "file_added"; extensions?: string[]; folder?: string }
  | { type: "manual" }
  | { type: "event"; event: "product_added" | "deal_added" };

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  risk: string;
}

const OPS = ["exists", "not_exists", "truthy", "falsy", "eq", "neq", "gt", "gte", "lt", "lte", "contains"];
const PRESETS = [
  { cron: "0 8 * * *", label: "Every day at 08:00" },
  { cron: "0 18 * * *", label: "Every day at 18:00" },
  { cron: "0 9 * * 1-5", label: "Weekdays at 09:00" },
  { cron: "0 8 * * 1", label: "Every Monday at 08:00" },
  { cron: "0 17 * * 5", label: "Every Friday at 17:00" },
  { cron: "0 */2 * * *", label: "Every 2 hours" },
  { cron: "0 * * * *", label: "Every hour" },
  { cron: "0 9 1 * *", label: "Monthly on the 1st at 09:00" },
];

const KIND_META = {
  tool: { icon: Wrench, label: "ACTION", tone: "text-accent bg-accent-soft" },
  condition: { icon: GitBranch, label: "CONDITION", tone: "text-gold bg-gold/10" },
  delay: { icon: Clock, label: "DELAY", tone: "text-muted bg-panel-2" },
  approval: { icon: Hand, label: "APPROVAL", tone: "text-warn bg-warn/10" },
} as const;

let counter = 0;
const newId = (prefix: string, existing: BStep[]) => {
  let id = "";
  do id = `${prefix}${++counter}`;
  while (existing.some((s) => s.id === id));
  return id;
};

function StepCard({ step, index, tools, steps, onChange, onRemove, onDuplicate }: { step: BStep; index: number; tools: ToolInfo[]; steps: BStep[]; onChange: (s: BStep) => void; onRemove: () => void; onDuplicate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const [open, setOpen] = useState(false);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [json, setJson] = useState(JSON.stringify(step.input ?? {}, null, 2));
  const meta = KIND_META[step.kind];
  const tool = tools.find((t) => t.name === step.tool);
  const prev = steps.slice(0, index).map((s) => s.id);

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("relative", isDragging && "z-10 opacity-80")}>
      <div className="rounded-2xl border border-line bg-panel shadow-card">
        <div className="flex items-center gap-2 p-3">
          <button {...attributes} {...listeners} className="cursor-grab touch-none rounded-lg p-1 text-muted hover:bg-panel-2 active:cursor-grabbing" aria-label="Drag to reorder">
            <GripVertical className="h-4 w-4" />
          </button>
          <span className={cx("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold tracking-wider", meta.tone)}>
            <meta.icon className="h-3 w-3" /> {meta.label}
          </span>
          <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
            <div className="truncate text-sm font-medium">{step.action}</div>
            <div className="truncate text-[11px] text-muted">
              {step.kind === "tool" && (step.tool ?? "choose a tool")}
              {step.kind === "condition" && step.condition && `${step.condition.left} ${step.condition.op} ${step.condition.right ?? ""} → else ${step.onFalse === "skip_next" ? "skip next" : "stop"}`}
              {step.kind === "delay" && `wait ${step.delayMinutes ?? 1} min`}
              {step.kind === "approval" && "pause until you approve"}
              {step.forEach && " · loop over items"}
              {step.when && " · conditional"}
              {(step.retries ?? 0) > 0 && ` · ${step.retries} retries`}
            </div>
          </button>
          {tool && tool.risk !== "low" && <Badge tone={tool.risk === "high" ? "bad" : "warn"}>{tool.risk === "dynamic" ? "risk varies" : `${tool.risk} risk`}</Badge>}
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-1 text-muted hover:bg-panel-2" aria-label="Edit step">
            <ChevronDown className={cx("h-4 w-4 transition", open && "rotate-180")} />
          </button>
        </div>
        {open && (
          <div className="space-y-3 border-t border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Label</Label>
                <Input value={step.action} onChange={(e) => onChange({ ...step, action: e.target.value })} />
              </div>
              <div>
                <Label>Step id (for references)</Label>
                <Input value={step.id} disabled />
              </div>
            </div>
            {step.kind === "tool" && (
              <>
                <div>
                  <Label>Tool</Label>
                  <Select value={step.tool ?? ""} onChange={(e) => onChange({ ...step, tool: e.target.value })}>
                    <option value="">Choose…</option>
                    {[...new Set(tools.map((t) => t.category))].map((c) => (
                      <optgroup key={c} label={c}>
                        {tools
                          .filter((t) => t.category === c)
                          .map((t) => (
                            <option key={t.name} value={t.name}>
                              {t.name} {t.risk !== "low" ? `(${t.risk})` : ""}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </Select>
                  {tool && <p className="mt-1 text-[11px] text-muted">{tool.description}</p>}
                </div>
                <div>
                  <Label hint={`— reference earlier results with {{steps.<id>.<field>}}${prev.length ? ` (ids: ${prev.join(", ")})` : ""}, trigger data with {{trigger.x}}, loop items with {{item}}`}>Input (JSON)</Label>
                  <Textarea
                    rows={6}
                    className="font-mono text-[11px]"
                    value={json}
                    onChange={(e) => {
                      setJson(e.target.value);
                      try {
                        onChange({ ...step, input: JSON.parse(e.target.value || "{}") });
                        setJsonErr(null);
                      } catch {
                        setJsonErr("Invalid JSON");
                      }
                    }}
                  />
                  {jsonErr && <p className="mt-1 text-[11px] text-bad">{jsonErr}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Loop over (optional)</Label>
                    <Input placeholder="{{steps.find.files}}" value={step.forEach ?? ""} onChange={(e) => onChange({ ...step, forEach: e.target.value || undefined })} />
                  </div>
                  <div>
                    <Label>Retries</Label>
                    <Input type="number" min={0} max={5} value={step.retries ?? ""} placeholder="default" onChange={(e) => onChange({ ...step, retries: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>If it fails</Label>
                    <Select value={step.onError ?? "stop"} onChange={(e) => onChange({ ...step, onError: e.target.value as "stop" | "continue" })}>
                      <option value="stop">Stop the workflow</option>
                      <option value="continue">Continue anyway</option>
                    </Select>
                  </div>
                </div>
              </>
            )}
            {(step.kind === "condition" || step.kind === "tool") && (
              <div>
                <Label>{step.kind === "condition" ? "Condition" : "Only run if (optional)"}</Label>
                <div className="grid grid-cols-[1fr_8rem_1fr] gap-2">
                  {(() => {
                    const c = (step.kind === "condition" ? step.condition : step.when) ?? { left: "", op: "exists" };
                    const set = (v: { left: string; op: string; right?: unknown } | undefined) => onChange(step.kind === "condition" ? { ...step, condition: v ?? { left: "", op: "exists" } } : { ...step, when: v && v.left ? v : undefined });
                    return (
                      <>
                        <Input placeholder="{{steps.check.changed}}" value={c.left} onChange={(e) => set({ ...c, left: e.target.value })} />
                        <Select value={c.op} onChange={(e) => set({ ...c, op: e.target.value })}>
                          {OPS.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </Select>
                        <Input placeholder="value" value={String(c.right ?? "")} onChange={(e) => set({ ...c, right: e.target.value })} />
                      </>
                    );
                  })()}
                </div>
                {step.kind === "condition" && (
                  <div className="mt-2">
                    <Select value={step.onFalse ?? "stop"} onChange={(e) => onChange({ ...step, onFalse: e.target.value as "stop" | "skip_next" })} className="max-w-xs">
                      <option value="stop">If false: stop here</option>
                      <option value="skip_next">If false: skip the next step</option>
                    </Select>
                  </div>
                )}
              </div>
            )}
            {step.kind === "delay" && (
              <div className="max-w-xs">
                <Label>Wait (minutes)</Label>
                <Input type="number" min={0} value={step.delayMinutes ?? 1} onChange={(e) => onChange({ ...step, delayMinutes: Number(e.target.value) })} />
              </div>
            )}
            {step.kind === "approval" && (
              <div>
                <Label>Message shown in the Approval Center</Label>
                <Input value={step.message ?? ""} onChange={(e) => onChange({ ...step, message: e.target.value })} />
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onDuplicate}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button size="sm" variant="danger" onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-center py-1 text-muted">
        <ArrowDown className="h-4 w-4" />
      </div>
    </div>
  );
}

export function TriggerEditor({ trigger, onChange, webhookUrl }: { trigger: BTrigger; onChange: (t: BTrigger) => void; webhookUrl?: string | null }) {
  return (
    <div className="space-y-3">
      <Select
        value={trigger.type}
        onChange={(e) => {
          const t = e.target.value;
          onChange(
            t === "schedule"
              ? { type: "schedule", cron: "0 8 * * *", description: "Every day at 08:00" }
              : t === "file_added"
                ? { type: "file_added", extensions: [".pdf"] }
                : t === "event"
                  ? { type: "event", event: "product_added" }
                  : ({ type: t } as BTrigger),
          );
        }}
      >
        <option value="schedule">Schedule (time / recurring)</option>
        <option value="file_added">When a file is added</option>
        <option value="webhook">Webhook</option>
        <option value="event">When a product / deal is added</option>
        <option value="manual">Manual only</option>
      </Select>
      {trigger.type === "schedule" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={PRESETS.find((p) => p.cron === trigger.cron)?.cron ?? "custom"} onChange={(e) => e.target.value !== "custom" && onChange({ ...trigger, cron: e.target.value, description: PRESETS.find((p) => p.cron === e.target.value)?.label })}>
            {PRESETS.map((p) => (
              <option key={p.cron} value={p.cron}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom (cron)…</option>
          </Select>
          <Input value={trigger.cron} onChange={(e) => onChange({ ...trigger, cron: e.target.value, description: undefined })} placeholder="min hour day month weekday" className="font-mono" />
          <p className="text-[11px] text-muted sm:col-span-2">Cron format: minute hour day-of-month month day-of-week (in your timezone). Specific date: e.g. “30 9 15 11 *”.</p>
        </div>
      )}
      {trigger.type === "file_added" && (
        <Input value={(trigger.extensions ?? []).join(", ")} onChange={(e) => onChange({ ...trigger, extensions: e.target.value.split(/[,\s]+/).filter(Boolean).map((x) => (x.startsWith(".") ? x : `.${x}`)) })} placeholder=".pdf, .docx" />
      )}
      {trigger.type === "event" && (
        <Select value={trigger.event} onChange={(e) => onChange({ type: "event", event: e.target.value as "product_added" })}>
          <option value="product_added">New product added</option>
          <option value="deal_added">New deal / special offer added</option>
        </Select>
      )}
      {trigger.type === "webhook" && (
        <div className="rounded-xl bg-panel-2 p-3 text-xs">
          {webhookUrl ? (
            <>
              POST to <code className="break-all">{webhookUrl}</code> (JSON body available as {"{{trigger.body}}"}). Keep this URL secret.
            </>
          ) : (
            "The secret webhook URL appears after saving."
          )}
        </div>
      )}
    </div>
  );
}

export function WorkflowBuilder({ trigger, steps, onTrigger, onSteps, webhookUrl }: { trigger: BTrigger; steps: BStep[]; onTrigger: (t: BTrigger) => void; onSteps: (s: BStep[]) => void; webhookUrl?: string | null }) {
  const meta = useApi<{ tools: ToolInfo[] }>("/api/automations/templates");
  const tools = useMemo(() => meta.data?.tools ?? [], [meta.data]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = steps.findIndex((s) => s.id === e.active.id);
    const to = steps.findIndex((s) => s.id === e.over!.id);
    onSteps(arrayMove(steps, from, to));
  };
  const add = (kind: BStep["kind"], preset?: Partial<BStep>) =>
    onSteps([
      ...steps,
      {
        id: newId(kind === "tool" ? "step" : kind, steps),
        kind,
        action: kind === "tool" ? "New action" : kind === "condition" ? "Check a condition" : kind === "delay" ? "Wait" : "Ask for my approval",
        input: {},
        ...(kind === "condition" ? { condition: { left: "", op: "exists" }, onFalse: "stop" as const } : {}),
        ...(kind === "delay" ? { delayMinutes: 5 } : {}),
        ...preset,
      },
    ]);

  return (
    <div>
      <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-wider text-accent">
          <Zap className="h-3.5 w-3.5" /> TRIGGER
        </div>
        <TriggerEditor trigger={trigger} onChange={onTrigger} webhookUrl={webhookUrl} />
      </div>
      <div className="flex justify-center py-1 text-muted">
        <ArrowDown className="h-4 w-4" />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {steps.map((s, i) => (
            <StepCard
              key={s.id}
              step={s}
              index={i}
              steps={steps}
              tools={tools}
              onChange={(n) => onSteps(steps.map((x) => (x.id === s.id ? n : x)))}
              onRemove={() => onSteps(steps.filter((x) => x.id !== s.id))}
              onDuplicate={() => onSteps([...steps.slice(0, i + 1), { ...s, id: newId(s.id.replace(/\d+$/, ""), steps) }, ...steps.slice(i + 1)])}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex flex-wrap justify-center gap-2 rounded-2xl border border-dashed border-line p-3">
        <Button size="sm" onClick={() => add("tool")}>
          <Plus className="h-3.5 w-3.5" /> Action
        </Button>
        <Button size="sm" onClick={() => add("condition")}>
          <GitBranch className="h-3.5 w-3.5" /> Condition
        </Button>
        <Button size="sm" onClick={() => add("delay")}>
          <Clock className="h-3.5 w-3.5" /> Delay
        </Button>
        <Button size="sm" onClick={() => add("approval")}>
          <Hand className="h-3.5 w-3.5" /> Approval
        </Button>
        <Button size="sm" onClick={() => add("tool", { action: "Notify me", tool: "notification_send", input: { title: "Automation finished", body: "" } })}>
          <Bell className="h-3.5 w-3.5" /> Notify
        </Button>
      </div>
      <div className="flex justify-center py-1 text-muted">
        <ArrowDown className="h-4 w-4" />
      </div>
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-ok/30 bg-ok/5 p-3 text-[11px] font-bold tracking-wider text-ok">
        <Flag className="h-3.5 w-3.5" /> RESULT — saved to the run history, activity log and notifications
      </div>
    </div>
  );
}
