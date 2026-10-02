import Link from "next/link";
import { STATUS_LABEL } from "@/lib/format";
import type { TopicRow } from "@/lib/data/workspace";
import { cn } from "@/lib/utils";

const CREDIT = { not_started: 0, learning: 40, practicing: 70, reviewed: 90, mastered: 100 } as const;

/** Chapter-level progress bars ("IAS 16 ████████░░"). */
export function ChapterBars({ topics }: { topics: TopicRow[] }) {
  const chapters = new Map<string, { name: string; values: number[] }>();
  for (const t of topics.filter((t) => !t.parent_topic_id)) {
    const c = chapters.get(t.chapter_id) ?? { name: t.chapter_name, values: [] };
    c.values.push(CREDIT[t.progress?.status ?? "not_started"]);
    chapters.set(t.chapter_id, c);
  }
  return (
    <ul className="space-y-3">
      {[...chapters.entries()].map(([id, c]) => {
        const value = Math.round(c.values.reduce((a, b) => a + b, 0) / Math.max(c.values.length, 1));
        const blocks = Math.round(value / 10);
        return (
          <li key={id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,14rem)_1fr_3rem]">
            <span className="truncate text-sm font-medium">{c.name}</span>
            <span className="hidden gap-1 sm:flex" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={cn("h-2.5 flex-1 rounded-sm", i < blocks ? "bg-primary" : "bg-muted")} />
              ))}
            </span>
            <span className="text-right text-sm tabular-nums text-muted-foreground">{value}%</span>
            <span className="col-span-2 flex gap-1 sm:hidden" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={cn("h-2 flex-1 rounded-sm", i < blocks ? "bg-primary" : "bg-muted")} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusDot({ status }: { status: keyof typeof STATUS_LABEL }) {
  const color = {
    not_started: "bg-muted-foreground/30",
    learning: "bg-chart-3",
    practicing: "bg-chart-2",
    reviewed: "bg-chart-1",
    mastered: "bg-success",
  }[status];
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", color)} aria-hidden="true" />;
}

export function TopicLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/topics/${id}`} className="truncate font-medium hover:text-primary hover:underline">
      {name}
    </Link>
  );
}
