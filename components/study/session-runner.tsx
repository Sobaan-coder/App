"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfidencePicker } from "@/components/common/confidence-picker";
import { finishStudySession, saveSessionGoals } from "@/lib/actions/study-sessions";
import { toast } from "sonner";

type Goal = { text: string; done: boolean };

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

export function SessionRunner({ id, startedAt, plannedMinutes, initialGoals, done }: { id: string; startedAt: string; plannedMinutes: number | null; initialGoals: Goal[]; done: boolean }) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (done) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, done]);

  function toggle(i: number, value: boolean) {
    const next = goals.map((g, j) => (j === i ? { ...g, done: value } : g));
    setGoals(next);
    saveSessionGoals(id, next).catch(() => {});
  }

  const target = (plannedMinutes ?? 45) * 60;
  return (
    <div className="space-y-6">
      {!done && (
        <div className="rounded-3xl border bg-card p-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Focus time</p>
          <p className="mt-2 font-mono text-5xl font-semibold tabular-nums" aria-live="off">
            {fmt(elapsed)}
          </p>
          <Progress value={Math.min(100, (elapsed / target) * 100)} className="mx-auto mt-4 h-1.5 max-w-xs" aria-label="Session progress" />
          <p className="mt-2 text-xs text-muted-foreground">Planned: {plannedMinutes ?? 45} minutes</p>
        </div>
      )}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Goals</h2>
        <ul className="space-y-2">
          {goals.map((g, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
              <Checkbox id={`goal-${i}`} checked={g.done} disabled={done} onCheckedChange={(v) => toggle(i, v)} />
              <label htmlFor={`goal-${i}`} className={g.done ? "text-sm text-muted-foreground line-through" : "text-sm"}>
                {g.text}
              </label>
            </li>
          ))}
        </ul>
      </div>
      {!done && (
        <Button size="lg" className="w-full sm:w-auto" onClick={() => setEnding(true)}>
          <Square /> End session
        </Button>
      )}

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How confident are you?</DialogTitle>
            <DialogDescription>This updates your topic confidence, when you&apos;ll revise it next, and your plan.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <ConfidencePicker size="lg" value={confidence} onChange={setConfidence} />
          </div>
          <div className="flex justify-between px-1 text-xs text-muted-foreground">
            <span>1 · lost</span>
            <span>5 · confident</span>
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember? (optional)" aria-label="Session notes" />
          <DialogFooter>
            <Button
              disabled={!confidence || pending}
              onClick={() =>
                start(async () => {
                  const res = await finishStudySession(id, { confidence: confidence!, notes: notes || null, goals });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Session saved — your plan and revision schedule are updated.", { icon: <CheckCircle2 className="size-4" /> });
                  setEnding(false);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Finish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
