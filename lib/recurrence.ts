/**
 * Natural language → cron. Used by "remind me every Friday" and
 * "every Monday morning at 8, …" automation creation.
 */
export interface Recurrence {
  cron: string;
  description: string;
}

const DAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const DAY_RE = "(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?";

/** Extract a time of day: "8 am", "8:30pm", "20:00", "morning", "evening", "noon". */
export function parseTimeOfDay(text: string): { h: number; m: number } | null {
  const t = text.toLowerCase();
  let m = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/.exec(t);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].startsWith("p")) h += 12;
    return { h, m: Number(m[2] ?? 0) };
  }
  m = /\bat\s+(\d{1,2}):(\d{2})\b/.exec(t) ?? /\b(\d{1,2}):(\d{2})\b/.exec(t);
  if (m && Number(m[1]) < 24) return { h: Number(m[1]), m: Number(m[2]) };
  m = /\bat\s+(\d{1,2})\b(?!\s*(?:hours?|minutes?|mins?|days?))/.exec(t);
  if (m && Number(m[1]) < 24) return { h: Number(m[1]) < 7 ? Number(m[1]) + 12 : Number(m[1]), m: 0 };
  if (/\bnoon\b|\bmidday\b/.test(t)) return { h: 12, m: 0 };
  if (/\bmidnight\b/.test(t)) return { h: 0, m: 0 };
  if (/\bmorning\b/.test(t)) return { h: 8, m: 0 };
  if (/\bafternoon\b/.test(t)) return { h: 14, m: 0 };
  if (/\bevening\b/.test(t)) return { h: 18, m: 0 };
  if (/\bnight\b/.test(t)) return { h: 21, m: 0 };
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function parseRecurrence(text: string): Recurrence | null {
  const t = text.toLowerCase();
  const tod = parseTimeOfDay(t);
  const at = tod ?? { h: 9, m: 0 };
  const timeLabel = `${pad(at.h)}:${pad(at.m)}`;

  let m = /\bevery\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/.exec(t);
  if (m) {
    const n = Math.max(1, Number(m[1]));
    if (m[2].startsWith("h")) return { cron: `0 */${Math.min(n, 23)} * * *`, description: `Every ${n} hour${n > 1 ? "s" : ""}` };
    const mins = Math.max(5, n);
    return { cron: `*/${Math.min(mins, 59)} * * * *`, description: `Every ${mins} minutes` };
  }
  if (/\b(every|each)\s+hour\b|\bhourly\b/.test(t)) return { cron: "0 * * * *", description: "Every hour" };
  if (/\b(every|each)\s+(weekday|work ?day)s?\b|\bon weekdays\b/.test(t))
    return { cron: `${at.m} ${at.h} * * 1-5`, description: `Every weekday at ${timeLabel}` };
  if (/\b(every|each)\s+weekend\b|\bon weekends\b/.test(t)) return { cron: `${at.m} ${at.h} * * 0,6`, description: `Every weekend day at ${timeLabel}` };

  const dayMatches = [...t.matchAll(new RegExp(`\\b(?:every|each|on)\\s+((?:${DAY_RE}(?:\\s*(?:,|and|&)\\s*)?)+)`, "g"))];
  if (dayMatches.length) {
    const names = dayMatches.flatMap((dm) => [...dm[1].matchAll(new RegExp(DAY_RE, "g"))].map((x) => x[1]));
    const nums = [...new Set(names.map((n) => DAYS[n]))].sort();
    if (nums.length && /\b(every|each)\b|\bweekly\b|s\b/.test(dayMatches[0][0])) {
      const label = names.map((n) => n[0].toUpperCase() + n.slice(1)).filter((v, i, a) => a.indexOf(v) === i).join(", ");
      return { cron: `${at.m} ${at.h} * * ${nums.join(",")}`, description: `Every ${label} at ${timeLabel}` };
    }
  }
  if (/\b(every|each)\s+(day|morning|evening|night|afternoon)\b|\bdaily\b|\bevery ?day\b/.test(t))
    return { cron: `${at.m} ${at.h} * * *`, description: `Every day at ${timeLabel}` };
  if (/\b(every|each)\s+week\b|\bweekly\b/.test(t)) return { cron: `${at.m} ${at.h} * * 1`, description: `Every Monday at ${timeLabel}` };
  m = /\b(?:every|each)\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  if (m) return { cron: `${at.m} ${at.h} ${Math.min(28, Number(m[1]))} * *`, description: `Monthly on day ${m[1]} at ${timeLabel}` };
  if (/\b(every|each)\s+month\b|\bmonthly\b/.test(t)) return { cron: `${at.m} ${at.h} 1 * *`, description: `Monthly on the 1st at ${timeLabel}` };
  return null;
}
