"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api, bytes, fmtDate, useApi } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select, StatusBadge, Tabs, useToast } from "@/components/ui";

interface Data {
  project: { id: string; name: string; description: string; kind: string; status: string; sections: string[]; deadline: string | null };
  tasks: { id: string; title: string; status: string; priority: string; due_at: string | null; tags: string[] }[];
  files: { id: string; name: string; folder: string; size_bytes: number; created_at: string }[];
  memories: { id: string; category: string; subject: string; content: string }[];
  automations: { id: string; name: string; enabled: boolean; trigger_type: string; last_run_at: string | null }[];
  activity: { created_at: string; message: string; status: string }[];
  brands: { id: string; name: string }[];
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, reload } = useApi<Data>(`/api/projects/${id}`);
  const [tab, setTab] = useState("tasks");
  const [task, setTask] = useState("");
  const [note, setNote] = useState("");
  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  const p = data.project;
  const sectionTag = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
  const extra = p.sections.filter((s) => !["Tasks", "Files", "Notes", "Documents", "Automations", "Activity", "Deadlines", "Content", "Products"].includes(s));
  return (
    <div>
      <PageHeader
        title={`PROJECT: ${p.name.toUpperCase()}`}
        subtitle={p.description}
        actions={
          <>
            <Badge>{p.kind}</Badge>
            <Select
              value={p.status}
              onChange={async (e) => {
                await api(`/api/projects/${id}`, { method: "PATCH", body: { status: e.target.value } });
                reload();
              }}
              className="h-9 w-36"
            >
              {["active", "paused", "completed", "archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </>
        }
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "tasks", label: "Tasks", count: data.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length },
            { value: "deadlines", label: "Deadlines" },
            { value: "files", label: "Files & Documents", count: data.files.length },
            { value: "notes", label: "Notes", count: data.memories.length },
            ...extra.map((s) => ({ value: `s:${s}`, label: s })),
            { value: "automations", label: "Automations", count: data.automations.length },
            ...(data.brands.length ? [{ value: "content", label: "Products & Content" }] : []),
            { value: "activity", label: "Activity" },
          ]}
        />
      </div>

      {(tab === "tasks" || tab.startsWith("s:")) && (
        <Card>
          <form
            className="flex gap-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!task.trim()) return;
              await api("/api/tasks", { body: { text: task, projectId: id, tags: tab.startsWith("s:") ? [sectionTag(tab.slice(2))] : undefined } });
              setTask("");
              reload();
            }}
          >
            <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder={tab.startsWith("s:") ? `Add to ${tab.slice(2)}…` : "Add a task to this project…"} />
            <Button type="submit" variant="primary">
              Add
            </Button>
          </form>
          <div className="divide-y divide-line border-t border-line">
            {data.tasks
              .filter((t) => !tab.startsWith("s:") || t.tags.includes(sectionTag(tab.slice(2))))
              .map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.due_at && <span className="text-xs text-muted">{fmtDate(t.due_at)}</span>}
                  <StatusBadge status={t.status} />
                </div>
              ))}
          </div>
        </Card>
      )}
      {tab === "deadlines" && (
        <Card className="divide-y divide-line">
          {data.tasks.filter((t) => t.due_at && !["completed", "cancelled"].includes(t.status)).length === 0 && <Empty title="No upcoming deadlines" />}
          {data.tasks
            .filter((t) => t.due_at && !["completed", "cancelled"].includes(t.status))
            .sort((a, b) => a.due_at!.localeCompare(b.due_at!))
            .map((t) => (
              <div key={t.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{t.title}</span>
                <span className={new Date(t.due_at!) < new Date() ? "text-bad" : "text-muted"}>{fmtDate(t.due_at)}</span>
              </div>
            ))}
        </Card>
      )}
      {tab === "files" && (
        <Card className="divide-y divide-line">
          {!data.files.length && <Empty title="No files">Upload in Files and assign them to this project.</Empty>}
          {data.files.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-panel-2">
              <span className="truncate">{f.name}</span>
              <span className="text-xs text-muted">
                /{f.folder} · {bytes(f.size_bytes)}
              </span>
            </a>
          ))}
        </Card>
      )}
      {tab === "notes" && (
        <Card>
          <form
            className="flex gap-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              try {
                await api("/api/memory", { body: { category: "project", subject: note.slice(0, 60), content: note, projectId: id } });
                setNote("");
                reload();
              } catch (err) {
                toast((err as Error).message, "bad");
              }
            }}
          >
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note the AI should remember for this project…" />
            <Button type="submit" variant="primary">
              Save
            </Button>
          </form>
          <div className="divide-y divide-line border-t border-line">
            {data.memories.map((m) => (
              <div key={m.id} className="px-4 py-2.5 text-sm">
                <div className="font-medium">{m.subject}</div>
                <div className="text-xs text-muted">{m.content}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === "automations" && (
        <Card className="divide-y divide-line">
          {!data.automations.length && <Empty title="No automations linked">Assign an automation to this project from its editor.</Empty>}
          {data.automations.map((a) => (
            <Link key={a.id} href={`/automations/${a.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-panel-2">
              {a.name} <StatusBadge status={a.enabled ? "online" : "cancelled"} label={a.enabled ? "active" : "paused"} />
            </Link>
          ))}
        </Card>
      )}
      {tab === "content" && (
        <Card className="p-5">
          <CardHeader title="Brands in this project" />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {data.brands.map((b) => (
              <Link key={b.id} href="/content/brands" className="rounded-xl border border-line px-3 py-2 text-sm hover:border-accent">
                {b.name}
              </Link>
            ))}
            <Link href="/content" className="rounded-xl border border-line px-3 py-2 text-sm text-accent">
              Open Content Studio →
            </Link>
          </div>
        </Card>
      )}
      {tab === "activity" && (
        <Card className="p-4">
          {!data.activity.length && <Empty title="No activity yet" />}
          {data.activity.map((a, i) => (
            <div key={i} className="flex gap-3 py-1 text-xs">
              <span className="w-32 text-muted">{fmtDate(a.created_at)}</span>
              {a.message}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
