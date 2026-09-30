import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { TutorChat, type Citation } from "@/components/ai/tutor-chat";
import { MODES, type Mode } from "@/lib/ai/tutor-modes";
import { TutorLayout } from "@/components/ai/tutor-layout";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: convo } = await supabase.from("ai_conversations").select("id, title, mode, subject_id, topic_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!convo) notFound();
  const [{ data: messages }, { data: conversations }] = await Promise.all([
    supabase.from("ai_messages").select("id, role, content, citations, grounded").eq("conversation_id", id).order("created_at").limit(200),
    supabase.from("ai_conversations").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30),
  ]);
  const mode = MODES.some(([k]) => k === convo.mode) ? (convo.mode as Mode) : "explain_simply";

  return (
    <TutorLayout
      conversations={conversations ?? []}
      activeId={id}
      header={
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{convo.title}</h1>
          <Button asChild variant="ghost" size="sm" className="lg:hidden">
            <Link href="/tutor">
              <MessageSquarePlus /> New
            </Link>
          </Button>
        </div>
      }
    >
      <TutorChat
        conversationId={id}
        initialMode={mode}
        context={{ subject_id: convo.subject_id, topic_id: convo.topic_id }}
        initialMessages={(messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: (m.citations as unknown as Citation[]) ?? [],
          grounded: m.role === "assistant" ? m.grounded : undefined,
        }))}
      />
    </TutorLayout>
  );
}
