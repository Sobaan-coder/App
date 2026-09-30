import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { generateFlashcards } from "@/lib/ai/flashcard-generator";
import { retrieve } from "@/lib/ai/retrieval";

export const maxDuration = 120;

const Body = z.object({
  source_type: z.enum(["topic", "resource", "past_paper", "conversation"]),
  source_id: z.uuid(),
  count: z.number().int().min(3).max(30).default(10),
});

/** Returns draft cards for the student to review/edit before saving. */
export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!isAIConfigured()) return NextResponse.json({ error: "Flashcard generation isn't configured on this server yet." }, { status: 503 });
  const { source_type, source_id, count } = parsed.data;

  try {
    let material = "";
    let label = "";
    let subjectId: string | null = null;
    if (source_type === "topic") {
      const { data: t } = await supabase.from("topics").select("id, name, subject_id, description, learning_objectives").eq("id", source_id).eq("owner_id", user.id).maybeSingle();
      if (!t) return NextResponse.json({ error: "Not found." }, { status: 404 });
      subjectId = t.subject_id;
      label = `Topic: ${t.name}`;
      const [sources, { data: p }] = await Promise.all([
        retrieve(supabase, t.name, { subjectId: t.subject_id, topicId: t.id, k: 8 }),
        supabase.from("student_topic_progress").select("notes").eq("user_id", user.id).eq("topic_id", t.id).maybeSingle(),
      ]);
      material = [t.description, t.learning_objectives.join("\n"), p?.notes, ...sources.map((s) => s.content)].filter(Boolean).join("\n\n");
      if (!material.trim()) material = `Syllabus topic: ${t.name}. Use standard syllabus knowledge.`;
    } else if (source_type === "resource") {
      const { data: r } = await supabase.from("resources").select("id, title, subject_id").eq("id", source_id).eq("user_id", user.id).maybeSingle();
      if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });
      subjectId = r.subject_id;
      label = `Resource: ${r.title}`;
      const { data: chunks } = await supabase.from("resource_chunks").select("content").eq("resource_id", r.id).order("chunk_index").limit(12);
      material = (chunks ?? []).map((c) => c.content).join("\n\n");
    } else if (source_type === "past_paper") {
      const { data: p } = await supabase.from("past_papers").select("id, title, subject_id, past_paper_questions(question_text)").eq("id", source_id).eq("user_id", user.id).maybeSingle();
      if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 });
      subjectId = p.subject_id;
      label = `Past paper: ${p.title} (make cards on the concepts these questions test)`;
      material = (p.past_paper_questions as { question_text: string }[]).map((q) => q.question_text).join("\n\n");
    } else {
      const { data: c } = await supabase.from("ai_conversations").select("id, title, subject_id").eq("id", source_id).eq("user_id", user.id).maybeSingle();
      if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
      subjectId = c.subject_id;
      label = `Tutor conversation: ${c.title}`;
      const { data: msgs } = await supabase.from("ai_messages").select("role, content").eq("conversation_id", c.id).order("created_at").limit(40);
      material = (msgs ?? []).map((m) => `${m.role}: ${m.content}`).join("\n\n");
    }
    if (!material.trim()) return NextResponse.json({ error: "There's no text in this source yet." }, { status: 422 });

    const { data: topics } = await supabase.from("topics").select("id, name").eq("owner_id", user.id).match(subjectId ? { subject_id: subjectId } : {}).limit(300);
    const cards = await generateFlashcards({ userId: user.id, feature: "flashcards" }, { material, label, topics: topics ?? [], count });
    return NextResponse.json({ cards: cards.map((c) => ({ ...c, topic_id: c.topic_id ?? (source_type === "topic" ? source_id : null) })), subject_id: subjectId });
  } catch (err) {
    return apiError(err, "We couldn't generate flashcards. Try again.");
  }
}
