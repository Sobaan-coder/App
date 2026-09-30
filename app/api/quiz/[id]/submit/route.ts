import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import type { QuizItem } from "@/lib/ai/quiz-generator";
import { masteryScore, nextStatus, ratingFromScore, schedule, type TopicStatus } from "@/lib/revision/srs";
import type { Json } from "@/types/database";

const Body = z.object({ answers: z.array(z.number().int().min(-1).max(3)).max(20), duration_seconds: z.number().int().min(0).max(36000) });

/** Grade on the server (answers never reach the browser before submission) and update progress. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.guid().safeParse(id).success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });

  try {
    const { data: attempt } = await supabase.from("quiz_attempts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!attempt) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
    if (attempt.completed_at) return NextResponse.json({ error: "Already submitted." }, { status: 409 });

    const items = attempt.items as unknown as QuizItem[];
    const graded = items.map((q, i) => {
      const chosen = parsed.data.answers[i] ?? -1;
      return { ...q, chosen, correct: chosen === q.answer };
    });
    const score = graded.filter((g) => g.correct).length;
    await supabase
      .from("quiz_attempts")
      .update({ score, items: graded as unknown as NonNullable<Json>, duration_seconds: parsed.data.duration_seconds, completed_at: new Date().toISOString() })
      .eq("id", id);

    // Per-topic accuracy → progress, spaced repetition, weakness.
    const byTopic = new Map<string, { correct: number; total: number }>();
    for (const g of graded) {
      const t = g.topic_id ?? attempt.topic_id;
      if (!t) continue;
      const cur = byTopic.get(t) ?? { correct: 0, total: 0 };
      cur.total++;
      if (g.correct) cur.correct++;
      byTopic.set(t, cur);
    }
    for (const [topicId, r] of byTopic) {
      const { data: p } = await supabase.from("student_topic_progress").select("*").eq("user_id", user.id).eq("topic_id", topicId).maybeSingle();
      const next = schedule({ easeFactor: Number(p?.ease_factor ?? 2.5), intervalDays: Number(p?.interval_days ?? 0), repetitions: p?.review_count ?? 0 }, ratingFromScore(r.correct, r.total));
      const quizCorrect = (p?.quiz_correct ?? 0) + r.correct;
      const quizTotal = (p?.quiz_total ?? 0) + r.total;
      const confidence = p?.confidence ?? null;
      await supabase.from("student_topic_progress").upsert(
        {
          user_id: user.id,
          topic_id: topicId,
          quiz_correct: quizCorrect,
          quiz_total: quizTotal,
          last_studied_at: new Date().toISOString(),
          next_review_at: next.nextReviewAt.toISOString(),
          ease_factor: next.easeFactor,
          interval_days: next.intervalDays,
          review_count: next.repetitions,
          status: nextStatus((p?.status ?? "not_started") as TopicStatus, confidence ?? (r.correct / r.total >= 0.8 ? 4 : 2), next.repetitions),
          mastery_score: masteryScore(confidence, quizCorrect, quizTotal, next.repetitions),
        },
        { onConflict: "user_id,topic_id" },
      );
    }

    // Missed questions go to the question bank for later practice.
    const missed = graded.filter((g) => !g.correct);
    if (missed.length) {
      await supabase.from("questions").insert(
        missed.map((g) => ({
          user_id: user.id,
          subject_id: attempt.subject_id,
          topic_id: g.topic_id ?? attempt.topic_id,
          question_text: g.question,
          options: g.options as unknown as NonNullable<Json>,
          answer: `${String.fromCharCode(65 + g.answer)}. ${g.options[g.answer]}\n\n${g.explanation}`,
          question_type: "mcq" as const,
          difficulty: attempt.difficulty === "easy" ? 2 : attempt.difficulty === "medium" ? 3 : 4,
          source_type: "ai",
          solved_status: "needs_review" as const,
          attempts: 1,
        })),
      );
    }
    return NextResponse.json({ score, total: graded.length, items: graded });
  } catch (err) {
    return apiError(err, "We couldn't grade the quiz. Try again.");
  }
}
