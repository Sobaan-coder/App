// HTTP handler shared by ai-process and ai-query.
import { createAIProvider } from './ai/service.ts';
import { queryDb, resolverDb } from './db_adapters.ts';
import { fromDbError, HttpError, json, readJson } from './http.ts';
import { PipelineResult, processMessage, processReceipt } from './pipeline.ts';
import { ParsedMessage } from './schema.ts';
import { logError, requireUser, serviceClient, userClient } from './supabase.ts';

interface Body {
  business_id?: string;
  text?: string;
  mode?: 'text' | 'receipt';
  storage_path?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function handleAI(req: Request, opts: { queryOnly: boolean }): Promise<Response> {
  const started = Date.now();
  const body = await readJson<Body>(req);
  const businessId = body.business_id ?? '';
  if (!UUID.test(businessId)) throw new HttpError(400, 'invalid_input:business_id');
  const mode = body.mode ?? 'text';
  const text = (body.text ?? '').trim();
  if (mode === 'text' && (text.length === 0 || text.length > 500)) throw new HttpError(400, 'invalid_input:text');

  const client = userClient(req);
  const user = await requireUser(client);

  // Membership + plan quota + per-user rate limit — decided by Postgres from the JWT.
  const { data: quota, error: qErr } = await client.rpc('ai_quota_check', { p_business_id: businessId });
  if (qErr) throw fromDbError(qErr);
  if (quota.rate_limited) throw new HttpError(429, 'rate_limited');

  const [{ data: biz, error: bErr }, { data: settings }, { data: flags }] = await Promise.all([
    client.from('businesses').select('currency, timezone').eq('id', businessId).single(),
    client.from('business_settings').select('ai_auto_record_low_risk, ai_confirm_threshold_minor, feature_flags')
      .eq('business_id', businessId).single(),
    client.from('settings').select('value').eq('key', 'feature_flags').maybeSingle(),
  ]);
  if (bErr || !biz) throw new HttpError(404, 'not_found:business');
  const featureFlags = { ...(flags?.value ?? {}), ...(settings?.feature_flags ?? {}) };
  if (featureFlags.ai_enabled === false) throw new HttpError(403, 'feature_disabled');

  // Over the monthly AI quota, the free deterministic parser still works; the LLM is skipped.
  const provider = quota.allowed ? createAIProvider((k) => Deno.env.get(k)) : null;
  const service = serviceClient();
  const cacheKey = mode === 'text' ? await sha256(`${businessId}:${text.toLowerCase().replace(/\s+/g, ' ')}`) : undefined;

  const deps = {
    provider,
    resolverDb: resolverDb(client, businessId),
    queryDb: queryDb(client, businessId),
    ctx: {
      currency: biz.currency, today: todayIn(biz.timezone), role: quota.role,
      autoRecordLowRisk: settings?.ai_auto_record_low_risk ?? false,
      confirmThresholdMinor: Number(settings?.ai_confirm_threshold_minor ?? 2_000_000),
    },
    cacheKey,
    cache: {
      // Reuse a recent LLM parse of the identical message (resolution is always re-run on live data).
      async get(key: string): Promise<ParsedMessage | null> {
        const { data } = await service.from('ai_requests').select('result')
          .eq('business_id', businessId).eq('cache_key', key).eq('used_llm', true).eq('status', 'ok')
          .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        return (data?.result as { parsed?: ParsedMessage } | null)?.parsed ?? null;
      },
    },
  };

  let result: PipelineResult;
  try {
    if (mode === 'receipt') {
      if (!featureFlags.receipt_scanning) throw new HttpError(403, 'feature_disabled');
      const path = body.storage_path ?? '';
      if (!path.startsWith(`${businessId}/`) || path.includes('..')) throw new HttpError(400, 'invalid_input:storage_path');
      const { data: file, error } = await client.storage.from('receipts').download(path);   // RLS-checked
      if (error || !file) throw new HttpError(404, 'not_found:receipt');
      if (file.size > 5_000_000) throw new HttpError(413, 'payload_too_large');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      result = await processReceipt({ mimeType: file.type || 'image/jpeg', base64: btoa(bin) }, deps);
    } else {
      result = await processMessage(text, deps, { queryOnly: opts.queryOnly });
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    await logError('ai-process', 'pipeline_failed', (e as Error).message, { business_id: businessId, user_id: user.id });
    throw new HttpError(500, 'ai_failed');
  }

  const u = result.usage;
  const { data: logged } = await service.from('ai_requests').insert({
    business_id: businessId, user_id: user.id, kind: mode === 'receipt' ? 'receipt' : (opts.queryOnly ? 'query' : 'parse'),
    input_preview: text.slice(0, 120) || null, intent: u.intent, provider: u.provider, model: u.model,
    used_llm: u.usedLlm, cache_hit: u.cacheHit, prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens,
    latency_ms: Date.now() - started, status: u.status, error_code: u.errorCode,
    cache_key: u.usedLlm && u.status === 'ok' ? cacheKey : null,
    result: u.parsed ? { parsed: u.parsed } : null,
  }).select('id').single();
  await service.from('analytics_events').insert({
    event: 'ai_request', business_id: businessId, user_id: user.id,
    properties: { intent: u.intent, used_llm: u.usedLlm, kind: result.proposal.kind },
  });
  if (u.errorCode === 'provider_error') {
    await logError('ai-process', 'provider_error', 'AI provider call failed', { business_id: businessId });
  }

  const proposal = result.proposal;
  if (proposal.action?.kind === 'record_transaction' && logged?.id) {
    proposal.action.payload.ai_request_id = logged.id;
  }
  return json(req, {
    ...proposal,
    ai_request_id: logged?.id ?? null,
    usage: { used_llm: u.usedLlm, ai_requests_used: quota.used + (u.usedLlm ? 1 : 0), ai_requests_limit: quota.limit },
  });
}
