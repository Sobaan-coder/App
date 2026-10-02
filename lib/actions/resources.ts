"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs/queue";
import { BUCKETS } from "@/lib/storage";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const uuid = z.guid();

function refresh(id?: string) {
  revalidatePath("/resources");
  if (id) revalidatePath(`/resources/${id}`);
  revalidatePath("/dashboard");
}

export async function saveNote(input: { id?: string; title: string; content: string; subject_id?: string | null; topic_ids?: string[] }): Promise<Result> {
  const parsed = z
    .object({
      id: z.guid().optional(),
      title: z.string().trim().min(1, "Give your note a title").max(300),
      content: z.string().max(200_000),
      subject_id: z.guid().nullable().optional(),
      topic_ids: z.array(z.guid()).max(20).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note" };
  const { supabase, user } = await requireUser();
  const { id, topic_ids, ...fields } = parsed.data;
  let noteId = id;
  if (id) {
    const { error } = await supabase.from("resources").update({ ...fields, processing_status: "processing" }).eq("id", id).eq("user_id", user.id).eq("type", "note");
    if (error) return { ok: false, error: "Couldn't save the note." };
  } else {
    const { data, error } = await supabase.from("resources").insert({ ...fields, user_id: user.id, type: "note", processing_status: "processing" }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save the note." };
    noteId = data.id;
  }
  if (topic_ids?.length) {
    await supabase.from("topic_resource_links").upsert(
      topic_ids.map((topic_id) => ({ user_id: user.id, resource_id: noteId!, topic_id, source: "user" as const, confirmed: true, confidence: 1 })),
      { onConflict: "topic_id,resource_id" },
    );
  }
  // Re-index so the tutor can search the latest version.
  await enqueueJob("resource", noteId!, user.id);
  refresh(noteId);
  return { ok: true, id: noteId };
}

const Patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  subject_id: z.guid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export async function updateResource(id: string, patch: z.input<typeof Patch>): Promise<Result> {
  const parsed = Patch.safeParse(patch);
  if (!uuid.safeParse(id).success || !parsed.success) return { ok: false, error: "Invalid update" };
  const { supabase, user } = await requireUser();
  const fields = { ...parsed.data, ...(parsed.data.subject_id !== undefined ? { suggested_subject_id: null } : {}) };
  if (fields.tags) fields.tags = [...new Set(fields.tags.map((t) => t.toLowerCase()))];
  const { error } = await supabase.from("resources").update(fields).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't update the resource." };
  refresh(id);
  return { ok: true };
}

export async function deleteResource(id: string): Promise<Result> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid resource" };
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("resources").select("storage_path").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) return { ok: false, error: "Not found" };
  if (data.storage_path) await supabase.storage.from(BUCKETS.resources).remove([data.storage_path]);
  const { error } = await supabase.from("resources").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete the resource." };
  refresh();
  return { ok: true };
}

/** Student confirms/edits the AI's suggested subject + topics for a resource. */
export async function confirmResourceLinks(id: string, input: { subject_id: string | null; topic_ids: string[] }): Promise<Result> {
  const parsed = z.object({ subject_id: z.guid().nullable(), topic_ids: z.array(z.guid()).max(30) }).safeParse(input);
  if (!uuid.safeParse(id).success || !parsed.success) return { ok: false, error: "Invalid selection" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("resources").update({ subject_id: parsed.data.subject_id, suggested_subject_id: null }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't save." };
  await supabase.from("topic_resource_links").delete().eq("resource_id", id).not("topic_id", "in", `(${parsed.data.topic_ids.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (parsed.data.topic_ids.length) {
    const { error: linkError } = await supabase.from("topic_resource_links").upsert(
      parsed.data.topic_ids.map((topic_id) => ({ user_id: user.id, resource_id: id, topic_id, confirmed: true })),
      { onConflict: "topic_id,resource_id" },
    );
    if (linkError) return { ok: false, error: "Couldn't link those topics." };
  }
  refresh(id);
  return { ok: true };
}
