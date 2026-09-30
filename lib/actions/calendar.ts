"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

type Result = { ok: true } | { ok: false; error: string };

const Event = z.object({
  id: z.guid().optional(),
  title: z.string().trim().min(1, "Give the event a title").max(300),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.enum(["exam", "assignment", "quiz", "class", "study_session", "deadline", "revision"]),
  subject_id: z.guid().nullable().optional(),
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }).nullable().optional(),
  all_day: z.boolean().optional(),
});

function refresh() {
  for (const p of ["/calendar", "/dashboard", "/deadlines"]) revalidatePath(p);
}

export async function saveEvent(input: z.input<typeof Event>): Promise<Result> {
  const parsed = Event.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid event" };
  if (parsed.data.end_at && parsed.data.end_at < parsed.data.start_at) return { ok: false, error: "The end must be after the start." };
  const { supabase, user } = await requireUser();
  const { id, ...fields } = parsed.data;
  const row = { ...fields, description: fields.description || null, subject_id: fields.subject_id || null, end_at: fields.end_at || null };
  const { error } = id ? await supabase.from("calendar_events").update(row).eq("id", id).eq("user_id", user.id) : await supabase.from("calendar_events").insert({ ...row, user_id: user.id });
  if (error) return { ok: false, error: "Couldn't save the event." };
  // Exams on the calendar keep the subject's exam date in sync.
  if (fields.type === "exam" && fields.subject_id) {
    await supabase.from("student_subjects").update({ exam_date: fields.start_at.slice(0, 10) }).eq("user_id", user.id).eq("subject_id", fields.subject_id);
  }
  refresh();
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<Result> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid event" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete the event." };
  refresh();
  return { ok: true };
}

export async function setEventCompleted(id: string, completed: boolean): Promise<Result> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: "Invalid event" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("calendar_events").update({ completed }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't update the event." };
  refresh();
  return { ok: true };
}

/** Drag-and-drop: move any calendar item to another day, keeping its time of day. */
export async function moveCalendarItem(kind: "event" | "task" | "session", id: string, date: string): Promise<Result> {
  if (!z.guid().safeParse(id).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Invalid move" };
  const { supabase, user } = await requireUser();
  if (kind === "session") {
    const { error } = await supabase.from("study_plan_sessions").update({ scheduled_date: date, status: "planned" }).eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: "Couldn't move the session." };
    revalidatePath("/planner");
  } else if (kind === "event") {
    const { data } = await supabase.from("calendar_events").select("start_at, end_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!data) return { ok: false, error: "Not found" };
    const start = `${date}${data.start_at.slice(10)}`;
    const shift = Date.parse(start) - Date.parse(data.start_at);
    const { error } = await supabase
      .from("calendar_events")
      .update({ start_at: start, end_at: data.end_at ? new Date(Date.parse(data.end_at) + shift).toISOString() : null })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: "Couldn't move the event." };
  } else {
    const { data } = await supabase.from("tasks").select("due_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!data) return { ok: false, error: "Not found" };
    const { error } = await supabase.from("tasks").update({ due_at: `${date}${data.due_at ? data.due_at.slice(10) : "T09:00:00Z"}` }).eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: "Couldn't move the task." };
  }
  refresh();
  return { ok: true };
}
