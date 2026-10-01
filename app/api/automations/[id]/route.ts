import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { logActivity } from "@/lib/activity";
import { updateAutomation } from "@/automations/service";
import { triggerSchema } from "@/workflows/types";

export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const automation = await db.one("select a.*, w.token as webhook_token from automations a left join webhooks w on w.automation_id = a.id where a.id = $1", [params.id]);
    if (!automation) throw notFound("Automation");
    const runs = await db.query(
      "select id, status, created_at, finished_at, error, result->>'summary' as summary, progress from automation_runs where automation_id = $1 order by created_at desc limit 30",
      [params.id],
    );
    return { automation, runs };
  });
});

export const PATCH = route<{ id: string }>({ rateLimit: 60 }, async ({ req, user, params }) => {
  const p = await body(
    req,
    z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(2000).optional(), enabled: z.boolean().optional(), trigger: triggerSchema.optional(), steps: z.array(z.any()).max(50).optional(), projectId: z.string().uuid().nullable().optional() }),
  );
  return { automation: await withUser(user.id, (db) => updateAutomation(db, user.id, params.id, p)) };
});

export const DELETE = route<{ id: string }>({}, async ({ user, params }) => {
  return withUser(user.id, async (db) => {
    const a = await db.one<{ name: string }>("delete from automations where id = $1 returning name", [params.id]);
    if (!a) throw notFound("Automation");
    await logActivity(db, { userId: user.id, category: "automation", action: "automation.deleted", status: "warning", message: `Automation "${a.name}" deleted (run history kept)` });
    return { ok: true };
  });
});
