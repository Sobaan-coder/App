// POST /functions/v1/admin-actions  { action, ...params }
// Platform administration. Access requires a row in public.platform_admins
// (separate from business roles). Returns aggregates and operational data
// only — no transaction contents or customer personal data.
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { requireUser, serviceClient, userClient } from '../_shared/supabase.ts';

type Body = { action: string; business_id?: string; flagged?: boolean; reason?: string; id?: string; status?: string; page?: number };

serve(async (req) => {
  const body = await readJson<Body>(req);
  const client = userClient(req);
  const user = await requireUser(client);
  const { data: isAdmin } = await client.rpc('is_platform_admin');
  if (!isAdmin) throw new HttpError(403, 'forbidden');
  const db = serviceClient();
  const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  const page = Math.max(0, Number(body.page ?? 0));

  switch (body.action) {
    case 'overview': {
      const count = async (table: string, f?: (q: any) => any) => {
        let q = db.from(table).select('*', { count: 'exact', head: true });
        if (f) q = f(q);
        const { count } = await q;
        return count ?? 0;
      };
      const [users, businesses, flagged, errors24h, openSupport, aiMonth, subs] = await Promise.all([
        count('profiles'),
        count('businesses', (q) => q.is('deleted_at', null).eq('is_demo', false)),
        count('businesses', (q) => q.eq('is_flagged', true)),
        count('app_errors', (q) => q.gte('created_at', since(1))),
        count('support_requests', (q) => q.in('status', ['open', 'in_progress'])),
        db.from('ai_requests').select('prompt_tokens, completion_tokens, used_llm').gte('created_at', since(30)).limit(50000),
        db.from('subscriptions').select('plan_id, status'),
      ]);
      const ai = (aiMonth.data ?? []) as Array<{ prompt_tokens: number; completion_tokens: number; used_llm: boolean }>;
      const plans: Record<string, number> = {};
      for (const s of subs.data ?? []) if (['active', 'trialing'].includes(s.status)) plans[s.plan_id] = (plans[s.plan_id] ?? 0) + 1;
      return json(req, {
        users, businesses, flagged, errors_24h: errors24h, open_support: openSupport, subscriptions_by_plan: plans,
        ai_30d: { requests: ai.length, llm_requests: ai.filter((r) => r.used_llm).length,
          tokens: ai.reduce((a, r) => a + r.prompt_tokens + r.completion_tokens, 0) },
        system: { ok: true, checked_at: new Date().toISOString() },
      });
    }
    case 'businesses': {
      const { data } = await db.from('businesses')
        .select('id, name, business_type, currency, country, created_at, is_demo, is_flagged, flagged_reason, subscriptions(plan_id, status)')
        .is('deleted_at', null).order('created_at', { ascending: false }).range(page * 50, page * 50 + 49);
      return json(req, { businesses: data ?? [] });
    }
    case 'errors': {
      const { data } = await db.from('app_errors').select('id, source, code, message, created_at')
        .order('created_at', { ascending: false }).range(page * 50, page * 50 + 49);
      return json(req, { errors: data ?? [] });
    }
    case 'support': {
      const { data } = await db.from('support_requests').select('id, kind, subject, message, status, created_at, business_id')
        .order('created_at', { ascending: false }).range(page * 50, page * 50 + 49);
      return json(req, { requests: data ?? [] });
    }
    case 'ai_usage': {
      const { data } = await db.from('ai_requests').select('created_at, used_llm, prompt_tokens, completion_tokens, status')
        .gte('created_at', since(30)).limit(50000);
      const byDay: Record<string, { requests: number; llm: number; tokens: number; errors: number }> = {};
      for (const r of data ?? []) {
        const d = (r.created_at as string).slice(0, 10);
        byDay[d] ??= { requests: 0, llm: 0, tokens: 0, errors: 0 };
        byDay[d].requests++;
        if (r.used_llm) byDay[d].llm++;
        byDay[d].tokens += r.prompt_tokens + r.completion_tokens;
        if (r.status === 'error') byDay[d].errors++;
      }
      return json(req, { by_day: byDay });
    }
    case 'flag_business': {
      if (!body.business_id) throw new HttpError(400, 'invalid_input:business_id');
      await db.from('businesses').update({ is_flagged: Boolean(body.flagged), flagged_reason: body.reason?.slice(0, 300) ?? null })
        .eq('id', body.business_id);
      await db.from('audit_logs').insert({ business_id: body.business_id, user_id: user.id, action: 'admin.flag_business',
        entity: 'business', entity_id: body.business_id, metadata: { flagged: Boolean(body.flagged), reason: body.reason ?? null } });
      return json(req, { ok: true });
    }
    case 'update_support': {
      if (!body.id || !['open', 'in_progress', 'resolved', 'closed'].includes(body.status ?? '')) {
        throw new HttpError(400, 'invalid_input:status');
      }
      await db.from('support_requests').update({ status: body.status }).eq('id', body.id);
      return json(req, { ok: true });
    }
    default:
      throw new HttpError(400, 'invalid_input:action');
  }
});
