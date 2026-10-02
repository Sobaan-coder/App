"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RESOURCE_TYPE_META } from "./resource-icons";

export function ResourceFilters({ subjects, topics }: { subjects: { id: string; name: string }[]; topics: { id: string; name: string; subject_id: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    if (key === "subject") next.delete("topic");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set("q", q.trim() || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const subject = params.get("subject") ?? "";
  const visibleTopics = subject ? topics.filter((t) => t.subject_id === subject) : [];
  const selectClass = "h-10 rounded-xl border border-input bg-card px-3 text-sm";
  const anyFilter = ["q", "subject", "topic", "type", "from", "to", "status"].some((k) => params.get(k));

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and tags" className="pl-9" aria-label="Search resources" />
      </div>
      <select aria-label="Filter by subject" value={subject} onChange={(e) => set("subject", e.target.value || null)} className={selectClass}>
        <option value="">All subjects</option>
        <option value="none">Unsorted</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {visibleTopics.length > 0 && (
        <select aria-label="Filter by topic" value={params.get("topic") ?? ""} onChange={(e) => set("topic", e.target.value || null)} className={selectClass}>
          <option value="">All topics</option>
          {visibleTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <select aria-label="Filter by type" value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value || null)} className={selectClass}>
        <option value="">All types</option>
        {Object.entries(RESOURCE_TYPE_META).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      <Input type="date" aria-label="Added from" value={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value || null)} className="w-40" />
      <Input type="date" aria-label="Added until" value={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value || null)} className="w-40" />
      {anyFilter && (
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
