import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createAutomation } from "@/automations/service";
import { templateToDraft } from "@/workflows/templates";
import { triggerSchema } from "@/workflows/types";

export const GET = route({}, async ({ user }) => ({
  automations: await withUser(user.id, (db) =>
    db.query(
      `select a.*, w.token as webhook_token,
         (select status from automation_runs r where r.automation_id = a.id order by created_at desc limit 1) as last_status,
         (select count(*)::int from automation_runs r where r.automation_id = a.id) as run_count
       from automations a left join webhooks w on w.automation_id = a.id order by a.created_at desc`,
    ),
  ),
}));

const createSchema = z.union([
  z.object({ templateKey: z.string(), params: z.record(z.string(), z.string()).default({}), name: z.string().max(120).optional() }),
  z.object({ draft: z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).default(""), trigger: triggerSchema, steps: z.array(z.any()).max(50), templateKey: z.string().optional() }) }),
]);

export const POST = route({ rateLimit: 30 }, async ({ req, user }) => {
  const i = await body(req, createSchema);
  let draft;
  if ("templateKey" in i) {
    try {
      draft = templateToDraft(i.templateKey, i.params);
    } catch (err) {
      throw new AppError((err as Error).message);
    }
    if (!draft) throw new AppError("Unknown template");
    if (i.name) draft.name = i.name;
  } else draft = i.draft;
  const automation = await withUser(user.id, (db) => createAutomation(db, user.id, draft, { createdBy: "templateKey" in i ? "template" : "user" }));
  return { automation };
});
