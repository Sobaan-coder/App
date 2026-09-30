"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCheck, Loader2, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { confirmAllMappings, setQuestionTopics, updatePaperQuestion } from "@/lib/actions/past-papers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type MappedQuestion = {
  id: string;
  number: string;
  text: string;
  marks: number | null;
  type: "mcq" | "short" | "long" | "numerical" | "theory" | "case_study";
  page: number | null;
  links: { topicId: string; confidence: number; confirmed: boolean; source: "ai" | "user" }[];
};
export type CatalogueTopic = { id: string; name: string; chapter: string };

const TYPE_LABEL = { mcq: "MCQ", short: "Short", long: "Long", numerical: "Numerical", theory: "Theory", case_study: "Case study" } as const;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function QuestionCard({ q, topics }: { q: MappedQuestion; topics: CatalogueTopic[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(q.links.map((l) => l.topicId));
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const uncertain = q.links.filter((l) => l.confidence < 0.7 && !l.confirmed);
  const confident = q.links.filter((l) => !(l.confidence < 0.7 && !l.confirmed));
  const needsReview = uncertain.length > 0 || q.links.length === 0;

  const save = (ids: string[]) =>
    start(async () => {
      const res = await setQuestionTopics(q.id, ids);
      if (!res.ok) return void toast.error(res.error);
      setEditing(false);
      router.refresh();
    });

  const matches = topics.filter((t) => !filter || `${t.name} ${t.chapter}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 40);

  return (
    <li id={`q-${q.id}`} className={cn("scroll-mt-24 rounded-2xl border bg-card p-4 sm:p-5", needsReview && "border-warning/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-muted px-2 py-0.5 text-sm font-semibold">Q{q.number}</span>
        {q.marks !== null && <span className="text-sm text-muted-foreground">{q.marks} marks</span>}
        <select
          aria-label="Question type"
          defaultValue={q.type}
          onChange={(e) => start(async () => void (await updatePaperQuestion(q.id, { question_type: e.target.value as MappedQuestion["type"] })))}
          className="h-7 rounded-lg border border-input bg-card px-2 text-xs"
        >
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {q.page && <span className="text-xs text-muted-foreground">page {q.page}</span>}
      </div>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{q.text}</p>

      <div className="mt-4 space-y-2">
        {!editing ? (
          <>
            {confident.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Mapped to</span>
                {confident.map((l) => {
                  const t = byId.get(l.topicId);
                  return (
                    <Badge key={l.topicId} variant="secondary" className="max-w-full" title={t?.chapter}>
                      <span className="truncate">
                        {t?.chapter ? `${t.chapter.split("—")[0].trim()} → ` : ""}
                        {t?.name ?? "Unknown topic"}
                      </span>
                      <span className="opacity-60">{l.confirmed && l.source === "user" ? "you" : pct(l.confidence)}</span>
                      {l.confirmed && <Check />}
                    </Badge>
                  );
                })}
              </div>
            )}
            {uncertain.length > 0 && (
              <div className="rounded-xl bg-warning/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <AlertTriangle className="size-3.5 text-[oklch(0.6_0.14_70)]" /> AI isn&apos;t fully confident about this mapping. Possible topics:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {uncertain.map((l) => (
                    <Badge key={l.topicId} variant="warning">
                      {byId.get(l.topicId)?.name ?? "Unknown"} · {pct(l.confidence)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {q.links.length === 0 && <p className="text-xs text-muted-foreground">Not mapped to any topic — outside your syllabus, or pick one.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {needsReview && q.links.length > 0 && (
                <Button size="sm" disabled={pending} onClick={() => save(q.links.map((l) => l.topicId))}>
                  {pending ? <Loader2 className="animate-spin" /> : <Check />} Looks right
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Correct mapping
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3 rounded-xl border bg-background p-3">
            <div className="flex flex-wrap gap-1.5">
              {selected.map((id) => (
                <Badge key={id} variant="default">
                  {byId.get(id)?.name}
                  <button type="button" aria-label={`Remove ${byId.get(id)?.name}`} onClick={() => setSelected((s) => s.filter((x) => x !== id))}>
                    <X />
                  </button>
                </Badge>
              ))}
              {!selected.length && <span className="text-xs text-muted-foreground">No topics selected</span>}
            </div>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a topic" className="h-9 pl-9" aria-label="Find a topic" />
            </div>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {matches.map((t) => {
                const on = selected.includes(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected((s) => (on ? s.filter((x) => x !== t.id) : [...s, t.id]))}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent", on && "bg-accent")}
                      aria-pressed={on}
                    >
                      <span className={cn("flex size-4 items-center justify-center rounded border", on && "border-primary bg-primary text-primary-foreground")}>{on && <Check className="size-3" />}</span>
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="max-w-40 truncate text-xs text-muted-foreground">{t.chapter}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending} onClick={() => save(selected)}>
                {pending && <Loader2 className="animate-spin" />} Save mapping
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export function QuestionMappingList({ paperId, questions, topics }: { paperId: string; questions: MappedQuestion[]; topics: CatalogueTopic[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [onlyReview, setOnlyReview] = useState(false);
  const reviewCount = questions.filter((q) => q.links.length === 0 || q.links.some((l) => l.confidence < 0.7 && !l.confirmed)).length;
  const shown = onlyReview ? questions.filter((q) => q.links.length === 0 || q.links.some((l) => l.confidence < 0.7 && !l.confirmed)) : questions;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {questions.length} questions · {reviewCount ? <span className="font-medium text-foreground">{reviewCount} need a quick check</span> : "all mappings look confident"}
        </p>
        <div className="flex gap-2">
          {reviewCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setOnlyReview((v) => !v)}>
              {onlyReview ? "Show all" : "Show only flagged"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await confirmAllMappings(paperId);
                if (!res.ok) return void toast.error(res.error);
                toast.success("All mappings confirmed");
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Confirm all
          </Button>
        </div>
      </div>
      <ol className="space-y-3">
        {shown.map((q) => (
          <QuestionCard key={q.id} q={q} topics={topics} />
        ))}
      </ol>
    </div>
  );
}
