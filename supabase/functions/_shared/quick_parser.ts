// Deterministic, zero-cost parser for the most common phrasings.
// AI cost control: when this parser is confident, no LLM call is made.
// It returns null when unsure so the caller can fall back to the LLM.
// It NEVER fills in a missing number — vague input becomes a clarification.

import { Intent, ParsedMessage } from './schema.ts';

type Period = 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'last_month' | 'this_year' | 'all';

const AMOUNT = String.raw`(?:rs\.?|pkr|inr|usd|aed|sar|gbp|eur|\$|£|€|₹)?\s*(\d[\d,]*(?:\.\d+)?\s*(?:k|lac|lakh)?)\s*(?:rs|rupees?|pkr|\/-|dollars?)?`;

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, dozen: 12,
};
const VAGUE_QTY = /^(some|few|a few|several|many|lots of|a lot of|multiple|bunch of|a bunch of)\b/;
const UNITS = ['kg', 'kgs', 'g', 'gram', 'grams', 'l', 'liter', 'liters', 'litre', 'litres', 'ml', 'pcs', 'pc',
  'pieces', 'piece', 'packs', 'pack', 'boxes', 'box', 'bags', 'bag', 'dozen', 'bottles', 'bottle', 'cartons', 'carton',
  'plates', 'plate', 'units', 'unit', 'meters', 'meter', 'm'];

const EXPENSE_CATEGORIES: Array<[RegExp, string]> = [
  [/\b(electric(ity)?|bijli|power|light) ?(bill)?\b/, 'Electricity'],
  [/\b(rent|kiraya)\b/, 'Rent'],
  [/\bgas\b/, 'Gas'],
  [/\bwater\b/, 'Water'],
  [/\b(internet|wifi|wi-fi|broadband|phone bill|mobile bill)\b/, 'Internet'],
  [/\b(salary|salaries|wage|wages|worker|staff|employee|helper|cook|chef|waiter|cashier)\b/, 'Salaries'],
  [/\b(transport|fuel|petrol|diesel|delivery|rickshaw|taxi|uber|careem|fare)\b/, 'Transport'],
  [/\b(marketing|ads?|advert(isement|ising)?|facebook ads|promotion|flyers?)\b/, 'Marketing'],
  [/\b(supplies|stationery|cleaning)\b/, 'Supplies'],
  [/\b(repair|repairs|maintenance|plumber|electrician|service)\b/, 'Maintenance'],
  [/\b(packaging|packing|boxes|bags|wrappers?)\b/, 'Packaging'],
];

const PAYMENT_PATTERNS: Array<[RegExp, string, string | null]> = [
  [/\b(?:via|by|through|with|in|on)?\s*easy ?paisa\b/, 'wallet', 'Easypaisa'],
  [/\b(?:via|by|through|with|in|on)?\s*jazz ?cash\b/, 'wallet', 'JazzCash'],
  [/\b(?:via|by|through|with|in|on)?\s*sadapay\b/, 'wallet', 'SadaPay'],
  [/\b(?:via|by|through|with|in|on)?\s*nayapay\b/, 'wallet', 'NayaPay'],
  [/\b(?:via|by|through|with|in|on)?\s*paypal\b/, 'wallet', 'PayPal'],
  [/\b(?:via|by|through|with|in|on|using)?\s*(?:bank(?: transfer)?|online transfer|ibft|raast)\b/, 'bank', null],
  [/\b(?:via|by|through|with|in|on|using)?\s*(?:credit card|debit card|card|visa|mastercard)\b/, 'card', null],
  [/\b(?:on|in|as)?\s*(?:credit|udhaar|udhar|udaar|pay later)\b/, 'credit', null],
  [/\b(?:via|by|through|with|in|on)?\s*(?:mobile wallet|wallet)\b/, 'wallet', null],
  [/\b(?:in|by|with|paid in|as)?\s*cash\b/, 'cash', null],
];

const PERIOD_PATTERNS: Array<[RegExp, Period]> = [
  [/\b(today|today's|todays|so far today)\b/, 'today'],
  [/\byesterday('s)?\b/, 'yesterday'],
  [/\b(this week|last 7 days|past 7 days|past week|last week)\b/, '7d'],
  [/\b(last 30 days|past 30 days|past month)\b/, '30d'],
  [/\b(this month|this month's|month to date)\b/, 'this_month'],
  [/\blast month('s)?\b/, 'last_month'],
  [/\b(this year|year to date|ytd)\b/, 'this_year'],
  [/\b(all time|ever|overall|in total)\b/, 'all'],
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[“”"]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '').trim();
}

export function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, ' ').split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/** Very small English singularizer for product names ("burgers" -> "burger"). */
export function singularize(word: string): string {
  const parts = word.trim().split(' ');
  const last = parts.pop() ?? '';
  let s = last;
  if (/(ies|ss|us|is)$/.test(last) || last.length <= 3) s = last;          // fries, glass, hummus
  else if (/(ches|shes|xes|zes)$/.test(last)) s = last.slice(0, -2);
  else if (last.endsWith('s')) s = last.slice(0, -1);
  return [...parts, s].join(' ');
}

function extractPayment(text: string): { text: string; method: string | null; provider: string | null } {
  for (const [re, method, provider] of PAYMENT_PATTERNS) {
    const m = text.match(re);
    if (m) return { text: text.replace(re, ' ').replace(/\s+/g, ' ').trim(), method, provider };
  }
  return { text, method: null, provider: null };
}

function extractPeriod(text: string): { text: string; period: Period | null } {
  for (const [re, p] of PERIOD_PATTERNS) {
    if (re.test(text)) return { text: text.replace(re, ' ').replace(/\s+/g, ' ').trim(), period: p };
  }
  return { text, period: null };
}

function parseQty(raw: string): { qty: number | null; vague: boolean; rest: string; unit: string | null } {
  let s = raw.trim();
  if (VAGUE_QTY.test(s)) return { qty: null, vague: true, rest: s.replace(VAGUE_QTY, '').trim(), unit: null };
  let qty: number | null = null;
  const num = s.match(/^(\d+(?:\.\d+)?)\s*/);
  if (num) {
    qty = Number(num[1]);
    s = s.slice(num[0].length);
  } else {
    const w = s.match(/^([a-z]+)\s+/);
    if (w && NUMBER_WORDS[w[1]] !== undefined) {
      qty = NUMBER_WORDS[w[1]];
      s = s.slice(w[0].length);
    }
  }
  let unit: string | null = null;
  const u = s.match(/^([a-z]+)\b\s*(?:of\s+)?/);
  if (u && UNITS.includes(u[1]) && s.slice(u[0].length).trim().length > 0) {
    unit = u[1].replace(/s$/, '');
    if (unit === 'kg' || unit === 'kgs') unit = 'kg';
    s = s.slice(u[0].length);
  }
  s = s.replace(/^of\s+/, '');
  return { qty, vague: false, rest: s.trim(), unit };
}

function parseItems(list: string) {
  const chunks = list.split(/\s*(?:,|\band\b|&|\+)\s*/).filter(Boolean);
  const items: { product_name: string; quantity: number | null; unit_price: null; unit: string | null }[] = [];
  let vague = false;
  for (const chunk of chunks) {
    const q = parseQty(chunk);
    if (q.vague) vague = true;
    const name = q.rest.replace(/^(the|my)\s+/, '').trim();
    if (!name || name.length > 60 || /\d/.test(name)) return null;
    items.push({ product_name: titleCase(singularize(name)), quantity: q.qty, unit_price: null, unit: q.unit });
  }
  return items.length ? { items, vague } : null;
}

function base(intent: Intent, confidence: number): ParsedMessage {
  return {
    intent, confidence, requires_confirmation: false, clarification_question: null, missing_fields: [],
    transaction: null, items: [], product: null, inventory: null, query: null,
  };
}

function tx(over: Partial<NonNullable<ParsedMessage['transaction']>>): NonNullable<ParsedMessage['transaction']> {
  return {
    amount: null, currency: null, payment_method: null, payment_provider: null, description: null,
    customer_name: null, supplier_name: null, expense_category: null, date: null, ...over,
  };
}

function cleanName(s: string): string | null {
  const n = s.replace(/^(mr|mrs|ms|bhai|sir)\.?\s+/, '').replace(/\s+(bhai|sahab|sb)$/, '').trim();
  if (!n || n.length > 60 || /\d/.test(n)) return null;
  return titleCase(n);
}

function dateFor(period: Period | null, today: string): string | null {
  if (period !== 'yesterday') return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const QUESTION_START = /^(how|what|what's|whats|who|whom|which|show|tell|give|list|did|do|does|any|is|are|can you|could you|please show|get|display|summar)/;

export function quickParse(input: string, opts: { today: string }): ParsedMessage | null {
  const original = normalize(input);
  if (!original || original.length > 300) return null;
  const isQuestion = input.trim().endsWith('?') || QUESTION_START.test(original);

  if (isQuestion) return parseQuestion(original);

  const { text: noPeriod, period } = extractPeriod(original);
  const { text, method, provider } = extractPayment(noPeriod);
  const date = dateFor(period, opts.today);
  let m: RegExpMatchArray | null;

  // --- Sale ------------------------------------------------------------------
  if ((m = text.match(/^(?:i\s+)?(?:sold|sell|sale of|sales of)\s+(.+?)$/))) {
    let rest = m[1];
    let amount: string | null = null;
    let customer: string | null = null;
    const a = rest.match(new RegExp(String.raw`\s+(?:for|at|@|=|in|worth)\s+${AMOUNT}(?:\s+(?:total|each))?\s*`));
    if (a) {
      if (/\beach\b/.test(a[0])) return null;                       // per-unit pricing: let the LLM handle
      amount = a[1];
      rest = (rest.slice(0, a.index) + ' ' + rest.slice((a.index ?? 0) + a[0].length)).trim();
    }
    const c = rest.match(/\s+to\s+([a-z][a-z .'-]*)$/);
    if (c) { customer = cleanName(c[1]); rest = rest.slice(0, c.index).trim(); if (!customer) return null; }
    const parsed = parseItems(rest);
    if (!parsed) return null;
    const p = base('record_sale', 0.95);
    p.transaction = tx({ amount, payment_method: method as never, payment_provider: provider, customer_name: customer,
      description: original.slice(0, 200), date });
    p.items = parsed.items;
    const unknownQty = parsed.items.filter((i) => i.quantity === null);
    if (parsed.vague || unknownQty.length) {
      const names = unknownQty.map((i) => i.product_name.toLowerCase() + 's').join(' and ');
      p.confidence = 0.6;
      p.missing_fields = amount ? ['quantity'] : ['quantity', 'amount'];
      p.clarification_question = amount
        ? `How many ${names} did you sell?`
        : `How many ${names} did you sell, and for what amount?`;
    }
    return p;
  }

  // --- Purchase --------------------------------------------------------------
  if ((m = text.match(/^(?:i\s+)?(?:bought|buy|purchased|purchase of|purchase)\s+(.+?)$/))) {
    let rest = m[1];
    let amount: string | null = null;
    let supplier: string | null = null;
    const a = rest.match(new RegExp(String.raw`\s+(?:for|at|@|=|worth)\s+${AMOUNT}\s*`));
    if (a) {
      amount = a[1];
      rest = (rest.slice(0, a.index) + ' ' + rest.slice((a.index ?? 0) + a[0].length)).trim();
    }
    const f = rest.match(/\s+from\s+([a-z][a-z .&'-]*)$/);
    if (f) { supplier = cleanName(f[1]); rest = rest.slice(0, f.index).trim(); if (!supplier) return null; }
    const parsed = parseItems(rest);
    if (!parsed) return null;
    const p = base('record_purchase', 0.93);
    p.transaction = tx({ amount, payment_method: method as never, payment_provider: provider, supplier_name: supplier,
      description: original.slice(0, 200), date });
    p.items = parsed.items;
    if (!amount) {
      p.confidence = 0.6;
      p.missing_fields = ['amount'];
      p.clarification_question = `How much did you pay for the ${parsed.items.map((i) => i.product_name.toLowerCase()).join(' and ')}?`;
    }
    return p;
  }

  // --- Debts -----------------------------------------------------------------
  if ((m = text.match(new RegExp(String.raw`^([a-z][a-z .'-]*?)\s+owes\s+(?:me|us)\s+${AMOUNT}$`)))) {
    const name = cleanName(m[1]);
    if (!name) return null;
    const p = base('record_customer_debt', 0.95);
    p.transaction = tx({ amount: m[2], customer_name: name, payment_method: 'credit', description: `${name} owes`, date });
    return p;
  }
  if ((m = text.match(new RegExp(String.raw`^(?:i|we)\s+owe\s+([a-z][a-z .&'-]*?)\s+${AMOUNT}$`)))) {
    const name = cleanName(m[1]);
    if (!name) return null;
    const p = base('record_supplier_debt', 0.95);
    p.transaction = tx({ amount: m[2], supplier_name: name, payment_method: 'credit', description: `Owed to ${name}`, date });
    return p;
  }

  // --- Payment received --------------------------------------------------------
  if ((m = text.match(new RegExp(String.raw`^(?:i\s+|we\s+)?(?:received|got|collected)\s+${AMOUNT}\s+from\s+([a-z][a-z .'-]*)$`)))) {
    const name = cleanName(m[2]);
    if (!name) return null;
    const p = base('record_payment_received', 0.95);
    p.transaction = tx({ amount: m[1], customer_name: name, payment_method: (method ?? 'cash') as never,
      payment_provider: provider, description: `Payment from ${name}`, date });
    return p;
  }
  if ((m = text.match(new RegExp(String.raw`^([a-z][a-z .'-]*?)\s+(?:paid|gave)\s+(?:me|us)\s+${AMOUNT}$`)))) {
    const name = cleanName(m[1]);
    if (!name) return null;
    const p = base('record_payment_received', 0.93);
    p.transaction = tx({ amount: m[2], customer_name: name, payment_method: (method ?? 'cash') as never,
      payment_provider: provider, description: `Payment from ${name}`, date });
    return p;
  }

  // --- Other income ------------------------------------------------------------
  if ((m = text.match(new RegExp(String.raw`^(?:i\s+)?(?:received|earned|got)\s+${AMOUNT}\s+(?:as|for|in)\s+(.+)$`)))) {
    const p = base('record_income', 0.9);
    p.transaction = tx({ amount: m[1], description: titleCase(m[2]).slice(0, 200), payment_method: method as never,
      payment_provider: provider, date });
    return p;
  }

  // --- Payments to suppliers / transfers --------------------------------------
  if ((m = text.match(new RegExp(String.raw`^(?:i\s+)?(?:paid|transfer(?:red)?|sent|send)\s+(?:supplier|vendor)\s+([a-z][a-z .&'-]*?)\s+${AMOUNT}$`)))) {
    const name = cleanName(m[1]);
    if (!name) return null;
    const p = base('record_payment_sent', 0.93);
    p.transaction = tx({ amount: m[2], supplier_name: name, payment_method: (method ?? 'cash') as never,
      payment_provider: provider, description: `Payment to ${name}`, date });
    return p;
  }
  if ((m = text.match(new RegExp(String.raw`^(?:transfer(?:red)?|send|sent)\s+${AMOUNT}\s+to\s+([a-z][a-z .&'-]*)$`)))) {
    const name = cleanName(m[2]);
    if (!name) return null;
    const p = base('record_payment_sent', 0.9);
    p.requires_confirmation = true;
    p.transaction = tx({ amount: m[1], supplier_name: name, payment_method: (method ?? 'bank') as never,
      payment_provider: provider, description: `Transfer to ${name}`, date });
    return p;
  }

  // --- Expenses ----------------------------------------------------------------
  let descriptor: string | null = null;
  let amount: string | null = null;
  if ((m = text.match(new RegExp(String.raw`^(?:i\s+)?(?:paid|pay|spent|spend)\s+(?:the\s+|for\s+|on\s+)?(.+?)\s+(?:bill\s+)?(?:of\s+|for\s+)?${AMOUNT}$`)))) {
    descriptor = m[1]; amount = m[2];
  } else if ((m = text.match(new RegExp(String.raw`^(?:i\s+)?(?:paid|spent|spend)\s+${AMOUNT}\s+(?:on|for|as)\s+(?:the\s+)?(.+)$`)))) {
    amount = m[1]; descriptor = m[2];
  } else if ((m = text.match(new RegExp(String.raw`^(.+?)\s+(?:bill|expense)\s+(?:paid\s+)?${AMOUNT}(?:\s+paid)?$`)))) {
    descriptor = m[1]; amount = m[2];
  }
  if (descriptor && amount) {
    const d = descriptor.replace(/\s+bill$/, '').trim();
    const cat = EXPENSE_CATEGORIES.find(([re]) => re.test(d));
    if (!cat) return null;                                   // "paid Bilal 5000": person or expense? ask the LLM
    const p = base('record_expense', 0.95);
    let description = titleCase(d);
    if (cat[1] === 'Salaries') {
      const person = d.replace(/\b(salary|salaries|wages?|worker|staff|employee|helper|cook|chef|waiter|cashier|to|of|the|my)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
      description = person ? `Salary - ${titleCase(person)}` : 'Salary';
    } else if (!/bill$/i.test(description) && ['Electricity', 'Gas', 'Water', 'Internet'].includes(cat[1])) {
      description = `${titleCase(d)} bill`;
    }
    p.transaction = tx({ amount, expense_category: cat[1], description, payment_method: method as never,
      payment_provider: provider, date });
    return p;
  }

  // --- Add product ---------------------------------------------------------------
  if ((m = original.match(new RegExp(String.raw`^add\s+(?:a\s+)?(?:new\s+)?(?:product|item)\s+(?:called\s+|named\s+)?([a-z][a-z0-9 .'&-]*?)\s+(?:for|at|price|priced at|@)\s+${AMOUNT}(?:\s+cost\s+${AMOUNT})?$`)))) {
    const p = base('add_product', 0.95);
    p.requires_confirmation = true;
    p.product = { name: titleCase(m[1]), selling_price: m[2], cost_price: m[3] ?? null, unit: null, sku: null };
    return p;
  }

  return null;
}

function parseQuestion(text: string): ParsedMessage | null {
  const { text: t, period } = extractPeriod(text);
  const q = (metric: NonNullable<ParsedMessage['query']>['metric'], intent: Intent, defPeriod: Period,
    term: string | null = null, entity: string | null = null) => {
    const p = base(intent, 0.92);
    p.query = { metric, period: period ?? defPeriod, term, entity_name: entity };
    return p;
  };
  let m: RegExpMatchArray | null;

  if (/\b(do|did|does)\s+(i|we)\s+owe\b|\bpayables?\b|\bowe (to )?suppliers?\b/.test(t)) {
    return q('supplier_balance', 'query_supplier_balance', 'all');
  }
  if ((m = t.match(/\bhow much (?:does|do) ([a-z][a-z .'-]*?) owe\b/))) {
    return q('customer_balance', 'query_customer_balance', 'all', null, cleanName(m[1]));
  }
  if (/\bowes?\b|\breceivables?\b|\boutstanding\b|\bunpaid\b|\bcredit customers\b/.test(t)) {
    return q('customer_balance', 'query_customer_balance', 'all');
  }
  if (/\blow (in )?stock\b|\brunning (out|low)\b|\bout of stock\b|\brestock\b|\breorder\b/.test(t)) {
    return q('low_stock', 'query_inventory', 'today');
  }
  if ((m = t.match(/\b(?:stock of|how (?:much|many)) ([a-z][a-z .'-]*?) (?:do i have|is left|are left|left|in stock|remaining)\b/))) {
    return q('inventory', 'query_inventory', 'today', null, titleCase(singularize(m[1])));
  }
  if (/\b(sold|sell|sells|selling|seller)\b.*\b(most|best|top)\b|\b(best|top)[ -]sell|\bmost popular\b|\btop (products?|items?)\b/.test(t)) {
    return q('top_products', 'query_sales', period ?? '30d');
  }
  if ((m = t.match(/\bspen[dt]\s+on\s+([a-z][a-z .'-]*?)$/))) {
    return q('spend_on', 'query_expenses', 'this_month', m[1].trim());
  }
  if (/\bprofit|\bloss\b|\bmargin\b|\bmake money\b|\bnet (income|earnings)\b/.test(t)) {
    return q('profit', 'query_profit', 'this_month');
  }
  if (/\bexpenses?\b|\bspen[dt]\b|\bcosts?\b/.test(t)) {
    return q('expenses', 'query_expenses', 'this_month');
  }
  if (/\bsales?\b|\bsold\b|\bsell\b|\brevenue\b|\bturnover\b|\bincome\b|\bearn(ed)?\b|\borders?\b/.test(t)) {
    return q('sales', 'query_sales', 'today');
  }
  if (/\breport\b|\bsummary\b|\boverview\b/.test(t)) {
    return q('report', 'generate_report', 'this_month');
  }
  return null;
}
