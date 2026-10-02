"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Flame, Loader2, RotateCcw, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { deleteQuestion, solveAgain, updateQuestion } from "@/lib/actions/questions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type QuestionRow = {
  id: string;
  question_text: string;
  answer: string | null;
  options: string[] | null;
  question_type: string;
  difficulty: number;
  marks: number | null;
  year: number | null;
  source_type: "past_paper" | "ai" | "manual";
  source_id: string | null;
  paper_id: string | null;
  paper_title: string | null;
  solved_status: "unsolved" | "attempted" | "solved" | "needs_review";
  bookmarked: boolean;
  marked_difficult: boolean;
  note: string | null;
  attempts: number;
  subject: string | null;
  topic: { id: string; name: string } | null;
};

const TYPE_LABEL: Record<string, string> = { mcq: "MCQ", short: "Short", long: "Long", numerical: "Numerical", theory: "Theory", case_study: "Case study" };
const STATUS = {
  unsolved: { label: "Unsolved", variant: "muted" },
  attempted: { label: "Attempted", variant: "warning" },
  solved: { label: "Solved", variant: "success" },
  needs_review: { label: "Needs review", variant: "destructive" },
} as const;

export function QuestionItem({ q, defaultOpen = false }: { q: QuestionRow; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(q.note ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error((res as { error: string }).error);
      if (success) toast.success(success);
      router.refresh();
    });

  return (
    <li id={`question-${q.id}`} className="scroll-mt-24 rounded-2xl border bg-card">
      <button type="button" className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm leading-relaxed", !open && "line-clamp-2")}>{q.question_text}</span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant={STATUS[q.solved_status].variant}>{STATUS[q.solved_status].label}</Badge>
            <Badge variant="outline">{TYPE_LABEL[q.question_type] ?? q.question_type}</Badge>
            {q.marks !== null && <span>{q.marks} marks</span>}
            {q.year && <span>· {q.year}</span>}
            {q.topic && <span>· {q.topic.name}</span>}
            {q.subject && <span>· {q.subject}</span>}
            <span>· {q.source_type === "past_paper" ? "Past paper" : q.source_type === "ai" ? "AI quiz" : "Added by you"}</span>
            {q.bookmarked && <BookmarkCheck className="size-3.5 text-primary" aria-label="Bookmarked" />}
            {q.marked_difficult && <Flame className="size-3.5 text-destructive" aria-label="Marked difficult" />}
          </span>
        </span>
        {open ? <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          {q.options && q.options.length > 0 && (
            <ol className="list-[upper-alpha] space-y-1 pl-5 text-sm">
              {q.options.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          )}

          <div className="space-y-2">
            <label htmlFor={`work-${q.id}`} className="text-xs font-medium text-muted-foreground">
              Practice — write your answer or working (not saved)
            </label>
            <Textarea id={`work-${q.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-24" placeholder="Work it out here…" />
            <div className="flex flex-wrap gap-2">
              {q.answer ? (
                <Button size="sm" variant="outline" onClick={() => setReveal((r) => !r)}>
                  {reveal ? "Hide answer" : "Reveal answer"}
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/tutor?mode=${draft ? "find_mistake" : "step_by_step"}&q=${encodeURIComponent(draft ? `Question: ${q.question_text}\n\nMy answer: ${draft}` : q.question_text)}${q.topic ? `&topic=${q.topic.id}` : ""}`}>
                    <Sparkles /> {draft ? "Check my answer with AI" : "Solve with AI tutor"}
                  </Link>
                </Button>
              )}
            </div>
            {reveal && q.answer && <p className="rounded-xl bg-muted/60 p-3 text-sm whitespace-pre-wrap">{q.answer}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Mark as</span>
            {(["attempted", "solved", "needs_review"] as const).map((s) => (
              <Button key={s} size="sm" variant={q.solved_status === s ? "default" : "outline"} disabled={pending} onClick={() => run(() => updateQuestion(q.id, { solved_status: s }))}>
                {STATUS[s].label}
              </Button>
            ))}
            {q.solved_status !== "unsolved" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => solveAgain(q.id), "Reset — try it again")}>
                <RotateCcw /> Solve again
              </Button>
            )}
            {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button size="sm" variant="ghost" onClick={() => run(() => updateQuestion(q.id, { bookmarked: !q.bookmarked }))} aria-pressed={q.bookmarked}>
              {q.bookmarked ? <BookmarkCheck className="text-primary" /> : <Bookmark />} {q.bookmarked ? "Bookmarked" : "Bookmark"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => updateQuestion(q.id, { marked_difficult: !q.marked_difficult }))} aria-pressed={q.marked_difficult}>
              <Flame className={q.marked_difficult ? "text-destructive" : undefined} /> {q.marked_difficult ? "Marked difficult" : "Mark difficult"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingNote((e) => !e)}>
              <StickyNote /> {q.note ? "Edit note" : "Add note"}
            </Button>
            {q.paper_id && (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/past-papers/${q.paper_id}#q-${q.source_id}`}>Open in paper</Link>
              </Button>
            )}
            {q.source_type !== "past_paper" && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("Delete this question?") && run(() => deleteQuestion(q.id), "Deleted")}>
                <Trash2 /> Delete
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{q.attempts} attempt{q.attempts === 1 ? "" : "s"}</span>
          </div>
          {q.note && !editingNote && <p className="rounded-xl bg-accent/50 p-3 text-sm whitespace-pre-wrap">{q.note}</p>}
          {editingNote && (
            <div className="space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Question note" placeholder="Mistake I made, approach to remember…" />
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setEditingNote(false);
                  run(() => updateQuestion(q.id, { note: note || null }), "Note saved");
                }}
              >
                Save note
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
