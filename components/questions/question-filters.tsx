"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const select = "h-10 rounded-xl border border-input bg-card px-3 text-sm";

export function QuestionFilters({ subjects, topics }: { subjects: { id: string; name: string }[]; topics: { id: string; name: string; subject_id: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    next.delete("focus");
    if (key === "subject") next.delete("topic");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set("q", q.trim() || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const subject = params.get("subject") ?? "";
  const visibleTopics = subject ? topics.filter((t) => t.subject_id === subject) : topics;
  const any = [...params.keys()].some((k) => k !== "page");

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions, e.g. depreciation" className="pl-9" aria-label="Search questions" />
      </div>
      <select aria-label="Subject" value={subject} onChange={(e) => set("subject", e.target.value || null)} className={select}>
        <option value="">All subjects</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label="Topic" value={params.get("topic") ?? ""} onChange={(e) => set("topic", e.target.value || null)} className={`${select} max-w-48`}>
        <option value="">All topics</option>
        {visibleTopics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select aria-label="Type" value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value || null)} className={select}>
        <option value="">All types</option>
        <option value="mcq">MCQ</option>
        <option value="short">Short</option>
        <option value="long">Long</option>
        <option value="numerical">Numerical</option>
        <option value="theory">Theory</option>
        <option value="case_study">Case study</option>
      </select>
      <select aria-label="Difficulty" value={params.get("difficulty") ?? ""} onChange={(e) => set("difficulty", e.target.value || null)} className={select}>
        <option value="">Any difficulty</option>
        {[1, 2, 3, 4, 5].map((d) => (
          <option key={d} value={d}>
            Difficulty {d}
          </option>
        ))}
      </select>
      <Input type="number" aria-label="Year" placeholder="Year" value={params.get("year") ?? ""} onChange={(e) => set("year", e.target.value || null)} className="w-24" min={1950} max={2100} />
      <select aria-label="Source" value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value || null)} className={select}>
        <option value="">All sources</option>
        <option value="past_paper">Past papers</option>
        <option value="ai">AI quizzes</option>
        <option value="manual">Added by me</option>
      </select>
      <select aria-label="Status" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value || null)} className={select}>
        <option value="">Any status</option>
        <option value="unsolved">Unsolved</option>
        <option value="attempted">Attempted</option>
        <option value="solved">Solved</option>
        <option value="needs_review">Needs review</option>
      </select>
      <select aria-label="Flag" value={params.get("flag") ?? ""} onChange={(e) => set("flag", e.target.value || null)} className={select}>
        <option value="">All</option>
        <option value="bookmarked">Bookmarked</option>
        <option value="difficult">Marked difficult</option>
      </select>
      {any && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            router.replace(pathname, { scroll: false });
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
