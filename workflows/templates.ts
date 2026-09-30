import type { AutomationDraft, Trigger, WorkflowStepInput } from "./types";

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  group: "productivity" | "documents" | "research" | "content" | "monitoring";
  trigger: Trigger;
  /** Values the user must/can fill in when using the template (e.g. a URL). */
  params?: { key: string; label: string; placeholder?: string; required?: boolean }[];
  steps: WorkflowStepInput[];
}

const notify = (id: string, title: string, body: string, extra: Partial<WorkflowStepInput> = {}): WorkflowStepInput => ({
  id,
  action: "Notify me",
  tool: "notification_send",
  input: { title, body },
  ...extra,
});

export const TEMPLATES: WorkflowTemplate[] = [
  {
    key: "daily_planner",
    name: "Daily Planner",
    description: "Every morning: read tasks and deadlines, find urgent work, build a time-blocked schedule and show the plan.",
    group: "productivity",
    trigger: { type: "schedule", cron: "0 8 * * *", description: "Every day at 08:00" },
    steps: [
      { id: "tasks", action: "Read today's tasks & deadlines (incl. calendar events)", tool: "task_list", input: { status: "open", dueOn: "today" } },
      { id: "rank", action: "Identify urgent work", tool: "task_prioritize", input: { tasks: "{{steps.tasks.tasks}}" } },
      { id: "plan", action: "Create schedule", tool: "schedule_generate", input: { tasks: "{{steps.rank.tasks}}", day: "today" } },
      { id: "save", action: "Save the plan", tool: "document_create", input: { title: "Daily plan", markdown: "{{steps.plan.markdown}}", format: "md", folder: "reports" } },
      notify("notify", "Your plan for today is ready", "{{steps.plan.summary}}"),
    ],
  },
  {
    key: "end_of_day_review",
    name: "End-of-Day Review",
    description: "Every evening: completed vs unfinished tasks, blockers, and tomorrow's plan.",
    group: "productivity",
    trigger: { type: "schedule", cron: "0 18 * * 1-5", description: "Weekdays at 18:00" },
    steps: [
      { id: "done", action: "Read completed tasks", tool: "task_list", input: { completedSince: "today" } },
      { id: "open", action: "Read unfinished tasks", tool: "task_list", input: { status: "open" } },
      { id: "review", action: "Identify blockers & prepare tomorrow", tool: "review_generate", input: { completed: "{{steps.done.tasks}}", open: "{{steps.open.tasks}}" } },
      { id: "save", action: "Save review", tool: "document_create", input: { title: "End-of-day review", markdown: "{{steps.review.markdown}}", format: "md", folder: "reports" } },
      notify("notify", "End-of-day review ready", "{{steps.review.summary}}"),
    ],
  },
  {
    key: "weekly_report",
    name: "Weekly Report",
    description: "Every Friday: what got done, what's open, activity — saved as a PDF.",
    group: "productivity",
    trigger: { type: "schedule", cron: "0 17 * * 5", description: "Every Friday at 17:00" },
    steps: [
      { id: "done", action: "Tasks completed this week", tool: "task_list", input: { completedSince: "week" } },
      { id: "open", action: "Open tasks", tool: "task_list", input: { status: "open" } },
      { id: "activity", action: "This week's activity", tool: "activity_summary", input: { hours: 168 } },
      {
        id: "write",
        action: "Write the report",
        tool: "text_generate",
        input: {
          title: "Weekly report",
          instruction: "Write a concise weekly report in Markdown with sections: Highlights, Completed, In progress / open, Risks & blockers, Focus for next week. Use only the data provided.",
          context: [
            { label: "Completed tasks", text: "{{steps.done.markdown}}" },
            { label: "Open tasks", text: "{{steps.open.markdown}}" },
          ],
          fallback: "# Weekly report\n\n## Completed\n{{steps.done.markdown}}\n\n## Open\n{{steps.open.markdown}}\n\n{{steps.activity.markdown}}",
        },
      },
      { id: "save", action: "Save as PDF", tool: "document_create", input: { title: "Weekly report", markdown: "{{steps.write.markdown}}", format: "pdf", folder: "reports" } },
      notify("notify", "Weekly report ready", "{{steps.done.count}} tasks completed this week."),
    ],
  },
  {
    key: "document_processor",
    name: "Document Processor",
    description: "When a PDF/Word file is uploaded: extract text, summarise, find key points and action items, store the summary.",
    group: "documents",
    trigger: { type: "file_added", extensions: [".pdf", ".docx", ".txt", ".md"] },
    steps: [
      { id: "process", action: "Read, extract, summarise & find action items", tool: "document_process", input: { fileId: "{{trigger.fileId}}" } },
      { id: "save", action: "Store summary", tool: "document_create", input: { title: "Summary - {{trigger.fileName}}", markdown: "{{steps.process.markdown}}", format: "md", folder: "reports" } },
      notify("notify", "Summarised {{trigger.fileName}}", "{{steps.process.summary}}"),
    ],
  },
  {
    key: "research_agent",
    name: "Research Agent",
    description: "Search the web, read sources, compare, de-duplicate, flag uncertainty and write a cited report.",
    group: "research",
    trigger: { type: "manual" },
    params: [{ key: "topic", label: "Research topic", placeholder: "e.g. best free local LLMs in 2026", required: true }],
    steps: [
      { id: "search", action: "Search the web", tool: "web_search", input: { query: "{{params.topic}}", limit: 5 } },
      { id: "read", action: "Gather sources", tool: "pages_read", input: { results: "{{steps.search.results}}", limit: 5 } },
      { id: "report", action: "Compare sources & write report", tool: "research_compile", input: { topic: "{{params.topic}}", pages: "{{steps.read.pages}}" } },
      { id: "save", action: "Save report with sources", tool: "document_create", input: { title: "Research - {{params.topic}}", markdown: "{{steps.report.markdown}}", format: "md", folder: "reports" } },
    ],
  },
  {
    key: "file_organizer",
    name: "File Organizer",
    description: "Scan Downloads, detect type & topic, propose folders, move files (approval if more than 5), log changes.",
    group: "documents",
    trigger: { type: "schedule", cron: "0 20 * * 0", description: "Every Sunday at 20:00" },
    steps: [
      { id: "scan", action: "Scan files & suggest folders", tool: "file_organize_plan", input: { folder: "downloads" } },
      { id: "apply", action: "Move files", tool: "file_organize_apply", input: { moves: "{{steps.scan.moves}}" }, when: { left: "{{steps.scan.moves}}", op: "exists" } },
      notify("notify", "Files organised", "{{steps.scan.summary}}"),
    ],
  },
  {
    key: "website_monitor",
    name: "Website Monitor",
    description: "Check a website every 2 hours and notify me when it changes.",
    group: "monitoring",
    trigger: { type: "schedule", cron: "0 */2 * * *", description: "Every 2 hours" },
    params: [{ key: "url", label: "Website URL", placeholder: "https://example.com/page", required: true }],
    steps: [
      { id: "check", action: "Check the website", tool: "website_check", input: { url: "{{params.url}}" }, retries: 1 },
      notify("notify", "Website changed: {{params.url}}", "{{steps.check.markdown}}", { when: { left: "{{steps.check.changed}}", op: "truthy" } }),
    ],
  },
  {
    key: "daily_content",
    name: "Daily Content",
    description: "Every day: generate content + image + captions, quality check, ask approval, publish, log.",
    group: "content",
    trigger: { type: "schedule", cron: "0 18 * * *", description: "Every day at 18:00" },
    steps: [
      { id: "create", action: "Generate idea, image & captions", tool: "content_generate", input: { text: "today's content" } },
      notify("issues", "Today's post needs your attention", "Quality checks failed: {{steps.create.warnings}}", { when: { left: "{{steps.create.qualityPassed}}", op: "falsy" } }),
      { id: "gate", kind: "condition", action: "Quality check passed?", condition: { left: "{{steps.create.qualityPassed}}", op: "truthy" }, onFalse: "stop" },
      { id: "publish", action: "Publish (approval required)", tool: "social_publish", input: { postId: "{{steps.create.postId}}" } },
    ],
  },
  {
    key: "weekly_content",
    name: "Weekly Content Plan",
    description: "Every Sunday: create a 7-day content calendar and queue the posts.",
    group: "content",
    trigger: { type: "schedule", cron: "0 10 * * 0", description: "Every Sunday at 10:00" },
    steps: [
      { id: "plan", action: "Create 7-day content calendar", tool: "content_plan_week", input: {} },
      notify("notify", "Next week's content plan is ready", "{{steps.plan.summary}}", { input: { title: "Next week's content plan is ready", body: "{{steps.plan.summary}}", link: "/content/calendar" } }),
    ],
  },
  {
    key: "deal_promotion",
    name: "Deal Promotion",
    description: "When a new deal is added to a product: generate a promo post, ask approval, publish.",
    group: "content",
    trigger: { type: "event", event: "deal_added" },
    steps: [
      { id: "create", action: "Generate promotional post", tool: "content_generate", input: { productName: "{{trigger.productName}}", category: "Deals", idea: "{{trigger.productName}} — {{trigger.offer}}" } },
      { id: "gate", kind: "condition", action: "Quality check passed?", condition: { left: "{{steps.create.qualityPassed}}", op: "truthy" }, onFalse: "stop" },
      { id: "publish", action: "Publish (approval required)", tool: "social_publish", input: { postId: "{{steps.create.postId}}" } },
    ],
  },
  {
    key: "product_launch",
    name: "Product Launch",
    description: "When a new product is added: launch post, 5 content ideas and a notification.",
    group: "content",
    trigger: { type: "event", event: "product_added" },
    steps: [
      { id: "create", action: "Generate launch post", tool: "content_generate", input: { productName: "{{trigger.productName}}", idea: "Launch: {{trigger.productName}}" } },
      {
        id: "ideas",
        action: "Generate 5 content ideas",
        tool: "text_generate",
        input: {
          title: "Launch ideas",
          instruction: "Suggest 5 short social media content ideas to launch the product {{trigger.productName}} over the next two weeks, one per line with a suggested day.",
          fallback:
            "1. Day 1 — Reveal: hero photo of {{trigger.productName}}\n2. Day 3 — Behind the scenes: how it's made\n3. Day 5 — First reactions from customers\n4. Day 8 — Ingredient close-ups\n5. Day 12 — Limited-time launch offer reminder",
        },
      },
      notify("notify", "Launch content ready for {{trigger.productName}}", "{{steps.ideas.markdown}}"),
    ],
  },
];

export function getTemplate(key: string) {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** Turn a template (+ parameter values) into an automation draft. */
export function templateToDraft(key: string, params: Record<string, string> = {}): AutomationDraft | null {
  const t = getTemplate(key);
  if (!t) return null;
  for (const p of t.params ?? []) if (p.required && !params[p.key]?.trim()) throw new Error(`"${p.label}" is required`);
  const fill = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(/\{\{\s*params\.(\w+)\s*\}\}/g, (_, k: string) => params[k] ?? "");
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  const suffix = params.url ? ` — ${params.url}` : params.topic ? ` — ${params.topic}` : "";
  return { name: `${t.name}${suffix}`, description: t.description, trigger: t.trigger, steps: fill(t.steps) as WorkflowStepInput[], templateKey: t.key };
}
