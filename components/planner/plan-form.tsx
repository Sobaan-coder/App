"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function PlanForm({
  subjects,
  defaults,
}: {
  subjects: { id: string; name: string; examDays: number | null }[];
  defaults: { prompt: string; subjectIds: string[]; days: number | null; minutes: number | null; dailyMinutes: number; replacePlanId?: string | null };
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(defaults.prompt);
  const [selected, setSelected] = useState<string[]>(defaults.subjectIds);
  const [days, setDays] = useState(defaults.days?.toString() ?? "");
  const [dailyMinutes, setDailyMinutes] = useState(defaults.dailyMinutes.toString());
  const [minutes, setMinutes] = useState(defaults.minutes?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soonest = subjects.filter((s) => selected.includes(s.id) && s.examDays !== null && s.examDays >= 0).sort((a, b) => a.examDays! - b.examDays!)[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/planner/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request: prompt,
          subject_ids: selected,
          days: days ? Number(days) : null,
          minutes: minutes ? Number(minutes) : null,
          daily_minutes: dailyMinutes ? Number(dailyMinutes) : null,
          replace_plan_id: defaults.replacePlanId ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/planner/${json.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "We couldn't build your plan. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="plan-prompt">What do you need?</Label>
        <Textarea
          id="plan-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-24"
          placeholder="I have 3 days before my FAR exam. What should I study?"
          required
          minLength={3}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Subjects</legend>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => {
            const on = selected.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected((c) => (on ? c.filter((x) => x !== s.id) : [...c, s.id]))}
                className={cn("rounded-xl border px-3 py-2 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
              >
                {s.name}
                {s.examDays !== null && s.examDays >= 0 && <span className="ml-1 opacity-70">· exam in {s.examDays}d</span>}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="plan-days">Days to plan</Label>
          <Input id="plan-days" type="number" min={1} max={120} value={days} onChange={(e) => setDays(e.target.value)} placeholder={soonest ? `Until exam (${soonest.examDays}d)` : "7"} disabled={!!minutes} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-daily">Minutes per day</Label>
          <Input id="plan-daily" type="number" min={15} max={960} value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} disabled={!!minutes} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-short">Or: one session today (minutes)</Label>
          <Input id="plan-short" type="number" min={15} max={960} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 120" />
        </div>
      </div>
      <Button type="submit" size="lg" disabled={busy || !selected.length || prompt.trim().length < 3}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "Building your plan from your syllabus, papers and progress…" : "Generate plan"}
      </Button>
    </form>
  );
}
