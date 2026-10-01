import { describe, expect, it } from "vitest";
import { parseTaskText } from "@/services/tasks/parse";
import { parseRecurrence, parseTimeOfDay } from "@/lib/recurrence";
import { detectIntent } from "@/agents/intent";
import { parseAutomationText, looksLikeAutomation } from "@/workflows/nl-automation";

const NOW = new Date("2026-09-30T08:00:00Z"); // a Wednesday

describe("task parser (natural language → structured task)", () => {
  it("handles 'remind me tomorrow to …'", () => {
    const t = parseTaskText("Remind me tomorrow to finish the report.", { now: NOW, timezone: "UTC" });
    expect(t.title).toBe("Finish the report");
    expect(t.isReminder).toBe(true);
    expect(t.dueAt?.slice(0, 10)).toBe("2026-10-01");
    expect(t.remindAt).toBe("2026-10-01T09:00:00.000Z");
  });
  it("extracts priority, tags, time and duration", () => {
    const t = parseTaskText("Add a high priority task to call the supplier by Friday 3pm #merchants (30 min)", { now: NOW, timezone: "UTC" });
    expect(t.title).toBe("Call the supplier");
    expect(t.priority).toBe("high");
    expect(t.tags).toEqual(["merchants"]);
    expect(t.estimatedMinutes).toBe(30);
    expect(t.dueAt).toBe("2026-10-02T15:00:00.000Z");
  });
  it("respects the user's timezone", () => {
    const t = parseTaskText("Submit form tomorrow at 9am", { now: NOW, timezone: "Asia/Karachi" });
    expect(t.dueAt).toBe("2026-10-01T04:00:00.000Z"); // 09:00 PKT = 04:00 UTC
  });
  it("detects recurrence", () => {
    const t = parseTaskText("Remind me every Friday to send invoices", { now: NOW });
    expect(t.title).toBe("Send invoices");
    expect(t.recurrence).toBe("0 9 * * 5");
  });
  it("never returns an empty title", () => {
    expect(parseTaskText("tomorrow", { now: NOW }).title.length).toBeGreaterThan(0);
  });
});

describe("recurrence parser", () => {
  it.each([
    ["every day at 8 am", "0 8 * * *"],
    ["every morning", "0 8 * * *"],
    ["every Monday morning", "0 8 * * 1"],
    ["each Friday at 17:30", "30 17 * * 5"],
    ["every weekday at 9", "0 9 * * 1-5"],
    ["every 2 hours", "0 */2 * * *"],
    ["post every day at 8 PM", "0 20 * * *"],
    ["every month on the 15th", "0 9 15 * *"],
  ])("%s → %s", (text, cron) => expect(parseRecurrence(text)?.cron).toBe(cron));
  it("returns null without a recurrence", () => expect(parseRecurrence("tomorrow at 5")).toBeNull());
  it("parses times", () => {
    expect(parseTimeOfDay("at 8:30pm")).toEqual({ h: 20, m: 30 });
    expect(parseTimeOfDay("noon")).toEqual({ h: 12, m: 0 });
  });
});

describe("intent detection", () => {
  it.each([
    ["Plan my day.", "plan_day"],
    ["Prepare tomorrow's schedule.", "plan_tomorrow"],
    ["Summarize this PDF.", "summarize_documents"],
    ["Summarize the documents I added today.", "summarize_documents"],
    ["Organize my files.", "organize_files"],
    ["Research quantum batteries", "research"],
    ["Create a task for tomorrow to buy flour", "task_create"],
    ["Remind me every Friday to back up files", "task_create"],
    ["What should I work on next?", "what_next"],
    ["Find unfinished work.", "unfinished_tasks"],
    ["Check my project deadlines.", "deadlines"],
    ["Show my active automations.", "automation_list"],
    ["Pause all automations.", "automation_pause_all"],
    ["Why did this automation fail?", "explain_failure"],
    ["Retry it.", "retry"],
    ["Show me today's activity.", "show_activity"],
    ["Create content for Merchants.", "content_create"],
    ["Create 7 days of content.", "content_plan"],
    ["Create today's Merchants post about the Crown Crust Pizza and publish it to Instagram", "content_publish"],
    ["Read this spreadsheet and tell me what changed.", "spreadsheet_changes"],
    ["Prepare a weekly report.", "weekly_report"],
    ["Create an Excel sales report.", "generate_document"],
    ["Every Friday prepare weekly report.", "create_automation"],
    ["Monitor this website https://example.com", "create_automation"],
    ["Remember that our brand color is gold", "memory_save"],
    ["Forget the brand color", "memory_forget"],
  ])("%s → %s", (text, intent) => expect(detectIntent(text).intent).toBe(intent));
});

describe("natural-language automation creation", () => {
  it("builds the Monday planning workflow from the spec", () => {
    const d = parseAutomationText("Every Monday morning, check my unfinished tasks, identify the important ones, create a schedule for the week, and notify me.")!;
    expect(d.trigger).toMatchObject({ type: "schedule", cron: "0 8 * * 1" });
    expect(d.steps.map((s) => s.tool)).toEqual(["task_list", "task_prioritize", "schedule_generate", "document_create", "notification_send"]);
    expect(d.steps[2].input?.tasks).toBe("{{steps.rank.tasks}}");
  });
  it("handles file-added triggers", () => {
    const d = parseAutomationText("Whenever I upload a PDF, summarize it.")!;
    expect(d.trigger).toEqual({ type: "file_added", extensions: [".pdf"] });
    expect(d.steps[0].tool).toBe("document_process");
  });
  it("handles website monitoring", () => {
    const d = parseAutomationText("Monitor https://example.com/prices every 2 hours")!;
    expect(d.steps[0]).toMatchObject({ tool: "website_check", input: { url: "https://example.com/prices" } });
    expect(d.steps[1].when).toBeDefined();
  });
  it("content automation gates publishing on quality", () => {
    const d = parseAutomationText("Post every day at 8 PM")!;
    expect(d.trigger).toMatchObject({ cron: "0 20 * * *" });
    expect(d.steps.map((s) => s.kind ?? "tool")).toContain("condition");
    expect(d.steps.at(-2)?.tool).toBe("social_publish");
  });
  it("treats 'remind me every…' as a recurring task, not an automation", () => expect(looksLikeAutomation("Remind me every Friday to call mom")).toBe(false));
  it("returns null when nothing is recognised", () => expect(parseAutomationText("every day do the thing")).toBeNull());
});
