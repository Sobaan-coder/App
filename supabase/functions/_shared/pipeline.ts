// The AI pipeline, independent of HTTP so it can be unit-tested:
//   deterministic parser → (cache) → LLM → strict schema validation →
//   entity resolution against real data → risk policy → Proposal
// Questions are answered from database calculations; the LLM may only
// rephrase those facts.

import { AIProvider } from './ai/types.ts';
import { extractJson } from './ai/service.ts';
import { PROMPTS } from './prompts.generated.ts';
import { answerProposal, answerQuery, QueryDb } from './queries.ts';
import { quickParse } from './quick_parser.ts';
import { buildProposal, clarify, Proposal, ResolverContext, ResolverDb } from './resolver.ts';
import { isQueryIntent, ParsedMessage, ParsedReceipt, ReceiptSchema, validateParsed } from './schema.ts';

export interface PipelineDeps {
  provider: AIProvider | null;
  resolverDb: ResolverDb;
  queryDb: QueryDb;
  ctx: ResolverContext;
  cache?: { get(key: string): Promise<ParsedMessage | null> };
  cacheKey?: string;
}

export interface Usage {
  usedLlm: boolean;
  cacheHit: boolean;
  promptTokens: number;
  completionTokens: number;
  provider: string | null;
  model: string | null;
  intent: string | null;
  status: 'ok' | 'clarification' | 'error' | 'rejected';
  errorCode: string | null;
  parsed: ParsedMessage | null;
}

export interface PipelineResult { proposal: Proposal; usage: Usage }

const EXAMPLES = 'Try something like “Sold 3 burgers for 1500 cash”, “Paid electricity 4500” or “How much did I sell today?”.';

function newUsage(): Usage {
  return { usedLlm: false, cacheHit: false, promptTokens: 0, completionTokens: 0, provider: null, model: null,
    intent: null, status: 'ok', errorCode: null, parsed: null };
}

async function llmParse(text: string, deps: PipelineDeps, usage: Usage): Promise<ParsedMessage | null> {
  if (!deps.provider) return null;
  const res = await deps.provider.complete({
    system: `${PROMPTS.assistant}\n\n${PROMPTS.transactionParser}`,
    user: JSON.stringify({ today: deps.ctx.today, currency: deps.ctx.currency, message: text }),
    json: true, maxTokens: 700, temperature: 0,
  });
  usage.usedLlm = true;
  usage.promptTokens += res.promptTokens;
  usage.completionTokens += res.completionTokens;
  usage.provider = res.provider;
  usage.model = res.model;
  let raw: unknown;
  try {
    raw = extractJson(res.text);
  } catch {
    usage.errorCode = 'invalid_json';
    return null;
  }
  const v = validateParsed(raw);
  if (!v.ok) {
    usage.errorCode = 'schema_violation';
    console.warn(JSON.stringify({ level: 'warn', msg: 'AI output rejected by schema', issues: v.issues.slice(0, 5) }));
    return null;
  }
  return v.value;
}

export async function processMessage(text: string, deps: PipelineDeps, opts: { queryOnly?: boolean } = {}): Promise<PipelineResult> {
  const usage = newUsage();
  const input = text.trim();
  if (!input) return { proposal: clarify('unknown', `Tell me what happened. ${EXAMPLES}`), usage: { ...usage, status: 'clarification' } };

  // 1. Deterministic first (free, instant, predictable).
  let parsed = quickParse(input, { today: deps.ctx.today });
  const quickIsFinal = parsed !== null && (parsed.confidence >= 0.9 || parsed.clarification_question !== null);

  // 2. Cache, then 3. LLM.
  if (!quickIsFinal) {
    const cached = deps.cache && deps.cacheKey ? await deps.cache.get(deps.cacheKey) : null;
    if (cached) {
      parsed = cached;
      usage.cacheHit = true;
    } else {
      try {
        parsed = (await llmParse(input, deps, usage)) ?? parsed;
      } catch (e) {
        usage.errorCode = 'provider_error';
        usage.status = 'error';
        console.error(JSON.stringify({ level: 'error', msg: 'AI provider failed', error: (e as Error).message }));
        if (!parsed) {
          return { proposal: { ...clarify('unknown', 'The assistant is having trouble right now. Please try again, or use the + button to add it manually.'), kind: 'error' }, usage };
        }
      }
    }
  }

  if (!parsed) {
    usage.status = 'clarification';
    return { proposal: clarify('unknown', `Sorry, I didn’t understand that. ${EXAMPLES}`), usage };
  }
  if (opts.queryOnly && !isQueryIntent(parsed.intent)) {
    parsed = { ...parsed, intent: 'general_business_question', query: { metric: 'general', period: 'this_month', term: null, entity_name: null } };
  }
  usage.parsed = parsed;
  usage.intent = parsed.intent;

  // 4. Questions: numbers come from the database.
  if (isQueryIntent(parsed.intent)) {
    const result = await answerQuery(parsed, deps.queryDb, deps.ctx.currency);
    if (parsed.intent === 'general_business_question' && deps.provider && !opts.queryOnly) {
      try {
        const res = await deps.provider.complete({
          system: `${PROMPTS.assistant}\n\n${PROMPTS.businessAnalyst}`,
          user: JSON.stringify({ question: input, facts: result.facts }),
          json: true, maxTokens: 400, temperature: 0.2,
        });
        usage.usedLlm = true;
        usage.promptTokens += res.promptTokens;
        usage.completionTokens += res.completionTokens;
        usage.provider = res.provider;
        usage.model = res.model;
        const out = extractJson(res.text) as { answer?: unknown };
        if (typeof out.answer === 'string' && out.answer.length > 0 && out.answer.length < 2000) {
          result.text = out.answer;
        }
      } catch { /* deterministic text already answers the question */ }
    }
    return { proposal: answerProposal(parsed.intent, result), usage };
  }

  // 5. Actions: resolve against real data and apply the risk policy.
  const proposal = await buildProposal(parsed, deps.resolverDb, deps.ctx);
  if (proposal.kind === 'clarification') usage.status = 'clarification';
  return { proposal, usage };
}

/** Receipt scanning: extracted data ALWAYS requires confirmation. */
export async function processReceipt(
  image: { mimeType: string; base64: string }, deps: PipelineDeps,
): Promise<PipelineResult> {
  const usage = newUsage();
  if (!deps.provider) {
    return { proposal: { ...clarify('record_purchase', 'Receipt scanning is not configured yet.'), kind: 'error' }, usage };
  }
  const res = await deps.provider.complete({
    system: `${PROMPTS.assistant}\n\n${PROMPTS.receiptParser}`,
    user: JSON.stringify({ today: deps.ctx.today, currency: deps.ctx.currency }),
    image, json: true, maxTokens: 1200,
  });
  usage.usedLlm = true;
  usage.promptTokens = res.promptTokens;
  usage.completionTokens = res.completionTokens;
  usage.provider = res.provider;
  usage.model = res.model;
  let receipt: ParsedReceipt;
  try {
    receipt = ReceiptSchema.parse(extractJson(res.text));
  } catch {
    usage.status = 'error';
    usage.errorCode = 'schema_violation';
    return { proposal: { ...clarify('record_purchase', 'I couldn’t read that receipt clearly. Please enter it manually.'), kind: 'error' }, usage };
  }
  const parsed: ParsedMessage = {
    intent: 'record_purchase',
    confidence: Math.min(receipt.confidence, 0.8),
    requires_confirmation: true,
    clarification_question: receipt.total === null ? 'I couldn’t read the total on this receipt. How much was it?' : null,
    missing_fields: [],
    transaction: {
      amount: receipt.total, currency: receipt.currency, payment_method: receipt.payment_method, payment_provider: null,
      description: receipt.vendor ? `Receipt: ${receipt.vendor}` : 'Scanned receipt',
      customer_name: null, supplier_name: receipt.vendor, expense_category: null, date: receipt.date,
    },
    items: receipt.items.filter((i) => i.quantity !== null).map((i) => ({
      product_name: i.name, quantity: i.quantity, unit_price: i.unit_price, unit: null,
    })),
    product: null, inventory: null, query: null,
  };
  usage.parsed = parsed;
  usage.intent = parsed.intent;
  const proposal = await buildProposal(parsed, deps.resolverDb, deps.ctx);
  proposal.requires_confirmation = true;
  proposal.auto_commit = false;
  if (!proposal.risk_reasons.includes('receipt_extraction')) proposal.risk_reasons.push('receipt_extraction');
  proposal.preview?.warnings.unshift('Extracted from a photo — please check every value before confirming.');
  if (receipt.unreadable_fields.length) {
    proposal.preview?.warnings.push(`Couldn’t read: ${receipt.unreadable_fields.join(', ')}.`);
  }
  return { proposal, usage };
}
