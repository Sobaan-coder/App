import type { z } from "zod";
import type { Db } from "@/lib/db";
import type { Settings } from "@/lib/settings";

export type RiskLevel = "low" | "medium" | "high";
export type PermissionMode = "auto" | "approval" | "confirm" | "disabled";

export interface ToolContext {
  userId: string;
  runId?: string;
  projectId?: string | null;
  db: Db;
  settings: Settings;
  /** Append a line to the activity log for this run. */
  log: (message: string, status?: "info" | "success" | "warning" | "error", details?: unknown) => Promise<void>;
}

/** Standard, displayable parts of any tool output. */
export interface ToolOutputBase {
  summary?: string;
  markdown?: string;
  files?: { id: string; name: string }[];
  warnings?: string[];
}

export interface ToolDefinition<I = any, O extends ToolOutputBase = any> {
  name: string;
  description: string;
  category: "tasks" | "files" | "documents" | "research" | "browser" | "communication" | "memory" | "ai" | "content" | "automation" | "system" | "projects";
  input: z.ZodType<I>;
  /** Static risk, or computed from the (validated) input. */
  risk: RiskLevel | ((input: I) => RiskLevel);
  /** Transient failures (network) may be retried; side-effecting tools usually should not be. */
  retryable?: boolean;
  timeoutMs?: number;
  /** One-line description of what this call will do — shown on approval cards. */
  describe?: (input: I) => string;
  /** Post-execution verification; return an error message if the result looks wrong. */
  verify?: (output: O, input: I) => string | null;
  /**
   * Optional policy hook for medium-risk tools: return true to skip the approval for this call
   * (e.g. AUTO MODE publishing). Never consulted for high-risk tools.
   */
  autoApprove?: (input: I, ctx: ToolContext) => Promise<boolean>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
}

export function defineTool<I, O extends ToolOutputBase>(t: ToolDefinition<I, O>): ToolDefinition<I, O> {
  return t;
}
