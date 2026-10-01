import { Cron } from "croner";
import { sql, withUser, type Db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { randomToken } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { enqueue } from "@/workers/queue";
import { getTool } from "@/tools/registry";
import { stepSchema, triggerSchema, workflowSchema, type AutomationDraft, type Plan, type Trigger, type WorkflowStep } from "@/workflows/types";
import { describeTrigger } from "@/workflows/nl-automation";

export interface AutomationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  description: string;
  enabled: boolean;
  trigger_type: Trigger["type"];
  trigger_config: Record<string, unknown>;
  workflow: { steps: WorkflowStep[] };
  template_key: string | null;
  created_by: string;
  last_run_at: string | null;
  next_run_at: string | null;
  consecutive_failures: number;
  created_at: string;
}

export function triggerOf(a: Pick<AutomationRow, "trigger_type" | "trigger_config">): Trigger {
  return triggerSchema.parse({ ...a.trigger_config, type: a.trigger_type });
}

export function nextRunFor(trigger: Trigger, timezone: string, from = new Date()): Date | null {
  if (trigger.type !== "schedule") return null;
  try {
    return new Cron(trigger.cron, { timezone: trigger.timezone ?? timezone }).nextRun(from) ?? null;
  } catch {
    throw new AppError(`Invalid schedule "${trigger.cron}"`);
  }
}

/** Validate steps: known tools, unique ids, tool steps have a tool. */
export function validateSteps(steps: unknown): WorkflowStep[] {
  const parsed = workflowSchema.parse({ steps }).steps;
  const ids = new Set<string>();
  for (const s of parsed) {
    if (ids.has(s.id)) throw new AppError(`Duplicate step id "${s.id}"`);
    ids.add(s.id);
    if (s.kind === "tool") {
      if (!s.tool) throw new AppError(`Step "${s.action}" needs a tool`);
      if (!getTool(s.tool)) throw new AppError(`Unknown tool "${s.tool}" in step "${s.action}"`);
    }
    if (s.kind === "condition" && !s.condition) throw new AppError(`Condition step "${s.action}" needs a condition`);
    if (s.fallback && !getTool(s.fallback.tool)) throw new AppError(`Unknown fallback tool "${s.fallback.tool}"`);
  }
  return parsed;
}

async function userTimezone(db: Db): Promise<string> {
  return (await db.one<{ timezone: string }>("select timezone from profiles limit 1"))?.timezone ?? "UTC";
}

export async function createAutomation(db: Db, userId: string, draft: AutomationDraft, opts: { createdBy?: "user" | "ai" | "template"; projectId?: string | null; enabled?: boolean } = {}): Promise<AutomationRow> {
  const trigger = triggerSchema.parse(draft.trigger);
  const steps = validateSteps(draft.steps);
  const tz = await userTimezone(db);
  const { type, ...config } = trigger;
  if (type === "schedule" && !("timezone" in config && config.timezone)) (config as Record<string, unknown>).timezone = tz;
  const next = nextRunFor(trigger, tz);
  const row = await db.one<AutomationRow>(
    `insert into automations(user_id, project_id, name, description, enabled, trigger_type, trigger_config, workflow, template_key, created_by, next_run_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [userId, opts.projectId ?? null, draft.name.slice(0, 120), draft.description ?? "", opts.enabled ?? true, type, JSON.stringify(config), JSON.stringify({ steps }), draft.templateKey ?? null, opts.createdBy ?? "user", next?.toISOString() ?? null],
  );
  if (type === "webhook") await db.query("insert into webhooks(user_id, automation_id, token) values ($1,$2,$3)", [userId, row!.id, randomToken(24)]);
  await logActivity(db, { userId, category: "automation", action: "automation.created", status: "success", message: `Automation "${row!.name}" created (${describeTrigger(trigger)})` });
  return row!;
}

export async function updateAutomation(
  db: Db,
  userId: string,
  id: string,
  patch: { name?: string; description?: string; enabled?: boolean; trigger?: Trigger; steps?: unknown[]; projectId?: string | null },
): Promise<AutomationRow> {
  const current = await db.one<AutomationRow>("select * from automations where id = $1", [id]);
  if (!current) throw new AppError("Automation not found", 404);
  const trigger = patch.trigger ? triggerSchema.parse(patch.trigger) : triggerOf(current);
  const steps = patch.steps ? validateSteps(patch.steps) : current.workflow.steps;
  const tz = await userTimezone(db);
  const { type, ...config } = trigger;
  if (type === "schedule" && !("timezone" in config && config.timezone)) (config as Record<string, unknown>).timezone = tz;
  const enabled = patch.enabled ?? current.enabled;
  const next = enabled ? nextRunFor(trigger, tz) : null;
  const row = await db.one<AutomationRow>(
    `update automations set name = coalesce($2, name), description = coalesce($3, description), enabled = $4, trigger_type = $5, trigger_config = $6,
       workflow = $7, next_run_at = $8, project_id = case when $9::boolean then $10::uuid else project_id end,
       consecutive_failures = case when $4 and not enabled then 0 else consecutive_failures end
     where id = $1 returning *`,
    [id, patch.name ?? null, patch.description ?? null, enabled, type, JSON.stringify(config), JSON.stringify({ steps }), next?.toISOString() ?? null, patch.projectId !== undefined, patch.projectId ?? null],
  );
  if (type === "webhook") {
    const hook = await db.one("select id from webhooks where automation_id = $1", [id]);
    if (!hook) await db.query("insert into webhooks(user_id, automation_id, token) values ($1,$2,$3)", [userId, id, randomToken(24)]);
  }
  if (patch.enabled !== undefined && patch.enabled !== current.enabled) {
    await logActivity(db, { userId, category: "automation", action: patch.enabled ? "automation.resumed" : "automation.paused", message: `Automation "${row!.name}" ${patch.enabled ? "resumed" : "paused"}` });
  }
  return row!;
}

export interface StartRunInput {
  userId: string;
  title: string;
  source: "command" | "automation" | "content" | "system";
  plan: Plan;
  automationId?: string | null;
  projectId?: string | null;
  triggerData?: Record<string, unknown> | null;
  commandText?: string | null;
  /** Don't enqueue yet (caller enqueues after preparing e.g. a pre-approval). */
  defer?: boolean;
}

/** Create a run and put it on the queue. */
export async function startRun(input: StartRunInput): Promise<string> {
  const steps = input.plan.steps.map((s) => stepSchema.parse(s));
  const run = await withUser(input.userId, (db) =>
    db.one<{ id: string }>(
      `insert into automation_runs(user_id, automation_id, project_id, source, title, command_text, intent, status, plan, trigger_data)
       values ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9) returning id`,
      [input.userId, input.automationId ?? null, input.projectId ?? null, input.source, input.title.slice(0, 200), input.commandText ?? null, input.plan.intent, JSON.stringify({ ...input.plan, steps }), input.triggerData ? JSON.stringify(input.triggerData) : null],
    ),
  );
  if (!input.defer) await enqueue("run.advance", { runId: run!.id }, { userId: input.userId });
  return run!.id;
}

export async function triggerAutomation(userId: string, automationId: string, triggerData: Record<string, unknown> = {}): Promise<string> {
  const a = await withUser(userId, (db) => db.one<AutomationRow>("select * from automations where id = $1", [automationId]));
  if (!a) throw new AppError("Automation not found", 404);
  const runId = await startRun({
    userId,
    title: a.name,
    source: "automation",
    automationId: a.id,
    projectId: a.project_id,
    triggerData: { ...triggerData, triggeredAt: new Date().toISOString() },
    plan: { goal: a.description || a.name, intent: `automation:${a.template_key ?? "custom"}`, steps: a.workflow.steps, requiresApproval: false },
  });
  await withUser(userId, (db) => db.query("update automations set last_run_at = now() where id = $1", [a.id]));
  return runId;
}

/** Fire event-based automations (file added, product added, deal added). */
export async function fireEvent(userId: string, event: "file_added" | "product_added" | "deal_added", data: Record<string, unknown>): Promise<string[]> {
  const settings = await withUser(userId, (db) => db.one<{ value: { paused?: boolean } }>("select value from settings where key = 'automation'"));
  if (settings?.value?.paused) return [];
  const rows = await withUser(userId, (db) =>
    event === "file_added"
      ? db.query<AutomationRow>("select * from automations where enabled and trigger_type = 'file_added'")
      : db.query<AutomationRow>("select * from automations where enabled and trigger_type = 'event' and trigger_config->>'event' = $1", [event]),
  );
  const runIds: string[] = [];
  for (const a of rows) {
    if (event === "file_added") {
      const exts = (a.trigger_config.extensions as string[] | undefined) ?? [];
      const folder = a.trigger_config.folder as string | undefined;
      const name = String(data.fileName ?? "").toLowerCase();
      if (exts.length && !exts.some((e) => name.endsWith(e.toLowerCase()))) continue;
      if (folder && folder !== data.folder) continue;
    }
    runIds.push(await triggerAutomation(userId, a.id, data));
  }
  return runIds;
}

/** Called by the scheduler: run every due scheduled automation and compute its next run. */
export async function runDueSchedules(now = new Date()): Promise<number> {
  const due = await sql.query<AutomationRow & { tz: string | null; paused: boolean | null }>(
    `select a.*, p.timezone as tz, (s.value->>'paused')::boolean as paused
     from automations a left join profiles p on p.user_id = a.user_id left join settings s on s.user_id = a.user_id and s.key = 'automation'
     where a.enabled and a.trigger_type = 'schedule' and a.next_run_at is not null and a.next_run_at <= $1
     order by a.next_run_at limit 50`,
    [now.toISOString()],
  );
  let started = 0;
  for (const a of due) {
    const trigger = triggerOf(a);
    const next = nextRunFor(trigger, a.tz ?? "UTC", new Date(Math.max(now.getTime(), Date.now()) + 1000));
    // claim atomically: only the process that moves next_run_at forward starts the run
    // (compare at millisecond precision: JS dates drop Postgres microseconds)
    const claimed = await sql.one(
      "update automations set next_run_at = $2 where id = $1 and date_trunc('milliseconds', next_run_at) = date_trunc('milliseconds', $3::timestamptz) returning id",
      [a.id, next?.toISOString() ?? null, a.next_run_at],
    );
    if (!claimed || a.paused) continue;
    await triggerAutomation(a.user_id, a.id, { scheduledFor: a.next_run_at });
    started++;
  }
  return started;
}
