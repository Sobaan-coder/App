import { route } from "@/lib/api";
import { TEMPLATES } from "@/workflows/templates";
import { describeTrigger } from "@/workflows/nl-automation";
import { TOOLS } from "@/tools/registry";

export const GET = route({}, async () => ({
  templates: TEMPLATES.map((t) => ({ ...t, triggerLabel: describeTrigger(t.trigger) })),
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, category: t.category, risk: typeof t.risk === "function" ? "dynamic" : t.risk })),
}));
