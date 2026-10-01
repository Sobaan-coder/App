import { route, body } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { decideApproval, decisionSchema } from "@/services/approvals";
import { getTool } from "@/tools/registry";
import { z } from "zod";
import { resumeAfterDecision } from "@/workflows/engine";

export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const a = await db.one<{ tool_name: string | null }>("select a.*, r.title as run_title from approvals a left join automation_runs r on r.id = a.run_id where a.id = $1", [params.id]);
    if (!a) throw notFound("Approval");
    const tool = a.tool_name ? getTool(a.tool_name) : undefined;
    const schema = tool ? z.toJSONSchema(tool.input, { unrepresentable: "any" }) : null;
    return { approval: a, tool: tool ? { name: tool.name, description: tool.description, schema } : null };
  });
});

/** APPROVE / REJECT / EDIT (approve with edited input). High risk requires typing CONFIRM. */
export const POST = route<{ id: string }>({ rateLimit: 60 }, async ({ req, user, params }) => {
  const d = await body(req, decisionSchema);
  const out = await withUser(user.id, (db) => decideApproval(db, user.id, params.id, d));
  if (out.runId) await resumeAfterDecision(out.runId, user.id); // after commit, so the worker sees the decision
  return out;
});
