"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Clock, Play } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setTaskStatus } from "@/lib/actions/tasks";
import { setPlanSessionStatus } from "@/lib/actions/plan-sessions";
import { ACTIVITY_LABEL, minutesLabel, timeLabel } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type TodayItem = {
  kind: "session" | "task";
  id: string;
  title: string;
  done: boolean;
  meta?: string;
  startTime?: string | null;
  duration?: number;
  activity?: keyof typeof ACTIVITY_LABEL;
  overdue?: boolean;
  topicId?: string | null;
};

export function TodayList({ items }: { items: TodayItem[] }) {
  const [, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (state, { id, done }: { id: string; done: boolean }) =>
    state.map((i) => (i.id === id ? { ...i, done } : i)),
  );

  function toggle(item: TodayItem, done: boolean) {
    start(async () => {
      setOptimistic({ id: item.id, done });
      const res =
        item.kind === "task"
          ? await setTaskStatus(item.id, done ? "done" : "todo")
          : await setPlanSessionStatus(item.id, done ? "done" : "planned");
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <ul className="divide-y">
      {optimistic.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-3">
          <Checkbox
            id={`today-${item.id}`}
            checked={item.done}
            onCheckedChange={(v) => toggle(item, v)}
            aria-label={`Mark "${item.title}" as ${item.done ? "not done" : "done"}`}
          />
          <label htmlFor={`today-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
            <span className={cn("block truncate text-sm font-medium", item.done && "text-muted-foreground line-through")}>{item.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.startTime && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {timeLabel(item.startTime)}
                </span>
              )}
              {item.duration ? <span>{minutesLabel(item.duration)}</span> : null}
              {item.activity && <Badge variant="muted">{ACTIVITY_LABEL[item.activity]}</Badge>}
              {item.meta && <span>{item.meta}</span>}
              {item.overdue && !item.done && <Badge variant="destructive">Overdue</Badge>}
            </span>
          </label>
          {item.kind === "session" && !item.done && (
            <Button asChild size="icon-sm" variant="ghost" aria-label={`Start session: ${item.title}`}>
              <Link href={`/study/session/new?plan_session=${item.id}`}>
                <Play />
              </Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
