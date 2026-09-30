import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, Layers, Play, Repeat, Timer } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { TodayList, type TodayItem } from "@/components/dashboard/today-list";
import { getProfile, requireUser } from "@/lib/auth";
import { todayIn } from "@/lib/data/workspace";
import { formatDateTime, minutesLabel } from "@/lib/format";

export const metadata: Metadata = { title: "My Study" };

export default async function MyStudyPage() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile?.timezone);
  const now = new Date().toISOString();
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const [plan, tasks, dueTopics, dueCards, active, recent] = await Promise.all([
    supabase
      .from("study_plan_sessions")
      .select("id, title, activity, start_time, duration, status, topic_id, study_plans!inner(status)")
      .eq("user_id", user.id)
      .eq("scheduled_date", today)
      .eq("study_plans.status", "active")
      .neq("status", "skipped")
      .order("start_time", { nullsFirst: false }),
    supabase.from("tasks").select("id, title, due_at, subjects(code, name)").eq("user_id", user.id).neq("status", "done").lte("due_at", weekEnd).order("due_at").limit(8),
    supabase.from("student_topic_progress").select("topic_id, topics(name)").eq("user_id", user.id).lte("next_review_at", now).order("next_review_at").limit(6),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due_at", now),
    supabase.from("study_sessions").select("id, started_at, topics(name)").eq("user_id", user.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(3),
    supabase.from("study_sessions").select("id, started_at, duration, confidence_after, topics(name)").eq("user_id", user.id).eq("status", "done").order("started_at", { ascending: false }).limit(5),
  ]);

  const items: TodayItem[] = [
    ...(plan.data ?? []).map((s) => ({ kind: "session" as const, id: s.id, title: s.title, done: s.status === "done", startTime: s.start_time, duration: s.duration, activity: s.activity, topicId: s.topic_id })),
    ...(tasks.data ?? []).map((t) => ({
      kind: "task" as const, id: t.id, title: t.title, done: false,
      meta: `${(t.subjects as { code: string | null } | null)?.code ?? ""}${t.due_at ? ` · due ${t.due_at.slice(0, 10) === today ? "today" : t.due_at.slice(5, 10)}` : ""}`,
      overdue: !!t.due_at && t.due_at.slice(0, 10) < today,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Study"
        description="Everything to do today: planned sessions, revision that's due, and deadlines."
        actions={
          <Button asChild>
            <Link href="/study/session/new">
              <Play /> Start a session
            </Link>
          </Button>
        }
      />
      {active.data && active.data.length > 0 && (
        <Card className="border-primary/30 bg-accent/40">
          <CardContent className="flex flex-wrap items-center gap-3">
            <Timer className="size-5 text-primary" />
            <span className="text-sm font-medium">Session in progress: {(active.data[0].topics as { name: string } | null)?.name ?? "Focused study"}</span>
            <Button asChild size="sm" className="ml-auto">
              <Link href={`/study/session/${active.data[0].id}`}>Resume</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>Plan sessions for today and tasks due this week.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/planner">Planner</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {items.length ? (
              <TodayList items={items} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing planned.{" "}
                <Link href="/planner/new" className="font-medium text-primary hover:underline">
                  Generate a plan
                </Link>{" "}
                or start a session.
              </p>
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="size-4" /> Revision due
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dueTopics.data?.length ? (
                <ul className="space-y-1 text-sm">
                  {dueTopics.data.map((t) => (
                    <li key={t.topic_id}>• {(t.topics as { name: string } | null)?.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No topics due.</p>
              )}
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="size-4" /> {dueCards.count ?? 0} flashcards due
              </p>
              <Button asChild size="sm">
                <Link href="/revision">Start revision</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="size-4" /> Recent sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recent.data?.length ? (
                <ul className="space-y-2 text-sm">
                  {recent.data.map((s) => (
                    <li key={s.id}>
                      <Link href={`/study/session/${s.id}`} className="flex justify-between gap-2 hover:text-primary">
                        <span className="truncate">{(s.topics as { name: string } | null)?.name ?? "Focused study"}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {minutesLabel(s.duration ?? 0)}
                          {s.confidence_after ? ` · ${s.confidence_after}/5` : ""}
                        </span>
                      </Link>
                      <span className="text-xs text-muted-foreground">{formatDateTime(s.started_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
