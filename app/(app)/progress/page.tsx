import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Flame } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Stat } from "@/components/common/stat";
import { SubjectSwitcher } from "@/components/common/subject-switcher";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { ReadinessCard } from "@/components/progress/readiness-card";
import { getProfile, requireUser } from "@/lib/auth";
import { coverageOf, getSubjects, getTopicSignals, todayIn } from "@/lib/data/workspace";
import { getSubjectReadiness } from "@/lib/data/readiness";
import { STATUS_LABEL, minutesLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Progress" };

function lastNDays(today: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ subject?: string; view?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const tz = profile?.timezone || "UTC";
  const today = todayIn(tz);
  const subjects = await getSubjects(supabase, user.id);
  if (!subjects.length) return <EmptyState icon={BarChart3} title="No progress to show yet" description="Add a subject and start studying — your analytics build up automatically." />;

  const subjectIds = sp.subject ? [sp.subject] : subjects.map((s) => s.id);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

  const [signals, sessions, quizzes, reviews, tasksDone, pastPaperQs, readiness] = await Promise.all([
    getTopicSignals(supabase, user.id, subjectIds),
    supabase.from("study_sessions").select("started_at, duration, topics(subject_id)").eq("user_id", user.id).eq("status", "done").gte("started_at", since),
    supabase.from("quiz_attempts").select("score, total, completed_at, subject_id").eq("user_id", user.id).not("completed_at", "is", null).order("completed_at").limit(50),
    supabase.from("flashcard_reviews").select("reviewed_at").eq("user_id", user.id).gte("reviewed_at", since),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "done").gte("completed_at", since),
    supabase.from("questions").select("solved_status, subject_id").eq("user_id", user.id).eq("source_type", "past_paper").in("subject_id", subjectIds),
    Promise.all(subjects.filter((s) => subjectIds.includes(s.id)).map(async (s) => ({ subject: s, readiness: await getSubjectReadiness(supabase, user.id, s.id) }))),
  ]);

  const days14 = lastNDays(today, 14);
  const minutesByDay = new Map<string, number>();
  for (const s of sessions.data ?? []) {
    const sub = (s.topics as { subject_id: string } | null)?.subject_id;
    if (sp.subject && sub !== sp.subject) continue;
    const d = localDay(s.started_at);
    minutesByDay.set(d, (minutesByDay.get(d) ?? 0) + (s.duration ?? 0));
  }
  const totalMinutes = [...minutesByDay.values()].reduce((a, b) => a + b, 0);
  const reviewsByDay = new Map<string, number>();
  for (const r of reviews.data ?? []) reviewsByDay.set(localDay(r.reviewed_at), (reviewsByDay.get(localDay(r.reviewed_at)) ?? 0) + 1);
  const activeReviewDays = days14.filter((d) => (reviewsByDay.get(d) ?? 0) > 0).length;

  const quizList = (quizzes.data ?? []).filter((q) => !sp.subject || q.subject_id === sp.subject);
  const quizCorrect = quizList.reduce((a, q) => a + q.score, 0);
  const quizTotal = quizList.reduce((a, q) => a + q.total, 0);
  const pp = pastPaperQs.data ?? [];
  const ppAttempted = pp.filter((q) => q.solved_status !== "unsolved").length;
  const ppSolved = pp.filter((q) => q.solved_status === "solved").length;
  const statusCounts = Object.keys(STATUS_LABEL).map((k) => ({ label: STATUS_LABEL[k as keyof typeof STATUS_LABEL], value: signals.filter((s) => s.status === k).length }));
  const weak = [...signals].filter((s) => s.status !== "not_started" || s.confidence !== null).sort((a, b) => b.priority.weakness - a.priority.weakness).slice(0, 10);
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        description="Where you are, what's working and where you're weak — calculated from your own activity."
        actions={<SubjectSwitcher subjects={subjects.map((s) => ({ id: s.id, name: s.code || s.name }))} current={sp.subject ?? null} basePath="/progress" allowAll />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Syllabus coverage" value={`${coverageOf(signals.map((s) => s.status))}%`} hint={`${signals.filter((s) => s.status === "mastered").length} of ${signals.length} topics mastered`} />
        <Stat label="Study time (30 days)" value={minutesLabel(totalMinutes)} hint={`${minutesLabel(days14.reduce((a, d) => a + (minutesByDay.get(d) ?? 0), 0) / 2)} per week lately`} />
        <Stat label="Quiz accuracy" value={quizTotal ? `${Math.round((quizCorrect / quizTotal) * 100)}%` : "—"} hint={`${quizList.length} quizzes · ${quizTotal} questions`} />
        <Stat label="Past-paper questions" value={`${ppSolved}/${pp.length}`} hint={`solved · ${ppAttempted} attempted · ${tasksDone.count ?? 0} tasks done (30d)`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Study hours</CardTitle>
            <CardDescription>Minutes of completed study sessions, last 14 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart caption="Study minutes per day for the last 14 days" valueLabel="Minutes" data={days14.map((d) => ({ label: fmt(d), value: minutesByDay.get(d) ?? 0 }))} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Quiz accuracy</CardTitle>
            <CardDescription>Score of each completed quiz, oldest to newest.</CardDescription>
          </CardHeader>
          <CardContent>
            {quizList.length ? (
              <LineChart caption="Quiz accuracy over time" valueLabel="Accuracy" domain={[0, 100]} format={(v) => `${Math.round(v)}%`} data={quizList.map((q) => ({ label: fmt(localDay(q.completed_at!)), value: Math.round((q.score / q.total) * 100) }))} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No quizzes yet. <Link href="/quiz" className="font-medium text-primary hover:underline">Take one</Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Topic mastery</CardTitle>
            <CardDescription>How many topics are at each stage.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart horizontal caption="Number of topics by status" valueLabel="Topics" data={statusCounts} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Revision consistency</CardTitle>
            <CardDescription>Reviews per day · active on {activeReviewDays} of the last 14 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart caption="Flashcard and topic reviews per day for the last 14 days" valueLabel="Reviews" data={days14.map((d) => ({ label: fmt(d), value: reviewsByDay.get(d) ?? 0 }))} />
          </CardContent>
        </Card>
      </div>

      <section id="weak" className="scroll-mt-24">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-destructive" /> Weak topics
            </CardTitle>
            <CardDescription>Weakness combines your confidence, status and quiz results. Focus here first.</CardDescription>
          </CardHeader>
          <CardContent>
            {weak.length ? (
              <ul className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                {weak.map((t) => (
                  <li key={t.topicId}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/topics/${t.topicId}`} className="truncate font-medium hover:text-primary">
                        {t.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t.subjectName} · {t.confidence ? `${t.confidence}/5` : "unrated"} · {t.priority.weakness}
                      </span>
                    </div>
                    <Progress value={t.priority.weakness} className="mt-1.5 h-1.5" indicatorClassName="bg-destructive/70" aria-label={`Weakness ${t.priority.weakness} of 100`} />
                    {t.priority.reasons.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t.priority.reasons.join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Rate your confidence after studying and weak spots will show up here.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Exam readiness" className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {readiness.map(({ subject, readiness: r }) => (
          <ReadinessCard key={subject.id} readiness={r} title={`Exam readiness — ${subject.code || subject.name}`} />
        ))}
      </section>
    </div>
  );
}
