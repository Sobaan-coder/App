import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { generateQuiz } from "@/lib/ai/quiz-generator";
import { retrieve } from "@/lib/ai/retrieval";
import { getTopicSignals } from "@/lib/data/workspace";
import type { Json } from "@/types/database";

export const maxDuration = 300;

const Body = z.object({
  subject_id: z.guid().nullable().optional(),
  topic_id: z.guid().nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard", "exam"]),
  count: z.number().int().min(3).max(20),
});

export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.subject_id && !parsed.data.topic_id)) return NextResponse.json({ error: "Choose a subject or topic." }, { status: 400 });
  if (!isAIConfigured()) return NextResponse.json({ error: "Quiz generation isn't configured on this server yet." }, { status: 503 });
  const b = parsed.data;

  try {
    let subjectId = b.subject_id ?? null;
    if (b.topic_id) {
      const { data: t } = await supabase.from("topics").select("subject_id").eq("id", b.topic_id).eq("owner_id", user.id).maybeSingle();
      if (!t) return NextResponse.json({ error: "Topic not found." }, { status: 404 });
      subjectId = t.subject_id;
    }
    const { data: subject } = await supabase.from("subjects").select("id, name, code").eq("id", subjectId!).eq("owner_id", user.id).maybeSingle();
    if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

    // Topic focus: the chosen topic, or the student's weakest/highest-priority topics in the subject.
    const signals = await getTopicSignals(supabase, user.id, [subject.id]);
    const focus = b.topic_id ? signals.filter((s) => s.topicId === b.topic_id) : signals.slice(0, 6);
    if (!focus.length) return NextResponse.json({ error: "Add topics to this subject first." }, { status: 422 });

    const sources = await retrieve(supabase, focus.map((t) => t.name).join(" "), { subjectId: subject.id, topicId: b.topic_id ?? null, k: 8 });
    const items = await generateQuiz(
      { userId: user.id, feature: "quiz" },
      { topics: focus.map((t) => ({ id: t.topicId, name: t.name, chapter: t.chapter ?? "" })), subjectName: subject.code ? `${subject.name} (${subject.code})` : subject.name, difficulty: b.difficulty, count: b.count, sources },
    );
    if (items.length < 3) return NextResponse.json({ error: "We couldn't generate a good quiz this time. Try again." }, { status: 502 });

    const { data: attempt, error } = await supabase
      .from("quiz_attempts")
      .insert({ user_id: user.id, subject_id: subject.id, topic_id: b.topic_id ?? null, difficulty: b.difficulty, total: items.length, items: items as unknown as NonNullable<Json> })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: attempt.id });
  } catch (err) {
    return apiError(err, "We couldn't generate the quiz. Try again.");
  }
}
