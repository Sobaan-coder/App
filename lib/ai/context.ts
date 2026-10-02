import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { daysUntil, getSubjects, getTopicSignals, todayIn } from "@/lib/data/workspace";

/**
 * The AI context engine: a compact, factual snapshot of WHO the student is,
 * WHAT they study, WHEN their exams are, WHAT they have, WHERE they're weak.
 * Built fresh per request from the database (never from model memory).
 */
export async function buildStudentContext(supabase: ServerClient, userId: string, focus: { subjectId?: string | null; topicId?: string | null } = {}) {
  const [{ data: profile }, { data: program }, subjects, { data: tasks }, { count: resourceCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, education_level, country, current_level, daily_study_minutes, timezone").eq("id", userId).single(),
    supabase.from("student_programs").select("level, programs(name, education_system)").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
    getSubjects(supabase, userId),
    supabase.from("tasks").select("title, due_at, type").eq("user_id", userId).neq("status", "done").order("due_at").limit(5),
    supabase.from("resources").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("processing_status", "ready"),
  ]);
  const today = todayIn(profile?.timezone);
  const signals = await getTopicSignals(supabase, userId, focus.subjectId ? [focus.subjectId] : undefined);
  const prog = program?.programs as { name: string; education_system: string | null } | null;

  const lines: string[] = [
    `Today: ${today}`,
    `Student: ${profile?.full_name ?? "unknown"} · level: ${profile?.education_level ?? "unknown"}${prog ? ` · programme: ${[prog.education_system, prog.name].filter(Boolean).join(" — ")}` : ""}${program?.level ? ` (${program.level})` : ""}${profile?.country ? ` · ${profile.country}` : ""}`,
    `Daily study time available: ~${profile?.daily_study_minutes ?? 120} minutes`,
    "Subjects:",
    ...subjects.map((s) => `- ${s.name}${s.code ? ` (${s.code})` : ""}: progress ${s.progress}%${s.exam_date ? `, exam ${s.exam_date} (${daysUntil(s.exam_date, today)} days)` : ""}`),
  ];

  const weak = signals.filter((s) => s.status !== "not_started" || s.confidence !== null).sort((a, b) => b.priority.weakness - a.priority.weakness).slice(0, 6);
  if (weak.length) lines.push("Weakest topics:", ...weak.map((t) => `- ${t.name} (${t.subjectName}): confidence ${t.confidence ?? "unrated"}/5, status ${t.status}`));

  if (focus.topicId) {
    const t = signals.find((s) => s.topicId === focus.topicId);
    if (t) {
      lines.push(
        `Current topic: ${t.name} (${t.chapter}, ${t.subjectName}) — status ${t.status}, confidence ${t.confidence ?? "unrated"}/5, difficulty ${t.difficulty}/5, appeared in ${t.paperCount} of ${t.totalPapers} uploaded papers`,
      );
    }
  }
  if (tasks?.length) lines.push("Upcoming tasks:", ...tasks.map((t) => `- ${t.title}${t.due_at ? ` (due ${t.due_at.slice(0, 10)})` : ""}`));
  lines.push(`Uploaded, indexed resources: ${resourceCount ?? 0}`);
  return `<student_context>\n${lines.join("\n")}\n</student_context>`;
}
