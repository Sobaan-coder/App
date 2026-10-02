"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const DIFFICULTIES = [
  ["easy", "Easy"],
  ["medium", "Medium"],
  ["hard", "Hard"],
  ["exam", "Exam level"],
] as const;

export function QuizSetup({ subjects, topics, defaultSubjectId, defaultTopicId }: { subjects: { id: string; name: string }[]; topics: { id: string; name: string; subject_id: string }[]; defaultSubjectId: string | null; defaultTopicId: string | null }) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(defaultTopicId ?? "");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number][0]>("medium");
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/quiz/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject_id: topicId ? null : subjectId, topic_id: topicId || null, difficulty, count }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error);
          setBusy(false);
          return;
        }
        router.push(`/quiz/${json.id}`);
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="qz-subject">Subject</Label>
          <select id="qz-subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); }} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qz-topic">Topic</Label>
          <select id="qz-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">My weakest topics</option>
            {topics.filter((t) => t.subject_id === subjectId).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Difficulty</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {DIFFICULTIES.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={difficulty === k} onClick={() => setDifficulty(k)} className={cn("rounded-xl border px-4 py-2 text-sm", difficulty === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="qz-count">Questions: {count}</Label>
        <input id="qz-count" type="range" min={3} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
      </div>
      <Button type="submit" size="lg" disabled={busy || !subjectId}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Writing your quiz…" : "Start quiz"}
      </Button>
    </form>
  );
}
