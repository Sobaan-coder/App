"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type QuizQuestion = { question: string; options: string[] };
export type GradedItem = QuizQuestion & { answer: number; chosen: number; correct: boolean; explanation: string; topic_id: string | null };

export function QuizResults({ items, score, total, topicNames }: { items: GradedItem[]; score: number; total: number; topicNames: Record<string, string> }) {
  const pct = Math.round((score / total) * 100);
  const weak = [...new Set(items.filter((i) => !i.correct && i.topic_id).map((i) => i.topic_id!))];
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Your score</p>
        <p className={cn("text-5xl font-semibold tabular-nums", pct >= 70 ? "text-success" : pct >= 50 ? "text-[oklch(0.6_0.14_70)]" : "text-destructive")}>{score}/{total}</p>
        <p className="mt-1 text-sm text-muted-foreground">{pct}% accuracy · missed questions were added to your question bank</p>
        {weak.length > 0 && (
          <p className="mt-3 text-sm">
            Weak areas:{" "}
            {weak.map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <Link href={`/topics/${t}`} className="font-medium text-primary hover:underline">{topicNames[t] ?? "topic"}</Link>
              </span>
            ))}
          </p>
        )}
      </div>
      <ol className="space-y-3">
        {items.map((q, i) => (
          <li key={i} className="rounded-2xl border bg-card p-4">
            <p className="flex gap-2 text-sm font-medium">
              {q.correct ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <XCircle className="size-5 shrink-0 text-destructive" />}
              <span>{i + 1}. {q.question}</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {q.options.map((o, j) => (
                <li key={j} className={cn("rounded-lg border px-3 py-2", j === q.answer && "border-success/50 bg-success/8", j === q.chosen && !q.correct && "border-destructive/40 bg-destructive/5")}>
                  <span className="font-medium">{String.fromCharCode(65 + j)}.</span> {o}
                  {j === q.answer && <span className="ml-2 text-xs text-success">correct</span>}
                  {j === q.chosen && !q.correct && <span className="ml-2 text-xs text-destructive">your answer</span>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{q.explanation.replace(/\[S\d+\]/g, "")}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function QuizRunner({ id, questions }: { id: string; questions: QuizQuestion[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>(questions.map(() => -1));
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const q = questions[current];
  const answered = answers.filter((a) => a >= 0).length;

  async function submit() {
    setSubmitting(true);
    const res = await fetch(`/api/quiz/${id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers, duration_seconds: Math.floor((Date.now() - started.current) / 1000) }),
    });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Couldn't submit.");
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Question {current + 1} of {questions.length}</span>
        <span className="tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
      </div>
      <Progress value={(answered / questions.length) * 100} aria-label="Answered" />
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-base font-medium leading-relaxed">{q.question}</p>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
          {q.options.map((o, j) => (
            <button
              key={j}
              type="button"
              role="radio"
              aria-checked={answers[current] === j}
              onClick={() => setAnswers((a) => a.map((x, k) => (k === current ? j : x)))}
              className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", answers[current] === j ? "border-primary bg-primary/8" : "bg-card hover:bg-accent")}
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold", answers[current] === j && "border-primary bg-primary text-primary-foreground")}>{String.fromCharCode(65 + j)}</span>
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</Button>
        {current < questions.length - 1 ? (
          <Button onClick={() => setCurrent((c) => c + 1)}>Next</Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />} Submit ({answered}/{questions.length} answered)
          </Button>
        )}
      </div>
      <nav aria-label="Jump to question" className="flex flex-wrap gap-1.5">
        {questions.map((_, i) => (
          <button key={i} type="button" onClick={() => setCurrent(i)} aria-label={`Question ${i + 1}`} aria-current={i === current} className={cn("size-8 rounded-lg border text-xs", i === current && "border-primary", answers[i] >= 0 && "bg-accent")}>
            {i + 1}
          </button>
        ))}
      </nav>
    </div>
  );
}
