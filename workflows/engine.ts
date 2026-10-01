import { sql, userDb, type Db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSettings, type Settings } from "@/lib/settings";
import { effectiveMode } from "@/lib/permissions";
import { explainError } from "@/lib/errors";
import { backoffMs, circuitOpen, recordFailure, recordSuccess, sleep, withTimeout } from "@/lib/circuit";
import { evaluateCondition, resolveTemplates } from "@/lib/template";
import { getTool } from "@/tools/registry";
import type { PermissionMode, RiskLevel, ToolContext, ToolOutputBase } from "@/tools/types";
import { enqueue } from "@/workers/queue";
import { notify } from "@/services/notifications";
import type { Plan, WorkflowStep } from "./types";

/**
 * EXECUTION ENGINE
 *
 * A run is a persisted plan (list of steps) plus a context of step outputs. `advanceRun` executes
 * steps from `current_step` until the run completes, fails, or has to pause (approval / delay).
 * Pausing is durable: resuming is just another `advanceRun` job.
 */

interface RunRow {
  id: string;
  user_id: string;
  automation_id: string | null;
  project_id: string | null;
  source: string;
  title: string;
  status: string;
  plan: Plan;
  context: RunContext;
  current_step: number;
  trigger_data: Record<string, unknown> | null;
}

interface RunContext {
  outputs?: Record<string, unknown>;
  delays?: Record<string, boolean>;
  skip?: Record<string, boolean>;
  files?: { id: string; name: string }[];
  warnings?: string[];
}

interface ApprovalRow {
  id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  payload: { input?: unknown };
  edited_payload: { input?: unknown } | null;
}

const TEXT_LIMIT = 20_000;

/** Keep the stored context small: trim very long strings in outputs. */
function compact(v: unknown, depth = 0): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v.length > TEXT_LIMIT ? `${v.slice(0, TEXT_LIMIT)}…` : v;
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => compact(x, depth + 1));
  if (v && typeof v === "object" && depth < 8) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x, depth + 1)]));
  return v;
}

async function upsertStep(db: Db, run: RunRow, idx: number, step: WorkflowStep, patch: Record<string, unknown>) {
  const cols = Object.keys(patch);
  const vals = Object.values(patch).map((v) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v));
  await db.query(
    `insert into workflow_steps(user_id, run_id, step_index, step_key, kind, tool, action${cols.map((c) => `, ${c}`).join("")})
     values ($1,$2,$3,$4,$5,$6,$7${cols.map((_, i) => `, $${i + 8}`).join("")})
     on conflict (run_id, step_key) do update set ${["step_index = excluded.step_index", ...cols.map((c) => `${c} = excluded.${c}`)].join(", ")}`,
    [run.user_id, run.id, idx, step.id, step.kind, step.tool ?? null, step.action, ...vals],
  );
}

async function setRun(db: Db, runId: string, patch: Record<string, unknown>) {
  const cols = Object.keys(patch);
  await db.query(
    `update automation_runs set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`,
    [runId, ...Object.values(patch).map((v) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v))],
  );
}

function riskOf(tool: NonNullable<ReturnType<typeof getTool>>, input: unknown): RiskLevel {
  try {
    return typeof tool.risk === "function" ? tool.risk(input) : tool.risk;
  } catch {
    return "medium";
  }
}

async function permissionFor(db: Db, toolName: string, risk: RiskLevel, settings: Settings): Promise<PermissionMode> {
  const o = await db.one<{ mode: PermissionMode }>("select mode from tool_permissions where tool_name = $1", [toolName]);
  const globalTool = await db.one<{ enabled: boolean }>("select enabled from tools where name = $1", [toolName]);
  if (globalTool && !globalTool.enabled) return "disabled";
  if (toolName.startsWith("browser_") && !settings.browser.enabled) return "disabled";
  return effectiveMode(risk, o?.mode);
}

function composeResult(run: RunRow, ctx: RunContext) {
  const outputs = ctx.outputs ?? {};
  const steps = run.plan.steps;
  let markdown = "";
  let summary = "";
  let proposal: unknown = undefined;
  let postId: string | undefined;
  for (const s of steps) {
    const o = outputs[s.id] as (ToolOutputBase & { proposal?: unknown; postId?: string }) | undefined;
    if (!o) continue;
    if (o.markdown) markdown = o.markdown;
    if (o.summary) summary = o.summary;
    if (o.proposal) proposal = o.proposal;
    if (o.postId) postId = o.postId;
  }
  const lastTool = [...steps].reverse().find((s) => outputs[s.id]);
  if (lastTool && (outputs[lastTool.id] as ToolOutputBase)?.markdown) markdown = (outputs[lastTool.id] as ToolOutputBase).markdown!;
  // Prefer the richest "document-like" markdown when the last step is a notification or file save.
  if (lastTool && ["notification_send", "document_create", "file_write"].includes(lastTool.tool ?? "")) {
    const rich = [...steps].reverse().find((s) => s.tool && !["notification_send"].includes(s.tool) && (outputs[s.id] as ToolOutputBase)?.markdown);
    if (rich) markdown = (outputs[rich.id] as ToolOutputBase).markdown!;
  }
  return { summary: summary || "Done", markdown, files: ctx.files ?? [], warnings: [...new Set(ctx.warnings ?? [])].slice(0, 20), proposal, postId };
}

async function executeTool(
  toolName: string,
  input: unknown,
  tctx: ToolContext,
  opts: { retries: number; timeoutMs: number; onAttemptFail: (attempt: number, err: unknown) => Promise<void> },
): Promise<{ output: ToolOutputBase & Record<string, unknown>; attempts: number }> {
  const tool = getTool(toolName)!;
  const parsed = tool.input.parse(input);
  const breaker = `tool:${tctx.userId}:${toolName}`;
  if (circuitOpen(breaker, 120_000)) throw new Error(`${toolName} failed several times in a row and is paused for 2 minutes (circuit breaker). Try again shortly.`);
  const maxAttempts = 1 + (tool.retryable ? opts.retries : 0);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const output = (await withTimeout(tool.execute(parsed, tctx), tool.timeoutMs ?? opts.timeoutMs, toolName)) as ToolOutputBase & Record<string, unknown>;
      const problem = tool.verify?.(output, parsed);
      if (problem) throw new Error(`Verification failed: ${problem}`);
      recordSuccess(breaker);
      return { output, attempts: attempt };
    } catch (err) {
      lastErr = err;
      recordFailure(breaker, 4);
      await opts.onAttemptFail(attempt, err);
      if (attempt < maxAttempts) await sleep(backoffMs(attempt));
    }
  }
  throw Object.assign(lastErr instanceof Error ? lastErr : new Error(String(lastErr)), { attempts: maxAttempts });
}

export async function advanceRun(runId: string): Promise<void> {
  // Claim the run (only one worker advances a run at a time).
  const run = await sql.one<RunRow>(
    `update automation_runs set status = 'running', started_at = coalesce(started_at, now()) where id = $1 and status in ('queued','waiting','approval_required') returning *`,
    [runId],
  );
  if (!run) return;
  const db = userDb(run.user_id);
  const settings = await getSettings(db);
  const ctx: RunContext = { outputs: {}, delays: {}, skip: {}, files: [], warnings: [], ...(run.context ?? {}) };
  const steps = run.plan.steps;
  const log = (message: string, status: "info" | "success" | "warning" | "error" = "info", details?: unknown, tool?: string | null) =>
    logActivity(db, { userId: run.user_id, runId: run.id, category: run.source, action: "run.step", tool, status, message, details });

  if (run.current_step === 0 && !Object.keys(ctx.outputs ?? {}).length) await log(`Started: ${run.title}`);

  for (let i = run.current_step; i < steps.length; i++) {
    const step = steps[i];
    const scope = { steps: ctx.outputs, trigger: run.trigger_data ?? {}, run: { id: run.id, title: run.title }, now: new Date().toISOString() };
    const progress = Math.round((i / steps.length) * 100);
    await setRun(db, run.id, { current_step: i, progress, context: ctx });

    if (ctx.skip?.[step.id] || (step.when && !safeEval(step.when, scope))) {
      await upsertStep(db, run, i, step, { status: "skipped", finished_at: new Date() });
      continue;
    }

    // ── condition ──
    if (step.kind === "condition") {
      const ok = step.condition ? safeEval(step.condition, scope) : true;
      await upsertStep(db, run, i, step, { status: "completed", output: { result: ok }, finished_at: new Date() });
      ctx.outputs![step.id] = { result: ok };
      if (!ok) {
        if (step.onFalse === "skip_next" && steps[i + 1]) ctx.skip![steps[i + 1].id] = true;
        else {
          await log(`Condition "${step.action}" was not met — stopping here.`, "info");
          for (let j = i + 1; j < steps.length; j++) await upsertStep(db, run, j, steps[j], { status: "skipped" });
          return finish(db, run, ctx, "completed", log);
        }
      }
      continue;
    }

    // ── delay ──
    if (step.kind === "delay") {
      if (!ctx.delays![step.id]) {
        ctx.delays![step.id] = true;
        const mins = step.delayMinutes ?? 1;
        await upsertStep(db, run, i, step, { status: "running", started_at: new Date() });
        await setRun(db, run.id, { status: "waiting", current_step: i, context: ctx });
        await enqueue("run.advance", { runId: run.id }, { userId: run.user_id, runAt: new Date(Date.now() + mins * 60_000) });
        await log(`Waiting ${mins} minute(s) before continuing`);
        return;
      }
      await upsertStep(db, run, i, step, { status: "completed", finished_at: new Date() });
      continue;
    }

    // ── explicit approval gate ──
    if (step.kind === "approval") {
      const decision = await db.one<ApprovalRow>("select * from approvals where run_id = $1 and step_key = $2 order by created_at desc limit 1", [run.id, step.id]);
      if (decision?.status === "approved") {
        await upsertStep(db, run, i, step, { status: "completed", finished_at: new Date() });
        continue;
      }
      if (decision?.status === "rejected") return cancelRun(db, run, i, step, ctx, log);
      if (!decision) await requestApproval(db, run, i, step, { kind: "workflow", title: step.message ?? step.action, reason: step.message ?? "This workflow asks for your go-ahead before continuing.", risk: "medium", payload: {} }, log, ctx);
      else await setRun(db, run.id, { status: "approval_required", current_step: i, context: ctx });
      return;
    }

    // ── tool ──
    const tool = step.tool ? getTool(step.tool) : undefined;
    if (!tool) return failRun(db, run, i, step, ctx, `Unknown tool "${step.tool}"`, log);

    let input: unknown;
    try {
      input = resolveTemplates(step.input ?? {}, scope);
    } catch (err) {
      return failRun(db, run, i, step, ctx, `Could not prepare inputs: ${explainError(err)}`, log);
    }
    const decision = await db.one<ApprovalRow>("select * from approvals where run_id = $1 and step_key = $2 order by created_at desc limit 1", [run.id, step.id]);
    if (decision?.status === "approved") {
      // Run exactly what was approved (or the user's edit) — never re-resolved inputs.
      input = decision.edited_payload?.input ?? decision.payload.input ?? input;
    } else if (decision?.status === "rejected") {
      return cancelRun(db, run, i, step, ctx, log);
    }

    const items: unknown = step.forEach ? resolveTemplates<unknown>(step.forEach, scope) : undefined;
    if (step.forEach && !Array.isArray(items)) {
      await upsertStep(db, run, i, step, { status: "skipped", output: { note: "Nothing to loop over" }, finished_at: new Date() });
      ctx.outputs![step.id] = { items: [], summary: "Nothing to process" };
      continue;
    }

    const parsedInput = tool.input.safeParse(input);
    if (!step.forEach && !parsedInput.success) {
      return failRun(db, run, i, step, ctx, `Invalid input for ${tool.name}: ${parsedInput.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`, log);
    }
    const risk = riskOf(tool, parsedInput.success ? parsedInput.data : input);
    let mode = await permissionFor(db, tool.name, risk, settings);
    const toolCtx: ToolContext = {
      userId: run.user_id,
      runId: run.id,
      projectId: run.project_id,
      db,
      settings,
      log: (m, s, d) => log(m, s, d, tool.name),
    };
    if (mode === "approval" && decision?.status !== "approved" && tool.autoApprove && parsedInput.success) {
      if (await tool.autoApprove(parsedInput.data, toolCtx).catch(() => false)) {
        mode = "auto";
        await log(`AUTO MODE: ${tool.name} approved automatically by your rules`, "info", undefined, tool.name);
      }
    }
    if (mode === "disabled") return failRun(db, run, i, step, ctx, `The tool "${tool.name}" is disabled in your settings.`, log);
    if ((mode === "approval" || mode === "confirm") && decision?.status !== "approved") {
      let desc = tool.describe && parsedInput.success ? tool.describe(parsedInput.data) : step.action;
      if (tool.describeAsync && parsedInput.success) desc = await tool.describeAsync(parsedInput.data, toolCtx).catch(() => desc);
      await requestApproval(
        db,
        run,
        i,
        step,
        {
          kind: tool.name === "social_publish" ? "content_publish" : "tool",
          title: desc,
          reason: `${run.title}: step "${step.action}" uses ${tool.name} (${risk} risk).`,
          risk,
          payload: { tool: tool.name, input: parsedInput.success ? parsedInput.data : input, forEach: items ?? null },
          confirm: mode === "confirm",
        },
        log,
        ctx,
      );
      return;
    }

    await upsertStep(db, run, i, step, { status: "running", input: compact(input), risk_level: risk, started_at: new Date() });
    await log(`${step.action}…`, "info", undefined, tool.name);
    const retries = step.retries ?? settings.automation.maxRetries;
    const timeoutMs = settings.automation.stepTimeoutSeconds * 1000;
    try {
      let output: ToolOutputBase & Record<string, unknown>;
      let attempts = 1;
      const onAttemptFail = async (attempt: number, err: unknown) => {
        await log(`Attempt ${attempt} of "${step.action}" failed: ${explainError(err)}`, "warning", undefined, tool.name);
      };
      if (step.forEach) {
        const results: unknown[] = [];
        const errors: string[] = [];
        for (const item of (items as unknown[]).slice(0, 100)) {
          try {
            const r = await executeTool(tool.name, resolveTemplates(step.input ?? {}, { ...scope, item }), toolCtx, { retries, timeoutMs, onAttemptFail });
            results.push(r.output);
            attempts = Math.max(attempts, r.attempts);
          } catch (err) {
            errors.push(explainError(err));
            if (step.onError !== "continue") throw err;
          }
        }
        output = {
          items: results,
          count: results.length,
          summary: `${step.action}: ${results.length} done${errors.length ? `, ${errors.length} failed` : ""}`,
          markdown: results.map((r) => (r as ToolOutputBase).markdown).filter(Boolean).join("\n\n"),
          files: results.flatMap((r) => (r as ToolOutputBase).files ?? []),
          warnings: errors,
        };
      } else {
        const r = await executeTool(tool.name, input, toolCtx, { retries, timeoutMs, onAttemptFail });
        output = r.output;
        attempts = r.attempts;
      }
      ctx.outputs![step.id] = compact(output);
      if (output.files?.length) ctx.files = [...(ctx.files ?? []), ...output.files];
      if (output.warnings?.length) ctx.warnings = [...(ctx.warnings ?? []), ...output.warnings];
      await upsertStep(db, run, i, step, { status: "completed", output: compact(output), attempts, finished_at: new Date(), error: null });
      await log(output.summary ?? `${step.action} — done`, "success", undefined, tool.name);
    } catch (err) {
      const message = explainError(err);
      const attempts = (err as { attempts?: number }).attempts ?? 1;
      // fallback tool
      if (step.fallback && getTool(step.fallback.tool)) {
        await log(`Trying fallback ${step.fallback.tool} after: ${message}`, "warning", undefined, tool.name);
        try {
          const r = await executeTool(step.fallback.tool, resolveTemplates(step.fallback.input, scope), toolCtx, { retries: 0, timeoutMs, onAttemptFail: async () => {} });
          ctx.outputs![step.id] = compact(r.output);
          await upsertStep(db, run, i, step, { status: "completed", output: compact(r.output), attempts: attempts + 1, finished_at: new Date(), error: `Primary failed (${message}); fallback used` });
          continue;
        } catch (fbErr) {
          await log(`Fallback failed too: ${explainError(fbErr)}`, "error", undefined, tool.name);
        }
      }
      await upsertStep(db, run, i, step, { status: "failed", error: message, attempts, finished_at: new Date() });
      if (step.onError === "continue") {
        ctx.warnings = [...(ctx.warnings ?? []), `${step.action} failed: ${message}`];
        ctx.outputs![step.id] = { error: message };
        await log(`"${step.action}" failed but the workflow continues: ${message}`, "warning", undefined, tool.name);
        continue;
      }
      return failRun(db, run, i, step, ctx, message, log, attempts);
    }
  }
  return finish(db, run, ctx, "completed", log);
}

function safeEval(cond: Parameters<typeof evaluateCondition>[0], scope: Record<string, unknown>) {
  try {
    return evaluateCondition(cond, scope);
  } catch {
    return false;
  }
}

type Logger = (message: string, status?: "info" | "success" | "warning" | "error", details?: unknown, tool?: string | null) => Promise<void>;

async function requestApproval(
  db: Db,
  run: RunRow,
  i: number,
  step: WorkflowStep,
  a: { kind: "tool" | "workflow" | "content_publish"; title: string; reason: string; risk: RiskLevel; payload: Record<string, unknown>; confirm?: boolean },
  log: Logger,
  ctx: RunContext,
) {
  const approval = await db.one<{ id: string }>(
    `insert into approvals(user_id, run_id, step_key, tool_name, kind, title, reason, risk_level, requires_confirmation, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [run.user_id, run.id, step.id, step.tool ?? null, a.kind, a.title.slice(0, 300), a.reason.slice(0, 1000), a.risk, Boolean(a.confirm), JSON.stringify(a.payload)],
  );
  await upsertStep(db, run, i, step, { status: "waiting_approval", risk_level: a.risk });
  await setRun(db, run.id, { status: "approval_required", current_step: i, context: ctx, result: { ...composeResult(run, ctx), pendingApprovalId: approval!.id } });
  await log(`${a.confirm ? "Explicit confirmation" : "Approval"} required: ${a.title}`, "warning", { approvalId: approval!.id }, step.tool);
  await notify(db, run.user_id, { title: a.confirm ? "Confirmation required" : "Approval required", body: a.title, level: "warning", link: `/approvals?focus=${approval!.id}` }).catch(() => {});
}

async function cancelRun(db: Db, run: RunRow, i: number, step: WorkflowStep, ctx: RunContext, log: Logger) {
  await upsertStep(db, run, i, step, { status: "cancelled", finished_at: new Date(), error: "Rejected by you" });
  for (let j = i + 1; j < run.plan.steps.length; j++) await upsertStep(db, run, j, run.plan.steps[j], { status: "cancelled" });
  await setRun(db, run.id, { status: "cancelled", finished_at: new Date(), context: ctx, result: { ...composeResult(run, ctx), summary: `Stopped: you rejected "${step.action}". Nothing further was executed.` } });
  await log(`Run stopped — "${step.action}" was rejected`, "info");
}

async function failRun(db: Db, run: RunRow, i: number, step: WorkflowStep, ctx: RunContext, message: string, log: Logger, attempts = 1) {
  await upsertStep(db, run, i, step, { status: "failed", error: message, attempts, finished_at: new Date() });
  const friendly = `"${step.action}" failed${attempts > 1 ? ` after ${attempts} attempts` : ""}: ${message}`;
  await setRun(db, run.id, { status: "failed", error: friendly, finished_at: new Date(), context: ctx, result: { ...composeResult(run, ctx), summary: friendly } });
  await log(friendly, "error", undefined, step.tool);
  if (run.automation_id) {
    await db.query("update automations set consecutive_failures = consecutive_failures + 1 where id = $1", [run.automation_id]);
    await notify(db, run.user_id, { title: `Automation failed: ${run.title}`, body: `${friendly}\n\nSay "retry it" or open the run for details.`, level: "error", link: `/runs/${run.id}` }).catch(() => {});
  }
}

async function finish(db: Db, run: RunRow, ctx: RunContext, status: "completed", log: Logger) {
  const result = composeResult(run, ctx);
  await setRun(db, run.id, { status, progress: 100, finished_at: new Date(), context: ctx, result, error: null });
  if (run.automation_id) await db.query("update automations set consecutive_failures = 0 where id = $1", [run.automation_id]);
  await log(`Completed: ${run.title}`, "success");
}

/** Called when the user decides on an approval. */
export async function resumeAfterDecision(runId: string, userId: string) {
  await enqueue("run.advance", { runId }, { userId });
}

export async function cancelRunById(db: Db, userId: string, runId: string) {
  const r = await db.one<{ id: string; status: string }>("select id, status from automation_runs where id = $1", [runId]);
  if (!r || ["completed", "failed", "cancelled"].includes(r.status)) return false;
  await db.query("update automation_runs set status = 'cancelled', finished_at = now(), error = 'Cancelled by you' where id = $1", [runId]);
  await db.query("update approvals set status = 'expired' where run_id = $1 and status = 'pending'", [runId]);
  await db.query("update workflow_steps set status = 'cancelled' where run_id = $1 and status in ('pending','waiting_approval','running')", [runId]);
  await logActivity(db, { userId, runId, action: "run.cancelled", message: "Run cancelled by you" });
  return true;
}
