import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { rankTopics, type TopicSignal } from "@/lib/planner/priority";

export type SubjectSummary = Tables<"subjects"> & {
  exam_date: string | null;
  enrollment_status: string;
  topicCount: number;
  progress: number; // 0–100 coverage
};

export type TopicRow = Tables<"topics"> & {
  chapter_name: string;
  chapter_sort: number;
  progress: Tables<"student_topic_progress"> | null;
};

const COVERAGE = { not_started: 0, learning: 0.4, practicing: 0.7, reviewed: 0.9, mastered: 1 } as const;

export function coverageOf(statuses: (keyof typeof COVERAGE)[]) {
  if (statuses.length === 0) return 0;
  return Math.round((statuses.reduce((a, s) => a + COVERAGE[s], 0) / statuses.length) * 100);
}

export function todayIn(timezone: string | null | undefined) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}

/** The student's own subjects with exam dates and coverage. */
export async function getSubjects(supabase: ServerClient, userId: string): Promise<SubjectSummary[]> {
  const [{ data: subjects }, { data: enrolments }, { data: topics }, { data: progress }] = await Promise.all([
    supabase.from("subjects").select("*").eq("owner_id", userId).order("sort_order").order("created_at"),
    supabase.from("student_subjects").select("subject_id, exam_date, status").eq("user_id", userId),
    supabase.from("topics").select("id, subject_id").eq("owner_id", userId).is("parent_topic_id", null),
    supabase.from("student_topic_progress").select("topic_id, status").eq("user_id", userId),
  ]);
  const statusByTopic = new Map((progress ?? []).map((p) => [p.topic_id, p.status]));
  return (subjects ?? []).map((s) => {
    const enr = enrolments?.find((e) => e.subject_id === s.id);
    const ts = (topics ?? []).filter((t) => t.subject_id === s.id);
    return {
      ...s,
      exam_date: enr?.exam_date ?? null,
      enrollment_status: enr?.status ?? "active",
      topicCount: ts.length,
      progress: coverageOf(ts.map((t) => statusByTopic.get(t.id) ?? "not_started")),
    };
  });
}

/** All topics (with chapter + progress) for one subject or all of the student's subjects. */
export async function getTopics(supabase: ServerClient, userId: string, subjectId?: string): Promise<TopicRow[]> {
  let q = supabase
    .from("topics")
    .select("*, chapters!inner(name, sort_order)")
    .eq("owner_id", userId)
    .order("sort_order");
  if (subjectId) q = q.eq("subject_id", subjectId);
  const [{ data: topics }, { data: progress }] = await Promise.all([
    q,
    supabase.from("student_topic_progress").select("*").eq("user_id", userId),
  ]);
  const byTopic = new Map((progress ?? []).map((p) => [p.topic_id, p]));
  return (topics ?? [])
    .map(({ chapters, ...t }) => ({
      ...t,
      chapter_name: (chapters as { name: string }).name,
      chapter_sort: (chapters as { sort_order: number }).sort_order,
      progress: byTopic.get(t.id) ?? null,
    }))
    .sort((a, b) => a.chapter_sort - b.chapter_sort || a.sort_order - b.sort_order);
}

export type TopicStat = {
  topic_id: string;
  topic_name: string;
  chapter_id: string;
  chapter_name: string;
  question_count: number;
  paper_count: number;
  total_marks: number;
  years: number[];
  last_year: number | null;
};

export async function getTopicStats(supabase: ServerClient, subjectId: string): Promise<TopicStat[]> {
  const { data } = await supabase.rpc("subject_topic_stats", { p_subject_id: subjectId });
  return (data ?? []).map((r) => ({
    ...r,
    question_count: Number(r.question_count),
    paper_count: Number(r.paper_count),
    total_marks: Number(r.total_marks),
  }));
}

export type RankedTopic = TopicSignal & { subjectId: string; subjectName: string; priority: ReturnType<typeof rankTopics>[number]["priority"] };

/** Ranked topic signals for planning, weak-topic lists and recommendations. */
export async function getTopicSignals(supabase: ServerClient, userId: string, subjectIds?: string[]): Promise<RankedTopic[]> {
  const subjects = (await getSubjects(supabase, userId)).filter((s) => !subjectIds || subjectIds.includes(s.id));
  const results: (TopicSignal & { subjectId: string; subjectName: string })[] = [];
  await Promise.all(
    subjects.map(async (subject) => {
      const [topics, stats, { count: paperCount }] = await Promise.all([
        getTopics(supabase, userId, subject.id),
        getTopicStats(supabase, subject.id),
        supabase.from("past_papers").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).eq("processing_status", "ready"),
      ]);
      const statById = new Map(stats.map((s) => [s.topic_id, s]));
      const maxMarks = Math.max(0, ...stats.map((s) => s.total_marks));
      for (const t of topics.filter((t) => !t.parent_topic_id)) {
        const st = statById.get(t.id);
        results.push({
          topicId: t.id,
          name: t.name,
          chapter: t.chapter_name,
          subjectId: subject.id,
          subjectName: subject.code || subject.name,
          difficulty: t.difficulty,
          estimatedMinutes: t.estimated_minutes,
          weightage: t.weightage !== null ? Number(t.weightage) : null,
          paperCount: st?.paper_count ?? 0,
          totalPapers: paperCount ?? 0,
          marks: st?.total_marks ?? 0,
          maxTopicMarks: maxMarks,
          confidence: t.progress?.confidence ?? null,
          status: t.progress?.status ?? "not_started",
          quizCorrect: t.progress?.quiz_correct ?? 0,
          quizTotal: t.progress?.quiz_total ?? 0,
          nextReviewAt: t.progress?.next_review_at ?? null,
        });
      }
    }),
  );
  return rankTopics(results);
}
