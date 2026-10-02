"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { reviewFlashcard } from "@/lib/actions/flashcards";
import { toast } from "sonner";

type Card = { id: string; front: string; back: string; topic: string | null };

const RATINGS = [
  { key: "again", label: "Again", hint: "<10m", className: "border-destructive/40 hover:bg-destructive/10" },
  { key: "hard", label: "Hard", hint: "sooner", className: "hover:bg-accent" },
  { key: "good", label: "Good", hint: "on time", className: "hover:bg-accent" },
  { key: "easy", label: "Easy", hint: "later", className: "border-success/40 hover:bg-success/10" },
] as const;

export function FlashcardReview({ cards }: { cards: Card[] }) {
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [, start] = useTransition();
  const card = queue[0];

  function rate(rating: (typeof RATINGS)[number]["key"]) {
    const current = card;
    setFlipped(false);
    // "Again" puts the card back at the end of this session.
    setQueue((q) => (rating === "again" ? [...q.slice(1), current] : q.slice(1)));
    if (rating !== "again") setDone((d) => d + 1);
    start(async () => {
      const res = await reviewFlashcard(current.id, rating);
      if (!res.ok) toast.error(res.error);
    });
  }

  if (!card) {
    return (
      <div className="rounded-3xl border bg-card p-10 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="mt-3 text-lg font-semibold">All caught up</h2>
        <p className="mt-1 text-sm text-muted-foreground">You reviewed {done} card{done === 1 ? "" : "s"}. They&apos;ll come back when they&apos;re due.</p>
        <Button asChild className="mt-5">
          <Link href="/revision">Back to revision</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{queue.length} left</span>
        <span>{done} reviewed</span>
      </div>
      <Progress value={(done / (done + queue.length)) * 100} aria-label="Review progress" />
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-64 w-full flex-col items-center justify-center rounded-3xl border bg-card p-8 text-center shadow-sm transition-colors hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none"
        aria-label={flipped ? "Show question" : "Show answer"}
      >
        {card.topic && <span className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.topic}</span>}
        <span className="text-lg font-medium leading-relaxed">{flipped ? card.back : card.front}</span>
        {!flipped && <span className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw className="size-3" /> Tap to reveal</span>}
      </button>
      {flipped && (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
          {RATINGS.map((r) => (
            <Button key={r.key} variant="outline" className={`h-14 flex-col gap-0 ${r.className}`} onClick={() => rate(r.key)}>
              <span>{r.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{r.hint}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
