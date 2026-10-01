"use client";
import { useState } from "react";
import { CheckSquare, Plus, Repeat, Trash2 } from "lucide-react";
import { api, fmtDate, useApi } from "@/lib/client";
import { Badge, Button, Card, Empty, Input, Label, Modal, PageHeader, Select, StatusBadge, Tabs, Textarea, cx, useToast } from "@/components/ui";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  due_at: string | null;
  estimated_minutes: number | null;
  tags: string[];
  recurrence: string | null;
  project_id: string | null;
  project_name: string | null;
  source: string;
}

const STATUSES = ["todo", "in_progress", "waiting", "completed", "failed", "cancelled"];
const PRI = { urgent: "bad", high: "warn", medium: "neutral", low: "neutral" } as const;

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function TasksPage() {
  const toast = useToast();
  const [filter, setFilter] = useState("open");
  const [quick, setQuick] = useState("");
  const [edit, setEdit] = useState<Task | null>(null);
  const tasks = useApi<{ tasks: Task[] }>(`/api/tasks?status=${filter === "all" ? "" : filter}&limit=300`, 10_000);
  const projects = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");

  const add = async () => {
    if (!quick.trim()) return;
    try {
      const r = await api<{ task: Task }>("/api/tasks", { body: { text: quick } });
      toast(`Added: ${r.task.title}${r.task.due_at ? ` (due ${fmtDate(r.task.due_at)})` : ""}`, "ok");
      setQuick("");
      tasks.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", body });
      tasks.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const list = tasks.data?.tasks ?? [];
  const groups = filter === "open" ? [{ label: "Overdue", items: list.filter((t) => t.due_at && new Date(t.due_at) < new Date()) }, { label: "Upcoming", items: list.filter((t) => t.due_at && new Date(t.due_at) >= new Date()) }, { label: "No due date", items: list.filter((t) => !t.due_at) }] : [{ label: "", items: list }];

  return (
    <div>
      <PageHeader title="Tasks" icon={<CheckSquare className="h-6 w-6" />} subtitle="Type naturally: “Remind me tomorrow to finish the report”, “Call supplier Friday 3pm #merchants high priority”." />
      <Card className="mb-4 p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task in plain English…" />
          <Button variant="primary" type="submit">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      </Card>
      <div className="mb-4">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In progress" },
            { value: "waiting", label: "Waiting" },
            { value: "completed", label: "Completed" },
            { value: "failed,cancelled", label: "Failed / cancelled" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {tasks.data && !list.length && (
        <Card>
          <Empty title="No tasks here" icon={<CheckSquare className="h-5 w-5" />} />
        </Card>
      )}
      <div className="space-y-4">
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <Card key={g.label} className="overflow-hidden">
              {g.label && <div className={cx("border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wider", g.label === "Overdue" ? "text-bad" : "text-muted")}>{g.label} · {g.items.length}</div>}
              <div className="divide-y divide-line">
                {g.items.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      aria-label={t.status === "completed" ? "Mark open" : "Mark complete"}
                      onClick={() => patch(t.id, { status: t.status === "completed" ? "todo" : "completed" })}
                      className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-md border", t.status === "completed" ? "border-ok bg-ok text-white" : "border-line hover:border-ok")}
                    >
                      {t.status === "completed" && "✓"}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(t)}>
                      <div className={cx("truncate text-sm", t.status === "completed" && "text-muted line-through")}>{t.title}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                        {t.due_at && <span className={cx(new Date(t.due_at) < new Date() && t.status !== "completed" && "text-bad")}>Due {fmtDate(t.due_at)}</span>}
                        {t.project_name && <span>· {t.project_name}</span>}
                        {t.estimated_minutes && <span>· {t.estimated_minutes} min</span>}
                        {t.recurrence && (
                          <span className="inline-flex items-center gap-0.5">
                            · <Repeat className="h-3 w-3" /> recurring
                          </span>
                        )}
                        {t.tags.map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                      </div>
                    </button>
                    {t.priority !== "medium" && <Badge tone={PRI[t.priority as keyof typeof PRI]}>{t.priority}</Badge>}
                    <Select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value })} className="hidden h-8 w-32 text-xs sm:block" aria-label="Status">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ").toUpperCase()}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </Card>
          ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit task">
        {edit && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const due = String(f.get("due") ?? "");
              await patch(edit.id, {
                title: f.get("title"),
                description: f.get("description"),
                priority: f.get("priority"),
                status: f.get("status"),
                projectId: f.get("project") || null,
                dueAt: due ? new Date(due).toISOString() : null,
                estimatedMinutes: f.get("est") ? Number(f.get("est")) : null,
                tags: String(f.get("tags") ?? "").split(/[,\s]+/).map((s) => s.replace(/^#/, "")).filter(Boolean),
              });
              setEdit(null);
            }}
          >
            <div>
              <Label>Title</Label>
              <Input name="title" defaultValue={edit.title} required />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea name="description" defaultValue={edit.description} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select name="priority" defaultValue={edit.priority}>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={edit.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Due</Label>
                <Input name="due" type="datetime-local" defaultValue={toLocalInput(edit.due_at)} />
              </div>
              <div>
                <Label>Estimate (min)</Label>
                <Input name="est" type="number" min={1} defaultValue={edit.estimated_minutes ?? ""} />
              </div>
              <div>
                <Label>Project</Label>
                <Select name="project" defaultValue={edit.project_id ?? ""}>
                  <option value="">—</option>
                  {projects.data?.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Tags</Label>
                <Input name="tags" defaultValue={edit.tags.join(", ")} />
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="danger"
                onClick={async () => {
                  if (!confirm("Delete this task?")) return;
                  await api(`/api/tasks/${edit.id}`, { method: "DELETE" });
                  setEdit(null);
                  tasks.reload();
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
            <div className="text-[11px] text-muted">
              Status: <StatusBadge status={edit.status} /> · created by {edit.source}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
