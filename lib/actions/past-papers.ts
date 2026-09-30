"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { BUCKETS } from "@/lib/storage";

type Result = { ok: true } | { ok: false; error: string };
const uuid = z.uuid();

function refresh(paperId?: string) {
  revalidatePath("/past-papers");
  revalidatePath("/past-papers/analytics");
  revalidatePath("/questions");
  if (paperId) revalidatePath(`/past-papers/${paperId}`);
}

/** Student corrects a question's topic mapping. Chosen topics become confirmed (confidence 1 for new ones). */
export async function setQuestionTopics(questionId: string, topicIds: string[]): Promise<Result> {
  const parsed = z.array(z.uuid()).max(10).safeParse(topicIds);
  if (!uuid.safeParse(questionId).success || !parsed.success) return { ok: false, error: "Invalid mapping" };
  const { supabase, user } = await requireUser();
  const { data: q } = await supabase.from("past_paper_questions").select("id, past_paper_id").eq("id", questionId).eq("user_id", user.id).maybeSingle();
  if (!q) return { ok: false, error: "Question not found" };

  const { data: existing } = await supabase.from("question_topic_links").select("topic_id").eq("question_id", questionId);
  const keep = new Set(parsed.data);
  const toDelete = (existing ?? []).map((e) => e.topic_id).filter((t) => !keep.has(t));
  if (toDelete.length) await supabase.from("question_topic_links").delete().eq("question_id", questionId).in("topic_id", toDelete);
  const had = new Set((existing ?? []).map((e) => e.topic_id));
  for (const topicId of parsed.data) {
    if (had.has(topicId)) {
      await supabase.from("question_topic_links").update({ confirmed: true }).eq("question_id", questionId).eq("topic_id", topicId);
    } else {
      const { error } = await supabase.from("question_topic_links").insert({ user_id: user.id, question_id: questionId, topic_id: topicId, confidence: 1, source: "user", confirmed: true });
      if (error) return { ok: false, error: "Couldn't save that mapping." };
    }
  }
  // Keep the question bank's primary topic in sync.
  await supabase.from("questions").update({ topic_id: parsed.data[0] ?? null }).eq("source_id", questionId).eq("user_id", user.id);
  refresh(q.past_paper_id);
  return { ok: true };
}

export async function confirmAllMappings(paperId: string): Promise<Result> {
  if (!uuid.safeParse(paperId).success) return { ok: false, error: "Invalid paper" };
  const { supabase, user } = await requireUser();
  const { data: qs } = await supabase.from("past_paper_questions").select("id").eq("past_paper_id", paperId).eq("user_id", user.id);
  if (!qs?.length) return { ok: true };
  const { error } = await supabase.from("question_topic_links").update({ confirmed: true }).in("question_id", qs.map((q) => q.id));
  if (error) return { ok: false, error: "Couldn't confirm." };
  refresh(paperId);
  return { ok: true };
}

export async function updatePaper(paperId: string, patch: { title?: string; year?: number | null; session?: string | null; subject_id?: string }): Promise<Result> {
  const parsed = z
    .object({ title: z.string().trim().min(1).max(300).optional(), year: z.number().int().min(1950).max(2100).nullable().optional(), session: z.string().trim().max(60).nullable().optional() })
    .safeParse(patch);
  if (!uuid.safeParse(paperId).success || !parsed.success) return { ok: false, error: "Invalid details" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("past_papers").update(parsed.data).eq("id", paperId).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't update the paper." };
  if (parsed.data.year !== undefined) {
    const { data: qs } = await supabase.from("past_paper_questions").select("id").eq("past_paper_id", paperId);
    if (qs?.length) await supabase.from("questions").update({ year: parsed.data.year }).in("source_id", qs.map((q) => q.id));
  }
  refresh(paperId);
  return { ok: true };
}

export async function updatePaperQuestion(questionId: string, patch: { marks?: number | null; question_type?: "mcq" | "short" | "long" | "numerical" | "theory" | "case_study" }): Promise<Result> {
  const parsed = z.object({ marks: z.number().min(0).max(1000).nullable().optional(), question_type: z.enum(["mcq", "short", "long", "numerical", "theory", "case_study"]).optional() }).safeParse(patch);
  if (!uuid.safeParse(questionId).success || !parsed.success) return { ok: false, error: "Invalid details" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("past_paper_questions").update(parsed.data).eq("id", questionId).eq("user_id", user.id).select("past_paper_id").single();
  if (error) return { ok: false, error: "Couldn't update the question." };
  await supabase.from("questions").update(parsed.data).eq("source_id", questionId).eq("user_id", user.id);
  refresh(data.past_paper_id);
  return { ok: true };
}

export async function deletePaper(paperId: string): Promise<Result> {
  if (!uuid.safeParse(paperId).success) return { ok: false, error: "Invalid paper" };
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("past_papers").select("storage_path").eq("id", paperId).eq("user_id", user.id).maybeSingle();
  if (!data) return { ok: false, error: "Not found" };
  if (data.storage_path) await supabase.storage.from(BUCKETS.papers).remove([data.storage_path]);
  const { error } = await supabase.from("past_papers").delete().eq("id", paperId).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete the paper." };
  refresh();
  return { ok: true };
}
