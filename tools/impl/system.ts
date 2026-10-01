import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool } from "../types";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getProfile } from "@/lib/profile";
import { dayRange, formatLocal } from "@/lib/time";
import { safeFetch } from "@/lib/net";
import { notify, sendEmail, smtpConfigured } from "@/services/notifications";
import { saveFile } from "@/services/storage";
import { writeWithAI } from "@/services/documents/analyze";
import { findProjectByName } from "@/services/tasks/repo";

// ── communication ────────────────────────────────────────────────────────────
export const emailDraft = defineTool({
  name: "email_draft",
  description: "Prepare an email draft (saved to Outputs, never sent).",
  category: "communication",
  risk: "low",
  input: z.object({ to: z.string().default(""), subject: z.string().min(1), body: z.string().optional(), instruction: z.string().optional() }),
  async execute(i, ctx) {
    let body = i.body;
    if (!body) {
      const ai = await writeWithAI(ctx.db, ctx.userId, "email_draft", `Write a clear, polite email. Subject: ${i.subject}. ${i.instruction ?? ""}\nReturn only the email body.`);
      body = ai?.text ?? `Hi,\n\n${i.instruction ?? i.subject}\n\nBest regards,`;
    }
    const content = `To: ${i.to}\nSubject: ${i.subject}\n\n${body}\n`;
    const f = await saveFile(ctx.db, ctx.userId, { name: `email draft - ${i.subject.slice(0, 50)}.txt`, folder: "outputs", data: content });
    return { to: i.to, subject: i.subject, body, files: [{ id: f.id, name: f.name }], summary: `Email draft ready (not sent)`, markdown: `✉️ **Draft (not sent)**\n\n**To:** ${i.to || "_(add recipient)_"}\n**Subject:** ${i.subject}\n\n${body}` };
  },
});

export const emailSend = defineTool({
  name: "email_send",
  description: "Send an email via your own SMTP server. Always requires approval.",
  category: "communication",
  risk: "medium",
  input: z.object({ to: z.string().email(), subject: z.string().min(1), body: z.string().min(1) }),
  describe: (i) => `Send email to ${i.to}: "${i.subject}"`,
  async execute(i) {
    if (!smtpConfigured()) throw new AppError("Email sending is not configured. Add SMTP_HOST/SMTP_FROM in .env (e.g. a Gmail app password) — the draft is saved in Outputs.");
    const r = await sendEmail(i.to, i.subject, i.body);
    return { sent: r.ok, messageId: r.detail, summary: `Email sent to ${i.to}` };
  },
});

export const notificationSend = defineTool({
  name: "notification_send",
  description: "Notify you in the app (plus Telegram/email if enabled in Settings).",
  category: "communication",
  risk: "low",
  input: z.object({ title: z.string().min(1), body: z.string().default(""), level: z.enum(["info", "success", "warning", "error"]).default("info"), link: z.string().optional() }),
  async execute(i, ctx) {
    const results = await notify(ctx.db, ctx.userId, { title: i.title, body: i.body.slice(0, 3000), level: i.level, link: i.link ?? (ctx.runId ? `/runs/${ctx.runId}` : undefined) });
    const failed = results.filter((r) => !r.ok);
    return { channels: results, summary: `Notified via ${results.filter((r) => r.ok).map((r) => r.channel).join(", ")}`, warnings: failed.map((f) => `${f.channel}: ${f.detail}`) };
  },
});

export const webhookCall = defineTool({
  name: "webhook_call",
  description: "Call an external webhook URL (e.g. to trigger another service). Requires approval.",
  category: "communication",
  risk: "medium",
  retryable: true,
  input: z.object({ url: z.string().url(), method: z.enum(["GET", "POST", "PUT"]).default("POST"), body: z.any().optional() }),
  describe: (i) => `${i.method} ${i.url}`,
  async execute(i) {
    const { res, body } = await safeFetch(i.url, {
      method: i.method,
      headers: { "content-type": "application/json" },
      body: i.method === "GET" ? undefined : JSON.stringify(i.body ?? {}),
    });
    if (!res.ok) throw new Error(`Webhook returned HTTP ${res.status}`);
    return { status: res.status, response: body.toString("utf8").slice(0, 2000), summary: `Webhook responded ${res.status}` };
  },
});

// ── memory ───────────────────────────────────────────────────────────────────
const categoryEnum = z.enum(["preference", "project", "business", "task", "general"]);

export const memorySave = defineTool({
  name: "memory_save",
  description: "Remember a fact or preference for future work.",
  category: "memory",
  risk: "low",
  input: z.object({ category: categoryEnum.default("general"), subject: z.string().min(1).max(120), content: z.string().min(1).max(4000), projectName: z.string().optional() }),
  async execute(i, ctx) {
    if (/\b(password|passcode|pin|cvv|card number|ssn|social security|private key|seed phrase)\b/i.test(i.content))
      throw new AppError("I don't store passwords, card numbers or other secrets in memory. Keep those in a password manager.");
    const projectId = i.projectName ? (await findProjectByName(ctx.db, i.projectName))?.id ?? null : ctx.projectId ?? null;
    const existing = await ctx.db.one<{ id: string }>("select id from memories where lower(subject) = lower($1) and category = $2", [i.subject, i.category]);
    if (existing) await ctx.db.query("update memories set content = $2, project_id = coalesce($3, project_id) where id = $1", [existing.id, i.content, projectId]);
    else await ctx.db.query("insert into memories(user_id, project_id, category, subject, content, source) values ($1,$2,$3,$4,$5,'user')", [ctx.userId, projectId, i.category, i.subject, i.content]);
    return { updated: Boolean(existing), summary: `${existing ? "Updated" : "Saved"} memory: ${i.subject}`, markdown: `🧠 ${existing ? "Updated" : "Remembered"} (${i.category}): **${i.subject}** — ${i.content}` };
  },
});

export const memorySearch = defineTool({
  name: "memory_search",
  description: "Show what I remember (optionally about a subject or project).",
  category: "memory",
  risk: "low",
  input: z.object({ query: z.string().optional(), category: categoryEnum.optional() }),
  async execute(i, ctx) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (i.category) {
      params.push(i.category);
      where.push(`m.category = $${params.length}`);
    }
    if (i.query?.trim()) {
      params.push(`%${i.query.trim().replace(/[%_]/g, "")}%`);
      where.push(`(m.subject ilike $${params.length} or m.content ilike $${params.length} or p.name ilike $${params.length})`);
    }
    const rows = await ctx.db.query<{ id: string; category: string; subject: string; content: string; project: string | null; updated_at: string }>(
      `select m.id, m.category, m.subject, m.content, p.name as project, m.updated_at from memories m left join projects p on p.id = m.project_id
       ${where.length ? `where ${where.join(" and ")}` : ""} order by m.importance desc, m.updated_at desc limit 100`,
      params,
    );
    let projectInfo = "";
    if (i.query) {
      const proj = await findProjectByName(ctx.db, i.query);
      if (proj) {
        const stats = await ctx.db.one<{ open: string; done: string }>(
          "select count(*) filter (where status in ('todo','in_progress','waiting')) as open, count(*) filter (where status = 'completed') as done from tasks where project_id = $1",
          [proj.id],
        );
        projectInfo = `\n\n**Project ${proj.name}:** ${stats?.open ?? 0} open tasks, ${stats?.done ?? 0} completed.`;
      }
    }
    const md = rows.length
      ? rows.map((r) => `- **${r.subject}** _(${r.category}${r.project ? ` · ${r.project}` : ""})_: ${r.content}`).join("\n") + projectInfo
      : `I don't have anything stored${i.query ? ` about "${i.query}"` : ""} yet.${projectInfo}`;
    return { memories: rows, count: rows.length, summary: `${rows.length} memories`, markdown: md };
  },
});

export const memoryForget = defineTool({
  name: "memory_forget",
  description: "Forget stored memories matching a subject.",
  category: "memory",
  risk: "low",
  input: z.object({ query: z.string().min(2) }),
  async execute(i, ctx) {
    const q = `%${i.query.trim().replace(/[%_]/g, "")}%`;
    const rows = await ctx.db.query<{ subject: string }>("delete from memories where subject ilike $1 or content ilike $1 returning subject", [q]);
    return { forgotten: rows.map((r) => r.subject), summary: `Forgot ${rows.length} memory item(s)`, markdown: rows.length ? `🧹 Forgotten:\n${rows.map((r) => `- ${r.subject}`).join("\n")}` : `Nothing matching "${i.query}" was stored.` };
  },
});

// ── system ───────────────────────────────────────────────────────────────────
export const activitySummary = defineTool({
  name: "activity_summary",
  description: "Show the activity timeline for today (or the last N hours).",
  category: "system",
  risk: "low",
  input: z.object({ hours: z.number().int().min(1).max(24 * 14).optional() }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const since = i.hours ? new Date(Date.now() - i.hours * 3600_000) : dayRange(profile.timezone).start;
    const rows = await ctx.db.query<{ created_at: string; message: string; status: string; tool: string | null }>(
      "select created_at, message, status, tool from activity_logs where created_at >= $1 order by created_at desc limit 200",
      [since.toISOString()],
    );
    const icon = { success: "✅", error: "❌", warning: "⚠️", info: "•" } as Record<string, string>;
    const md = rows.length
      ? rows
          .reverse()
          .map((r) => `- \`${formatLocal(r.created_at, profile.timezone, { timeStyle: "short" })}\` ${icon[r.status] ?? "•"} ${r.message}`)
          .join("\n")
      : "No activity recorded yet today.";
    return { count: rows.length, markdown: `## Activity${i.hours ? ` (last ${i.hours}h)` : " today"}\n\n${md}`, summary: `${rows.length} events` };
  },
});

const DATA_ENTITIES = {
  tasks: "select status, count(*)::int as n from tasks group by status order by n desc",
  projects: "select name, status, kind from projects order by created_at desc limit 50",
  files: "select folder, count(*)::int as n from files where not archived group by folder order by n desc",
  automations: "select name, enabled, trigger_type, last_run_at from automations order by created_at desc limit 50",
  runs: "select status, count(*)::int as n from automation_runs where created_at > now() - interval '7 days' group by status",
  content: "select status, count(*)::int as n from content_posts group by status",
} as const;

export const databaseQuery = defineTool({
  name: "database_query",
  description: "Read-only overview of your data (tasks, projects, files, automations, runs, content). No raw SQL is accepted.",
  category: "system",
  risk: "low",
  input: z.object({ entity: z.enum(Object.keys(DATA_ENTITIES) as [keyof typeof DATA_ENTITIES, ...(keyof typeof DATA_ENTITIES)[]]) }),
  async execute(i, ctx) {
    const rows = await ctx.db.query(DATA_ENTITIES[i.entity]);
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const md = rows.length ? `| ${headers.join(" | ")} |\n|${headers.map(() => "---").join("|")}|\n${rows.map((r) => `| ${headers.map((h) => String((r as Record<string, unknown>)[h] ?? "")).join(" | ")} |`).join("\n")}` : "No data.";
    return { rows, markdown: md, summary: `${rows.length} row(s)` };
  },
});

const run = promisify(execFile);

export const shellCommand = defineTool({
  name: "shell_command",
  description: "Run a shell command in the storage folder. Disabled unless SHELL_COMMANDS_ENABLED=true; always needs explicit confirmation.",
  category: "system",
  risk: "high",
  timeoutMs: 60_000,
  input: z.object({ command: z.string().min(1).max(500) }),
  describe: (i) => `Run shell command: ${i.command}`,
  async execute(i) {
    if (!env().SHELL_COMMANDS_ENABLED) throw new AppError("The shell_command tool is disabled. Set SHELL_COMMANDS_ENABLED=true in .env to allow it.");
    const cwd = path.resolve(/* turbopackIgnore: true */ process.cwd(), env().STORAGE_DIR);
    const { stdout, stderr } = await run("sh", ["-c", i.command], { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 });
    return { stdout: stdout.slice(0, 10_000), stderr: stderr.slice(0, 5000), summary: "Command finished", markdown: "```\n" + (stdout || stderr).slice(0, 4000) + "\n```" };
  },
});

export const systemTools = [emailDraft, emailSend, notificationSend, webhookCall, memorySave, memorySearch, memoryForget, activitySummary, databaseQuery, shellCommand];
