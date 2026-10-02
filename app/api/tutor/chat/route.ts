import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { streamWithAccounting } from "@/lib/ai/structured";
import { AIError, type ChatMessage } from "@/lib/ai/types";
import { citedSources, formatSources, retrieve } from "@/lib/ai/retrieval";
import { buildStudentContext } from "@/lib/ai/context";
import { TUTOR_MODES, conversationTitle, tutorSystemPrompt, type TutorMode } from "@/lib/ai/chat";
import type { Json } from "@/types/database";

export const maxDuration = 300;

const Body = z.object({
  conversation_id: z.guid().nullable().optional(),
  message: z.string().trim().min(1, "Type a question").max(8000),
  mode: z.enum(Object.keys(TUTOR_MODES) as [TutorMode, ...TutorMode[]]).default("explain_simply"),
  subject_id: z.guid().nullable().optional(),
  topic_id: z.guid().nullable().optional(),
  resource_id: z.guid().nullable().optional(),
});

const HISTORY_TURNS = 12;

/**
 * Streams an NDJSON response:
 *   {"type":"meta","conversation_id","sources":[…]}
 *   {"type":"delta","text"}…
 *   {"type":"done","message_id","citations":[…],"grounded"}
 *   {"type":"error","error"}
 */
export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  if (!isAIConfigured()) return NextResponse.json({ error: "The AI tutor isn't configured on this server yet." }, { status: 503 });
  const b = parsed.data;

  try {
    // Conversation (create or verify ownership through RLS).
    let conversationId = b.conversation_id ?? null;
    let subjectId = b.subject_id ?? null;
    let topicId = b.topic_id ?? null;
    if (conversationId) {
      const { data: convo } = await supabase.from("ai_conversations").select("id, subject_id, topic_id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
      if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      subjectId ??= convo.subject_id;
      topicId ??= convo.topic_id;
    } else {
      const { data: convo, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: user.id, title: conversationTitle(b.message), mode: b.mode, subject_id: subjectId, topic_id: topicId })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = convo.id;
    }
    if (topicId && !subjectId) {
      const { data: t } = await supabase.from("topics").select("subject_id").eq("id", topicId).maybeSingle();
      subjectId = t?.subject_id ?? null;
    }

    const [{ data: history }, sources, studentContext] = await Promise.all([
      supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY_TURNS),
      retrieve(supabase, b.message, { subjectId, topicId, resourceId: b.resource_id }),
      buildStudentContext(supabase, user.id, { subjectId, topicId }),
    ]);

    // Persist the question before streaming so it's never lost.
    await supabase.from("ai_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: b.message, mode: b.mode });

    const messages: ChatMessage[] = [
      ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: b.message },
    ];
    const textStream = await streamWithAccounting(
      { userId: user.id, feature: "tutor" },
      { tier: "strong", effort: b.mode === "step_by_step" || b.mode === "detailed" ? "high" : "medium", system: tutorSystemPrompt(b.mode, studentContext, formatSources(sources)), messages, maxTokens: 12000 },
    );

    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController, obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
    const publicSources = sources.map((s) => ({ n: s.n, kind: s.kind, title: s.title, page: s.page, resourceId: s.resourceId, paperId: s.paperId ?? null, id: s.id }));

    const stream = new ReadableStream({
      async start(controller) {
        send(controller, { type: "meta", conversation_id: conversationId, sources: publicSources });
        let answer = "";
        try {
          for await (const delta of textStream) {
            answer += delta;
            send(controller, { type: "delta", text: delta });
          }
          const cited = citedSources(answer, sources).map((s) => publicSources.find((p) => p.n === s.n)!);
          const { data: saved } = await supabase
            .from("ai_messages")
            .insert({ conversation_id: conversationId!, user_id: user.id, role: "assistant", content: answer, mode: b.mode, citations: cited as unknown as NonNullable<Json>, grounded: cited.length > 0 })
            .select("id")
            .single();
          await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString(), mode: b.mode }).eq("id", conversationId!);
          send(controller, { type: "done", message_id: saved?.id ?? null, citations: cited, grounded: cited.length > 0 });
        } catch (err) {
          const message = err instanceof AIError ? err.userMessage : "The tutor couldn't finish that answer. Try again.";
          if (answer) {
            await supabase.from("ai_messages").insert({ conversation_id: conversationId!, user_id: user.id, role: "assistant", content: answer + "\n\n_(Answer interrupted.)_", mode: b.mode });
          }
          send(controller, { type: "error", error: message });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (err) {
    return apiError(err, "The tutor couldn't start. Try again.");
  }
}
