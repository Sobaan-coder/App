"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveTask } from "@/lib/actions/tasks";
import { toast } from "sonner";

export type TaskDraft = {
  id?: string;
  title: string;
  description: string;
  type: "assignment" | "project" | "quiz" | "exam" | "application" | "registration" | "study" | "other";
  subject_id: string;
  date: string;
  time: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
};

const TYPES: [TaskDraft["type"], string][] = [
  ["assignment", "Assignment"], ["project", "Project"], ["quiz", "Quiz"], ["exam", "Exam"],
  ["application", "Application deadline"], ["registration", "Registration deadline"], ["study", "Study task"], ["other", "Other"],
];
const select = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

export function TaskDialog({ subjects, initial, trigger }: { subjects: { id: string; name: string }[]; initial?: TaskDraft; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const blank: TaskDraft = { title: "", description: "", type: "assignment", subject_id: "", date: "", time: "23:59", priority: "medium", status: "todo" };
  const [d, setD] = useState<TaskDraft>(initial ?? blank);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setD(initial ?? blank); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New deadline
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit deadline" : "New deadline"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveTask({
                id: d.id,
                title: d.title,
                description: d.description || null,
                type: d.type,
                subject_id: d.subject_id || null,
                due_at: d.date ? new Date(`${d.date}T${d.time || "23:59"}`).toISOString() : null,
                priority: d.priority,
                status: d.status,
              });
              if (!res.ok) return void toast.error(res.error);
              toast.success("Saved");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="tk-title">Title</Label>
            <Input id="tk-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required maxLength={300} placeholder="Submit IAS 40 case study" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tk-type">Type</Label>
              <select id="tk-type" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as TaskDraft["type"] })} className={select}>
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-subject">Subject</Label>
              <select id="tk-subject" value={d.subject_id} onChange={(e) => setD({ ...d, subject_id: e.target.value })} className={select}>
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="tk-date">Date</Label>
              <Input id="tk-date" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-time">Time</Label>
              <Input id="tk-time" type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-priority">Priority</Label>
              <select id="tk-priority" value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value as TaskDraft["priority"] })} className={select}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-status">Status</Label>
              <select id="tk-status" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as TaskDraft["status"] })} className={select}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-desc">Description</Label>
            <Textarea id="tk-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-16" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
