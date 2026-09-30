// Plan construction helpers shared by the AI planner and the heuristic fallback.
import type { TopicSignal, Priority } from "./priority";
import { availableDays } from "./rebalance";

export type Activity = "learn" | "practice" | "past_paper" | "revise" | "recall" | "mock" | "break";

export type DraftSession = {
  date: string;
  startTime: string | null; // HH:MM
  duration: number;
  topicId: string | null;
  title: string;
  activity: Activity;
  goals: string[];
  details: string | null;
  priority: number;
};

export type DraftPlan = {
  title: string;
  summary: string;
  strategy: string[];
  skipIfShort: string[];
  sessions: DraftSession[];
};

export type PlanWindow = {
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  studyDays: number[];
  dayStart?: string; // default first session time
};

export type RankedSignal = TopicSignal & { priority: Priority; subjectName?: string };

const BREAK = 15;

export function addMinutes(t: string, m: number) {
  const [h, mm] = t.split(":").map(Number);
  const total = Math.min(h * 60 + mm + m, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Deterministic planner (used when AI is unavailable and as a sanity baseline).
 * Greedy by priority: weak, frequently-examined topics first; learn → practice for
 * weak topics, a short recall for strong ones; a past-paper block most days and a
 * mock on the final day when there's more than one day.
 */
export function buildHeuristicPlan(signals: RankedSignal[], window: PlanWindow, examLabel: string | null): DraftPlan {
  const days = availableDays({ today: window.startDate, endDate: window.endDate, studyDays: window.studyDays });
  const cap = Math.max(30, window.dailyMinutes);
  const ranked = [...signals].sort((a, b) => b.priority.score - a.priority.score);
  const queue: Omit<DraftSession, "date" | "startTime">[] = [];

  for (const t of ranked) {
    const weak = t.priority.weakness >= 50;
    if (weak) {
      queue.push({ topicId: t.topicId, title: `${t.name} — concepts`, activity: "learn", duration: Math.min(90, Math.max(30, t.estimatedMinutes)), goals: [`Understand the core rules of ${t.name}`, "Study one worked example"], details: null, priority: t.priority.score });
      queue.push({ topicId: t.topicId, title: `${t.name} — practice`, activity: t.paperCount > 0 ? "past_paper" : "practice", duration: 45, goals: [t.paperCount > 0 ? "Attempt a past-paper question on this topic" : "Solve 5 practice questions"], details: null, priority: t.priority.score * 0.95 });
    } else {
      queue.push({ topicId: t.topicId, title: `${t.name} — quick recall`, activity: "recall", duration: 30, goals: ["Write key points from memory", "Check against notes"], details: null, priority: t.priority.score * 0.8 });
    }
  }

  const sessions: DraftSession[] = [];
  const skipped: string[] = [];
  days.forEach((date, di) => {
    let used = 0;
    let time = window.dayStart ?? "09:00";
    const place = (s: Omit<DraftSession, "date" | "startTime">) => {
      sessions.push({ ...s, date, startTime: time });
      used += s.duration;
      time = addMinutes(time, s.duration + BREAK);
    };
    const isLast = di === days.length - 1 && days.length > 1;
    if (isLast) {
      const mock = Math.min(120, Math.floor(cap * 0.6));
      place({ topicId: null, title: "Mock exam under timed conditions", activity: "mock", duration: mock, goals: ["Answer a full or partial paper under exam timing", "Mark it and note mistakes"], details: null, priority: 0.9 });
    }
    while (queue.length) {
      const next = queue[0];
      if (used + next.duration > cap) break;
      place(queue.shift()!);
    }
    if (isLast && used + 30 <= cap) place({ topicId: null, title: "Light review of formulas & flashcards", activity: "recall", duration: 30, goals: ["Skim flashcards", "Rest well"], details: null, priority: 0.5 });
  });
  for (const s of queue) if (s.topicId) skipped.push(s.title.split(" — ")[0]);

  const topNames = ranked.slice(0, 3).map((t) => t.name);
  return {
    title: examLabel ? `${examLabel} — ${days.length}-day plan` : `${days.length}-day study plan`,
    summary: `Prioritises ${topNames.join(", ")} based on your past papers, confidence and progress.${skipped.length ? ` Not enough time for everything — ${new Set(skipped).size} lower-priority topics are listed to skip if short.` : ""}`,
    strategy: ["Start each day with the weakest high-priority topic.", "Practise actively: questions over re-reading.", "Rate your confidence after each session so the plan adapts."],
    skipIfShort: [...new Set(skipped)].slice(0, 12),
    sessions,
  };
}

/**
 * Validate and repair an AI-produced plan before saving: dates inside the window,
 * known topic IDs only, sane durations and times, and days not over capacity
 * (lowest-priority sessions are dropped first — never overwhelm the student).
 */
export function normalisePlan(plan: DraftPlan, window: PlanWindow, validTopics: Map<string, number>): DraftPlan {
  const cap = Math.max(30, window.dailyMinutes);
  const okDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= window.startDate && d <= window.endDate;
  const okTime = (t: string | null) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);

  const cleaned = plan.sessions
    .filter((s) => okDate(s.date))
    .map((s) => {
      const topicId = s.topicId && validTopics.has(s.topicId) ? s.topicId : null;
      return {
        ...s,
        topicId,
        title: (s.title || "Study session").slice(0, 200),
        duration: Math.max(10, Math.min(240, Math.round(s.duration || 30))),
        startTime: okTime(s.startTime),
        goals: s.goals.filter(Boolean).slice(0, 6).map((g) => g.slice(0, 200)),
        details: s.details?.slice(0, 1000) ?? null,
        priority: topicId ? validTopics.get(topicId)! : s.activity === "mock" ? 0.9 : 0.5,
      };
    });

  const byDay = new Map<string, DraftSession[]>();
  for (const s of cleaned) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const out: DraftSession[] = [];
  for (const [, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let total = list.reduce((a, s) => a + (s.activity === "break" ? 0 : s.duration), 0);
    const keep = [...list];
    // Allow 10% slack, then drop lowest-priority sessions until the day fits.
    while (total > cap * 1.1 && keep.length > 1) {
      const lowest = keep.reduce((m, s, i) => (s.priority < keep[m].priority ? i : m), 0);
      total -= keep[lowest].duration;
      keep.splice(lowest, 1);
    }
    out.push(...keep.sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99")));
  }
  return { ...plan, title: plan.title.slice(0, 200) || "Study plan", summary: plan.summary.slice(0, 2000), strategy: plan.strategy.slice(0, 8), skipIfShort: plan.skipIfShort.slice(0, 15), sessions: out };
}
