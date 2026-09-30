"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runJob } from "@/lib/jobs/queue";

type Result = { ok: true } | { ok: false; error: string };

const LEVEL = z.enum(["university", "ca", "acca", "cfa", "mdcat", "ecat", "css", "a_level", "o_level", "college", "professional", "other"]);

export async function createEducationSystem(input: { name: string; country: string | null; category: string; description: string | null }): Promise<Result> {
  await requireAdmin();
  const parsed = z.object({ name: z.string().trim().min(2).max(120), country: z.string().trim().max(80).nullable(), category: LEVEL, description: z.string().trim().max(500).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the education system details." };
  const { error } = await createAdminClient().from("education_systems").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/catalogue");
  return { ok: true };
}

export async function createProgram(input: { education_system_id: string; name: string; levels: string[]; description: string | null }): Promise<Result> {
  await requireAdmin();
  const parsed = z.object({ education_system_id: z.guid(), name: z.string().trim().min(1).max(120), levels: z.array(z.string().trim().min(1).max(60)).max(20), description: z.string().trim().max(500).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the programme details." };
  const admin = createAdminClient();
  const { data: sys } = await admin.from("education_systems").select("name").eq("id", parsed.data.education_system_id).is("owner_id", null).single();
  if (!sys) return { ok: false, error: "Education system not found." };
  const { error } = await admin.from("programs").insert({ ...parsed.data, education_system: sys.name });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/catalogue");
  return { ok: true };
}

/**
 * Template subject from a simple outline:
 *   Chapter name: topic one, topic two, topic three
 * one chapter per line.
 */
export async function createTemplateSubject(input: { program_id: string; name: string; code: string | null; outline: string }): Promise<Result> {
  await requireAdmin();
  const parsed = z.object({ program_id: z.guid(), name: z.string().trim().min(1).max(160), code: z.string().trim().max(30).nullable(), outline: z.string().max(20000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the subject details." };
  const chapters = parsed.data.outline
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, rest = ""] = line.split(/:(.*)/s);
      return { name: name.trim().slice(0, 200), topics: rest.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 100) };
    })
    .filter((c) => c.name);
  if (!chapters.length) return { ok: false, error: "Add at least one chapter line." };

  const admin = createAdminClient();
  const { data: subject, error } = await admin.from("subjects").insert({ program_id: parsed.data.program_id, owner_id: null, name: parsed.data.name, code: parsed.data.code || null }).select("id").single();
  if (error) return { ok: false, error: error.message };
  for (const [i, c] of chapters.entries()) {
    const { data: ch } = await admin.from("chapters").insert({ subject_id: subject.id, name: c.name, sort_order: i }).select("id").single();
    if (ch && c.topics.length) {
      await admin.from("topics").insert(c.topics.map((name, j) => ({ chapter_id: ch.id, subject_id: subject.id, name: name.slice(0, 200), sort_order: j })));
    }
  }
  revalidatePath("/admin/catalogue");
  return { ok: true };
}

export async function deleteTemplateSubject(id: string): Promise<Result> {
  await requireAdmin();
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid subject" };
  // Only templates (owner_id null); students' private copies are never touched.
  const { error } = await createAdminClient().from("subjects").delete().eq("id", id).is("owner_id", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/catalogue");
  return { ok: true };
}

export async function retryJob(id: string): Promise<Result> {
  await requireAdmin();
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid job" };
  const admin = createAdminClient();
  const { error } = await admin.from("processing_jobs").update({ status: "queued", attempts: 0, error: null }).eq("id", id).eq("status", "failed");
  if (error) return { ok: false, error: error.message };
  await runJob(id);
  revalidatePath("/admin/jobs");
  return { ok: true };
}
