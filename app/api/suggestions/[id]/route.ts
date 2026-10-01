import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { planCommand } from "@/agents/planner";
import { createAutomation } from "@/automations/service";

/** Accept ("Create Automation") or dismiss ("Not now") a discovered repeated task. Never automatic. */
export const POST = route<{ id: string }>({ rateLimit: 20 }, async ({ req, user, params }) => {
  const p = await body(req, z.object({ action: z.enum(["accept", "dismiss"]), cron: z.string().min(9).max(60).optional(), description: z.string().max(100).optional() }));
  return withUser(user.id, async (db) => {
    const s = await db.one<{ id: string; example_command: string }>("select * from automation_suggestions where id = $1 and status = 'pending'", [params.id]);
    if (!s) throw notFound("Suggestion");
    if (p.action === "dismiss") {
      await db.query("update automation_suggestions set status = 'dismissed' where id = $1", [s.id]);
      return { ok: true };
    }
    const plan = await planCommand(db, user.id, s.example_command);
    const automation = await createAutomation(
      db,
      user.id,
      {
        name: plan.goal.slice(0, 80),
        description: `Created from a repeated command: "${s.example_command}"`,
        trigger: { type: "schedule", cron: p.cron ?? "0 9 * * 1-5", description: p.description ?? "Weekdays at 09:00" },
        steps: [...plan.steps, { id: "notify_done", action: "Notify me", tool: "notification_send", input: { title: `Done: ${plan.goal.slice(0, 60)}`, body: "Open the run for details." } }],
      },
      { createdBy: "ai" },
    );
    await db.query("update automation_suggestions set status = 'accepted' where id = $1", [s.id]);
    return { automation };
  });
});
