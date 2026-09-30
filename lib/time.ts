/** Timezone helpers built on Intl (no dependencies). */

/** Offset of `tz` from UTC in minutes at instant `at` (e.g. Asia/Karachi → +300). */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Y-M-D of `at` in `tz`. */
export function localDateParts(tz: string, at: Date = new Date()) {
  const shifted = new Date(at.getTime() + tzOffsetMinutes(tz, at) * 60000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), dow: shifted.getUTCDay() };
}

/** UTC instant for local wall-clock time in `tz`. */
export function zonedTime(tz: string, y: number, m: number, d: number, hh = 0, mm = 0): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - off * 60000);
}

/** [start, end) of the local day containing `at` (optionally shifted by `addDays`). */
export function dayRange(tz: string, at: Date = new Date(), addDays = 0): { start: Date; end: Date } {
  const { y, m, d } = localDateParts(tz, at);
  const start = zonedTime(tz, y, m, d + addDays, 0, 0);
  const end = zonedTime(tz, y, m, d + addDays + 1, 0, 0);
  return { start, end };
}

export function formatLocal(at: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(at));
  } catch {
    return new Date(at).toISOString();
  }
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
