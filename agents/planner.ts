import * as chrono from "chrono-node";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { tzOffsetMinutes } from "@/lib/time";
import { generateJson, aiAvailable } from "@/services/ai/router";
import { projectMentionedIn } from "@/services/tasks/repo";
import { getTool, staticRisk } from "@/tools/registry";
import { templateToDraft } from "@/workflows/templates";
import { stepSchema, type Plan, type WorkflowStep, type WorkflowStepInput } from "@/workflows/types";
import { detectIntent, type DetectedIntent, type Intent } from "./intent";

/**
 * TASK PLANNER — turns an intent into a structured, inspectable plan of tool steps.
 * Plans are built ONLY from the user's own words; external content can never add steps.
 */

const S = (id: string, action: string, tool: string, input: Record<string, unknown> = {}, extra: Partial<WorkflowStepInput> = {}): WorkflowStepInput => ({ id, action, tool, input, ...extra });

function docFormat(t: string): "pdf" | "docx" | "xlsx" | "csv" | "txt" | "md" {
  if (/\b(excel|xlsx|spreadsheet)\b/.test(t)) return "xlsx";
  if (/\bcsv\b/.test(t)) return "csv";
  if (/\bpdf\b|\binvoice\b/.test(t)) return "pdf";
  if (/\b(word|docx|doc)\b/.test(t)) return "docx";
  if (/\b(txt|plain text)\b/.test(t)) return "txt";
  if (/\bmarkdown\b|\bmd\b/.test(t)) return "md";
  return "docx";
}

function memoryParts(content: string) {
  const c = content.trim().replace(/[.]+$/, "");
  const m = /^(.{2,60}?)\s+(?:is|are|=|:)\s+(.+)$/i.exec(c);
  const subject = (m ? m[1] : c.split(/\s+/).slice(0, 6).join(" ")).replace(/^(that|my|our|the)\s+/i, "").trim();
  const lc = c.toLowerCase();
  const category = /\b(prefer|like|style|language|format|tone|work hours|wake|call me|i am|i'm)\b/.test(lc)
    ? "preference"
    : /\b(brand|product|price|business|customer|menu|shop|store|company|merchants?)\b/.test(lc)
      ? "business"
      : /\bproject\b/.test(lc)
        ? "project"
        : "general";
  return { subject: subject.slice(0, 120) || "note", content: c, category };
}

function eventFromText(text: string, tz: string) {
  const res = chrono.parse(text, { instant: new Date(), timezone: tzOffsetMinutes(tz) }, { forwardDate: true })[0];
  if (!res) return null;
  const title = (text.slice(0, res.index) + " " + text.slice(res.index + res.text.length))
    .replace(/^\s*(please\s+)?(schedule|add|put|book|create)\s+(a|an)?\s*/i, "")
    .replace(/\s+(to|on|in)\s+(my\s+)?calendar\b/i, "")
    .replace(/\s+(at|on|for)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const minutes = /(\d+)\s*(min|minutes)/i.exec(text)?.[1] ?? (/(\d+)\s*(h|hours?)/i.exec(text)?.[1] ? String(Number(/(\d+)\s*(h|hours?)/i.exec(text)![1]) * 60) : "60");
  return { title: title.charAt(0).toUpperCase() + title.slice(1) || "Event", startsAt: res.start.date().toISOString(), durationMinutes: Number(minutes) };
}

const llmIntentSchema = z.object({
  intent: z.string(),
  topic: z.string().optional(),
  query: z.string().optional(),
});

const LLM_INTENTS: Intent[] = ["research", "task_create", "plan_day", "what_next", "unfinished_tasks", "summarize_documents", "generate_document", "content_create", "organize_files", "create_automation", "memory_save", "memory_recall", "general"];

async function llmClassify(db: Db, userId: string, text: string): Promise<DetectedIntent | null> {
  if (!(await aiAvailable(db))) return null;
  const r = await generateJson(
    db,
    userId,
    {
      task: "intent_classify",
      tier: "fast",
      system: `Classify the user's request for a personal automation assistant. Allowed intents: ${LLM_INTENTS.join(", ")}. Use "general" for questions/conversation. Respond JSON: {"intent": string, "topic"?: string}.`,
      prompt: text,
    },
    (v) => {
      const p = llmIntentSchema.safeParse(v);
      return p.success && LLM_INTENTS.includes(p.data.intent as Intent) ? p.data : null;
    },
  );
  if (!r || r.value.intent === "general") return null;
  return { intent: r.value.intent as Intent, confidence: 0.6, entities: { topic: r.value.topic, query: r.value.query } };
}

export async function planCommand(db: Db, userId: string, text: string): Promise<Plan & { projectId: string | null; detected: DetectedIntent }> {
  let detected = detectIntent(text);
  if (detected.intent === "general") detected = (await llmClassify(db, userId, text)) ?? detected;
  const { intent, entities: e } = detected;
  const t = text.toLowerCase();
  const profile = await getProfile(db);
  const project = await projectMentionedIn(db, text);
  let goal = text.trim().slice(0, 160);
  let steps: WorkflowStepInput[] = [];

  switch (intent) {
    case "create_automation":
      goal = "Design an automation";
      steps = [S("propose", "Understand the request and design the automation", "automation_propose", { text })];
      break;
    case "automation_list":
      steps = [S("list", "List automations", "automation_control", { action: "list" })];
      break;
    case "automation_pause_all":
      steps = [S("pause", "Pause all automations", "automation_control", { action: "pause_all" })];
      break;
    case "automation_resume_all":
      steps = [S("resume", "Resume all automations", "automation_control", { action: "resume_all" })];
      break;
    case "automation_pause":
    case "automation_resume":
      steps = [S("toggle", `${intent === "automation_pause" ? "Pause" : "Resume"} "${e.name}"`, "automation_control", { action: intent === "automation_pause" ? "pause" : "resume", name: e.name })];
      break;
    case "explain_failure":
      steps = [S("explain", "Find the failed run and explain it", "run_explain", { name: e.name })];
      break;
    case "retry":
      steps = [S("retry", "Retry the last failed run", "run_retry", {})];
      break;
    case "memory_save": {
      const m = memoryParts(e.content ?? text);
      steps = [S("remember", `Remember: ${m.subject}`, "memory_save", { ...m, projectName: project?.name })];
      break;
    }
    case "memory_forget":
      steps = [S("forget", `Forget "${e.query}"`, "memory_forget", { query: e.query || text })];
      break;
    case "memory_recall":
      steps = [S("recall", "Show what I remember", "memory_search", { query: e.query ?? project?.name })];
      break;
    case "show_activity":
      steps = [S("activity", "Collect today's activity", "activity_summary", {})];
      break;
    case "content_plan":
      steps = [S("plan", "Create a 7-day content calendar", "content_plan_week", {})];
      break;
    case "content_status":
      steps = [S("list", "Look up posts", "content_list", { status: e.status })];
      break;
    case "image_generate":
      steps = [S("image", "Create the image (free providers first)", "image_generate", { text })];
      break;
    case "content_create":
      steps = [
        S("create", "Plan content, generate image & platform captions, run quality checks", "content_generate", { text }),
        S("package", "Prepare downloadable content package", "content_package", { postId: "{{steps.create.postId}}" }),
      ];
      break;
    case "content_publish":
      steps = [
        S("create", "Plan content, generate image & platform captions, run quality checks", "content_generate", { text }),
        S("package", "Prepare downloadable content package (manual fallback)", "content_package", { postId: "{{steps.create.postId}}" }),
        { id: "gate", kind: "condition", action: "Quality checks passed?", condition: { left: "{{steps.create.qualityPassed}}", op: "truthy" }, onFalse: "stop" },
        S("publish", "Publish to selected platforms (your approval required)", "social_publish", { postId: "{{steps.create.postId}}" }),
      ];
      break;
    case "task_create":
      steps = [S("task", "Create the task", "task_create", { text, projectId: project?.id })];
      break;
    case "task_complete":
      steps = [S("done", `Mark "${e.title}" as completed`, "task_update", { titleContains: e.title, status: "completed" })];
      break;
    case "calendar_event": {
      const ev = eventFromText(text, profile.timezone);
      steps = ev ? [S("event", `Create event "${ev.title}"`, "calendar_create", ev)] : [S("task", "Create the task", "task_create", { text })];
      break;
    }
    case "plan_day":
    case "plan_tomorrow": {
      const day = intent === "plan_tomorrow" ? "tomorrow" : "today";
      goal = day === "today" ? "Prepare today's work plan" : "Prepare tomorrow's schedule";
      steps = [
        S("tasks", `Read tasks due ${day} and deadlines`, "task_list", { status: "open", dueOn: day, projectId: project?.id }),
        S("rank", "Identify urgent & important work", "task_prioritize", { tasks: "{{steps.tasks.tasks}}" }),
        S("plan", "Build a time-blocked schedule", "schedule_generate", { tasks: "{{steps.rank.tasks}}", day }),
        S("save", "Save the plan to Reports", "document_create", { title: day === "today" ? "Daily plan" : "Plan for tomorrow", markdown: "{{steps.plan.markdown}}", format: "md", folder: "reports" }),
      ];
      break;
    }
    case "what_next":
      steps = [S("tasks", "Read open tasks", "task_list", { status: "open", projectId: project?.id }), S("rank", "Rank by urgency and importance", "task_prioritize", { tasks: "{{steps.tasks.tasks}}", top: 5 })];
      break;
    case "unfinished_tasks":
      steps = [S("tasks", "Find unfinished tasks", "task_list", { status: "open", projectId: project?.id })];
      break;
    case "deadlines":
      steps = [S("tasks", "Check deadlines in the next 14 days", "task_list", { status: "open", dueWithinDays: 14, projectId: project?.id }), S("rank", "Order by urgency", "task_prioritize", { tasks: "{{steps.tasks.tasks}}" })];
      break;
    case "end_of_day_review":
    case "weekly_report": {
      const d = templateToDraft(intent === "end_of_day_review" ? "end_of_day_review" : "weekly_report")!;
      steps = d.steps.filter((s) => s.tool !== "notification_send");
      break;
    }
    case "summarize_documents": {
      const latestOnly = /\bthis (pdf|document|file)\b|\bthe (pdf|document|file)\b|\blast (pdf|document|file|upload)\b/.test(t) && !e.name && !e.since;
      steps = [
        S("find", e.name ? `Find "${e.name}"` : latestOnly ? "Find the most recent document" : `Find documents${e.since ? ` added ${e.since === "today" ? "today" : "this week"}` : ""}`, "file_search", {
          query: e.name,
          since: e.since,
          extensions: /\bpdf\b/.test(t) ? [".pdf"] : [".pdf", ".docx", ".txt", ".md", ".html"],
          latest: latestOnly,
          limit: 10,
        }),
        S("process", "Read, extract, summarise, key points & action items", "document_process", { fileIds: "{{steps.find.fileIds}}" }, { when: { left: "{{steps.find.fileIds}}", op: "exists" } }),
        S("save", "Save the summary", "document_create", { title: "Document summary", markdown: "{{steps.process.markdown}}", format: "md", folder: "reports" }, { when: { left: "{{steps.find.fileIds}}", op: "exists" } }),
      ];
      break;
    }
    case "organize_files":
      steps = [
        S("scan", `Scan /${e.folder} and suggest folders`, "file_organize_plan", { folder: e.folder ?? "uploads" }),
        S("apply", "Move files (approval needed for more than 5)", "file_organize_apply", { moves: "{{steps.scan.moves}}" }, { when: { left: "{{steps.scan.moves}}", op: "exists" } }),
      ];
      break;
    case "spreadsheet_changes":
    case "spreadsheet_analyze":
      steps = [
        S("find", "Find the spreadsheet", "file_search", { query: e.name, extensions: [".xlsx", ".csv"], latest: true }),
        S(
          "analyze",
          intent === "spreadsheet_changes" ? "Compare with the previous version" : "Analyse the data",
          intent === "spreadsheet_changes" ? "spreadsheet_compare" : "data_analyze",
          { fileId: "{{steps.find.fileIds[0]}}" },
          { when: { left: "{{steps.find.fileIds}}", op: "exists" } },
        ),
      ];
      break;
    case "generate_document": {
      const format = docFormat(t);
      const fromFiles = /\b(these|my|the|uploaded|today'?s)\s+(notes|files|documents|docs)\b/.test(t);
      const title = /\binvoice\b/.test(t) ? "Invoice" : /\binternship\b/.test(t) ? "Internship report" : /\bsales\b/.test(t) ? "Sales report" : /\breport\b/.test(t) ? "Report" : "Document";
      const tableHint = format === "xlsx" || format === "csv" ? " Present the data as a Markdown table." : "";
      const fallback =
        title === "Invoice"
          ? "# Invoice\n\n**Invoice #:** 0001  \n**Date:** {{now}}  \n**Bill to:** _(client name)_\n\n| Item | Qty | Unit price | Total |\n|---|---|---|---|\n| _(item)_ | 1 | 0 | 0 |\n\n**Total due:** 0\n\n_Fill in the details above — no prices were invented._"
          : undefined;
      if (fromFiles) {
        steps.push(S("find", "Find the notes/files", "file_search", { since: /\btoday\b/.test(t) ? "today" : undefined, extensions: [".pdf", ".docx", ".txt", ".md"], limit: 10 }));
        steps.push(S("read", "Read and summarise them", "document_process", { fileIds: "{{steps.find.fileIds}}" }, { when: { left: "{{steps.find.fileIds}}", op: "exists" } }));
      }
      steps.push(
        S("write", "Write the document", "text_generate", {
          title,
          instruction: `${text}\nWrite it as a professional, well-structured document in Markdown.${tableHint} Do not invent facts, names, prices or figures that are not provided; use clear placeholders instead.`,
          context: fromFiles ? [{ label: "Source notes", text: "{{steps.read.markdown}}" }] : [],
          fallback,
        }),
      );
      steps.push(S("save", `Save as ${format.toUpperCase()}`, "document_create", { title, markdown: "{{steps.write.markdown}}", format, folder: "outputs" }));
      break;
    }
    case "research": {
      const topic = e.topic || e.query || text;
      const format = /\b(pdf|docx|word)\b/.test(t) ? docFormat(t) : "md";
      goal = `Research: ${topic}`;
      steps = [
        S("search", "Search the web (free providers)", "web_search", { query: topic, limit: 6 }),
        S("read", "Open and read the sources", "pages_read", { results: "{{steps.search.results}}", limit: 5 }),
        S("report", "Compare sources, flag conflicts & write a cited report", "research_compile", { topic, pages: "{{steps.read.pages}}" }),
        S("save", "Save the report with sources", "document_create", { title: `Research - ${topic.slice(0, 60)}`, markdown: "{{steps.report.markdown}}", format, folder: "reports" }),
      ];
      break;
    }
    case "web_screenshot":
      steps = [S("shot", "Open the page and take a screenshot", "browser_screenshot", { url: e.url, fullPage: /full/.test(t) })];
      break;
    case "web_read":
      steps = [
        S("read", "Open and read the page", "webpage_read", { url: e.url }, { fallback: { tool: "browser_open", input: { url: e.url } } }),
        S("summary", "Summarise it", "text_summarize", { title: "{{steps.read.title}}", text: "{{steps.read.text}}" }),
      ];
      break;
    case "email": {
      const subject = (/\babout\s+(.+?)(?:\s+to\s+\S+@|\.|$)/i.exec(text)?.[1] ?? text.replace(/^(please\s+)?(send|write|draft|compose)\s+(an?\s+)?e-?mail\s+/i, "")).slice(0, 80);
      steps = [S("draft", "Draft the email", "email_draft", { to: e.to ?? "", subject: subject.charAt(0).toUpperCase() + subject.slice(1), instruction: text })];
      if (e.send && e.to) steps.push(S("send", `Send the email to ${e.to} (approval required)`, "email_send", { to: e.to, subject: "{{steps.draft.subject}}", body: "{{steps.draft.body}}" }));
      break;
    }
    case "project_create":
      steps = [S("project", `Create project "${e.name}"`, "project_create", { name: e.name, kind: e.kind ?? (/\b(study|exam|course|university|school)\b/.test(t) ? "study" : /\b(business|shop|store|brand|company)\b/.test(t) ? "business" : "general") })];
      break;
    default:
      goal = "Answer";
      steps = [
        S("answer", "Think it through and answer", "text_generate", {
          title: "Answer",
          instruction: text,
          fallback: `I couldn't match that to one of my skills, and no AI model is configured to answer free-form questions.\n\n**Things I can do right now:**\n- "Plan my day" · "What should I work on next?" · "Find unfinished tasks"\n- "Remind me tomorrow to finish the report"\n- "Summarize the documents I added today" · "Organize my files"\n- "Research <topic>" · "Create a report about <topic> as PDF"\n- "Create today's Merchants content" · "Create 7 days of content"\n- "Every Monday at 8am, check my unfinished tasks and notify me"\n- "Remember that …" · "Show me today's activity"\n\nTo enable free-form answers at $0, install [Ollama](https://ollama.com) and run \`ollama pull llama3.2\`.`,
        }),
      ];
  }

  const parsed: WorkflowStep[] = steps.map((s) => stepSchema.parse(s));
  const requiresApproval = parsed.some((s) => {
    const tool = s.tool ? getTool(s.tool) : undefined;
    return tool ? typeof tool.risk === "function" || staticRisk(tool) !== "low" : s.kind === "approval";
  });
  return { goal, intent, steps: parsed, requiresApproval, projectId: project?.id ?? null, detected };
}
