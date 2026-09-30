import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lightbulb, Scissors } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PlanActions, SessionActions } from "@/components/planner/plan-controls";
import { getProfile, requireUser } from "@/lib/auth";
import { todayIn } from "@/lib/data/workspace";
import { ACTIVITY_LABEL, addMinutesToTime, formatDate, minutesLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Study plan" };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile?.timezone);
  const [{ data: plan }, { data: sessions }] = await Promise.all([
    supabase.from("study_plans").select("*, subjects(name, code)").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("study_plan_sessions").select("*, topics(id, name)").eq("study_plan_id", id).order("scheduled_date").order("start_time", { nullsFirst: false }).order("sort_order"),
  ]);
  if (!plan) notFound();

  const all = sessions ?? [];
  const active = all.filter((s) => s.status !== "skipped");
  const doneMin = active.filter((s) => s.status === "done").reduce((a, s) => a + s.duration, 0);
  const totalMin = active.reduce((a, s) => a + s.duration, 0);
  const days = [...new Set(all.map((s) => s.scheduled_date))].sort();
  const strategy = (plan.strategy as string[]) ?? [];
  const skip = (plan.skip_if_short as string[]) ?? [];
  const missed = all.filter((s) => s.status === "planned" && s.scheduled_date < today).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Link href="/planner" className="text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
            Planner
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{plan.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(plan.start_date)} – {plan.end_date ? formatDate(plan.end_date) : "…"}
            {plan.exam_date && ` · exam ${formatDate(plan.exam_date)}`}
            {plan.status === "archived" && " · archived"}
          </p>
        </div>
        <PlanActions planId={plan.id} subjectId={plan.subject_id} archived={plan.status === "archived"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{plan.summary}</p>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>{minutesLabel(doneMin)} of {minutesLabel(totalMin)} done</span>
                <span>{totalMin ? Math.round((doneMin / totalMin) * 100) : 0}%</span>
              </div>
              <Progress value={totalMin ? (doneMin / totalMin) * 100 : 0} aria-label="Plan progress" />
            </div>
            {missed > 0 && plan.status === "active" && (
              <p className="rounded-xl bg-warning/10 p-3 text-sm">
                {missed} session{missed === 1 ? " was" : "s were"} missed. Use <strong>Adapt to my progress</strong> to move them intelligently without overloading your days.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" /> Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {strategy.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {skip.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Scissors className="size-3.5" /> Safe to skip if you run short
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {skip.map((s) => (
                    <Badge key={s} variant="muted">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ol className="space-y-6">
        {days.map((day, i) => {
          const list = all.filter((s) => s.scheduled_date === day);
          const dayMin = list.filter((s) => s.status !== "skipped").reduce((a, s) => a + s.duration, 0);
          return (
            <li key={day}>
              <h2 className={cn("mb-3 flex items-baseline gap-2 font-semibold", day === today && "text-primary")}>
                DAY {i + 1}
                <span className="text-sm font-normal text-muted-foreground">
                  {formatDate(day, { weekday: "long", day: "numeric", month: "short" })}
                  {day === today && " · today"} · {minutesLabel(dayMin)}
                </span>
              </h2>
              <ul className="space-y-2">
                {list.map((s) => {
                  const topic = s.topics as { id: string; name: string } | null;
                  return (
                    <li key={s.id} className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-start", (s.status === "done" || s.status === "skipped") && "opacity-60")}>
                      <div className="w-28 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {s.start_time ? `${s.start_time.slice(0, 5)}–${addMinutesToTime(s.start_time.slice(0, 5), s.duration)}` : minutesLabel(s.duration)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("font-medium", s.status === "done" && "line-through")}>{s.title}</span>
                          <Badge variant="muted">{ACTIVITY_LABEL[s.activity]}</Badge>
                          {s.status === "skipped" && <Badge variant="outline">Skipped</Badge>}
                          {s.status === "planned" && s.scheduled_date < today && <Badge variant="destructive">Missed</Badge>}
                        </div>
                        {topic && (
                          <Link href={`/topics/${topic.id}`} className="text-xs text-primary hover:underline">
                            {topic.name}
                          </Link>
                        )}
                        {s.goals.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                            {s.goals.map((g, j) => (
                              <li key={j}>□ {g}</li>
                            ))}
                          </ul>
                        )}
                        {s.details && <p className="mt-2 text-xs text-muted-foreground">{s.details}</p>}
                      </div>
                      {plan.status === "active" && <SessionActions id={s.id} status={s.status} date={s.scheduled_date} startTime={s.start_time} />}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
