// Turns a validated ParsedMessage into a Proposal the client can show and,
// after confirmation, commit through the database's own validated RPCs.
// Every name is resolved against the business's REAL data. Ambiguity or a
// missing critical value always becomes a clarification — never a guess.

import { formatMoney, toMinor } from './money.ts';
import { evaluateRisk } from './risk.ts';
import { INTENT_TO_TYPE, ParsedMessage } from './schema.ts';
import { singularize, titleCase } from './quick_parser.ts';

export interface EntityMatch {
  query: string;
  id: string;
  name: string;
  score: number;
  selling_price_minor: number | null;
  cost_price_minor: number | null;
  unit: string | null;
}

export interface ResolverDb {
  matchEntities(kind: 'product' | 'customer' | 'supplier', names: string[]): Promise<EntityMatch[]>;
}

export interface ResolverContext {
  currency: string;
  today: string;
  autoRecordLowRisk: boolean;
  confirmThresholdMinor: number;
  role: string | null;
}

export type ActionKind = 'record_transaction' | 'add_product' | 'update_product' | 'adjust_inventory';

export interface PreviewLine { label: string; value: string }
export interface ClarificationOption { label: string; value: string }

export interface Proposal {
  kind: 'action' | 'clarification' | 'answer' | 'error';
  intent: string;
  confidence: number;
  message: string;
  requires_confirmation: boolean;
  auto_commit: boolean;
  risk_reasons: string[];
  action?: { kind: ActionKind; payload: Record<string, unknown> };
  preview?: { title: string; lines: PreviewLine[]; effects: string[]; warnings: string[] };
  question?: string;
  options?: ClarificationOption[];
  answer?: { text: string; data?: unknown; open?: string };
}

const TITLES: Record<string, string> = {
  sale: 'Sale detected', purchase: 'Purchase detected', expense: 'Expense detected', income: 'Income detected',
  payment_received: 'Payment received', payment_sent: 'Payment to record', adjustment: 'Balance to record',
};
const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', bank: 'Bank transfer', card: 'Card', wallet: 'Mobile wallet', credit: 'On credit', other: 'Other',
};

export function clarify(intent: string, question: string, confidence = 0.5, options?: ClarificationOption[]): Proposal {
  return {
    kind: 'clarification', intent, confidence, message: question, question, options,
    requires_confirmation: true, auto_commit: false, risk_reasons: [],
  };
}

function fmtQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function isExact(match: EntityMatch, query: string): boolean {
  const a = match.name.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  return a === q || a === singularize(q) || singularize(a) === singularize(q);
}

type Pick = { match: EntityMatch; exact: boolean } | { ambiguous: EntityMatch[] } | null;

/** Pick the best match for one name: exact > single strong fuzzy > ambiguous > none. */
export function pickMatch(query: string, matches: EntityMatch[]): Pick {
  const mine = matches.filter((m) => m.query === query);
  const exact = mine.filter((m) => isExact(m, query));
  if (exact.length === 1) return { match: exact[0], exact: true };
  if (exact.length > 1) return { ambiguous: exact };
  // "burger" when the catalogue has "Zinger Burger" and "Cheese Burger": ask, never pick.
  const word = new RegExp(`\\b${singularize(query.toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`);
  const containing = mine.filter((m) => word.test(m.name.toLowerCase()));
  if (containing.length > 1) return { ambiguous: containing.slice(0, 4) };
  if (containing.length === 1) return { match: containing[0], exact: false };
  const strong = mine.filter((m) => m.score >= 0.45);
  if (strong.length === 1) return { match: strong[0], exact: false };
  if (strong.length > 1) {
    // Clear winner only if notably better than the runner-up.
    const [a, b] = [...strong].sort((x, y) => y.score - x.score);
    if (a.score - b.score >= 0.25) return { match: a, exact: false };
    return { ambiguous: strong.slice(0, 4) };
  }
  return null;
}

async function resolveParty(db: ResolverDb, kind: 'customer' | 'supplier', name: string) {
  const matches = await db.matchEntities(kind, [name]);
  const pick = pickMatch(name, matches);
  if (pick && 'ambiguous' in pick) return { ambiguous: pick.ambiguous };
  if (pick) return { id: pick.match.id, name: pick.match.name, exact: pick.exact };
  return { create: true, name: titleCase(name) };
}

export async function buildProposal(parsed: ParsedMessage, db: ResolverDb, ctx: ResolverContext): Promise<Proposal> {
  const intent = parsed.intent;

  if (parsed.clarification_question || parsed.missing_fields.length > 0) {
    return clarify(intent, parsed.clarification_question ?? 'Could you give me a few more details?', parsed.confidence);
  }
  if (ctx.role === 'viewer') {
    return { ...clarify(intent, 'You have view-only access to this business, so I can’t record changes.'), kind: 'error' };
  }

  if (intent === 'add_product' || intent === 'update_product') return productProposal(parsed, db, ctx);
  if (intent === 'inventory_adjustment') return inventoryProposal(parsed, db);

  const type = INTENT_TO_TYPE[intent];
  if (!type) return clarify(intent, 'I’m not sure what to record. Try: “Sold 3 burgers for 1500 cash”.');
  const t = parsed.transaction ?? {
    amount: null, currency: null, payment_method: null, payment_provider: null, description: null,
    customer_name: null, supplier_name: null, expense_category: null, date: null,
  };

  if (t.currency && t.currency.toUpperCase() !== ctx.currency) {
    return clarify(intent, `Your business records money in ${ctx.currency}. What was the amount in ${ctx.currency}?`);
  }

  const warnings: string[] = [];
  const effects: string[] = [];
  const lines: PreviewLine[] = [];
  const flags = { newParty: false, unknownProduct: false, fuzzyMatch: false };
  const payload: Record<string, unknown> = { type, source: 'ai' };

  let amountMinor = toMinor(t.amount, ctx.currency);
  if (t.amount !== null && amountMinor === null) {
    return clarify(intent, `I couldn’t read the amount “${t.amount}”. How much was it?`);
  }

  // ---- Items ---------------------------------------------------------------
  const items: Record<string, unknown>[] = [];
  let computedMinor = 0;
  let allPriced = true;
  if (parsed.items.length && ['sale', 'purchase', 'refund'].includes(type)) {
    const matches = await db.matchEntities('product', parsed.items.map((i) => i.product_name));
    for (const item of parsed.items) {
      const pick = pickMatch(item.product_name, matches);
      if (pick && 'ambiguous' in pick) {
        const names = pick.ambiguous.map((m) => m.name);
        return clarify(intent,
          `I found ${names.length} products like “${item.product_name}”: ${names.join(', ')}. Which one did you mean?`,
          parsed.confidence, pick.ambiguous.map((m) => ({ label: m.name, value: m.name })));
      }
      if (item.quantity === null) {
        if (type === 'purchase' && amountMinor !== null) {
          warnings.push(`Stock for ${pick?.match.name ?? item.product_name} won’t change because no quantity was given.`);
          continue;
        }
        return clarify(intent, `How many ${item.product_name.toLowerCase()} — and for what amount?`, parsed.confidence);
      }
      const unitPrice = toMinor(item.unit_price, ctx.currency);
      if (pick) {
        if (!pick.exact) {
          flags.fuzzyMatch = true;
          warnings.push(`Matched “${item.product_name}” to your product “${pick.match.name}”.`);
        }
        const listPrice = type === 'purchase' ? pick.match.cost_price_minor : pick.match.selling_price_minor;
        const price = unitPrice ?? listPrice;
        if (price === null) allPriced = false; else computedMinor += Math.round(item.quantity * price);
        items.push({ product_id: pick.match.id, name: pick.match.name, quantity: item.quantity,
          ...(unitPrice !== null ? { unit_price_minor: unitPrice } : {}) });
        const unit = pick.match.unit && pick.match.unit !== 'pcs' ? ` ${pick.match.unit}` : '';
        effects.push(type === 'sale'
          ? `Inventory will decrease: ${pick.match.name} −${fmtQty(item.quantity)}${unit}`
          : `Inventory will increase: ${pick.match.name} +${fmtQty(item.quantity)}${unit}`);
      } else {
        flags.unknownProduct = true;
        if (unitPrice === null) allPriced = false; else computedMinor += Math.round(item.quantity * unitPrice);
        items.push({ name: titleCase(item.product_name), quantity: item.quantity,
          ...(unitPrice !== null ? { unit_price_minor: unitPrice } : {}) });
        warnings.push(`“${titleCase(item.product_name)}” isn’t in your products yet, so stock won’t be tracked for it.`);
      }
    }
    if (items.length > 1 && amountMinor !== null && !allPriced) {
      return clarify(intent, 'What was the price of each item?', parsed.confidence);
    }
    if (items.length) payload.items = items;
    const label = items.map((i) => `${fmtQty(i.quantity as number)} × ${i.name}`).join(', ');
    if (label) lines.push({ label: 'Items', value: label });
  }

  if (amountMinor === null) {
    if (items.length && allPriced) {
      amountMinor = computedMinor;                        // from the business's own price list
      warnings.push('Amount calculated from your product prices.');
    } else {
      const what = type === 'sale' ? 'What was the total amount of the sale?' : 'How much was it?';
      return clarify(intent, what, parsed.confidence);
    }
  } else {
    payload.amount_minor = amountMinor;
  }
  if (amountMinor <= 0 && type !== 'adjustment') return clarify(intent, 'The amount must be more than zero. How much was it?');

  // ---- Parties ---------------------------------------------------------------
  const method = t.payment_method ?? (type === 'adjustment' ? 'credit' : 'cash');
  const needsCustomer = ['payment_received'].includes(type) || intent === 'record_customer_debt'
    || (method === 'credit' && type === 'sale');
  const needsSupplier = intent === 'record_supplier_debt' || (method === 'credit' && ['purchase', 'expense'].includes(type));

  if (t.customer_name || needsCustomer) {
    if (!t.customer_name) return clarify(intent, type === 'sale' ? 'Who bought on credit?' : 'Who was it from?');
    const r = await resolveParty(db, 'customer', t.customer_name);
    if ('ambiguous' in r && r.ambiguous) {
      return clarify(intent, `I found more than one customer like “${t.customer_name}”. Which one?`, parsed.confidence,
        r.ambiguous.map((m) => ({ label: m.name, value: m.name })));
    }
    if ('create' in r) {
      flags.newParty = true;
      payload.customer_name = r.name;
      payload.create_customer = true;
      warnings.push(`New customer “${r.name}” will be added.`);
    } else {
      payload.customer_id = r.id;
      if (!r.exact) { flags.fuzzyMatch = true; warnings.push(`Matched “${t.customer_name}” to customer “${r.name}”.`); }
    }
    lines.push({ label: 'Customer', value: (payload.customer_name as string) ?? r.name! });
  }

  if (t.supplier_name || needsSupplier) {
    if (!t.supplier_name) return clarify(intent, 'Which supplier was this with?');
    let r = await resolveParty(db, 'supplier', t.supplier_name);
    // "Transfer 100,000 to Ahmed": the recipient may be a customer (e.g. a refund).
    if ('create' in r && type === 'payment_sent') {
      const asCustomer = await resolveParty(db, 'customer', t.supplier_name);
      if (!('create' in asCustomer) && !('ambiguous' in asCustomer && asCustomer.ambiguous)) {
        return clarify(intent, `${asCustomer.name} is one of your customers. Is this a refund to them, or a payment to a supplier?`,
          parsed.confidence, [{ label: 'Refund to customer', value: `Refund ${t.amount} to ${asCustomer.name}` },
                              { label: 'Payment to supplier', value: `Paid supplier ${asCustomer.name} ${t.amount}` }]);
      }
    }
    if ('ambiguous' in r && r.ambiguous) {
      return clarify(intent, `I found more than one supplier like “${t.supplier_name}”. Which one?`, parsed.confidence,
        r.ambiguous.map((m) => ({ label: m.name, value: m.name })));
    }
    r = r as Exclude<typeof r, { ambiguous: EntityMatch[] }>;
    if ('create' in r) {
      flags.newParty = true;
      payload.supplier_name = r.name;
      payload.create_supplier = true;
      warnings.push(`New supplier “${r.name}” will be added.`);
    } else {
      payload.supplier_id = r.id;
      if (!r.exact) { flags.fuzzyMatch = true; warnings.push(`Matched “${t.supplier_name}” to supplier “${r.name}”.`); }
    }
    lines.push({ label: type === 'payment_sent' ? 'Recipient' : 'Supplier', value: r.name! });
  }

  if (type === 'expense') {
    payload.expense_category_name = titleCase(t.expense_category ?? 'Other');
    lines.push({ label: 'Category', value: payload.expense_category_name as string });
  }

  payload.payment_method = method;
  if (t.payment_provider) payload.payment_provider = t.payment_provider;
  if (t.description) payload.description = t.description.slice(0, 500);
  if (t.date && t.date !== ctx.today) {
    if (t.date > ctx.today) return clarify(intent, 'That date is in the future. When did this happen?');
    payload.transaction_date = `${t.date}T12:00:00Z`;
    lines.push({ label: 'Date', value: t.date });
  }

  lines.splice(items.length ? 1 : 0, 0, { label: 'Amount', value: formatMoney(amountMinor, ctx.currency) });
  lines.push({ label: 'Payment', value: METHOD_LABEL[method] + (t.payment_provider ? ` · ${t.payment_provider}` : '') });
  if (type === 'sale' && method === 'credit') effects.push('Customer balance will increase.');
  if (type === 'payment_received') effects.push('Customer balance will decrease.');
  if (intent === 'record_customer_debt') effects.push('Customer will owe you this amount.');
  if (intent === 'record_supplier_debt') effects.push('You will owe this supplier this amount.');

  const risk = evaluateRisk({
    type, intent, amountMinor, confidence: parsed.confidence, modelAskedConfirmation: parsed.requires_confirmation,
    thresholdMinor: ctx.confirmThresholdMinor, autoRecord: ctx.autoRecordLowRisk, ...flags,
  });

  return {
    kind: 'action', intent, confidence: parsed.confidence,
    message: TITLES[type] ?? 'Ready to record',
    requires_confirmation: risk.requiresConfirmation,
    auto_commit: !risk.requiresConfirmation,
    risk_reasons: risk.reasons,
    action: { kind: 'record_transaction', payload },
    preview: { title: TITLES[type] ?? 'Ready to record', lines, effects, warnings },
  };
}

async function productProposal(parsed: ParsedMessage, db: ResolverDb, ctx: ResolverContext): Promise<Proposal> {
  const p = parsed.product;
  if (!p) return clarify(parsed.intent, 'What is the product called, and what is its price?');
  const selling = toMinor(p.selling_price, ctx.currency);
  const cost = toMinor(p.cost_price, ctx.currency);
  const matches = await db.matchEntities('product', [p.name]);
  const pick = pickMatch(p.name, matches);
  const existing = pick && !('ambiguous' in pick) && pick.exact ? pick.match : null;

  if (parsed.intent === 'add_product' && !existing) {
    if (selling === null) return clarify(parsed.intent, `What price do you sell ${titleCase(p.name)} for?`);
    const lines = [{ label: 'Product', value: titleCase(p.name) }, { label: 'Selling price', value: formatMoney(selling, ctx.currency) }];
    if (cost !== null) lines.push({ label: 'Cost price', value: formatMoney(cost, ctx.currency) });
    return {
      kind: 'action', intent: 'add_product', confidence: parsed.confidence, message: 'New product',
      requires_confirmation: true, auto_commit: false, risk_reasons: ['catalogue_change'],
      action: { kind: 'add_product', payload: { name: titleCase(p.name), selling_price_minor: selling, cost_price_minor: cost,
        unit: p.unit ?? 'pcs', sku: p.sku } },
      preview: { title: 'New product', lines, effects: ['Product will be added to your catalogue.'],
        warnings: cost === null ? ['Add a cost price later so profit can be calculated.'] : [] },
    };
  }
  const target = existing ?? (pick && !('ambiguous' in pick) ? pick.match : null);
  if (!target) {
    if (pick && 'ambiguous' in pick) {
      return clarify(parsed.intent, `Which product did you mean: ${pick.ambiguous.map((m) => m.name).join(', ')}?`, parsed.confidence,
        pick.ambiguous.map((m) => ({ label: m.name, value: m.name })));
    }
    return clarify(parsed.intent, `I couldn’t find a product called “${p.name}”. Do you want to add it?`, parsed.confidence,
      [{ label: `Add ${titleCase(p.name)}`, value: `Add product ${p.name} for ${p.selling_price ?? ''}` }]);
  }
  if (selling === null && cost === null) return clarify(parsed.intent, `What should the new price of ${target.name} be?`);
  const lines: PreviewLine[] = [{ label: 'Product', value: target.name }];
  if (selling !== null) lines.push({ label: 'Selling price', value: `${formatMoney(target.selling_price_minor, ctx.currency)} → ${formatMoney(selling, ctx.currency)}` });
  if (cost !== null) lines.push({ label: 'Cost price', value: `${formatMoney(target.cost_price_minor, ctx.currency)} → ${formatMoney(cost, ctx.currency)}` });
  return {
    kind: 'action', intent: 'update_product', confidence: parsed.confidence, message: 'Update product',
    requires_confirmation: true, auto_commit: false, risk_reasons: ['catalogue_change'],
    action: { kind: 'update_product', payload: { product_id: target.id,
      ...(selling !== null ? { selling_price_minor: selling } : {}), ...(cost !== null ? { cost_price_minor: cost } : {}) } },
    preview: { title: existing && parsed.intent === 'add_product' ? `${target.name} already exists — update its price?` : 'Update product',
      lines, effects: [], warnings: [] },
  };
}

async function inventoryProposal(parsed: ParsedMessage, db: ResolverDb): Promise<Proposal> {
  const inv = parsed.inventory;
  if (!inv || inv.quantity_change === null) return clarify(parsed.intent, 'Which product, and by how much did the stock change?');
  const matches = await db.matchEntities('product', [inv.product_name]);
  const pick = pickMatch(inv.product_name, matches);
  if (!pick) return clarify(parsed.intent, `I couldn’t find a product called “${inv.product_name}”.`);
  if ('ambiguous' in pick) {
    return clarify(parsed.intent, `Which product did you mean: ${pick.ambiguous.map((m) => m.name).join(', ')}?`, parsed.confidence,
      pick.ambiguous.map((m) => ({ label: m.name, value: m.name })));
  }
  const change = ['waste', 'damage'].includes(inv.reason) ? -Math.abs(inv.quantity_change) : inv.quantity_change;
  const unit = pick.match.unit && pick.match.unit !== 'pcs' ? ` ${pick.match.unit}` : '';
  return {
    kind: 'action', intent: 'inventory_adjustment', confidence: parsed.confidence, message: 'Stock adjustment',
    requires_confirmation: true, auto_commit: false, risk_reasons: ['inventory_change'],
    action: { kind: 'adjust_inventory', payload: { product_id: pick.match.id, type: inv.reason, quantity_change: change,
      note: `Recorded via assistant (${inv.reason})` } },
    preview: { title: 'Stock adjustment', lines: [
      { label: 'Product', value: pick.match.name },
      { label: 'Change', value: `${change > 0 ? '+' : '−'}${fmtQty(Math.abs(change))}${unit}` },
      { label: 'Reason', value: titleCase(inv.reason) },
    ], effects: [`Inventory will ${change > 0 ? 'increase' : 'decrease'}.`], warnings: [] },
  };
}
