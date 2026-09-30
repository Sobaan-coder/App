import { hhmm, parseHHMM, formatLocal } from "@/lib/time";
import type { Task } from "./types";

const PRIORITY_WEIGHT = { urgent: 40, high: 30, medium: 20, low: 10 } as const;

export interface ScoredTask extends Task {
  score: number;
  reason: string;
}

/** Deterministic, explainable prioritisation (priority + deadline urgency + momentum). */
export function prioritizeTasks(tasks: Task[], now: Date = new Date()): ScoredTask[] {
  return tasks
    .map((t) => {
      let score = PRIORITY_WEIGHT[t.priority] ?? 20;
      const reasons: string[] = [`${t.priority} priority`];
      if (t.due_at) {
        const hours = (new Date(t.due_at).getTime() - now.getTime()) / 3_600_000;
        if (hours < 0) {
          score += 45;
          reasons.push("overdue");
        } else if (hours <= 24) {
          score += 30;
          reasons.push("due within 24h");
        } else if (hours <= 72) {
          score += 18;
          reasons.push("due within 3 days");
        } else if (hours <= 24 * 7) {
          score += 8;
          reasons.push("due this week");
        }
      }
      if (t.status === "in_progress") {
        score += 6;
        reasons.push("already in progress");
      }
      if (t.status === "waiting") {
        score -= 15;
        reasons.push("waiting on something");
      }
      if (t.estimated_minutes && t.estimated_minutes <= 20) {
        score += 3;
        reasons.push("quick win");
      }
      return { ...t, score, reason: reasons.join(", ") };
    })
    .sort((a, b) => b.score - a.score || String(a.due_at ?? "9").localeCompare(String(b.due_at ?? "9")));
}

export interface ScheduleBlock {
  start: string; // HH:MM local
  end: string;
  title: string;
  taskId?: string;
  kind: "task" | "break" | "lunch";
}

/** Time-block prioritised tasks into the work day. */
export function buildSchedule(
  tasks: ScoredTask[],
  opts: { workStart?: string; workEnd?: string; defaultMinutes?: number } = {},
): { blocks: ScheduleBlock[]; unscheduled: ScoredTask[] } {
  const start = parseHHMM(opts.workStart ?? "09:00");
  const end = parseHHMM(opts.workEnd ?? "17:00");
  const lunchStart = 13 * 60;
  const blocks: ScheduleBlock[] = [];
  const unscheduled: ScoredTask[] = [];
  let cur = start;
  let lunchDone = end <= lunchStart || start >= lunchStart + 45;
  for (const t of tasks.filter((x) => x.status !== "waiting")) {
    const len = Math.min(240, t.estimated_minutes ?? opts.defaultMinutes ?? 60);
    if (!lunchDone && cur + len > lunchStart) {
      blocks.push({ start: hhmm(Math.max(cur, lunchStart)), end: hhmm(Math.max(cur, lunchStart) + 45), title: "Lunch break", kind: "lunch" });
      cur = Math.max(cur, lunchStart) + 45;
      lunchDone = true;
    }
    if (cur + len > end) {
      unscheduled.push(t);
      continue;
    }
    blocks.push({ start: hhmm(cur), end: hhmm(cur + len), title: t.title, taskId: t.id, kind: "task" });
    cur += len;
    if (cur + 10 <= end) {
      blocks.push({ start: hhmm(cur), end: hhmm(cur + 10), title: "Short break", kind: "break" });
      cur += 10;
    }
  }
  while (blocks.length && blocks[blocks.length - 1].kind === "break") blocks.pop();
  return { blocks, unscheduled: [...unscheduled, ...tasks.filter((x) => x.status === "waiting")] };
}

export function taskLine(t: Task, tz: string): string {
  const due = t.due_at ? ` — due ${formatLocal(t.due_at, tz)}` : "";
  const proj = t.project_name ? ` · _${t.project_name}_` : "";
  return `**${t.title}** (${t.priority}${t.status !== "todo" ? `, ${t.status.replace("_", " ")}` : ""})${due}${proj}`;
}
