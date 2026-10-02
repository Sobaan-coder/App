"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Loader2, Plus, Sparkles, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { saveSyllabus } from "@/lib/actions/syllabus";
import type { SyllabusExtraction } from "@/lib/syllabus/schema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Topic = {
  key: string; name: string; description: string | null; learning_objectives: string[];
  weightage: number | null; difficulty: number | null; subtopics: string[]; confidence?: number;
};
type Chapter = { key: string; name: string; weightage: number | null; topics: Topic[]; confidence?: number; open: boolean };
type Subject = { key: string; name: string; code: string; exam_date: string; chapters: Chapter[]; confidence?: number };

let n = 0;
const key = () => `k${++n}`;

export function draftFromExtraction(x: SyllabusExtraction): Subject[] {
  return x.subjects.map((s) => ({
    key: key(), name: s.name, code: s.code ?? "", exam_date: s.exam_date ?? "", confidence: s.confidence,
    chapters: s.chapters.map((c) => ({
      key: key(), name: c.name, weightage: c.weightage, confidence: c.confidence, open: true,
      topics: c.topics.map((t) => ({
        key: key(), name: t.name, description: t.description, learning_objectives: t.learning_objectives,
        weightage: t.weightage, difficulty: t.difficulty, subtopics: t.subtopics.map((st) => st.name), confidence: t.confidence,
      })),
    })),
  }));
}

export function emptySubject(): Subject {
  return {
    key: key(), name: "", code: "", exam_date: "",
    chapters: [{ key: key(), name: "", weightage: null, open: true, topics: [{ key: key(), name: "", description: null, learning_objectives: [], weightage: null, difficulty: 3, subtopics: [] }] }],
  };
}

function move<T>(list: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function ConfidenceBadge({ value }: { value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  if (value < 0.7) {
    return (
      <Badge variant="warning" title="AI isn't fully confident about this — please check it">
        <AlertTriangle /> {pct}%
      </Badge>
    );
  }
  return <Badge variant="muted" title="AI confidence">{pct}%</Badge>;
}

function NumberField({ value, onChange, label, max = 100, className }: { value: number | null; onChange: (v: number | null) => void; label: string; max?: number; className?: string }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      max={max}
      aria-label={label}
      placeholder={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Math.min(max, Number(e.target.value))))}
      className={cn("h-9 w-24", className)}
    />
  );
}

export function SyllabusEditor({
  initial,
  aiGenerated,
  uncertainties = [],
  importId,
  programId,
}: {
  initial: Subject[];
  aiGenerated: boolean;
  uncertainties?: string[];
  importId?: string;
  programId?: string | null;
}) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>(initial.length ? initial : [emptySubject()]);
  const [pending, start] = useTransition();
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const updateSubject = (si: number, patch: Partial<Subject>) => setSubjects((s) => s.map((x, i) => (i === si ? { ...x, ...patch } : x)));
  const updateChapter = (si: number, ci: number, patch: Partial<Chapter>) =>
    updateSubject(si, { chapters: subjects[si].chapters.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
  const updateTopic = (si: number, ci: number, ti: number, patch: Partial<Topic>) =>
    updateChapter(si, ci, { topics: subjects[si].chapters[ci].topics.map((t, i) => (i === ti ? { ...t, ...patch } : t)) });

  const lowConfidence = subjects.reduce(
    (a, s) => a + s.chapters.reduce((b, c) => b + (c.confidence !== undefined && c.confidence < 0.7 ? 1 : 0) + c.topics.filter((t) => t.confidence !== undefined && t.confidence < 0.7).length, 0),
    0,
  );
  const topicCount = subjects.reduce((a, s) => a + s.chapters.reduce((b, c) => b + c.topics.length, 0), 0);

  function save() {
    const draft = {
      subjects: subjects.map((s) => ({
        name: s.name,
        code: s.code || null,
        exam_date: s.exam_date || null,
        chapters: s.chapters
          .filter((c) => c.name.trim() || c.topics.some((t) => t.name.trim()))
          .map((c) => ({
            name: c.name || "Untitled chapter",
            weightage: c.weightage,
            topics: c.topics
              .filter((t) => t.name.trim())
              .map((t) => ({
                name: t.name,
                description: t.description,
                learning_objectives: t.learning_objectives.filter(Boolean),
                weightage: t.weightage,
                difficulty: t.difficulty,
                subtopics: t.subtopics.filter(Boolean).map((name) => ({ name })),
              })),
          })),
      })),
    };
    start(async () => {
      const res = await saveSyllabus({ draft, importId, programId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved ${res.subjectIds.length} subject${res.subjectIds.length > 1 ? "s" : ""}.`);
      router.push(res.subjectIds.length === 1 ? `/subjects/${res.subjectIds[0]}` : "/subjects");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {aiGenerated && (
        <Alert variant="info">
          <Sparkles />
          <AlertTitle>AI generated — review before saving</AlertTitle>
          <AlertDescription>
            <p>
              Study OS read your syllabus and found {subjects.length} subject{subjects.length === 1 ? "" : "s"} and {topicCount} topics. AI extraction isn&apos;t perfect — rename, reorder, add or remove anything.
              {lowConfidence > 0 && ` ${lowConfidence} item${lowConfidence === 1 ? " is" : "s are"} flagged for a closer look.`}
            </p>
            {uncertainties.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {subjects.map((subject, si) => (
        <section key={subject.key} className="rounded-2xl border bg-card p-4 sm:p-5" aria-label={`Subject ${si + 1}`}>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_170px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`s-name-${subject.key}`} className="flex items-center gap-2">
                Subject <ConfidenceBadge value={subject.confidence} />
              </Label>
              <Input id={`s-name-${subject.key}`} value={subject.name} onChange={(e) => updateSubject(si, { name: e.target.value })} placeholder="Financial Accounting & Reporting" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`s-code-${subject.key}`}>Code</Label>
              <Input id={`s-code-${subject.key}`} value={subject.code} onChange={(e) => updateSubject(si, { code: e.target.value })} placeholder="FAR" maxLength={30} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`s-exam-${subject.key}`}>Exam date</Label>
              <Input id={`s-exam-${subject.key}`} type="date" value={subject.exam_date} onChange={(e) => updateSubject(si, { exam_date: e.target.value })} />
            </div>
            {subjects.length > 1 && (
              <Button variant="ghost" size="icon" aria-label="Remove subject" onClick={() => setSubjects((s) => s.filter((_, i) => i !== si))}>
                <Trash2 />
              </Button>
            )}
          </div>

          <ol className="mt-5 space-y-3">
            {subject.chapters.map((chapter, ci) => (
              <li key={chapter.key} className={cn("rounded-xl border bg-background/60", chapter.confidence !== undefined && chapter.confidence < 0.7 && "border-warning/60")}>
                <div className="flex flex-wrap items-center gap-2 p-2.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => updateChapter(si, ci, { open: !chapter.open })} aria-expanded={chapter.open} aria-label={chapter.open ? "Collapse chapter" : "Expand chapter"}>
                    {chapter.open ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                  <Input
                    value={chapter.name}
                    onChange={(e) => updateChapter(si, ci, { name: e.target.value })}
                    placeholder="Chapter name (e.g. IAS 16 — Property, Plant and Equipment)"
                    aria-label="Chapter name"
                    className="h-9 min-w-0 flex-1 font-medium"
                  />
                  <NumberField value={chapter.weightage} onChange={(v) => updateChapter(si, ci, { weightage: v })} label="Weight %" />
                  <ConfidenceBadge value={chapter.confidence} />
                  <div className="flex">
                    <Button variant="ghost" size="icon-sm" aria-label="Move chapter up" onClick={() => updateSubject(si, { chapters: move(subject.chapters, ci, -1) })}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Move chapter down" onClick={() => updateSubject(si, { chapters: move(subject.chapters, ci, 1) })}>
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete chapter" onClick={() => updateSubject(si, { chapters: subject.chapters.filter((_, i) => i !== ci) })}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {chapter.open && (
                  <div className="space-y-2 border-t px-2.5 pb-3 pt-2 sm:pl-12">
                    {chapter.topics.map((topic, ti) => (
                      <div key={topic.key} className={cn("rounded-lg", topic.confidence !== undefined && topic.confidence < 0.7 && "bg-warning/8 ring-1 ring-warning/40")}>
                        <div className="flex flex-wrap items-center gap-2 p-1">
                          <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{ti + 1}.</span>
                          <Input
                            value={topic.name}
                            onChange={(e) => updateTopic(si, ci, ti, { name: e.target.value })}
                            placeholder="Topic name (e.g. Revaluation)"
                            aria-label="Topic name"
                            className="h-9 min-w-0 flex-1"
                          />
                          <select
                            aria-label="Difficulty"
                            value={topic.difficulty ?? ""}
                            onChange={(e) => updateTopic(si, ci, ti, { difficulty: e.target.value ? Number(e.target.value) : null })}
                            className="h-9 rounded-xl border border-input bg-card px-2 text-sm"
                          >
                            <option value="">Difficulty</option>
                            {[1, 2, 3, 4, 5].map((d) => (
                              <option key={d} value={d}>
                                {["Easy", "Fairly easy", "Medium", "Hard", "Very hard"][d - 1]}
                              </option>
                            ))}
                          </select>
                          <ConfidenceBadge value={topic.confidence} />
                          <div className="flex">
                            <Button variant="ghost" size="icon-sm" aria-label="Topic details" aria-expanded={expandedTopic === topic.key} onClick={() => setExpandedTopic(expandedTopic === topic.key ? null : topic.key)}>
                              {expandedTopic === topic.key ? <ChevronDown /> : <ChevronRight />}
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Move topic up" onClick={() => updateChapter(si, ci, { topics: move(chapter.topics, ti, -1) })}>
                              <ArrowUp />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Move topic down" onClick={() => updateChapter(si, ci, { topics: move(chapter.topics, ti, 1) })}>
                              <ArrowDown />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Delete topic" onClick={() => updateChapter(si, ci, { topics: chapter.topics.filter((_, i) => i !== ti) })}>
                              <X />
                            </Button>
                          </div>
                        </div>
                        {topic.subtopics.length > 0 && expandedTopic !== topic.key && (
                          <p className="px-2 pb-1.5 text-xs text-muted-foreground sm:pl-7">↳ {topic.subtopics.join(" · ")}</p>
                        )}
                        {expandedTopic === topic.key && (
                          <div className="grid gap-3 p-2 sm:grid-cols-2 sm:pl-7">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Subtopics (one per line)</Label>
                              <Textarea
                                value={topic.subtopics.join("\n")}
                                onChange={(e) => updateTopic(si, ci, ti, { subtopics: e.target.value.split("\n") })}
                                className="min-h-16 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Learning objectives (one per line)</Label>
                              <Textarea
                                value={topic.learning_objectives.join("\n")}
                                onChange={(e) => updateTopic(si, ci, ti, { learning_objectives: e.target.value.split("\n") })}
                                className="min-h-16 text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Weightage</Label>
                              <NumberField value={topic.weightage} onChange={(v) => updateTopic(si, ci, ti, { weightage: v })} label="%" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateChapter(si, ci, {
                          topics: [...chapter.topics, { key: key(), name: "", description: null, learning_objectives: [], weightage: null, difficulty: 3, subtopics: [] }],
                        })
                      }
                    >
                      <Plus /> Add topic
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              updateSubject(si, {
                chapters: [...subject.chapters, { key: key(), name: "", weightage: null, open: true, topics: [{ key: key(), name: "", description: null, learning_objectives: [], weightage: null, difficulty: 3, subtopics: [] }] }],
              })
            }
          >
            <Plus /> Add chapter
          </Button>
        </section>
      ))}

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-4">
        <Button variant="ghost" onClick={() => setSubjects((s) => [...s, emptySubject()])}>
          <Plus /> Add another subject
        </Button>
        <Button onClick={save} disabled={pending || subjects.some((s) => !s.name.trim())}>
          {pending && <Loader2 className="animate-spin" />}
          Save {subjects.length > 1 ? `${subjects.length} subjects` : "subject"}
        </Button>
      </div>
    </div>
  );
}
