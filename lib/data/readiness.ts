import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { computeReadiness } from "@/lib/analytics/readiness";

export async function getSubjectReadiness(supabase: ServerClient, userId: string, subjectId: string) {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [{ data: topics }, { data: progress }, { data: quizzes }, { data: questions }] = await Promise.all([
    supabase.from("topics").select("id").eq("subject_id", subjectId).eq("owner_id", userId).is("parent_topic_id", null),
    supabase.from("student_topic_progress").select("topic_id, status, confidence, last_studied_at, next_review_at").eq("user_id", userId),
    supabase.from("quiz_attempts").select("score, total").eq("user_id", userId).eq("subject_id", subjectId).not("completed_at", "is", null).gte("created_at", since),
    supabase.from("questions").select("solved_status").eq("user_id", userId).eq("subject_id", subjectId).eq("source_type", "past_paper").neq("solved_status", "unsolved"),
  ]);
  const byTopic = new Map((progress ?? []).map((p) => [p.topic_id, p]));
  return computeReadiness({
    topics: (topics ?? []).map((t) => {
      const p = byTopic.get(t.id);
      return {
        status: p?.status ?? "not_started",
        confidence: p?.confidence ?? null,
        lastStudiedAt: p?.last_studied_at ?? null,
        nextReviewAt: p?.next_review_at ?? null,
      };
    }),
    quizCorrect: (quizzes ?? []).reduce((a, q) => a + q.score, 0),
    quizTotal: (quizzes ?? []).reduce((a, q) => a + q.total, 0),
    pastPaperSolved: (questions ?? []).filter((q) => q.solved_status === "solved").length,
    pastPaperAttempted: (questions ?? []).length,
  });
}
