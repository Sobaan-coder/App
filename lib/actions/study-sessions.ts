"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { masteryScore, nextStatus, ratingFromConfidence, schedule, type TopicStatus } from "@/lib/revision/srs";
import type { Json } from "@/types/database";

const Goal = z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() });

export async function startStudySession(input: { topic_id?: string | null; plan_session_id?: string | null; goals: { text: string; done: boolean }[] }) {
  const parsed = z.object({ topic_id: z.guid().nullable().optional(), plan_session_id: z.guid().nullable().optional(), goals: z.array(Goal).max(12) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Add at least a goal or pick a topic." };
  const { supabase, user } = await requireUser();
  let topicId = parsed.data.topic_id ?? null;
  if (parsed.data.plan_session_id) {
    const { data: ps } = await supabase.from("study_plan_sessions").select("topic_id").eq("id", parsed.data.plan_session_id).eq("user_id", user.id).maybeSingle();
    if (!ps) return { ok: false as const, error: "Plan session not found." };
    topicId ??= ps.topic_id;
    await supabase.from("study_plan_sessions").update({ status: "in_progress" }).eq("id", parsed.data.plan_session_id);
  }
  let before: number | null = null;
  if (topicId) {
    const { data: p } = await supabase.from("student_topic_progress").select("confidence").eq("user_id", user.id).eq("topic_id", topicId).maybeSingle();
    before = p?.confidence ?? null;
  }
  const { data, error } = await supabase
    .from("study_sessions")
    .insert({ user_id: user.id, topic_id: topicId, plan_session_id: parsed.data.plan_session_id ?? null, goals: parsed.data.goals as unknown as NonNullable<Json>, confidence_before: before, status: "in_progress" })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: "Couldn't start the session." };
  revalidatePath("/study");
  return { ok: true as const, id: data.id };
}

export async function saveSessionGoals(id: string, goals: { text: string; done: boolean }[]) {
  const parsed = z.array(Goal).max(12).safeParse(goals);
  if (!z.guid().safeParse(id).success || !parsed.success) return { ok: false as const, error: "Invalid goals" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("study_sessions").update({ goals: parsed.data as unknown as NonNullable<Json> }).eq("id", id).eq("user_id", user.id);
  return error ? { ok: false as const, error: "Couldn't save goals." } : { ok: true as const };
}

/** End a session: record duration + confidence, update topic mastery, spaced repetition and the plan. */
export async function finishStudySession(id: string, input: { confidence: number; notes?: string | null; goals: { text: string; done: boolean }[] }) {
  const parsed = z.object({ confidence: z.number().int().min(1).max(5), notes: z.string().max(4000).nullable().optional(), goals: z.array(Goal).max(12) }).safeParse(input);
  if (!z.guid().safeParse(id).success || !parsed.success) return { ok: false as const, error: "Pick how confident you feel (1–5)." };
  const { supabase, user } = await requireUser();
  const { data: s } = await supabase.from("study_sessions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!s) return { ok: false as const, error: "Session not found." };
  if (s.status === "done") return { ok: true as const };

  const ended = new Date();
  const minutes = Math.max(1, Math.min(600, Math.round((ended.getTime() - new Date(s.started_at).getTime()) / 60000)));
  const { error } = await supabase
    .from("study_sessions")
    .update({ status: "done", ended_at: ended.toISOString(), duration: minutes, confidence_after: parsed.data.confidence, notes: parsed.data.notes || null, goals: parsed.data.goals as unknown as NonNullable<Json> })
    .eq("id", id);
  if (error) return { ok: false as const, error: "Couldn't save the session." };

  if (s.topic_id) {
    const { data: p } = await supabase.from("student_topic_progress").select("*").eq("user_id", user.id).eq("topic_id", s.topic_id).maybeSingle();
    const next = schedule(
      { easeFactor: Number(p?.ease_factor ?? 2.5), intervalDays: Number(p?.interval_days ?? 0), repetitions: p?.review_count ?? 0 },
      ratingFromConfidence(parsed.data.confidence),
      ended,
    );
    await supabase.from("student_topic_progress").upsert(
      {
        user_id: user.id,
        topic_id: s.topic_id,
        confidence: parsed.data.confidence,
        status: nextStatus((p?.status ?? "not_started") as TopicStatus, parsed.data.confidence, next.repetitions),
        last_studied_at: ended.toISOString(),
        next_review_at: next.nextReviewAt.toISOString(),
        ease_factor: next.easeFactor,
        interval_days: next.intervalDays,
        review_count: next.repetitions,
        minutes_studied: (p?.minutes_studied ?? 0) + minutes,
        mastery_score: masteryScore(parsed.data.confidence, p?.quiz_correct ?? 0, p?.quiz_total ?? 0, next.repetitions),
      },
      { onConflict: "user_id,topic_id" },
    );
  }
  if (s.plan_session_id) {
    await supabase.from("study_plan_sessions").update({ status: "done", completed_at: ended.toISOString() }).eq("id", s.plan_session_id);
  }
  for (const p of ["/dashboard", "/study", "/planner", "/progress", "/revision"]) revalidatePath(p);
  if (s.topic_id) revalidatePath(`/topics/${s.topic_id}`);
  return { ok: true as const, minutes };
}
