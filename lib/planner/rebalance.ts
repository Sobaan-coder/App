// Deterministic, explainable plan adaptation. Runs whenever the student
// completes, skips or misses sessions, or their confidence changes.

export type PlanSessionLite = {
  id: string;
  topicId: string | null;
  title: string;
  activity: "learn" | "practice" | "past_paper" | "revise" | "recall" | "mock" | "break";
  scheduledDate: string; // YYYY-MM-DD
  duration: number; // minutes
  priority: number; // 0–1
  status: "planned" | "in_progress" | "done" | "skipped";
  sortOrder: number;
};

export type RebalanceOptions = {
  today: string; // YYYY-MM-DD in the student's timezone
  endDate: string; // last day sessions may be scheduled on (inclusive)
  dailyMinutes: number;
  studyDays: number[]; // 0 = Sunday … 6 = Saturday
  confidence: Record<string, number | null>; // topicId → 1–5
  /** Pull future sessions into today when today's plan is finished early. */
  pullForward?: boolean;
};

export type Change =
  | { kind: "move"; id: string; from: string; to: string; reason: string }
  | { kind: "drop"; id: string; reason: string }
  | { kind: "add"; topicId: string; date: string; duration: number; reason: string };

export type RebalanceResult = { sessions: PlanSessionLite[]; changes: Change[] };

const REPETITION_ACTIVITIES = new Set(["revise", "recall"]);

function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(date: string) {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function availableDays(opts: Pick<RebalanceOptions, "today" | "endDate" | "studyDays">): string[] {
  const days: string[] = [];
  for (let d = opts.today; d <= opts.endDate; d = addDays(d, 1)) days.push(d);
  const study = days.filter((d) => opts.studyDays.includes(dayOfWeek(d)));
  // If the student marked no study days left before the exam, use every day rather than nothing.
  return study.length > 0 ? study : days;
}

export function rebalance(input: PlanSessionLite[], opts: RebalanceOptions): RebalanceResult {
  const sessions = input.map((s) => ({ ...s }));
  const changes: Change[] = [];
  const days = availableDays(opts);
  const capacity = Math.max(30, opts.dailyMinutes);

  const load = new Map<string, number>(days.map((d) => [d, 0]));
  const active = (s: PlanSessionLite) => s.status === "planned" || s.status === "in_progress";

  // 1. Reduce repetition for topics the student is now confident in.
  for (const s of sessions) {
    if (!active(s) || !s.topicId || !REPETITION_ACTIVITIES.has(s.activity)) continue;
    const conf = opts.confidence[s.topicId];
    if (conf !== undefined && conf !== null && conf >= 5 && s.scheduledDate >= opts.today) {
      s.status = "skipped";
      changes.push({ kind: "drop", id: s.id, reason: "You rated this topic 5/5 — extra repetition removed." });
    }
  }

  // Current load of sessions that stay where they are.
  const toPlace: PlanSessionLite[] = [];
  for (const s of sessions) {
    if (!active(s)) {
      if (s.status === "done" && load.has(s.scheduledDate)) load.set(s.scheduledDate, load.get(s.scheduledDate)! + s.duration);
      continue;
    }
    if (s.scheduledDate < opts.today || !load.has(s.scheduledDate)) toPlace.push(s);
    else load.set(s.scheduledDate, load.get(s.scheduledDate)! + s.duration);
  }

  // Skipped sessions (not auto-dropped above) for weak topics get another chance.
  for (const s of sessions) {
    if (s.status !== "skipped" || changes.some((c) => c.kind === "drop" && c.id === s.id)) continue;
    const conf = s.topicId ? opts.confidence[s.topicId] ?? null : null;
    if (conf === null || conf <= 3) {
      s.status = "planned";
      toPlace.push(s);
    }
  }

  // 2. Place missed/skipped sessions by priority into the earliest day with room.
  toPlace.sort((a, b) => b.priority - a.priority);
  for (const s of toPlace) {
    const from = s.scheduledDate;
    const day = days.find((d) => load.get(d)! + s.duration <= capacity);
    if (day) {
      load.set(day, load.get(day)! + s.duration);
      s.scheduledDate = day;
      if (day !== from) changes.push({ kind: "move", id: s.id, from, to: day, reason: from < opts.today ? "Missed — rescheduled" : "Moved to fit your available time" });
    } else {
      s.status = "skipped";
      changes.push({ kind: "drop", id: s.id, reason: "No time left before the exam — lower priority than what's planned." });
    }
  }

  // 3. If today is finished early, pull the most important upcoming sessions forward.
  if (opts.pullForward && load.has(opts.today)) {
    const todayOpen = sessions.some((s) => active(s) && s.scheduledDate === opts.today);
    if (!todayOpen) {
      const future = sessions
        .filter((s) => active(s) && s.scheduledDate > opts.today)
        .sort((a, b) => b.priority - a.priority || a.scheduledDate.localeCompare(b.scheduledDate));
      for (const s of future) {
        if (load.get(opts.today)! + s.duration > capacity) continue;
        load.set(s.scheduledDate, load.get(s.scheduledDate)! - s.duration);
        load.set(opts.today, load.get(opts.today)! + s.duration);
        changes.push({ kind: "move", id: s.id, from: s.scheduledDate, to: opts.today, reason: "You finished early — pulled forward" });
        s.scheduledDate = opts.today;
        break; // one at a time: don't overwhelm
      }
    }
  }

  // 4. Weak topics (confidence ≤ 2) with nothing left scheduled get one revision slot.
  const scheduledTopics = new Set(sessions.filter((s) => active(s) && s.topicId).map((s) => s.topicId));
  for (const [topicId, conf] of Object.entries(opts.confidence)) {
    if (conf === null || conf > 2 || scheduledTopics.has(topicId)) continue;
    if (!sessions.some((s) => s.topicId === topicId)) continue; // only topics that belong to this plan
    const day = days.find((d) => d > opts.today && load.get(d)! + 45 <= capacity) ?? days.find((d) => load.get(d)! + 45 <= capacity);
    if (day) {
      load.set(day, load.get(day)! + 45);
      changes.push({ kind: "add", topicId, date: day, duration: 45, reason: "Low confidence — extra revision added" });
    }
  }

  // Re-number within each day by priority.
  const byDay = new Map<string, PlanSessionLite[]>();
  for (const s of sessions.filter(active)) byDay.set(s.scheduledDate, [...(byDay.get(s.scheduledDate) ?? []), s]);
  for (const list of byDay.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder).forEach((s, i) => (s.sortOrder = i));
  }

  return { sessions, changes };
}
