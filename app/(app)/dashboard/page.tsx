import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, CalendarClock, FileText, Flame, GraduationCap, Repeat, Sparkles, Target, TrendingUp, Upload, MonitorPlay, Globe, StickyNote,
} from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/common/empty-state";
import { Greeting } from "@/components/dashboard/greeting";
import { TodayList, type TodayItem } from "@/components/dashboard/today-list";
import { getProfile, requireUser } from "@/lib/auth";
import { coverageOf, daysUntil, getSubjects, getTopicSignals, todayIn } from "@/lib/data/workspace";
import { daysLabel, formatDate, minutesLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const RESOURCE_ICON = { pdf: FileText, docx: FileText, pptx: FileText, txt: StickyNote, note: StickyNote, image: FileText, youtube: MonitorPlay, web: Globe, drive: Globe } as const;

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const profile = (await getProfile())!;
  const today = todayIn(profile.timezone);
  const firstName = (profile.full_name || "there").split(" ")[0];

  const [subjects, signals, planSessions, tasks, resources, dueTopics, dueCards] = await Promise.all([
    getSubjects(supabase, user.id),
    getTopicSignals(supabase, user.id),
    supabase
      .from("study_plan_sessions")
      .select("id, title, activity, start_time, duration, status, topic_id, study_plans!inner(status)")
      .eq("user_id", user.id)
      .eq("scheduled_date", today)
      .eq("study_plans.status", "active")
      .neq("status", "skipped")
      .order("start_time", { nullsFirst: false })
      .order("sort_order"),
    supabase
      .from("tasks")
      .select("id, title, due_at, status, type, subjects(code, name)")
      .eq("user_id", user.id)
      .neq("status", "done")
      .lte("due_at", `${today}T23:59:59.999Z`)
      .order("due_at")
      .limit(8),
    supabase.from("resources").select("id, title, type, created_at, processing_status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("student_topic_progress").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("next_review_at", new Date().toISOString()),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due_at", new Date().toISOString()),
  ]);

  const sessions = planSessions.data ?? [];
  const targetMinutes = sessions.length ? sessions.reduce((a, s) => a + s.duration, 0) : profile.daily_study_minutes;
  const doneMinutes = sessions.filter((s) => s.status === "done").reduce((a, s) => a + s.duration, 0);
  const overall = coverageOf(signals.map((s) => s.status));

  const upcoming = subjects
    .filter((s) => s.exam_date && daysUntil(s.exam_date, today) >= 0)
    .sort((a, b) => a.exam_date!.localeCompare(b.exam_date!));
  const nextExam = upcoming[0];
  const examDays = nextExam ? daysUntil(nextExam.exam_date!, today) : null;

  const todayItems: TodayItem[] = [
    ...sessions.map((s) => ({
      kind: "session" as const, id: s.id, title: s.title, done: s.status === "done",
      startTime: s.start_time, duration: s.duration, activity: s.activity, topicId: s.topic_id,
    })),
    ...(tasks.data ?? []).map((t) => ({
      kind: "task" as const, id: t.id, title: t.title, done: false,
      meta: (t.subjects as { code: string | null; name: string } | null)?.code ?? undefined,
      overdue: !!t.due_at && t.due_at.slice(0, 10) < today,
    })),
  ];

  const weak = signals
    .filter((s) => s.status !== "not_started" || s.confidence !== null)
    .sort((a, b) => b.priority.weakness - a.priority.weakness)
    .slice(0, 4);

  const focusSubjectId = nextExam?.id;
  const recommended = signals.filter((s) => !focusSubjectId || s.subjectId === focusSubjectId).slice(0, 5);
  const revisionDue = (dueTopics.count ?? 0) + (dueCards.count ?? 0);

  if (subjects.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          <Greeting name={firstName} />
        </h1>
        <EmptyState
          icon={GraduationCap}
          title="Let's set up your first subject"
          description="Upload your syllabus and Study OS will organise it into chapters and topics, or pick a subject from the catalogue."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/subjects/import">
                  <Upload /> Upload syllabus
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/subjects/new">Browse catalogue</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{formatDate(today, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            <Greeting name={firstName} />
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/tutor">
              <Sparkles /> Ask AI Tutor
            </Link>
          </Button>
          <Button asChild>
            <Link href="/planner/new">
              <CalendarClock /> Plan my study
            </Link>
          </Button>
        </div>
      </div>

      <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Target className="size-3.5" /> Today&apos;s study target
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{minutesLabel(targetMinutes)}</div>
          <Progress value={targetMinutes ? (doneMinutes / targetMinutes) * 100 : 0} className="mt-3 h-1.5" aria-label="Today's progress" />
          <p className="mt-1.5 text-xs text-muted-foreground">{minutesLabel(doneMinutes)} done</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <TrendingUp className="size-3.5" /> Progress
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{overall}%</div>
          <Progress value={overall} className="mt-3 h-1.5" aria-label="Overall syllabus progress" />
          <p className="mt-1.5 text-xs text-muted-foreground">across {signals.length} topics</p>
        </div>
        <Link href={nextExam ? `/subjects/${nextExam.id}` : "/subjects"} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/40">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarClock className="size-3.5" /> Upcoming exam
          </div>
          {nextExam ? (
            <>
              <div className="mt-2 truncate text-2xl font-semibold">
                {nextExam.code || nextExam.name} <span className="text-muted-foreground">—</span>{" "}
                <span className={examDays! <= 7 ? "text-destructive" : undefined}>{daysLabel(examDays!)}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(nextExam.exam_date!, { weekday: "short", day: "numeric", month: "short" })}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Add an exam date to your subjects.</p>
          )}
        </Link>
        <Link href="/revision" className="rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/40">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Repeat className="size-3.5" /> Revision due
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{revisionDue}</div>
          <p className="mt-1.5 text-xs text-muted-foreground">{dueTopics.count ?? 0} topics · {dueCards.count ?? 0} flashcards</p>
        </Link>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s tasks</CardTitle>
              <CardDescription>From your active plan and deadlines due today.</CardDescription>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/study">
                    My Study <ArrowRight />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {todayItems.length ? (
                <TodayList items={todayItems} />
              ) : (
                <div className="rounded-xl bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                  Nothing scheduled for today.{" "}
                  <Link href="/planner/new" className="font-medium text-primary hover:underline">
                    Generate a study plan
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-accent/70 to-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </span>
                <CardTitle>Study OS recommendation</CardTitle>
              </div>
              <CardDescription className="pt-1 text-foreground/80">
                {nextExam
                  ? `You have ${daysLabel(examDays!)} before ${nextExam.code || nextExam.name}. Based on your syllabus, past papers and progress, prioritise these ${recommended.length} topics.`
                  : `Based on your syllabus, past papers and progress, these ${recommended.length} topics need attention first.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recommended.map((t, i) => (
                <Link
                  key={t.topicId}
                  href={`/topics/${t.topicId}`}
                  className="flex items-start gap-3 rounded-xl bg-card/80 p-3 ring-1 ring-border transition-colors hover:bg-card"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">{t.priority.reasons.slice(0, 2).join(" · ") || t.chapter}</span>
                  </span>
                  <Badge variant="muted" className="shrink-0">{t.subjectName}</Badge>
                </Link>
              ))}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild size="sm">
                  <Link href={`/planner/new${nextExam ? `?subject=${nextExam.id}&days=${Math.max(1, examDays!)}` : ""}`}>Turn this into a plan</Link>
                </Button>
                {recommended[0] && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/quiz?topic=${recommended[0].topicId}`}>Quiz me on {recommended[0].name}</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="size-4 text-destructive" /> Weak topics
              </CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/progress">All</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {weak.length ? (
                <ul className="space-y-3">
                  {weak.map((t) => (
                    <li key={t.topicId}>
                      <Link href={`/topics/${t.topicId}`} className="group block">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium group-hover:text-primary">{t.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{t.confidence ? `${t.confidence}/5` : "unrated"}</span>
                        </div>
                        <Progress value={t.priority.weakness} className="mt-1.5 h-1.5" indicatorClassName="bg-destructive/70" aria-label={`Weakness ${t.priority.weakness}%`} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Rate your confidence on topics after studying and weak spots will appear here.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent resources</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/resources">Library</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {resources.data?.length ? (
                <ul className="space-y-1">
                  {resources.data.map((r) => {
                    const Icon = RESOURCE_ICON[r.type];
                    return (
                      <li key={r.id}>
                        <Link href={`/resources/${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/50">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Icon className="size-4 text-muted-foreground" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                          {r.processing_status !== "ready" && <Badge variant={r.processing_status === "failed" ? "destructive" : "warning"}>{r.processing_status}</Badge>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No resources yet.{" "}
                  <Link href="/resources?upload=1" className="font-medium text-primary hover:underline">
                    Upload one
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {upcoming.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Exams</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcoming.slice(0, 4).map((s) => (
                  <Link key={s.id} href={`/subjects/${s.id}`} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-accent/50">
                    <span className="truncate">{s.code || s.name}</span>
                    <span className="text-muted-foreground">{daysLabel(daysUntil(s.exam_date!, today))}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
