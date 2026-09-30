"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewTopic } from "@/lib/actions/flashcards";
import { toast } from "sonner";

type Item = { topicId: string; name: string; subject: string; confidence: number | null; reviewCount: number };

export function TopicReviewList({ items }: { items: Item[] }) {
  const [, start] = useTransition();
  const [reviewed, markReviewed] = useOptimistic<string[], string>([], (s, id) => [...s, id]);
  return (
    <ul className="divide-y">
      {items.map((t) => {
        const done = reviewed.includes(t.topicId);
        return (
          <li key={t.topicId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Link href={`/topics/${t.topicId}`} className="font-medium hover:text-primary">
                {t.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {t.subject} · confidence {t.confidence ?? "—"}/5 · reviewed {t.reviewCount}×
              </p>
            </div>
            {done ? (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="size-4" /> Rescheduled
              </span>
            ) : (
              <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`How well do you know ${t.name}?`}>
                {(["again", "hard", "good", "easy"] as const).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant="outline"
                    className="capitalize"
                    onClick={() =>
                      start(async () => {
                        markReviewed(t.topicId);
                        const res = await reviewTopic(t.topicId, r);
                        if (!res.ok) toast.error(res.error);
                      })
                    }
                  >
                    {r}
                  </Button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
