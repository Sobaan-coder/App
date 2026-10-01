import * as chrono from "chrono-node";
import { parseRecurrence } from "@/lib/recurrence";
import { tzOffsetMinutes } from "@/lib/time";
import type { TaskPriority } from "./types";

export interface ParsedTask {
  title: string;
  dueAt: string | null;
  remindAt: string | null;
  priority: TaskPriority;
  tags: string[];
  recurrence: string | null;
  recurrenceLabel: string | null;
  estimatedMinutes: number | null;
  projectName: string | null;
  isReminder: boolean;
}

const LEAD_RE =
  /^\s*(please\s+)?(can you\s+|could you\s+)?(remind me( to)?|add( a)?( new)?( \w+ priority)? (task|todo|to-?do)( to)?|create( a)?( new)?( \w+ priority)? (task|todo|reminder)( to| for)?|new task:?|todo:?|task:?|i need to|don't let me forget to|set a reminder( to)?)\s*/i;

/**
 * "Remind me tomorrow to finish the report" →
 *   { title: "Finish the report", dueAt: tomorrow 17:00, remindAt: tomorrow 09:00, … }
 */
export function parseTaskText(input: string, opts: { now?: Date; timezone?: string; workStart?: string } = {}): ParsedTask {
  const now = opts.now ?? new Date();
  const tz = opts.timezone ?? "UTC";
  const isReminder = /\bremind(er)?\b/i.test(input);
  let text = input.trim().replace(/[.!]+$/, "");

  // tags (#tag) and priority
  const tags = [...text.matchAll(/(^|\s)#([\w-]{2,30})/g)].map((m) => m[2].toLowerCase());
  text = text.replace(/(^|\s)#[\w-]{2,30}/g, " ");
  let priority: TaskPriority = "medium";
  if (/\b(urgent|asap|immediately|critical)\b/i.test(text)) priority = "urgent";
  else if (/\b(high[- ]priority|important)\b/i.test(text)) priority = "high";
  else if (/\blow[- ]priority\b|\bwhenever\b|\bsomeday\b/i.test(text)) priority = "low";
  text = text.replace(/\b(urgent(ly)?|asap|high[- ]priority|low[- ]priority|medium[- ]priority)\b,?/gi, " ").replace(/\s{2,}/g, " ");

  // estimated duration "(30 min)", "for 2 hours", "takes 45 minutes"
  let estimatedMinutes: number | null = null;
  const dur = /\b(?:for|takes?|about|~)?\s*\(?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\)?(?=\s|$|,)/i.exec(text);
  if (dur && /(\bfor|\btakes?|\babout|~|\()/i.test(dur[0])) {
    const n = Number(dur[1]);
    estimatedMinutes = Math.round(/^h/i.test(dur[2]) ? n * 60 : n);
    text = text.replace(dur[0], " ");
  }

  // project: "for project X", "in project X", "(project: X)"
  let projectName: string | null = null;
  const pm = /\b(?:for|in|under|to)\s+(?:the\s+)?(?:project\s+)?["“]?([A-Z][\w&' -]{1,40}?)["”]?\s+project\b|\bproject[:\s]+["“]?([\w&' -]{2,40}?)["”]?(?=\s*(?:$|,|\.|\bby\b|\bon\b|\bat\b|\btomorrow\b|\btoday\b))/i.exec(text);
  if (pm) {
    projectName = (pm[1] ?? pm[2]).trim();
    text = text.replace(pm[0], " ");
  }

  // recurrence
  const rec = parseRecurrence(text);
  if (rec) text = text.replace(/\b(every|each)\s+(\d+\s+)?(\w+)(\s*(,|and|&)\s*\w+day)*\b|\b(daily|weekly|monthly|hourly)\b|\bon weekdays\b/gi, " ");

  // date/time via chrono in the user's timezone
  const offset = tzOffsetMinutes(tz, now);
  const results = chrono.parse(text, { instant: now, timezone: offset }, { forwardDate: true });
  let dueAt: Date | null = null;
  let remindAt: Date | null = null;
  if (results.length) {
    const r = results[0];
    const d = r.start.date();
    const hasTime = r.start.isCertain("hour");
    if (!hasTime) {
      // date only: due end of work day, remind at start of work day
      const [wh, wm] = (opts.workStart ?? "09:00").split(":").map(Number);
      const base = Date.UTC(r.start.get("year")!, r.start.get("month")! - 1, r.start.get("day")!);
      dueAt = new Date(base + (17 * 60 - offset) * 60000);
      remindAt = new Date(base + (wh * 60 + wm - offset) * 60000);
    } else {
      dueAt = d;
      remindAt = d;
    }
    text = (text.slice(0, r.index) + " " + text.slice(r.index + r.text.length)).replace(/\b(by|on|at|before|until|due)\s*$/i, " ");
  }
  if (!isReminder) remindAt = null;

  let title = text
    .replace(/\s{2,}/g, " ")
    .replace(LEAD_RE, "")
    .replace(/\b(by|on|at|before|until|due)\s*(,|$)/gi, " ")
    .replace(/^\s*(to|that|about)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")
    .trim();
  if (!title) title = input.trim().slice(0, 120);
  title = title[0].toUpperCase() + title.slice(1);

  return {
    title: title.slice(0, 200),
    dueAt: dueAt?.toISOString() ?? null,
    remindAt: remindAt?.toISOString() ?? null,
    priority,
    tags,
    recurrence: rec?.cron ?? null,
    recurrenceLabel: rec?.description ?? null,
    estimatedMinutes,
    projectName,
    isReminder,
  };
}
