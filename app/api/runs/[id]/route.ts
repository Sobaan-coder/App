import { z } from "zod";
import { body, route } from "@/lib/api";
import { userDb, withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { cancelRunById } from "@/workflows/engine";
import { getTool } from "@/tools/registry";

export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const run = await db.one("select * from automation_runs where id = $1", [params.id]);
    if (!run) throw notFound("Run");
    const steps = await db.query("select step_key, step_index, kind, tool, action, status, error, attempts, risk_level, started_at, finished_at, output->>'summary' as summary from workflow_steps where run_id = $1 order by step_index", [params.id]);
    const approvals = await db.query("select id, title, reason, status, risk_level, requires_confirmation, kind, tool_name, payload, created_at, decided_at from approvals where run_id = $1 order by created_at", [params.id]);
    const activity = await db.query("select created_at, message, status, tool from activity_logs where run_id = $1 order by created_at", [params.id]);
    const plan = (run as { plan: { steps: { id: string; action: string; tool?: string; kind: string }[] } }).plan;
    const planSteps = plan.steps.map((s) => ({ id: s.id, action: s.action, tool: s.tool, kind: s.kind, risk: s.tool ? (typeof getTool(s.tool)?.risk === "string" ? getTool(s.tool)?.risk : "dynamic") : null }));
    return { run: { ...run, context: undefined }, planSteps, steps, approvals, activity };
  });
});

export const POST = route<{ id: string }>({ rateLimit: 30 }, async ({ req, user, params }) => {
  const { action } = await body(req, z.object({ action: z.enum(["cancel", "retry"]) }));
  if (action === "cancel") return { cancelled: await cancelRunById(userDb(user.id), user.id, params.id) };
  const { runRetry } = await import("@/tools/impl/automation");
  const { getSettings } = await import("@/lib/settings");
  const db = userDb(user.id);
  const out = await runRetry.execute({ runId: params.id }, { userId: user.id, db, settings: await getSettings(db), log: async () => {} });
  return out;
});
