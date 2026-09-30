"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { masteryScore, nextStatus, schedule, type Rating, type TopicStatus } from "@/lib/revision/srs";

type Result = { ok: true; count?: number } | { ok: false; error: string };
const Rating = z.enum(["again", "hard", "good", "easy"]);

function refresh() {
  for (const p of ["/flashcards", "/revision", "/dashboard", "/study", "/progress"]) revalidatePath(p);
}

const Card = z.object({
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
  topic_id: z.uuid().nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export async function saveFlashcards(input: { cards: z.input<typeof Card>[]; subject_id: string | null; source_type: "manual" | "topic" | "resource" | "past_paper" | "conversation"; source_id?: string | null }): Promise<Result> {
  const parsed = z
    .object({ cards: z.array(Card).min(1, "Add at least one card").max(50), subject_id: z.uuid().nullable(), source_type: z.enum(["manual", "topic", "resource", "past_paper", "conversation"]), source_id: z.uuid().nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid cards" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("flashcards").insert(
    parsed.data.cards.map((c) => ({ ...c, user_id: user.id, subject_id: parsed.data.subject_id, source_type: parsed.data.source_type, source_id: parsed.data.source_id ?? null })),
  );
  if (error) return { ok: false, error: "Couldn't save the flashcards." };
  refresh();
  return { ok: true, count: parsed.data.cards.length };
}

export async function updateFlashcard(id: string, patch: { front?: string; back?: string; difficulty?: number }): Promise<Result> {
  const parsed = Card.partial().safeParse(patch);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { ok: false, error: "Invalid card" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("flashcards").update(parsed.data).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't update the card." };
  refresh();
  return { ok: true };
}

export async function deleteFlashcard(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid card" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("flashcards").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete the card." };
  refresh();
  return { ok: true };
}

export async function reviewFlashcard(id: string, rating: Rating): Promise<Result> {
  if (!z.uuid().safeParse(id).success || !Rating.safeParse(rating).success) return { ok: false, error: "Invalid review" };
  const { supabase, user } = await requireUser();
  const { data: card } = await supabase.from("flashcards").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!card) return { ok: false, error: "Card not found" };
  const next = schedule({ easeFactor: Number(card.ease_factor), intervalDays: Number(card.interval_days), repetitions: card.repetitions }, rating);
  await supabase.from("flashcards").update({ ease_factor: next.easeFactor, interval_days: next.intervalDays, repetitions: next.repetitions, due_at: next.nextReviewAt.toISOString() }).eq("id", id);
  await supabase.from("flashcard_reviews").insert({ user_id: user.id, flashcard_id: id, rating, next_review_at: next.nextReviewAt.toISOString() });
  return { ok: true };
}

/** Topic-level revision ("Today's Revision"): Easy/Good/Hard/Again reschedules the topic. */
export async function reviewTopic(topicId: string, rating: Rating): Promise<Result> {
  if (!z.uuid().safeParse(topicId).success || !Rating.safeParse(rating).success) return { ok: false, error: "Invalid review" };
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from("student_topic_progress").select("*").eq("user_id", user.id).eq("topic_id", topicId).maybeSingle();
  const next = schedule({ easeFactor: Number(p?.ease_factor ?? 2.5), intervalDays: Number(p?.interval_days ?? 0), repetitions: p?.review_count ?? 0 }, rating);
  // Map the rating to a confidence signal so the planner and weak-topic lists adapt too.
  const confidence = { again: 1, hard: 2, good: Math.max(3, p?.confidence ?? 3), easy: Math.min(5, Math.max(4, (p?.confidence ?? 3) + 1)) }[rating];
  const { error } = await supabase.from("student_topic_progress").upsert(
    {
      user_id: user.id,
      topic_id: topicId,
      confidence,
      next_review_at: next.nextReviewAt.toISOString(),
      ease_factor: next.easeFactor,
      interval_days: next.intervalDays,
      review_count: next.repetitions,
      last_studied_at: new Date().toISOString(),
      status: nextStatus((p?.status ?? "learning") as TopicStatus, confidence, next.repetitions),
      mastery_score: masteryScore(confidence, p?.quiz_correct ?? 0, p?.quiz_total ?? 0, next.repetitions),
    },
    { onConflict: "user_id,topic_id" },
  );
  if (error) return { ok: false, error: "Couldn't save the review." };
  await supabase.from("flashcard_reviews").insert({ user_id: user.id, topic_id: topicId, rating, next_review_at: next.nextReviewAt.toISOString() });
  refresh();
  return { ok: true };
}
