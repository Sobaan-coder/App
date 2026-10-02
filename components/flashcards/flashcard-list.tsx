"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { deleteFlashcard, updateFlashcard } from "@/lib/actions/flashcards";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

type Card = { id: string; front: string; back: string; due_at: string; topic: string | null };

function Row({ c }: { c: Card }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [front, setFront] = useState(c.front);
  const [back, setBack] = useState(c.back);
  const [pending, start] = useTransition();
  const due = new Date(c.due_at) <= new Date();
  return (
    <li className="rounded-2xl border bg-card p-4">
      {edit ? (
        <div className="space-y-2">
          <Textarea value={front} onChange={(e) => setFront(e.target.value)} aria-label="Front" />
          <Textarea value={back} onChange={(e) => setBack(e.target.value)} aria-label="Back" />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateFlashcard(c.id, { front, back });
                  if (!res.ok) return void toast.error(res.error);
                  setEdit(false);
                  router.refresh();
                })
              }
            >
              <Check /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              <X /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{c.front}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.back}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {c.topic && <Badge variant="muted">{c.topic}</Badge>}
              <Badge variant={due ? "warning" : "outline"}>{due ? "Due now" : `Due ${formatDate(c.due_at)}`}</Badge>
            </div>
          </div>
          <div className="flex shrink-0">
            <Button size="icon-sm" variant="ghost" aria-label="Edit card" onClick={() => setEdit(true)}>
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete card"
              onClick={() =>
                confirm("Delete this card?") &&
                start(async () => {
                  const res = await deleteFlashcard(c.id);
                  if (!res.ok) return void toast.error(res.error);
                  router.refresh();
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function FlashcardList({ cards }: { cards: Card[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {cards.map((c) => (
        <Row key={c.id} c={c} />
      ))}
    </ul>
  );
}
