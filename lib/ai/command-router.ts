// Routes natural-language commands to the right part of Study OS.
// Deterministic rules handle the common phrasings for free; the cheap model is
// only consulted for anything ambiguous.
import { z } from "zod/v4";

export const Intent = z.enum([
  "plan", "revision_today", "find_questions", "quiz", "weak_topics", "summarize", "past_paper_stats", "flashcards", "search", "tutor", "navigate",
]);
export type Intent = z.infer<typeof Intent>;

export const CommandSchema = z.object({
  intent: Intent,
  subject: z.string().nullable().describe("Subject name or code the student mentioned, if any"),
  topic: z.string().nullable().describe("Topic or concept mentioned, if any"),
  days: z.number().nullable().describe("Number of days available, if stated"),
  minutes: z.number().nullable().describe("Minutes available for a short plan, if stated"),
  page: z.enum(["dashboard", "subjects", "resources", "past-papers", "planner", "calendar", "revision", "progress", "tutor", "settings", "deadlines", "questions", "flashcards"]).nullable(),
});
export type Command = z.infer<typeof CommandSchema>;

const PAGES: Record<string, NonNullable<Command["page"]>> = {
  dashboard: "dashboard", home: "dashboard", subjects: "subjects", resources: "resources", library: "resources", files: "resources",
  "past papers": "past-papers", papers: "past-papers", planner: "planner", calendar: "calendar", revision: "revision",
  progress: "progress", analytics: "progress", tutor: "tutor", settings: "settings", deadlines: "deadlines", tasks: "deadlines",
  "question bank": "questions", questions: "questions", flashcards: "flashcards",
};

const empty = { subject: null, topic: null, days: null, minutes: null, page: null } as const;

function afterKeyword(q: string, re: RegExp) {
  const m = q.match(re);
  return m?.[1]?.trim().replace(/[?.!]+$/, "") || null;
}

export function ruleBasedRoute(query: string): Command | null {
  const q = query.trim();
  const lower = q.toLowerCase();
  const days = lower.match(/(\d+)\s*(?:days?|din)\b/);
  const hours = lower.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:hours?|hrs?|h)\b/);
  const mins = lower.match(/(\d+)\s*(?:minutes?|mins?)\b/);

  const nav = lower.match(/^(?:open|go to|show|take me to)\s+(?:my\s+)?(.+?)(?:\s+page)?$/);
  if (nav && PAGES[nav[1]]) return { ...empty, intent: "navigate", page: PAGES[nav[1]] };

  if (/\b(quiz|test)\s+me\b/.test(lower)) return { ...empty, intent: "quiz", topic: afterKeyword(q, /(?:quiz|test)\s+me\s+(?:on|about|in)\s+(.+)/i) };
  if (/\bflash\s?cards?\b/.test(lower) && /\b(make|create|generate)\b/.test(lower))
    return { ...empty, intent: "flashcards", topic: afterKeyword(q, /(?:for|on|about|from)\s+(.+)/i) };
  if (/\b(today'?s|daily)\s+revision\b|\bwhat should i revise\b|\brevision (?:for )?today\b/.test(lower)) return { ...empty, intent: "revision_today" };
  if (/\b(weak(?:est)?|struggling)\b.*\btopics?\b|\bshow my weak/.test(lower)) return { ...empty, intent: "weak_topics" };
  if (/\b(most often|most frequent|frequently|appeared|repeated)\b.*\b(past papers?|papers?)\b|\bpast[- ]paper (?:analysis|analytics|trends)\b/.test(lower))
    return { ...empty, intent: "past_paper_stats", subject: afterKeyword(q, /\b(?:in|for)\s+(?:my\s+)?([A-Z][\w&]*)\b/) };
  if (/\b(find|show|list)\b.*\bquestions?\b/.test(lower))
    return { ...empty, intent: "find_questions", topic: afterKeyword(q, /questions?\s+(?:about|on|for|from)\s+(.+)/i) };
  if (/\bsummari[sz]e\b/.test(lower)) return { ...empty, intent: "summarize", topic: afterKeyword(q, /summari[sz]e\s+(?:my\s+)?(.+)/i) };
  if ((days && /\b(before|until|left|exam|remaining)\b/.test(lower)) || /\b(study plan|plan my|make (?:me )?a plan|create a .*plan|what should i study)\b/.test(lower)) {
    return {
      ...empty,
      intent: "plan",
      subject: afterKeyword(q, /\b(?:before|for)\s+(?:my\s+)?(?:the\s+)?([A-Z][\w&]*(?:\s+[A-Z][\w&]*)*)\s+(?:exam|paper|test)/),
      days: days ? Number(days[1]) : null,
      minutes: hours ? Math.round(Number(hours[1]) * 60) : mins ? Number(mins[1]) : null,
    };
  }
  return null;
}
