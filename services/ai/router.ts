import { env } from "@/lib/env";
import { sha256 } from "@/lib/crypto";
import { sql, type Db } from "@/lib/db";
import { getSettings, type Settings } from "@/lib/settings";
import { circuitOpen, recordFailure, recordSuccess } from "@/lib/circuit";
import { ollamaProvider } from "./providers/ollama";
import { openAICompatProvider } from "./providers/openai-compat";
import { SYSTEM_GUARD } from "./safety";
import type { AIProvider, ChatMessage, Tier } from "./types";

/**
 * AI ROUTER
 *   Local model (Ollama) → Free API (OpenAI-compatible free tier) → Paid API (only if enabled)
 * Returns null when no model is usable — callers then use the deterministic offline engine.
 */

export interface GenerateRequest {
  task: string;
  tier?: Tier;
  system?: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  provider: string;
  model: string;
  cached: boolean;
  isPaid: boolean;
}

export interface ProviderStatus {
  id: string;
  label: string;
  isLocal: boolean;
  isPaid: boolean;
  model: string | undefined;
  ok: boolean;
  detail?: string;
  skippedReason?: string;
}

function buildProviders(s: Settings): AIProvider[] {
  const e = env();
  const list: AIProvider[] = [];
  const ollamaModel = s.ai.ollamaModel || e.OLLAMA_MODEL;
  if (e.OLLAMA_BASE_URL) list.push(ollamaProvider(e.OLLAMA_BASE_URL, ollamaModel));
  if (e.OPENAI_COMPAT_BASE_URL) {
    list.push(
      openAICompatProvider({
        baseUrl: e.OPENAI_COMPAT_BASE_URL,
        apiKey: e.OPENAI_COMPAT_API_KEY,
        model: s.ai.openaiCompatModel || e.OPENAI_COMPAT_MODEL,
        markedPaid: e.OPENAI_COMPAT_IS_PAID,
      }),
    );
  }
  // local first when preferred, free before paid always
  return list.sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    if (s.ai.preferLocal && a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return 0;
  });
}

// availability cache (30s) so we don't ping providers on every call
const availCache = new Map<string, { at: number; ok: boolean; detail?: string }>();
async function isAvailable(p: AIProvider): Promise<{ ok: boolean; detail?: string }> {
  const key = `${p.id}:${p.defaultModel}`;
  const c = availCache.get(key);
  if (c && Date.now() - c.at < 30_000) return c;
  const r = await p.available();
  availCache.set(key, { at: Date.now(), ...r });
  return r;
}

// response cache (10 min) — avoids repeated identical AI calls
const responseCache = new Map<string, { at: number; text: string }>();
const CACHE_TTL = 10 * 60_000;

async function monthSpend(userId: string): Promise<number> {
  const r = await sql.one<{ total: string }>(
    `select coalesce(sum(estimated_cost_usd),0) as total from ai_usage
     where user_id = $1 and is_paid and created_at >= date_trunc('month', now())`,
    [userId],
  );
  return Number(r?.total ?? 0);
}

export async function providerStatuses(db: Db, userId: string): Promise<ProviderStatus[]> {
  const s = await getSettings(db);
  const out: ProviderStatus[] = [];
  for (const p of buildProviders(s)) {
    const a = await isAvailable(p);
    let skippedReason: string | undefined;
    if (!s.ai.enabled) skippedReason = "AI disabled in settings (offline engine only)";
    else if (p.isPaid && !s.ai.allowPaid) skippedReason = "PAID DEPENDENCY — disabled until you allow paid usage";
    out.push({ id: p.id, label: p.label, isLocal: p.isLocal, isPaid: p.isPaid, model: p.defaultModel, ok: a.ok, detail: a.detail, skippedReason });
  }
  void userId;
  return out;
}

/** True when at least one model can be used right now for this user. */
export async function aiAvailable(db: Db): Promise<boolean> {
  const s = await getSettings(db);
  if (!s.ai.enabled) return false;
  for (const p of buildProviders(s)) {
    if (p.isPaid && !s.ai.allowPaid) continue;
    if ((await isAvailable(p)).ok) return true;
  }
  return false;
}

export async function generate(db: Db, userId: string, req: GenerateRequest): Promise<GenerateResult | null> {
  const s = await getSettings(db);
  if (!s.ai.enabled) return null;
  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_GUARD}\n\n${req.system ?? ""}`.trim() },
    { role: "user", content: req.prompt },
  ];

  for (const p of buildProviders(s)) {
    if (p.isPaid) {
      if (!s.ai.allowPaid) continue;
      if (s.ai.monthlyBudgetUsd > 0 && (await monthSpend(userId)) >= s.ai.monthlyBudgetUsd) continue;
    }
    const model = (req.tier && s.ai.tierModels[req.tier]) || p.defaultModel;
    if (!model) continue;
    const breakerKey = `ai:${p.id}:${model}`;
    if (circuitOpen(breakerKey)) continue;
    if (!(await isAvailable(p)).ok) continue;

    const cacheKey = sha256(JSON.stringify([p.id, model, messages, req.json, req.temperature]));
    const hit = responseCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      return { text: hit.text, provider: p.id, model, cached: true, isPaid: p.isPaid };
    }

    const started = Date.now();
    try {
      const r = await p.chat(messages, { model, json: req.json, maxTokens: req.maxTokens, temperature: req.temperature });
      if (!r.text.trim()) throw new Error("Empty response");
      recordSuccess(breakerKey);
      responseCache.set(cacheKey, { at: Date.now(), text: r.text });
      if (responseCache.size > 300) responseCache.delete(responseCache.keys().next().value!);
      await recordUsage(userId, p, model, req.task, r.promptTokens, r.completionTokens, Date.now() - started, true);
      return { text: r.text, provider: p.id, model, cached: false, isPaid: p.isPaid };
    } catch (err) {
      recordFailure(breakerKey);
      await recordUsage(userId, p, model, req.task, undefined, undefined, Date.now() - started, false, (err as Error).message);
      // fall through to next provider
    }
  }
  return null;
}

/** Ask for JSON and parse it; returns null if no model or unparsable. */
export async function generateJson<T>(
  db: Db,
  userId: string,
  req: GenerateRequest,
  validate: (v: unknown) => T | null,
): Promise<{ value: T; provider: string; model: string } | null> {
  const r = await generate(db, userId, { ...req, json: true, temperature: req.temperature ?? 0.2 });
  if (!r) return null;
  const match = r.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const v = validate(JSON.parse(match[0]));
    return v === null ? null : { value: v, provider: r.provider, model: r.model };
  } catch {
    return null;
  }
}

// Rough public list prices (USD per 1M tokens) for cost estimates of PAID endpoints only.
const PRICE_PER_M: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4o": [2.5, 10],
};

async function recordUsage(
  userId: string,
  p: AIProvider,
  model: string,
  task: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  latency: number,
  success: boolean,
  error?: string,
) {
  let cost = 0;
  if (p.isPaid && promptTokens !== undefined) {
    const price = PRICE_PER_M[model] ?? [1, 3]; // conservative default for unknown paid models
    cost = (promptTokens * price[0] + (completionTokens ?? 0) * price[1]) / 1_000_000;
  }
  await sql
    .query(
      `insert into ai_usage(user_id, provider, model, kind, task, prompt_tokens, completion_tokens, estimated_cost_usd, is_paid, success, latency_ms, error)
       values ($1,$2,$3,'text',$4,$5,$6,$7,$8,$9,$10,$11)`,
      [userId, p.id, model, task, promptTokens ?? null, completionTokens ?? null, cost, p.isPaid, success, latency, error ?? null],
    )
    .catch(() => {});
}

export function clearAICaches() {
  availCache.clear();
  responseCache.clear();
}
