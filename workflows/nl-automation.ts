import { parseRecurrence } from "@/lib/recurrence";
import type { AutomationDraft, Trigger, WorkflowStepInput } from "./types";

/**
 * "Every Monday morning, check my unfinished tasks, identify the important ones, create a schedule
 *  for the week, and notify me."  →  Trigger + ordered steps, wired together.
 * Deterministic (works offline). Returns null when no actions can be recognised.
 */

export function detectTrigger(text: string): Trigger | null {
  const t = text.toLowerCase();
  const fileAdded = /\b(whenever|when|each time|every time|if)\b[^.]*\b(upload|add|drop|save)\w*\b[^.]*\b(pdf|file|document|doc|docx|spreadsheet|image|photo)s?\b/.exec(t);
  if (fileAdded) {
    const kind = fileAdded[3];
    const extensions =
      kind === "pdf" ? [".pdf"] : kind === "spreadsheet" ? [".xlsx", ".csv"] : kind === "image" || kind === "photo" ? [".png", ".jpg", ".jpeg", ".webp"] : kind === "docx" ? [".docx"] : [".pdf", ".docx", ".txt", ".md"];
    return { type: "file_added", extensions };
  }
  if (/\b(when|whenever)\b[^.]*\bnew (deal|offer|discount)\b/.test(t)) return { type: "event", event: "deal_added" };
  if (/\b(when|whenever)\b[^.]*\bnew product\b/.test(t)) return { type: "event", event: "product_added" };
  if (/\bwebhook\b/.test(t)) return { type: "webhook" };
  const rec = parseRecurrence(t);
  if (rec) return { type: "schedule", cron: rec.cron, description: rec.description };
  if (/\b(monitor|watch|track)\b[^.]*https?:\/\//.test(t)) return { type: "schedule", cron: "0 */2 * * *", description: "Every 2 hours" };
  return null;
}

export function looksLikeAutomation(text: string): boolean {
  const t = text.toLowerCase();
  if (/^\s*(please\s+)?remind me\b/.test(t)) return false; // recurring reminder → task
  if (/\b(monitor|watch|keep an eye on|track changes)\b[^.]*https?:\/\//.test(t)) return true;
  if (/\bcreate (a|an) (workflow|automation)\b|\bautomate\b/.test(t) && detectTrigger(t)) return true;
  return Boolean(detectTrigger(t)) && /\b(every|each|whenever|when|daily|weekly|monthly|hourly)\b/.test(t) && /\b(check|create|prepare|make|generate|send|notify|summari[sz]e|post|publish|organi[sz]e|research|review|plan|read|report|remind|backup|monitor)\b/.test(t);
}

const URL_RE = /https?:\/\/[^\s,)]+/i;

export function parseAutomationText(text: string, now = new Date()): AutomationDraft | null {
  const t = text.toLowerCase();
  const trigger = detectTrigger(text) ?? { type: "manual" as const };
  const steps: WorkflowStepInput[] = [];
  const has = (re: RegExp) => re.test(t);
  let tasksRef: string | null = null;
  let mdRef: string | null = null;
  let summaryRef: string | null = null;
  const add = (s: WorkflowStepInput) => {
    steps.push(s);
    return s.id;
  };
  void now;

  // monitoring
  const url = URL_RE.exec(text)?.[0]?.replace(/[.,]+$/, "");
  if (url && has(/\b(monitor|watch|check|track|keep an eye)\b/)) {
    add({ id: "check", action: `Check ${url} for changes`, tool: "website_check", input: { url }, retries: 1 });
    add({ id: "notify", action: "Notify me if it changed", tool: "notification_send", input: { title: `Website changed: ${url}`, body: "{{steps.check.markdown}}" }, when: { left: "{{steps.check.changed}}", op: "truthy" } });
    return { name: `Monitor ${new URL(url).hostname}`, description: text.trim(), trigger, steps };
  }

  // documents on upload
  if (trigger.type === "file_added" || has(/\bsummari[sz]e\b[^.]*\b(pdf|document|file)/)) {
    add({ id: "process", action: "Read & summarise the document", tool: "document_process", input: { fileId: "{{trigger.fileId}}" } });
    add({ id: "save", action: "Store the summary", tool: "document_create", input: { title: "Summary - {{trigger.fileName}}", markdown: "{{steps.process.markdown}}", format: "md", folder: "reports" } });
    mdRef = "{{steps.process.markdown}}";
    summaryRef = "{{steps.process.summary}}";
    if (has(/\b(action items?|tasks?)\b/) && has(/\bcreate\b/)) {
      add({ id: "tasks", action: "Create tasks from action items", tool: "task_create", forEach: "{{steps.process.documents[0].actionItems}}", input: { title: "{{item}}", description: "From {{trigger.fileName}}" }, onError: "continue" });
    }
  }

  // social content
  if (has(/\b(post|content|caption|instagram|facebook|tiktok|social)\b/) && !has(/\bpostpone\b/)) {
    add({ id: "create", action: "Generate content, image & captions", tool: "content_generate", input: { text } });
    if (has(/\b(post|publish)\b/)) {
      add({ id: "gate", kind: "condition", action: "Quality check passed?", condition: { left: "{{steps.create.qualityPassed}}", op: "truthy" }, onFalse: "stop" });
      add({ id: "publish", action: "Publish (approval required)", tool: "social_publish", input: { postId: "{{steps.create.postId}}" } });
    }
    mdRef = "{{steps.create.markdown}}";
    summaryRef = "{{steps.create.summary}}";
  }

  // tasks
  if (has(/\b(unfinished|open|pending|incomplete|my|today'?s|outstanding)\s+(tasks?|work|to-?dos?)\b|\b(read|check|review|get)\s+(my\s+)?tasks\b|\bdeadlines?\b/) && !has(/\bcompleted tasks\b/)) {
    tasksRef = add({ id: "tasks", action: "Get unfinished tasks", tool: "task_list", input: has(/\bdeadline/) && !has(/unfinished|open|pending/) ? { status: "open", dueWithinDays: 7 } : { status: "open" } });
    mdRef = "{{steps.tasks.markdown}}";
    summaryRef = "{{steps.tasks.summary}}";
  }
  if (has(/\b(completed|finished|done) tasks\b|\bend[- ]of[- ]day\b|\breview (my|the) day\b/)) {
    add({ id: "done", action: "Read completed tasks", tool: "task_list", input: { completedSince: "today" } });
    if (!tasksRef) tasksRef = add({ id: "tasks", action: "Read unfinished tasks", tool: "task_list", input: { status: "open" } });
    add({ id: "review", action: "Identify blockers & plan tomorrow", tool: "review_generate", input: { completed: "{{steps.done.tasks}}", open: "{{steps.tasks.tasks}}" } });
    mdRef = "{{steps.review.markdown}}";
    summaryRef = "{{steps.review.summary}}";
  }
  if (has(/\b(important|prioriti[sz]e|priorities|urgent|most important)\b/)) {
    if (!tasksRef) tasksRef = add({ id: "tasks", action: "Get unfinished tasks", tool: "task_list", input: { status: "open" } });
    add({ id: "rank", action: "Identify the important ones", tool: "task_prioritize", input: { tasks: "{{steps.tasks.tasks}}", top: 10 } });
    tasksRef = "rank";
    mdRef = "{{steps.rank.markdown}}";
    summaryRef = "{{steps.rank.summary}}";
  }
  if (has(/\b(schedule|plan|agenda)\b/) && !has(/\bcontent (plan|calendar)\b/)) {
    if (!tasksRef) tasksRef = add({ id: "tasks", action: "Get tasks", tool: "task_list", input: { status: "open" } });
    add({ id: "plan", action: has(/\bweek\b/) ? "Create a schedule for the week" : "Create a schedule", tool: "schedule_generate", input: { tasks: `{{steps.${tasksRef}.tasks}}`, title: has(/\bweek\b/) ? "Plan for the week" : undefined } });
    add({ id: "save", action: "Save the plan", tool: "document_create", input: { title: has(/\bweek\b/) ? "Weekly plan" : "Plan", markdown: "{{steps.plan.markdown}}", format: "md", folder: "reports" } });
    mdRef = "{{steps.plan.markdown}}";
    summaryRef = "{{steps.plan.summary}}";
  }
  if (has(/\b(weekly|monthly)? ?report\b/) && !steps.some((s) => s.tool === "document_create")) {
    add({ id: "done", action: "Tasks completed this week", tool: "task_list", input: { completedSince: "week" } });
    add({ id: "open", action: "Open tasks", tool: "task_list", input: { status: "open" } });
    add({ id: "report", action: "Prepare the report", tool: "document_create", input: { title: "Weekly report", markdown: "# Weekly report\n\n## Completed\n{{steps.done.markdown}}\n\n## Open\n{{steps.open.markdown}}", format: "pdf", folder: "reports" } });
    summaryRef = "{{steps.done.summary}}";
  }
  if (has(/\b(content plan|content calendar|7 days of content|week of content)\b/)) {
    add({ id: "cplan", action: "Create 7-day content calendar", tool: "content_plan_week", input: {} });
    summaryRef = "{{steps.cplan.summary}}";
  }

  // research
  const research = /\bresearch\s+(?:about\s+|on\s+)?(.+?)(?:,|\band\b|\.|$)/i.exec(text);
  if (research) {
    const topic = research[1].trim();
    add({ id: "search", action: `Search the web for "${topic}"`, tool: "web_search", input: { query: topic, limit: 5 } });
    add({ id: "read", action: "Read the sources", tool: "pages_read", input: { results: "{{steps.search.results}}", limit: 5 } });
    add({ id: "report", action: "Write a cited report", tool: "research_compile", input: { topic, pages: "{{steps.read.pages}}" } });
    add({ id: "save", action: "Save the report", tool: "document_create", input: { title: `Research - ${topic}`, markdown: "{{steps.report.markdown}}", format: "md", folder: "reports" } });
    summaryRef = "{{steps.report.summary}}";
  }

  // files
  if (has(/\borgani[sz]e\b[^.]*\b(files|downloads|uploads|documents)\b/)) {
    const folder = has(/downloads/) ? "downloads" : "uploads";
    add({ id: "scan", action: `Scan /${folder} and suggest folders`, tool: "file_organize_plan", input: { folder } });
    add({ id: "apply", action: "Move files (approval if more than 5)", tool: "file_organize_apply", input: { moves: "{{steps.scan.moves}}" }, when: { left: "{{steps.scan.moves}}", op: "exists" } });
    summaryRef = "{{steps.scan.summary}}";
  }

  if (!steps.length) return null;

  // notification (explicit, or implicit so scheduled results are never silent)
  const wantsNotify = has(/\b(notify|alert|tell|send me|message me|ping|let me know|remind me|email me|telegram)\b/);
  if (wantsNotify || trigger.type !== "manual") {
    if (!steps.some((s) => s.tool === "notification_send")) {
      add({ id: "notify", action: "Notify me", tool: "notification_send", input: { title: "Automation finished", body: summaryRef ?? mdRef ?? "Done." } });
    }
  }
  // dedupe step ids
  const seen = new Map<string, number>();
  for (const s of steps) {
    const n = seen.get(s.id) ?? 0;
    seen.set(s.id, n + 1);
    if (n > 0) s.id = `${s.id}${n + 1}`;
  }

  const actionWords = steps.filter((s) => s.kind !== "condition").map((s) => s.action.split(" ").slice(0, 3).join(" ").toLowerCase());
  const when = trigger.type === "schedule" ? trigger.description : trigger.type === "file_added" ? "When a file is added" : trigger.type === "event" ? `When a ${trigger.event.replace("_", " ")}` : trigger.type === "webhook" ? "On webhook" : "Manual";
  const name = `${when}: ${actionWords.slice(0, 2).join(", ")}`.slice(0, 80);
  return { name: name.charAt(0).toUpperCase() + name.slice(1), description: text.trim(), trigger, steps };
}

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case "schedule":
      return t.description ?? `Cron: ${t.cron}`;
    case "file_added":
      return `When a file is added${t.extensions?.length ? ` (${t.extensions.join(", ")})` : ""}`;
    case "event":
      return t.event === "deal_added" ? "When a new deal is added" : "When a new product is added";
    case "webhook":
      return "When the webhook URL is called";
    default:
      return "Manually";
  }
}
