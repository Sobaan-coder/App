"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { addQuestion } from "@/lib/actions/questions";
import { toast } from "sonner";

const select = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

export function AddQuestionDialog({ subjects, topics }: { subjects: { id: string; name: string }[]; topics: { id: string; name: string; subject_id: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [pending, start] = useTransition();
  if (!subjects.length) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Add question
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a question</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const res = await addQuestion({
                subject_id: subjectId,
                topic_id: (f.get("topic") as string) || null,
                question_text: String(f.get("text")),
                answer: (f.get("answer") as string) || null,
                question_type: f.get("type") as "short",
                difficulty: Number(f.get("difficulty")),
                marks: f.get("marks") ? Number(f.get("marks")) : null,
                year: f.get("year") ? Number(f.get("year")) : null,
              });
              if (!res.ok) return void toast.error(res.error);
              toast.success("Question added");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="aq-subject">Subject</Label>
              <select id="aq-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={select}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aq-topic">Topic</Label>
              <select id="aq-topic" name="topic" className={select}>
                <option value="">—</option>
                {topics
                  .filter((t) => t.subject_id === subjectId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aq-text">Question</Label>
            <Textarea id="aq-text" name="text" required minLength={5} className="min-h-24" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aq-answer">Answer / solution (optional)</Label>
            <Textarea id="aq-answer" name="answer" className="min-h-16" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="aq-type">Type</Label>
              <select id="aq-type" name="type" defaultValue="short" className={select}>
                <option value="mcq">MCQ</option>
                <option value="short">Short</option>
                <option value="long">Long</option>
                <option value="numerical">Numerical</option>
                <option value="theory">Theory</option>
                <option value="case_study">Case study</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aq-diff">Difficulty</Label>
              <select id="aq-diff" name="difficulty" defaultValue="3" className={select}>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aq-marks">Marks</Label>
              <Input id="aq-marks" name="marks" type="number" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aq-year">Year</Label>
              <Input id="aq-year" name="year" type="number" min={1950} max={2100} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Add question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
