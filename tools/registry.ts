import type { ToolDefinition } from "./types";
import { taskTools } from "./impl/tasks";
import { fileTools } from "./impl/files";
import { documentTools } from "./impl/documents";
import { researchTools } from "./impl/research";
import { systemTools } from "./impl/system";
import { contentTools } from "./impl/content";
import { automationTools } from "./impl/automation";

/** Every tool the agent can use. Add a tool by exporting it from tools/impl and listing it here. */
export const TOOLS: ToolDefinition[] = [...taskTools, ...fileTools, ...documentTools, ...researchTools, ...systemTools, ...contentTools, ...automationTools];

const byName = new Map(TOOLS.map((t) => [t.name, t]));
if (byName.size !== TOOLS.length) throw new Error("Duplicate tool names in registry");

export function getTool(name: string): ToolDefinition | undefined {
  return byName.get(name);
}

/** The risk level shown in listings (dynamic-risk tools show their base risk). */
export function staticRisk(t: ToolDefinition): "low" | "medium" | "high" {
  return typeof t.risk === "function" ? "low" : t.risk;
}
