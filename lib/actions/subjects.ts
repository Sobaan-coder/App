"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { embedTopicsForSubjects } from "@/lib/embeddings/topics";
import { masteryScore, nextStatus, ratingFromConfidence, schedule, type TopicStatus } from "@/lib/revision/srs";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const id = z.uuid();
const fail = (error: string): Result => ({ ok: false, error });

function refresh(subjectId?: string, topicId?: string) {
  revalidatePath("/subjects");
  revalidatePath("/dashboard");
  if (subjectId) revalidatePath(`/subjects/${subjectId}`);
  if (topicId) revalidatePath(`/topics/${topicId}`);
}

const SubjectPatch = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  code: z.string().trim().max(30).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  color: z.enum(["indigo", "violet", "emerald", "amber", "rose", "sky", "slate"]).optional(),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
});

export async function updateSubject(subjectId: string, patch: z.input<typeof SubjectPatch>): Promise<Result> {
  const parsed = SubjectPatch.safeParse(patch);
  if (!id.safeParse(subjectId).success || !parsed.success) return fail("Please check the details.");
  const { supabase, user } = await requireUser();
  const { exam_date, status, ...fields } = parsed.data;
  if (Object.keys(fields).length) {
    const { error } = await supabase.from("subjects").update({ ...fields, code: fields.code || null }).eq("id", subjectId).eq("owner_id", user.id);
    if (error) return fail("Couldn't update the subject.");
  }
  if (exam_date !== undefined || status) {
    const { error } = await supabase
      .from("student_subjects")
      .upsert({ user_id: user.id, subject_id: subjectId, ...(exam_date !== undefined ? { exam_date } : {}), ...(status ? { status } : {}) }, { onConflict: "user_id,subject_id" });
    if (error) return fail("Couldn't update the exam date.");
  }
  refresh(subjectId);
  return { ok: true };
}

export async function createSubject(input: { name: string; code?: string | null; exam_date?: string | null; program_id?: string | null }): Promise<Result> {
  const parsed = z
    .object({ name: z.string().trim().min(1, "Name your subject").max(160), code: z.string().trim().max(30).nullable().optional(), exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), program_id: z.uuid().nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid subject");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("save_syllabus", {
    p_payload: { subjects: [{ name: parsed.data.name, code: parsed.data.code || null, exam_date: parsed.data.exam_date || null, chapters: [] }] },
    p_program_id: parsed.data.program_id ?? undefined,
  });
  if (error || !data?.[0]) return fail("Couldn't create the subject.");
  refresh();
  return { ok: true, id: data[0] };
}

export async function deleteSubject(subjectId: string): Promise<Result> {
  if (!id.safeParse(subjectId).success) return fail("Invalid subject");
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("subjects").delete().eq("id", subjectId).eq("owner_id", user.id);
  if (error) return fail("Couldn't delete the subject.");
  refresh();
  return { ok: true };
}

// ---------------- Chapters ----------------
export async function saveChapter(input: { id?: string; subject_id: string; name: string; weightage?: number | null }): Promise<Result> {
  const parsed = z.object({ id: z.uuid().optional(), subject_id: z.uuid(), name: z.string().trim().min(1).max(200), weightage: z.number().min(0).max(100).nullable().optional() }).safeParse(input);
  if (!parsed.success) return fail("Give the chapter a name.");
  const { supabase } = await requireUser();
  const { id: chapterId, subject_id, ...fields } = parsed.data;
  if (chapterId) {
    const { error } = await supabase.from("chapters").update(fields).eq("id", chapterId);
    if (error) return fail("Couldn't save the chapter.");
    refresh(subject_id);
    return { ok: true, id: chapterId };
  }
  const { data: last } = await supabase.from("chapters").select("sort_order").eq("subject_id", subject_id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("chapters").insert({ subject_id, ...fields, sort_order: (last?.sort_order ?? -1) + 1 }).select("id").single();
  if (error) return fail("Couldn't add the chapter.");
  refresh(subject_id);
  return { ok: true, id: data.id };
}

export async function deleteChapter(chapterId: string, subjectId: string): Promise<Result> {
  if (!id.safeParse(chapterId).success) return fail("Invalid chapter");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
  if (error) return fail("Couldn't delete the chapter.");
  refresh(subjectId);
  return { ok: true };
}

export async function moveChapter(chapterId: string, subjectId: string, dir: -1 | 1): Promise<Result> {
  const { supabase } = await requireUser();
  const { data: chapters } = await supabase.from("chapters").select("id, sort_order").eq("subject_id", subjectId).order("sort_order");
  if (!chapters) return fail("Couldn't reorder.");
  const i = chapters.findIndex((c) => c.id === chapterId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= chapters.length) return { ok: true };
  [chapters[i], chapters[j]] = [chapters[j], chapters[i]];
  await Promise.all(chapters.map((c, k) => supabase.from("chapters").update({ sort_order: k }).eq("id", c.id)));
  refresh(subjectId);
  return { ok: true };
}

// ---------------- Topics ----------------
const TopicInput = z.object({
  id: z.uuid().optional(),
  chapter_id: z.uuid(),
  name: z.string().trim().min(1, "Give the topic a name").max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  estimated_minutes: z.number().int().min(5).max(1200).optional(),
  weightage: z.number().min(0).max(100).nullable().optional(),
  parent_topic_id: z.uuid().nullable().optional(),
});

export async function saveTopic(input: z.input<typeof TopicInput>): Promise<Result> {
  const parsed = TopicInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid topic");
  const { supabase } = await requireUser();
  const { id: topicId, ...fields } = parsed.data;
  if (topicId) {
    const { data, error } = await supabase.from("topics").update({ ...fields, embedding: null }).eq("id", topicId).select("subject_id").single();
    if (error) return fail("Couldn't save the topic.");
    after(() => embedTopicsForSubjects([data.subject_id]).catch(() => {}));
    refresh(data.subject_id, topicId);
    return { ok: true, id: topicId };
  }
  const { data: chapter } = await supabase.from("chapters").select("subject_id").eq("id", fields.chapter_id).maybeSingle();
  if (!chapter) return fail("Chapter not found");
  const { data: last } = await supabase.from("topics").select("sort_order").eq("chapter_id", fields.chapter_id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("topics")
    .insert({ ...fields, subject_id: chapter.subject_id, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id, subject_id")
    .single();
  if (error) return fail("Couldn't add the topic.");
  after(() => embedTopicsForSubjects([data.subject_id]).catch(() => {}));
  refresh(data.subject_id);
  return { ok: true, id: data.id };
}

export async function deleteTopic(topicId: string): Promise<Result> {
  if (!id.safeParse(topicId).success) return fail("Invalid topic");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("topics").delete().eq("id", topicId).select("subject_id").single();
  if (error) return fail("Couldn't delete the topic.");
  refresh(data.subject_id);
  return { ok: true };
}

// ---------------- Progress ----------------
const ProgressPatch = z.object({
  status: z.enum(["not_started", "learning", "practicing", "reviewed", "mastered"]).optional(),
  confidence: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
});

export async function updateTopicProgress(topicId: string, patch: z.input<typeof ProgressPatch>): Promise<Result> {
  const parsed = ProgressPatch.safeParse(patch);
  if (!id.safeParse(topicId).success || !parsed.success) return fail("Invalid update");
  const { supabase, user } = await requireUser();
  const { data: topic } = await supabase.from("topics").select("id, subject_id").eq("id", topicId).eq("owner_id", user.id).maybeSingle();
  if (!topic) return fail("Topic not found");
  const { data: existing } = await supabase.from("student_topic_progress").select("*").eq("user_id", user.id).eq("topic_id", topicId).maybeSingle();

  const next: Record<string, unknown> = { ...parsed.data };
  // A new confidence rating feeds the spaced-repetition schedule and mastery score.
  if (parsed.data.confidence) {
    const s = schedule(
      { easeFactor: Number(existing?.ease_factor ?? 2.5), intervalDays: Number(existing?.interval_days ?? 0), repetitions: existing?.review_count ?? 0 },
      ratingFromConfidence(parsed.data.confidence),
    );
    next.next_review_at = s.nextReviewAt.toISOString();
    next.ease_factor = s.easeFactor;
    next.interval_days = s.intervalDays;
    next.review_count = s.repetitions;
    next.mastery_score = masteryScore(parsed.data.confidence, existing?.quiz_correct ?? 0, existing?.quiz_total ?? 0, s.repetitions);
    if (!parsed.data.status) next.status = nextStatus((existing?.status ?? "not_started") as TopicStatus, parsed.data.confidence, s.repetitions);
  }
  if (parsed.data.status && parsed.data.status !== "not_started" && !existing?.last_studied_at) next.last_studied_at = new Date().toISOString();

  const { error } = await supabase.from("student_topic_progress").upsert({ user_id: user.id, topic_id: topicId, ...next }, { onConflict: "user_id,topic_id" });
  if (error) return fail("Couldn't save your progress.");
  refresh(topic.subject_id, topicId);
  revalidatePath("/progress");
  revalidatePath("/revision");
  return { ok: true };
}

const TopicMeta = z.object({
  difficulty: z.number().int().min(1).max(5).optional(),
  estimated_minutes: z.number().int().min(5).max(1200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

export async function updateTopicMeta(topicId: string, patch: z.input<typeof TopicMeta>): Promise<Result> {
  const parsed = TopicMeta.safeParse(patch);
  if (!id.safeParse(topicId).success || !parsed.success) return fail("Invalid update");
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("topics").update(parsed.data).eq("id", topicId).eq("owner_id", user.id).select("subject_id").single();
  if (error) return fail("Couldn't update the topic.");
  refresh(data.subject_id, topicId);
  return { ok: true };
}
