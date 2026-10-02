"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { embedTopicsForSubjects } from "@/lib/embeddings/topics";

const Payload = z.object({
  full_name: z.string().trim().min(1, "Tell us your name").max(120),
  education_level: z.enum(["university", "ca", "acca", "cfa", "mdcat", "ecat", "css", "a_level", "o_level", "college", "professional", "other"]),
  country: z.string().trim().max(80).nullable().optional(),
  program_id: z.guid().nullable().optional(),
  custom_program: z.string().trim().max(120).nullable().optional(),
  current_level: z.string().trim().max(80).nullable().optional(),
  template_subjects: z.array(z.object({ id: z.guid(), exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })).max(20),
  custom_subjects: z.array(z.object({ name: z.string().trim().min(1).max(160), exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })).max(20),
  daily_study_minutes: z.number().int().min(15).max(960),
  study_days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one study day").max(7),
  timezone: z.string().max(60).optional(),
});

export type OnboardingPayload = z.input<typeof Payload>;

/** Saves the profile and creates the student's program + subjects. Idempotent for templates. */
export async function saveOnboarding(input: OnboardingPayload) {
  const parsed = Payload.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  const p = parsed.data;
  const { supabase, user } = await requireUser();

  let tz = p.timezone ?? "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: p.full_name,
      education_level: p.education_level,
      country: p.country || null,
      current_level: p.current_level || null,
      daily_study_minutes: p.daily_study_minutes,
      study_days: [...new Set(p.study_days)].sort(),
      timezone: tz,
    })
    .eq("id", user.id);
  if (profileError) return { ok: false as const, error: "Couldn't save your profile." };

  // Programme: catalogue entry, or a private one the student typed.
  let programId = p.program_id ?? null;
  if (!programId && p.custom_program) {
    const { data } = await supabase.from("programs").insert({ name: p.custom_program, owner_id: user.id, levels: p.current_level ? [p.current_level] : [] }).select("id").single();
    programId = data?.id ?? null;
  }
  if (programId) {
    await supabase.from("student_programs").update({ is_primary: false }).eq("user_id", user.id);
    await supabase.from("student_programs").upsert({ user_id: user.id, program_id: programId, level: p.current_level || null, is_primary: true }, { onConflict: "user_id,program_id" });
  }

  const subjectIds: string[] = [];
  for (const t of p.template_subjects) {
    const { data } = await supabase.rpc("clone_subject_template", { p_template_id: t.id, p_exam_date: t.exam_date ?? undefined });
    if (data) {
      subjectIds.push(data);
      if (t.exam_date) await supabase.from("student_subjects").update({ exam_date: t.exam_date }).eq("user_id", user.id).eq("subject_id", data);
    }
  }
  if (p.custom_subjects.length) {
    const { data } = await supabase.rpc("save_syllabus", {
      p_payload: { subjects: p.custom_subjects.map((s) => ({ name: s.name, exam_date: s.exam_date, chapters: [] })) },
      p_program_id: programId ?? undefined,
    });
    subjectIds.push(...(data ?? []));
  }
  after(() => embedTopicsForSubjects(subjectIds).catch(() => {}));
  return { ok: true as const, subjectIds };
}

export async function finishOnboarding() {
  const { supabase, user } = await requireUser();
  await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Fills the caller's own account with the CA Pakistan / FAR demo workspace. */
export async function loadDemoWorkspace() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("create_demo_workspace");
  if (error) return { ok: false as const, error: "Couldn't load the demo workspace." };
  await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
  revalidatePath("/", "layout");
  return { ok: true as const, subjectId: data };
}
