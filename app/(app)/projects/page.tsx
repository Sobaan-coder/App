"use client";
import Link from "next/link";
import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { api, fmtDate, useApi } from "@/lib/client";
import { Badge, Button, Card, Input, Label, Modal, PageHeader, Select, Textarea, useToast } from "@/components/ui";

interface Project {
  id: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  color: string;
  open_tasks: number;
  done_tasks: number;
  files: number;
  next_deadline: string | null;
}

export default function ProjectsPage() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{ projects: Project[] }>("/api/projects");
  return (
    <div>
      <PageHeader
        title="Projects"
        icon={<FolderKanban className="h-6 w-6" />}
        subtitle="Workspaces the AI understands — mention a project in a command and it uses that context."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.projects.map((p) => {
          const total = p.open_tasks + p.done_tasks;
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full p-5 transition hover:border-accent/50">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                  <span className="font-semibold">PROJECT: {p.name.toUpperCase()}</span>
                  <Badge className="ml-auto">{p.kind}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted">{p.description || "No description."}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full bg-ok" style={{ width: `${total ? (p.done_tasks / total) * 100 : 0}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  <span>
                    {p.open_tasks} open · {p.done_tasks} done · {p.files} files
                  </span>
                  {p.next_deadline && <span>Next: {fmtDate(p.next_deadline, { dateStyle: "medium" })}</span>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="New project">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await api("/api/projects", { body: { name: f.get("name"), description: f.get("description"), kind: f.get("kind") } });
              setOpen(false);
              reload();
            } catch (err) {
              toast((err as Error).message, "bad");
            }
          }}
        >
          <div>
            <Label>Name</Label>
            <Input name="name" required />
          </div>
          <div>
            <Label>Type</Label>
            <Select name="kind">
              <option value="general">General</option>
              <option value="business">Business (products, content, deadlines…)</option>
              <option value="study">Study (subjects, chapters, exams…)</option>
              <option value="personal">Personal</option>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea name="description" rows={3} />
          </div>
          <Button type="submit" variant="primary" className="w-full">
            Create
          </Button>
        </form>
      </Modal>
    </div>
  );
}
