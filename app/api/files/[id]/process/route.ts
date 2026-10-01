import { route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { getFile } from "@/services/storage";
import { startRun } from "@/automations/service";
import { stepSchema } from "@/workflows/types";

/** "Summarize this file" button → a normal run (visible in the work queue and activity log). */
export const POST = route<{ id: string }>({ rateLimit: 30 }, async ({ user, params }) => {
  const file = await withUser(user.id, (db) => getFile(db, params.id));
  const runId = await startRun({
    userId: user.id,
    title: `Summarise ${file.name}`,
    source: "command",
    plan: {
      goal: `Summarise ${file.name}`,
      intent: "summarize_documents",
      requiresApproval: false,
      steps: [stepSchema.parse({ id: "process", action: "Read, extract, summarise & find action items", tool: "document_process", input: { fileId: file.id } })],
    },
  });
  return { runId };
});
