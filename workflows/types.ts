import { z } from "zod";

export const conditionSchema = z.object({
  left: z.string(),
  op: z.enum(["exists", "not_exists", "truthy", "falsy", "eq", "neq", "gt", "gte", "lt", "lte", "contains"]),
  right: z.any().optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const stepSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[\w-]+$/),
  kind: z.enum(["tool", "condition", "delay", "approval"]).default("tool"),
  action: z.string().min(1).max(200),
  tool: z.string().optional(),
  input: z.record(z.string(), z.any()).default({}),
  /** Run the tool once per item of this array (loop). Items are available as {{item}}. */
  forEach: z.string().optional(),
  /** Skip this step unless the condition holds. */
  when: conditionSchema.optional(),
  /** For kind=condition */
  condition: conditionSchema.optional(),
  onFalse: z.enum(["stop", "skip_next"]).default("stop"),
  /** For kind=delay */
  delayMinutes: z.number().min(0).max(60 * 24 * 30).optional(),
  /** For kind=approval */
  message: z.string().optional(),
  retries: z.number().int().min(0).max(5).optional(),
  onError: z.enum(["stop", "continue"]).default("stop"),
  fallback: z.object({ tool: z.string(), input: z.record(z.string(), z.any()).default({}) }).optional(),
});
export type WorkflowStep = z.infer<typeof stepSchema>;
export type WorkflowStepInput = z.input<typeof stepSchema>;

export const workflowSchema = z.object({ steps: z.array(stepSchema).max(50) });
export type Workflow = z.infer<typeof workflowSchema>;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("schedule"), cron: z.string().min(9), timezone: z.string().optional(), description: z.string().optional() }),
  z.object({ type: z.literal("webhook") }),
  z.object({ type: z.literal("file_added"), folder: z.string().optional(), extensions: z.array(z.string()).optional() }),
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("event"), event: z.enum(["product_added", "deal_added"]) }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export interface AutomationDraft {
  name: string;
  description: string;
  trigger: Trigger;
  steps: WorkflowStepInput[];
  templateKey?: string;
}

export interface Plan {
  goal: string;
  intent: string;
  steps: WorkflowStep[];
  requiresApproval: boolean;
  /** Optional: an automation proposal the user can accept with one click. */
  proposal?: AutomationDraft;
}
