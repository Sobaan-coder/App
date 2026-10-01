import { z } from "zod";
import { body, route } from "@/lib/api";
import { handleCommand } from "@/agents/commands";

/** The command box: natural language in → a planned, queued run out. */
export const POST = route({ rateLimit: 30 }, async ({ req, user }) => {
  const { text, projectId } = await body(req, z.object({ text: z.string().trim().min(2).max(4000), projectId: z.string().uuid().nullable().optional() }));
  return handleCommand(user.id, text, { projectId });
});
