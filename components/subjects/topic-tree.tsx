"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, FileQuestion, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfidencePicker } from "@/components/common/confidence-picker";
import { StatusDot } from "@/components/progress/topic-bars";
import {
  deleteChapter, deleteTopic, moveChapter, saveChapter, saveTopic, updateTopicProgress,
} from "@/lib/actions/subjects";
import { STATUS_LABEL } from "@/lib/format";
import { toast } from "sonner";

export type TreeTopic = {
  id: string;
  name: string;
  parentId: string | null;
  status: keyof typeof STATUS_LABEL;
  confidence: number | null;
  paperCount: number;
  totalPapers: number;
  difficulty: number;
};
export type TreeChapter = { id: string; name: string; weightage: number | null; topics: TreeTopic[] };

function InlineName({ initial, onSave, onCancel, label }: { initial: string; onSave: (v: string) => void; onCancel: () => void; label: string }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v.trim());
      }}
    >
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={label} className="h-8" onKeyDown={(e) => e.key === "Escape" && onCancel()} />
      <Button type="submit" size="icon-sm" aria-label="Save">
        <Check />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={onCancel}>
        <X />
      </Button>
    </form>
  );
}

export function TopicTree({ subjectId, chapters }: { subjectId: string; chapters: TreeChapter[] }) {
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // chapter id or "chapter"
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error((res as { error: string }).error);
      else if (success) toast.success(success);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {editing ? "Rename, reorder, add or remove chapters and topics." : "Update your status and confidence as you study."}
        </p>
        <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing((e) => !e)}>
          {editing ? <Check /> : <Pencil />} {editing ? "Done" : "Edit structure"}
        </Button>
      </div>

      {chapters.map((chapter, ci) => (
        <section key={chapter.id} className="overflow-hidden rounded-2xl border bg-card" aria-label={chapter.name}>
          <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
            {renaming === chapter.id ? (
              <InlineName
                label="Chapter name"
                initial={chapter.name}
                onCancel={() => setRenaming(null)}
                onSave={(name) => {
                  setRenaming(null);
                  run(() => saveChapter({ id: chapter.id, subject_id: subjectId, name }));
                }}
              />
            ) : (
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{chapter.name}</h3>
            )}
            {chapter.weightage !== null && <Badge variant="muted">{chapter.weightage}%</Badge>}
            {editing && renaming !== chapter.id && (
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon-sm" aria-label="Rename chapter" onClick={() => setRenaming(chapter.id)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move chapter up" disabled={ci === 0 || pending} onClick={() => run(() => moveChapter(chapter.id, subjectId, -1))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move chapter down" disabled={ci === chapters.length - 1 || pending} onClick={() => run(() => moveChapter(chapter.id, subjectId, 1))}>
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete chapter"
                  onClick={() => {
                    if (confirm(`Delete "${chapter.name}" and all its topics?`)) run(() => deleteChapter(chapter.id, subjectId), "Chapter deleted");
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </header>
          <ul className="divide-y">
            {chapter.topics.map((t) => (
              <li key={t.id} className={t.parentId ? "bg-muted/15 pl-6" : undefined}>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  {renaming === t.id ? (
                    <InlineName
                      label="Topic name"
                      initial={t.name}
                      onCancel={() => setRenaming(null)}
                      onSave={(name) => {
                        setRenaming(null);
                        run(() => saveTopic({ id: t.id, chapter_id: chapter.id, name }));
                      }}
                    />
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <StatusDot status={t.status} />
                      <Link href={`/topics/${t.id}`} className="truncate text-sm font-medium hover:text-primary hover:underline">
                        {t.parentId && <span className="text-muted-foreground">↳ </span>}
                        {t.name}
                      </Link>
                      {t.totalPapers > 0 && t.paperCount > 0 && (
                        <Badge variant="secondary" title={`Appeared in ${t.paperCount} of ${t.totalPapers} uploaded papers`}>
                          <FileQuestion /> {t.paperCount}/{t.totalPapers}
                        </Badge>
                      )}
                    </div>
                  )}
                  {editing ? (
                    renaming !== t.id && (
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon-sm" aria-label={`Rename ${t.name}`} onClick={() => setRenaming(t.id)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${t.name}`}
                          onClick={() => {
                            if (confirm(`Delete topic "${t.name}"?`)) run(() => deleteTopic(t.id), "Topic deleted");
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <select
                        aria-label={`Status of ${t.name}`}
                        value={t.status}
                        disabled={pending}
                        onChange={(e) => run(() => updateTopicProgress(t.id, { status: e.target.value as TreeTopic["status"] }))}
                        className="h-8 rounded-lg border border-input bg-card px-2 text-xs"
                      >
                        {Object.entries(STATUS_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <ConfidencePicker label={`Confidence in ${t.name}`} value={t.confidence} disabled={pending} onChange={(v) => run(() => updateTopicProgress(t.id, { confidence: v }))} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {editing &&
            (adding === chapter.id ? (
              <div className="border-t px-4 py-2.5">
                <InlineName
                  label="New topic name"
                  initial=""
                  onCancel={() => setAdding(null)}
                  onSave={(name) => {
                    setAdding(null);
                    run(() => saveTopic({ chapter_id: chapter.id, name }), "Topic added");
                  }}
                />
              </div>
            ) : (
              <div className="border-t px-2 py-1.5">
                <Button variant="ghost" size="sm" onClick={() => setAdding(chapter.id)}>
                  <Plus /> Add topic
                </Button>
              </div>
            ))}
        </section>
      ))}

      {editing &&
        (adding === "chapter" ? (
          <div className="rounded-2xl border bg-card p-3">
            <InlineName
              label="New chapter name"
              initial=""
              onCancel={() => setAdding(null)}
              onSave={(name) => {
                setAdding(null);
                run(() => saveChapter({ subject_id: subjectId, name }), "Chapter added");
              }}
            />
          </div>
        ) : (
          <Button variant="outline" onClick={() => setAdding("chapter")}>
            <Plus /> Add chapter
          </Button>
        ))}
    </div>
  );
}
