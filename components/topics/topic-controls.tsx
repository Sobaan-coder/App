"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfidencePicker } from "@/components/common/confidence-picker";
import { updateTopicMeta, updateTopicProgress } from "@/lib/actions/subjects";
import { STATUS_LABEL } from "@/lib/format";
import { toast } from "sonner";

export function TopicStatusControls({ topicId, status, confidence, difficulty }: { topicId: string; status: keyof typeof STATUS_LABEL; confidence: number | null; difficulty: number }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error((res as { error: string }).error);
    });
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="topic-status">Status</Label>
        <select
          id="topic-status"
          value={status}
          disabled={pending}
          onChange={(e) => run(() => updateTopicProgress(topicId, { status: e.target.value as keyof typeof STATUS_LABEL }))}
          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
        >
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Confidence</Label>
        <ConfidencePicker value={confidence} disabled={pending} onChange={(v) => run(() => updateTopicProgress(topicId, { confidence: v }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="topic-diff">Difficulty</Label>
        <select
          id="topic-diff"
          value={difficulty}
          disabled={pending}
          onChange={(e) => run(() => updateTopicMeta(topicId, { difficulty: Number(e.target.value) }))}
          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
        >
          {["Easy", "Fairly easy", "Medium", "Hard", "Very hard"].map((l, i) => (
            <option key={l} value={i + 1}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
    </div>
  );
}

export function TopicNotes({ topicId, initial }: { topicId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = value !== initial;
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your own notes for this topic — key rules, mistakes you made, mnemonics…"
        className="min-h-40"
        aria-label="Topic notes"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await updateTopicProgress(topicId, { notes: value });
              if (!res.ok) toast.error(res.error);
              else toast.success("Notes saved");
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Save notes
        </Button>
      </div>
    </div>
  );
}
