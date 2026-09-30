import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { TutorChat, type Mode, MODES } from "@/components/ai/tutor-chat";
import { TutorLayout } from "@/components/ai/tutor-layout";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "AI Tutor" };

type Search = { q?: string; mode?: string; subject?: string; topic?: string; resource?: string };

export default async function TutorPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: conversations }, subject, topic, resource] = await Promise.all([
    supabase.from("ai_conversations").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30),
    sp.subject ? supabase.from("subjects").select("id, name").eq("id", sp.subject).maybeSingle() : Promise.resolve({ data: null }),
    sp.topic ? supabase.from("topics").select("id, name, subject_id").eq("id", sp.topic).maybeSingle() : Promise.resolve({ data: null }),
    sp.resource ? supabase.from("resources").select("id, title, subject_id").eq("id", sp.resource).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const mode = MODES.some(([k]) => k === sp.mode) ? (sp.mode as Mode) : "explain_simply";
  const label = resource.data?.title ?? topic.data?.name ?? subject.data?.name ?? null;

  return (
    <TutorLayout
      conversations={conversations ?? []}
      header={
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">AI Tutor</h1>
          <Button asChild variant="ghost" size="sm" className="lg:hidden">
            <Link href="/tutor/history">
              <History /> History
            </Link>
          </Button>
        </div>
      }
    >
      <TutorChat
        key={`${sp.q}-${sp.topic}-${sp.subject}-${sp.resource}`}
        initialMessages={[]}
        initialQuery={sp.q}
        initialMode={mode}
        contextLabel={label}
        context={{
          subject_id: subject.data?.id ?? topic.data?.subject_id ?? resource.data?.subject_id ?? null,
          topic_id: topic.data?.id ?? null,
          resource_id: resource.data?.id ?? null,
        }}
      />
    </TutorLayout>
  );
}
