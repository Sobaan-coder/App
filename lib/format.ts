export function minutesLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function daysLabel(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  return `${days} days`;
}

export function formatDate(date: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  const d = typeof date === "string" ? new Date(date.length === 10 ? date + "T00:00:00" : date) : date;
  return d.toLocaleDateString("en-GB", opts);
}

export function formatDateTime(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeLabel(t: string | null) {
  return t ? t.slice(0, 5) : "";
}

export function addMinutesToTime(t: string, minutes: number) {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function pct(n: number) {
  return `${Math.round(n)}%`;
}

export const STATUS_LABEL = {
  not_started: "Not started",
  learning: "Learning",
  practicing: "Practicing",
  reviewed: "Reviewed",
  mastered: "Mastered",
} as const;

export const ACTIVITY_LABEL = {
  learn: "Learn",
  practice: "Practice",
  past_paper: "Past paper",
  revise: "Revise",
  recall: "Active recall",
  mock: "Mock exam",
  break: "Break",
} as const;
