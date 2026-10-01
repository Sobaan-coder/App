import { z } from "zod";
import { body, route } from "@/lib/api";
import { parseAutomationText, describeTrigger } from "@/workflows/nl-automation";

/** Natural language → automation draft preview (nothing is created). */
export const POST = route({ rateLimit: 60 }, async ({ req }) => {
  const { text } = await body(req, z.object({ text: z.string().min(3).max(2000) }));
  const draft = parseAutomationText(text);
  return { draft, triggerLabel: draft ? describeTrigger(draft.trigger) : null };
});
