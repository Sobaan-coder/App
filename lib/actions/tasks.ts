"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

const TaskInput = z.object({
  id: z.guid().optional(),
  title: z.string().trim().min(1, "Give the task a title").max(300),
  description: z.string().trim().max(4000).optional().nullable(),
  type: z.enum(["assignment", "project", "quiz", "exam", "application", "registration", "study", "other"]),
  subject_id: z.guid().nullable().optional(),
  due_at: z.string().nullable().optional(), // ISO datetime
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateTasks() {
  for (const p of ["/dashboard", "/deadlines", "/calendar", "/study"]) revalidatePath(p);
}

export async function saveTask(raw: z.input<typeof TaskInput>): Promise<ActionResult> {
  const parsed = TaskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task" };
  const { supabase, user } = await requireUser();
  const { id, ...fields } = parsed.data;
  const row = {
    ...fields,
    description: fields.description || null,
    subject_id: fields.subject_id || null,
    due_at: fields.due_at || null,
    completed_at: fields.status === "done" ? new Date().toISOString() : null,
  };
  const { error } = id
    ? await supabase.from("tasks").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("tasks").insert({ ...row, user_id: user.id });
  if (error) return { ok: false, error: "Couldn't save the task. Try again." };
  revalidateTasks();
  return { ok: true };
}

export async function setTaskStatus(id: string, status: "todo" | "in_progress" | "done"): Promise<ActionResult> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid task" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't update the task." };
  revalidateTasks();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid task" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete the task." };
  revalidateTasks();
  return { ok: true };
}
