"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmResourceLinks } from "@/lib/actions/resources";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Topic = { id: string; name: string; subject_id: string; chapter: string };

export function SuggestionReview({
  resourceId,
  subjects,
  topics,
  initialSubjectId,
  suggestedSubjectId,
  links,
}: {
  resourceId: string;
  subjects: { id: string; name: string }[];
  topics: Topic[];
  initialSubjectId: string | null;
  suggestedSubjectId: string | null;
  links: { topic_id: string; confidence: number | null; confirmed: boolean }[];
}) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? suggestedSubjectId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(links.map((l) => l.topic_id)));
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const unconfirmed = links.some((l) => !l.confirmed) || (!initialSubjectId && !!suggestedSubjectId);
  const confidence = new Map(links.map((l) => [l.topic_id, l.confidence]));

  const visible = useMemo(() => {
    const inSubject = topics.filter((t) => !subjectId || t.subject_id === subjectId);
    return showAll ? inSubject : inSubject.filter((t) => selected.has(t.id));
  }, [topics, subjectId, showAll, selected]);

  return (
    <div className="space-y-4">
      {unconfirmed && (
        <p className="flex items-start gap-2 rounded-xl bg-accent/60 p-3 text-sm text-accent-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          Study OS suggested where this belongs. Confirm or edit.
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`subj-${resourceId}`} className="text-sm font-medium">
          Subject
        </label>
        <select id={`subj-${resourceId}`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
          <option value="">No subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === suggestedSubjectId && !initialSubjectId ? " (suggested)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Topics</span>
          <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show selected" : "Add topics"}
          </Button>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No topics linked yet.</p>
        ) : (
          <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
            {visible.map((t) => {
              const on = selected.has(t.id);
              const conf = confidence.get(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (on) next.delete(t.id);
                      else next.add(t.id);
                      return next;
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    on ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-accent",
                  )}
                  title={t.chapter}
                >
                  {on && <Check className="size-3" />}
                  {t.name}
                  {conf !== undefined && conf !== null && <span className="opacity-60">{Math.round(conf * 100)}%</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await confirmResourceLinks(resourceId, { subject_id: subjectId || null, topic_ids: [...selected] });
              if (!res.ok) return void toast.error(res.error);
              toast.success("Saved");
              router.refresh();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} {unconfirmed ? "Confirm" : "Save"}
        </Button>
        {unconfirmed && <Badge variant="warning">Needs review</Badge>}
      </div>
    </div>
  );
}
