import { route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { providerStatuses } from "@/services/ai/router";
import { imageProviderStatus } from "@/services/image-generation";

export const GET = route({}, async ({ user }) => {
  return withUser(user.id, async (db) => {
    const [totals] = await db.query<Record<string, number | string>>(
      `select count(*)::int as requests, coalesce(sum(prompt_tokens),0)::int as prompt_tokens, coalesce(sum(completion_tokens),0)::int as completion_tokens,
         coalesce(sum(estimated_cost_usd),0)::float as cost, count(*) filter (where is_paid)::int as paid_requests, count(*) filter (where not success)::int as failures
       from ai_usage where created_at >= date_trunc('month', now())`,
    );
    const byModel = await db.query(
      `select provider, model, kind, count(*)::int as requests, coalesce(sum(prompt_tokens),0)::int as prompt_tokens, coalesce(sum(completion_tokens),0)::int as completion_tokens,
         coalesce(sum(estimated_cost_usd),0)::float as cost, bool_or(is_paid) as is_paid, max(created_at) as last_used
       from ai_usage where created_at >= date_trunc('month', now()) group by provider, model, kind order by requests desc`,
    );
    const daily = await db.query(
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as requests, coalesce(sum(estimated_cost_usd),0)::float as cost
       from ai_usage where created_at >= now() - interval '30 days' group by 1 order by 1`,
    );
    const recent = await db.query("select created_at, provider, model, kind, task, prompt_tokens, completion_tokens, estimated_cost_usd, is_paid, success, error from ai_usage order by created_at desc limit 50");
    const settings = await getSettings(db);
    return { totals, byModel, daily, recent, providers: await providerStatuses(db, user.id), imageProviders: imageProviderStatus(), freeMode: !settings.ai.allowPaid, budget: settings.ai.monthlyBudgetUsd };
  });
});
