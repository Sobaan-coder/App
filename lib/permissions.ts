import type { PermissionMode, RiskLevel } from "@/tools/types";

/**
 * LOW → automatic · MEDIUM → approval · HIGH → explicit confirmation.
 * Users may make any tool stricter, may relax MEDIUM tools to automatic, and may disable tools.
 * HIGH-risk tools can never run without explicit confirmation.
 */
export function defaultMode(risk: RiskLevel): PermissionMode {
  return risk === "low" ? "auto" : risk === "medium" ? "approval" : "confirm";
}

const RANK: Record<PermissionMode, number> = { auto: 0, approval: 1, confirm: 2, disabled: 3 };

export function effectiveMode(risk: RiskLevel, override?: PermissionMode | null): PermissionMode {
  const base = defaultMode(risk);
  if (!override) return base;
  if (override === "disabled") return "disabled";
  if (risk === "high") return "confirm";
  if (risk === "medium" && override === "auto") return "auto";
  return RANK[override] > RANK[base] ? override : base;
}

export const CONFIRM_PHRASE = "CONFIRM";
