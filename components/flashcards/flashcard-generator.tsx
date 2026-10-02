"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveFlashcards } from "@/lib/actions/flashcards";
import { toast } from "sonner";

type Draft = { front: string; back: string; topic_id: string | null; difficulty: number };
type Source = { type: "topic" | "resource" | "past_paper" | "conversation"; id: string; label: string };

/** Generate (AI) or write cards, review/edit them, then save. Nothing is saved without the student's OK. */
export function FlashcardGenerator({ source, subjects, defaultSubjectId }: { source: Source | null; subjects: { id: string; name: string }[]; defaultSubjectId: string | null }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(source ? [] : [{ front: "", back: "", topic_id: null, difficulty: 3 }]);
  const [subjectId, setSubjectId] = useState<string | null>(defaultSubjectId);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  async function generate() {
    if (!source) return;
    setLoading(true);
    const res = await fetch("/api/flashcards/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_type: source.type, source_id: source.id, count: 10 }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return void toast.error(json.error);
    setDrafts(json.cards);
    setSubjectId(json.subject_id ?? subjectId);
  }

  useEffect(() => {
    if (source && !ran.current) {
      ran.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id]);

  const update = (i: number, patch: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {source ? <Sparkles className="size-4 text-primary" /> : <Plus className="size-4" />}
          {source ? `Flashcards from ${source.label}` : "New flashcards"}
        </CardTitle>
        <CardDescription>{source ? "AI generated — edit or delete any card before saving." : "Write your own cards."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Generating cards from your material…
          </p>
        )}
        {!source && subjects.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="fc-subject">Subject</Label>
            <select id="fc-subject" value={subjectId ?? ""} onChange={(e) => setSubjectId(e.target.value || null)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <ol className="space-y-3">
          {drafts.map((d, i) => (
            <li key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Textarea value={d.front} onChange={(e) => update(i, { front: e.target.value })} placeholder="Front — question" aria-label={`Card ${i + 1} front`} className="min-h-16" />
              <Textarea value={d.back} onChange={(e) => update(i, { back: e.target.value })} placeholder="Back — answer" aria-label={`Card ${i + 1} back`} className="min-h-16" />
              <Button variant="ghost" size="icon-sm" aria-label={`Remove card ${i + 1}`} onClick={() => setDrafts((c) => c.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrafts((c) => [...c, { front: "", back: "", topic_id: source?.type === "topic" ? source.id : null, difficulty: 3 }])}>
            <Plus /> Add card
          </Button>
          {source && (
            <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
              <Sparkles /> Generate again
            </Button>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={pending || !drafts.some((d) => d.front.trim() && d.back.trim())}
            onClick={() =>
              start(async () => {
                const cards = drafts.filter((d) => d.front.trim() && d.back.trim());
                const res = await saveFlashcards({ cards, subject_id: subjectId, source_type: source ? source.type : "manual", source_id: source?.id ?? null });
                if (!res.ok) return void toast.error(res.error);
                toast.success(`Saved ${res.count} flashcards`);
                router.push("/flashcards");
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save {drafts.length} cards
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
