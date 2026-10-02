"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { SyllabusDraft } from "@/lib/syllabus/schema";
import { embedTopicsForSubjects } from "@/lib/embeddings/topics";
import type { Json } from "@/types/database";

export async function saveSyllabus(input: { draft: unknown; importId?: string | null; programId?: string | null }) {
  const parsed = SyllabusDraft.safeParse(input.draft);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Please check the structure." };
  const { supabase, user } = await requireUser();
  const programId = input.programId && z.guid().safeParse(input.programId).success ? input.programId : null;

  const { data: ids, error } = await supabase.rpc("save_syllabus", {
    p_payload: parsed.data as unknown as Json,
    p_program_id: programId ?? undefined,
  });
  if (error || !ids) return { ok: false as const, error: "Couldn't save your syllabus. Try again." };

  if (input.importId && z.guid().safeParse(input.importId).success) {
    await supabase.from("syllabus_imports").update({ saved: true }).eq("id", input.importId).eq("user_id", user.id);
  }
  after(() => embedTopicsForSubjects(ids).catch(() => {}));
  revalidatePath("/subjects");
  revalidatePath("/dashboard");
  return { ok: true as const, subjectIds: ids };
}

export async function addTemplateSubject(templateId: string, examDate: string | null) {
  if (!z.guid().safeParse(templateId).success) return { ok: false as const, error: "Invalid subject" };
  const date = examDate && /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : null;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("clone_subject_template", { p_template_id: templateId, p_exam_date: date ?? undefined });
  if (error || !data) return { ok: false as const, error: "Couldn't add that subject." };
  after(() => embedTopicsForSubjects([data]).catch(() => {}));
  revalidatePath("/subjects");
  revalidatePath("/dashboard");
  return { ok: true as const, subjectId: data };
}
