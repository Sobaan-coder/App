"use client";
import { useState, useTransition } from "react";
import { Loader2, Play, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startStudySession } from "@/lib/actions/study-sessions";
import { toast } from "sonner";

export function SessionSetup({
  topics,
  defaultTopicId,
  planSessionId,
  defaultGoals,
  duration,
}: {
  topics: { id: string; name: string; subject: string }[];
  defaultTopicId: string | null;
  planSessionId: string | null;
  defaultGoals: string[];
  duration: number | null;
}) {
  const [topicId, setTopicId] = useState(defaultTopicId ?? "");
  const [goals, setGoals] = useState<string[]>(defaultGoals.length ? defaultGoals : ["Understand the key rules", "Study one worked example", "Solve 5 questions"]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await startStudySession({ topic_id: topicId || null, plan_session_id: planSessionId, goals: goals.filter(Boolean).map((text) => ({ text, done: false })) });
          if (res && !res.ok) toast.error(res.error);
        });
      }}
    >
      {!planSessionId && (
        <div className="space-y-1.5">
          <Label htmlFor="ss-topic">Topic</Label>
          <select id="ss-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">General study (no topic)</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.subject} — {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Goals</Label>
        <ul className="space-y-1.5">
          {goals.map((g, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-muted-foreground">□</span>
              <Input value={g} onChange={(e) => setGoals((c) => c.map((x, j) => (j === i ? e.target.value : x)))} className="h-9" aria-label={`Goal ${i + 1}`} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove goal" onClick={() => setGoals((c) => c.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a goal"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (draft.trim()) setGoals((c) => [...c, draft.trim()]);
                setDraft("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (draft.trim()) setGoals((c) => [...c, draft.trim()]);
              setDraft("");
            }}
          >
            <Plus /> Add
          </Button>
        </div>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />} Start {duration ? `${duration}-minute ` : ""}session
      </Button>
    </form>
  );
}
