import { z } from "zod";
import { defineTool } from "../types";
import { AppError } from "@/lib/errors";
import { saveSettings } from "@/lib/settings";
import { parseAutomationText, describeTrigger } from "@/workflows/nl-automation";
import type { AutomationDraft } from "@/workflows/types";

export const automationPropose = defineTool({
  name: "automation_propose",
  description: "Turn a natural-language request into an automation draft (trigger + steps). Nothing is created until you click CREATE.",
  category: "automation",
  risk: "low",
  input: z.object({ text: z.string().min(3) }),
  async execute(i) {
    const draft = parseAutomationText(i.text);
    if (!draft) {
      return {
        proposal: null,
        summary: "Couldn't map that to steps",
        markdown: `I understood this as an automation, but couldn't work out the steps. Try phrasing it like:\n\n- "Every Monday at 8am, check my unfinished tasks, identify the important ones, create a schedule for the week, and notify me."\n- "Whenever I upload a PDF, summarise it."\n- "Monitor https://example.com every 2 hours."\n\nOr build it visually in **Automations → New**.`,
      };
    }
    return { proposal: draft, summary: `Proposed automation "${draft.name}"`, markdown: proposalMarkdown(draft) };
  },
});

export function proposalMarkdown(d: AutomationDraft): string {
  return `### Proposed automation: ${d.name}\n\n**Trigger:** ${describeTrigger(d.trigger)}\n\n${d.steps
    .map((s) => `↓\n\n**${s.action}**${s.tool ? ` · \`${s.tool}\`` : ""}${s.when ? " _(only if condition holds)_" : ""}`)
    .join("\n\n")}\n\nCreate this automation?`;
}

export const automationControl = defineTool({
  name: "automation_control",
  description: "Pause/resume all automations, pause/resume one by name, or list active automations.",
  category: "automation",
  risk: "low",
  input: z.object({ action: z.enum(["pause_all", "resume_all", "pause", "resume", "list"]), name: z.string().optional() }),
  async execute(i, ctx) {
    if (i.action === "list") {
      const rows = await ctx.db.query<{ id: string; name: string; enabled: boolean; trigger_type: string; next_run_at: Date | null; last_run_at: Date | null }>(
        "select id, name, enabled, trigger_type, next_run_at, last_run_at from automations order by enabled desc, name",
      );
      const md = rows.length
        ? rows.map((r) => `- ${r.enabled ? "🟢" : "⏸️"} **[${r.name}](/automations/${r.id})** · ${r.trigger_type}${r.next_run_at ? ` · next ${new Date(r.next_run_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}`).join("\n")
        : "You have no automations yet. Try: _\"Every morning at 8 AM create my work plan.\"_";
      return { automations: rows, summary: `${rows.filter((r) => r.enabled).length} active of ${rows.length}`, markdown: `${ctx.settings.automation.paused ? "⚠️ **All automations are paused.**\n\n" : ""}${md}` };
    }
    if (i.action === "pause_all" || i.action === "resume_all") {
      const paused = i.action === "pause_all";
      await saveSettings(ctx.db, ctx.userId, { automation: { paused } });
      return { summary: paused ? "All automations paused" : "Automations resumed", markdown: paused ? "⏸️ All automations are **paused**. Nothing will run on a schedule or trigger until you resume." : "▶️ Automations **resumed**." };
    }
    if (!i.name) throw new AppError("Which automation? Please include its name.");
    const a = await ctx.db.one<{ id: string; name: string }>("select id, name from automations where name ilike $1 order by length(name) limit 1", [`%${i.name.replace(/[%_]/g, "")}%`]);
    if (!a) throw new AppError(`No automation matching "${i.name}"`);
    const { updateAutomation } = await import("@/automations/service");
    await updateAutomation(ctx.db, ctx.userId, a.id, { enabled: i.action === "resume" });
    return { summary: `${a.name} ${i.action === "resume" ? "resumed" : "paused"}`, markdown: `${i.action === "resume" ? "▶️" : "⏸️"} **${a.name}** ${i.action === "resume" ? "resumed" : "paused"}.` };
  },
});

interface FailedRun {
  id: string;
  title: string;
  error: string | null;
  created_at: Date;
  automation_id: string | null;
  plan: { steps: unknown[] };
  trigger_data: Record<string, unknown> | null;
  source: string;
  project_id: string | null;
  command_text: string | null;
  intent: string | null;
}

async function findFailedRun(ctx: Parameters<typeof automationControl.execute>[1], name?: string, runId?: string) {
  if (runId) return ctx.db.one<FailedRun>("select * from automation_runs where id = $1", [runId]);
  return ctx.db.one<FailedRun>(
    `select r.* from automation_runs r left join automations a on a.id = r.automation_id
     where r.status = 'failed' and ($1::text is null or r.title ilike $1 or a.name ilike $1) and r.id is distinct from $2
     order by r.created_at desc limit 1`,
    [name ? `%${name.replace(/[%_]/g, "")}%` : null, ctx.runId ?? null],
  );
}

export const runExplain = defineTool({
  name: "run_explain",
  description: "Explain why an automation or task run failed, in plain language.",
  category: "automation",
  risk: "low",
  input: z.object({ name: z.string().optional(), runId: z.string().uuid().optional() }),
  async execute(i, ctx) {
    const run = await findFailedRun(ctx, i.name, i.runId);
    if (!run) return { summary: "No failed runs", markdown: `I couldn't find a failed run${i.name ? ` matching "${i.name}"` : ""}. 🎉` };
    const step = await ctx.db.one<{ action: string; tool: string | null; error: string | null; attempts: number }>(
      "select action, tool, error, attempts from workflow_steps where run_id = $1 and status = 'failed' order by step_index limit 1",
      [run.id],
    );
    const md = `### Why "${run.title}" failed\n\n- **When:** ${new Date(run.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC\n- **Failed step:** ${step?.action ?? "unknown"}${step?.tool ? ` (\`${step.tool}\`)` : ""}\n- **Attempts:** ${step?.attempts ?? 0}\n- **Reason:** ${step?.error ?? run.error ?? "Unknown"}\n\n[Open the run](/runs/${run.id}) · Say **"retry it"** to run it again.`;
    return { runId: run.id, summary: `Failed at: ${step?.action ?? "unknown step"}`, markdown: md };
  },
});

export const runRetry = defineTool({
  name: "run_retry",
  description: "Retry the most recent failed run (or a specific run) from the start.",
  category: "automation",
  risk: "low",
  input: z.object({ name: z.string().optional(), runId: z.string().uuid().optional() }),
  async execute(i, ctx) {
    const run = await findFailedRun(ctx, i.name, i.runId);
    if (!run) return { summary: "Nothing to retry", markdown: "There's no failed run to retry." };
    const { startRun } = await import("@/automations/service");
    const newId = await startRun({
      userId: ctx.userId,
      title: `${run.title} (retry)`,
      source: run.source as "command",
      automationId: run.automation_id,
      projectId: run.project_id,
      triggerData: run.trigger_data,
      commandText: run.command_text,
      plan: { ...(run.plan as { goal: string; intent: string; steps: never[]; requiresApproval: boolean }) },
    });
    return { newRunId: newId, summary: `Retrying "${run.title}"`, markdown: `🔁 Retrying **${run.title}** — [follow the new run](/runs/${newId}).` };
  },
});

export const automationTools = [automationPropose, automationControl, runExplain, runRetry];
