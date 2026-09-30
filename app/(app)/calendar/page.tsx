import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { CalendarView, type CalItem } from "@/components/calendar/calendar-view";
import { getProfile, requireUser } from "@/lib/auth";
import { todayIn } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "Calendar" };

/** Local date/time parts of an ISO timestamp in the student's timezone. */
function localParts(isoTs: string, tz: string) {
  const d = new Date(isoTs);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
}

const TASK_TYPE: Record<string, CalItem["type"]> = { assignment: "assignment", project: "assignment", quiz: "quiz", exam: "exam", study: "study_session", application: "deadline", registration: "deadline", other: "deadline" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const tz = profile?.timezone || "UTC";
  const today = todayIn(tz);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  // Include the visible leading/trailing days of neighbouring months.
  const from = new Date(Date.UTC(y, m - 1, -7)).toISOString();
  const to = new Date(Date.UTC(y, m, 14)).toISOString();

  const [events, tasks, sessions, exams, reviews, { data: subjects }] = await Promise.all([
    supabase.from("calendar_events").select("*").eq("user_id", user.id).gte("start_at", from).lte("start_at", to),
    supabase.from("tasks").select("id, title, due_at, status, type, subject_id").eq("user_id", user.id).gte("due_at", from).lte("due_at", to),
    supabase
      .from("study_plan_sessions")
      .select("id, title, scheduled_date, start_time, duration, status, study_plan_id, study_plans!inner(status)")
      .eq("user_id", user.id)
      .eq("study_plans.status", "active")
      .neq("status", "skipped")
      .gte("scheduled_date", from.slice(0, 10))
      .lte("scheduled_date", to.slice(0, 10)),
    supabase.from("student_subjects").select("exam_date, subjects(id, name, code)").eq("user_id", user.id).gte("exam_date", from.slice(0, 10)).lte("exam_date", to.slice(0, 10)),
    supabase.from("student_topic_progress").select("topic_id, next_review_at, topics(name)").eq("user_id", user.id).gte("next_review_at", from).lte("next_review_at", to),
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
  ]);

  const items: CalItem[] = [];
  for (const e of events.data ?? []) {
    const s = localParts(e.start_at, tz);
    items.push({
      key: `e-${e.id}`, kind: "event", id: e.id, type: e.type, title: e.title, date: s.date, time: e.all_day ? null : s.time,
      endTime: e.end_at ? localParts(e.end_at, tz).time : null, completed: e.completed, subjectId: e.subject_id, description: e.description, allDay: e.all_day,
    });
  }
  const examEventSubjects = new Set((events.data ?? []).filter((e) => e.type === "exam").map((e) => e.subject_id));
  for (const x of exams.data ?? []) {
    const s = x.subjects as { id: string; name: string; code: string | null } | null;
    if (!s || !x.exam_date || examEventSubjects.has(s.id)) continue;
    items.push({ key: `x-${s.id}`, kind: "exam", id: s.id, type: "exam", title: `${s.code || s.name} exam`, date: x.exam_date, time: null, completed: false, href: `/subjects/${s.id}` });
  }
  for (const t of tasks.data ?? []) {
    const s = localParts(t.due_at!, tz);
    items.push({ key: `t-${t.id}`, kind: "task", id: t.id, type: TASK_TYPE[t.type] ?? "deadline", title: t.title, date: s.date, time: s.time, completed: t.status === "done", href: "/deadlines" });
  }
  for (const p of sessions.data ?? []) {
    items.push({ key: `s-${p.id}`, kind: "session", id: p.id, type: "study_session", title: p.title, date: p.scheduled_date, time: p.start_time?.slice(0, 5) ?? null, completed: p.status === "done", href: `/planner/${p.study_plan_id}` });
  }
  const reviewDays = new Map<string, string[]>();
  for (const r of reviews.data ?? []) {
    const d = localParts(r.next_review_at!, tz).date;
    reviewDays.set(d, [...(reviewDays.get(d) ?? []), (r.topics as { name: string } | null)?.name ?? "Topic"]);
  }
  for (const [date, names] of reviewDays) {
    items.push({ key: `r-${date}`, kind: "revision", id: date, type: "revision", title: names.length === 1 ? `Revise ${names[0]}` : `Revise ${names.length} topics`, date, time: null, completed: false, href: "/revision" });
  }

  return (
    <div>
      <PageHeader title="Calendar" description="Exams, classes, deadlines, study sessions and revision in one place. Drag items to move them; click a day to add an event." />
      <CalendarView month={month} items={items} today={today} subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.code || s.name }))} />
    </div>
  );
}
