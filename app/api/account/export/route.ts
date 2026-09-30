import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserForApi } from "@/lib/api";

const TABLES = [
  "profiles", "student_programs", "subjects", "student_subjects", "chapters", "topics", "student_topic_progress", "resources",
  "topic_resource_links", "past_papers", "past_paper_questions", "question_topic_links", "questions", "study_plans", "study_plan_sessions",
  "study_sessions", "tasks", "calendar_events", "quiz_attempts", "flashcards", "flashcard_reviews", "ai_conversations", "ai_messages",
] as const;

/** Download everything the student owns as JSON (uploaded files are listed by path, not embedded). */
export async function GET() {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user: { id: user.id, email: user.email } };
  for (const t of TABLES) {
    const col = t === "profiles" ? "id" : ["subjects", "chapters", "topics"].includes(t) ? "owner_id" : "user_id";
    // Dynamic table loop: use the untyped client (RLS still applies).
    const { data } = await (supabase as unknown as SupabaseClient).from(t).select("*").eq(col, user.id).limit(20000);
    out[t] = (data ?? []).map((row: Record<string, unknown>) => {
      const { embedding: _embedding, ...rest } = row;
      return rest;
    });
  }
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="study-os-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
