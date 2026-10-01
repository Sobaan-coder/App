"use client";
import { useState } from "react";
import { Brain, Trash2 } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Tabs, Textarea, useToast } from "@/components/ui";

interface M {
  id: string;
  category: string;
  subject: string;
  content: string;
  project_name: string | null;
  source: string;
  updated_at: string;
}

const CATS = [
  { value: "", label: "All" },
  { value: "preference", label: "Preferences" },
  { value: "project", label: "Projects" },
  { value: "business", label: "Business" },
  { value: "task", label: "Tasks" },
  { value: "general", label: "General" },
];

export default function MemoryPage() {
  const toast = useToast();
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ category: "preference", subject: "", content: "" });
  const { data, reload } = useApi<{ memories: M[] }>(`/api/memory?${cat ? `category=${cat}&` : ""}${q ? `q=${encodeURIComponent(q)}` : ""}`);
  return (
    <div>
      <PageHeader title="Memory" icon={<Brain className="h-6 w-6" />} subtitle="What your assistant remembers. You can also say “Remember that…”, “Forget …” or “What do you remember about …?”. Never store passwords here." />
      <Card className="mb-4 space-y-2 p-4">
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATS.slice(1).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input placeholder="Subject (e.g. Writing style)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <Textarea rows={2} placeholder="What should I remember?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!form.subject || !form.content}
            onClick={async () => {
              try {
                await api("/api/memory", { body: form });
                setForm({ ...form, subject: "", content: "" });
                reload();
              } catch (e) {
                toast((e as Error).message, "bad");
              }
            }}
          >
            Remember
          </Button>
        </div>
      </Card>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs value={cat} onChange={setCat} items={CATS} />
        <Input placeholder="Search memory…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
      </div>
      <Card className="divide-y divide-line">
        {data && !data.memories.length && <Empty title="Nothing remembered yet" icon={<Brain className="h-5 w-5" />} />}
        {data?.memories.map((m) => (
          <div key={m.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{m.subject}</span>
                <Badge>{m.category}</Badge>
                {m.project_name && <Badge tone="accent">{m.project_name}</Badge>}
              </div>
              <div
                className="mt-1 text-sm text-muted outline-none focus:text-ink"
                contentEditable
                suppressContentEditableWarning
                onBlur={async (e) => {
                  const content = e.currentTarget.textContent?.trim() ?? "";
                  if (content && content !== m.content) {
                    await api(`/api/memory/${m.id}`, { method: "PATCH", body: { content } });
                    toast("Updated", "ok");
                  }
                }}
              >
                {m.content}
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {m.source} · updated {timeAgo(m.updated_at)} · click the text to edit
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              title="Forget this"
              onClick={async () => {
                await api(`/api/memory/${m.id}`, { method: "DELETE" });
                reload();
              }}
            >
              <Trash2 className="h-4 w-4" /> Forget
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
