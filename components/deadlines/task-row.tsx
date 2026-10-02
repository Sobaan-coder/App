"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { deleteTask, setTaskStatus } from "@/lib/actions/tasks";
import { TaskDialog, type TaskDraft } from "./task-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRIORITY = { high: "destructive", medium: "warning", low: "muted" } as const;

export function TaskRow({ task, subjects, dueLabel, overdue }: { task: TaskDraft & { id: string; subjectName: string | null }; subjects: { id: string; name: string }[]; dueLabel: string | null; overdue: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error((res as { error: string }).error);
      router.refresh();
    });
  const done = task.status === "done";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Checkbox checked={done} disabled={pending} onCheckedChange={(v) => run(() => setTaskStatus(task.id, v ? "done" : "todo"))} aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{task.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {dueLabel && <span className={overdue ? "font-medium text-destructive" : undefined}>{dueLabel}</span>}
          {task.subjectName && <span>· {task.subjectName}</span>}
          <span className="capitalize">· {task.type.replace("_", " ")}</span>
          {task.status === "in_progress" && <Badge variant="secondary">In progress</Badge>}
        </p>
      </div>
      <Badge variant={PRIORITY[task.priority]} className="hidden capitalize sm:inline-flex">{task.priority}</Badge>
      <TaskDialog subjects={subjects} initial={task} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${task.title}`}><Pencil /></Button>} />
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${task.title}`} onClick={() => confirm("Delete this deadline?") && run(() => deleteTask(task.id))}>
        <Trash2 />
      </Button>
    </li>
  );
}
