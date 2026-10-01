import { z } from "zod";
import { body, route } from "@/lib/api";
import { triggerAutomation } from "@/automations/service";

/** Manual trigger ("Run now"). Optional trigger data, e.g. {"fileId": "..."} for document workflows. */
export const POST = route<{ id: string }>({ rateLimit: 30 }, async ({ req, user, params }) => {
  const p = await body(req, z.object({ triggerData: z.record(z.string(), z.any()).default({}) }));
  return { runId: await triggerAutomation(user.id, params.id, { ...p.triggerData, manual: true }) };
});
