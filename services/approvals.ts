import { z } from "zod";
import type { Db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/activity";
import { CONFIRM_PHRASE } from "@/lib/permissions";
import { getTool } from "@/tools/registry";

export const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  /** Edited tool input (EDIT button). Validated against the tool's schema. */
  editedInput: z.record(z.string(), z.any()).optional(),
  /** Required for high-risk actions: the user must type CONFIRM. */
  confirmText: z.string().optional(),
  note: z.string().max(500).optional(),
});

export interface ApprovalRecord {
  id: string;
  run_id: string | null;
  step_key: string | null;
  tool_name: string | null;
  kind: string;
  title: string;
  status: string;
  requires_confirmation: boolean;
  risk_level: string;
  payload: { tool?: string; input?: unknown };
}

export async function decideApproval(db: Db, userId: string, id: string, raw: unknown) {
  const d = decisionSchema.parse(raw);
  const a = await db.one<ApprovalRecord>("select * from approvals where id = $1", [id]);
  if (!a) throw new AppError("Approval not found", 404);
  if (a.status !== "pending") throw new AppError(`This request was already ${a.status}`, 409);
  if (d.decision === "approve" && a.requires_confirmation && d.confirmText?.trim() !== CONFIRM_PHRASE) {
    throw new AppError(`This is a high-risk action. Type ${CONFIRM_PHRASE} to confirm.`, 400, "confirmation_required");
  }
  let edited: { input: unknown } | null = null;
  if (d.editedInput && d.decision === "approve") {
    const tool = a.tool_name ? getTool(a.tool_name) : undefined;
    if (!tool) throw new AppError("This step can't be edited");
    const parsed = tool.input.safeParse(d.editedInput);
    if (!parsed.success) throw new AppError(`Edited values are invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    // Editing must not escalate risk beyond what was shown
    const risk = typeof tool.risk === "function" ? tool.risk(parsed.data) : tool.risk;
    if (risk === "high" && a.risk_level !== "high") throw new AppError("That edit would make this a high-risk action. Please start a new request instead.");
    edited = { input: parsed.data };
  }
  await db.query("update approvals set status = $2, edited_payload = $3, decision_note = $4, decided_at = now() where id = $1", [
    id,
    d.decision === "approve" ? "approved" : "rejected",
    edited ? JSON.stringify(edited) : null,
    d.note ?? null,
  ]);
  await logActivity(db, {
    userId,
    runId: a.run_id,
    category: "approval",
    action: d.decision === "approve" ? "approval.approved" : "approval.rejected",
    tool: a.tool_name,
    status: d.decision === "approve" ? "success" : "warning",
    message: `${d.decision === "approve" ? "You approved" : "You rejected"}: ${a.title}${edited ? " (edited)" : ""}`,
    details: { approvalId: id, note: d.note },
  });
  // NOTE: the caller must resume the run (resumeAfterDecision) AFTER this transaction commits.
  return { status: d.decision === "approve" ? "approved" : "rejected", runId: a.run_id };
}
