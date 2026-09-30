"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import type { TablesUpdate } from "@/types/database";

type Result = { ok: true } | { ok: false; error: string };

const Patch = z.object({
  solved_status: z.enum(["unsolved", "attempted", "solved", "needs_review"]).optional(),
  bookmarked: z.boolean().optional(),
  marked_difficult: z.boolean().optional(),
  note: z.string().max(4000).nullable().optional(),
});

export async function updateQuestion(id: string, patch: z.input<typeof Patch>): Promise<Result> {
  const parsed = Patch.safeParse(patch);
  if (!z.guid().safeParse(id).success || !parsed.success) return { ok: false, error: "Invalid update" };
  const { supabase, user } = await requireUser();
  const fields: TablesUpdate<"questions"> = { ...parsed.data };
  if (parsed.data.solved_status && parsed.data.solved_status !== "unsolved") fields.last_attempted_at = new Date().toISOString();
  const { data: current } = await supabase.from("questions").select("attempts").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!current) return { ok: false, error: "Question not found" };
  if (parsed.data.solved_status && parsed.data.solved_status !== "unsolved") fields.attempts = current.attempts + 1;
  const { error } = await supabase.from("questions").update(fields).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't update the question." };
  revalidatePath("/questions");
  return { ok: true };
}

/** "Solve again": back to unsolved, keeps the attempt history. */
export async function solveAgain(id: string): Promise<Result> {
  return updateQuestion(id, { solved_status: "unsolved" });
}

const NewQuestion = z.object({
  subject_id: z.guid(),
  topic_id: z.guid().nullable().optional(),
  question_text: z.string().trim().min(5, "Write the question").max(6000),
  answer: z.string().trim().max(8000).nullable().optional(),
  question_type: z.enum(["mcq", "short", "long", "numerical", "theory", "case_study"]),
  difficulty: z.number().int().min(1).max(5),
  marks: z.number().min(0).max(1000).nullable().optional(),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
});

export async function addQuestion(input: z.input<typeof NewQuestion>): Promise<Result> {
  const parsed = NewQuestion.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid question" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("questions").insert({ ...parsed.data, user_id: user.id, source_type: "manual" });
  if (error) return { ok: false, error: "Couldn't add the question." };
  revalidatePath("/questions");
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<Result> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid question" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("questions").delete().eq("id", id).eq("user_id", user.id).neq("source_type", "past_paper");
  if (error) return { ok: false, error: "Couldn't delete the question." };
  revalidatePath("/questions");
  return { ok: true };
}
