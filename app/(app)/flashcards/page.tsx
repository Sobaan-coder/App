import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Play, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { FlashcardGenerator } from "@/components/flashcards/flashcard-generator";
import { FlashcardList } from "@/components/flashcards/flashcard-list";
import { SubjectSwitcher } from "@/components/common/subject-switcher";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Flashcards" };
const PAGE_SIZE = 30;

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ generate?: string; resource?: string; paper?: string; conversation?: string; new?: string; subject?: string; page?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const page = Math.max(1, Number(sp.page) || 1);

  // Which source (if any) to generate from.
  let source: { type: "topic" | "resource" | "past_paper" | "conversation"; id: string; label: string } | null = null;
  if (sp.generate) {
    const { data } = await supabase.from("topics").select("id, name").eq("id", sp.generate).maybeSingle();
    if (data) source = { type: "topic", id: data.id, label: data.name };
  } else if (sp.resource) {
    const { data } = await supabase.from("resources").select("id, title").eq("id", sp.resource).maybeSingle();
    if (data) source = { type: "resource", id: data.id, label: data.title };
  } else if (sp.paper) {
    const { data } = await supabase.from("past_papers").select("id, title").eq("id", sp.paper).maybeSingle();
    if (data) source = { type: "past_paper", id: data.id, label: data.title };
  } else if (sp.conversation) {
    const { data } = await supabase.from("ai_conversations").select("id, title").eq("id", sp.conversation).maybeSingle();
    if (data) source = { type: "conversation", id: data.id, label: data.title };
  }

  let q = supabase.from("flashcards").select("id, front, back, due_at, topics(name)", { count: "exact" }).eq("user_id", user.id).order("due_at").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.subject) q = q.eq("subject_id", sp.subject);
  const [{ data: cards, count }, { count: due }, { data: subjects }] = await Promise.all([
    q,
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due_at", new Date().toISOString()),
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
  ]);
  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flashcards"
        description="Generate cards from any topic, PDF, past paper or tutor conversation — reviewed on a spaced-repetition schedule."
        actions={
          <>
            <SubjectSwitcher subjects={subjectOptions} current={sp.subject ?? null} basePath="/flashcards" allowAll />
            <Button asChild variant="outline">
              <Link href="/flashcards?new=1">
                <Plus /> New card
              </Link>
            </Button>
            <Button asChild disabled={!due}>
              <Link href="/flashcards/review">
                <Play /> Review {due ?? 0} due
              </Link>
            </Button>
          </>
        }
      />
      {(source || sp.new) && <FlashcardGenerator key={source?.id ?? "new"} source={source} subjects={subjectOptions} defaultSubjectId={sp.subject ?? null} />}
      {cards?.length ? (
        <>
          <FlashcardList cards={cards.map((c) => ({ id: c.id, front: c.front, back: c.back, due_at: c.due_at, topic: (c.topics as { name: string } | null)?.name ?? null }))} />
          <Pagination page={page} pageCount={Math.ceil((count ?? 0) / PAGE_SIZE)} makeHref={(p) => `/flashcards?page=${p}${sp.subject ? `&subject=${sp.subject}` : ""}`} />
        </>
      ) : (
        !source && !sp.new && (
          <EmptyState
            icon={Layers}
            title="No flashcards yet"
            description="Open any topic or resource and choose “Make flashcards”, or write your own."
            action={
              <Button asChild>
                <Link href="/flashcards?new=1">Create a card</Link>
              </Button>
            }
          />
        )
      )}
    </div>
  );
}
