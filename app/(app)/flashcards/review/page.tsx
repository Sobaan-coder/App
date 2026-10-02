import type { Metadata } from "next";
import { FlashcardReview } from "@/components/flashcards/flashcard-review";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Review flashcards" };

export default async function ReviewPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("flashcards").select("id, front, back, topics(name)").eq("user_id", user.id).lte("due_at", new Date().toISOString()).order("due_at").limit(50);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Flashcard review</h1>
      <FlashcardReview cards={(data ?? []).map((c) => ({ id: c.id, front: c.front, back: c.back, topic: (c.topics as { name: string } | null)?.name ?? null }))} />
    </div>
  );
}
