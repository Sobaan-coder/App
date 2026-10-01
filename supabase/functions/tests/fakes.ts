import { AICompletionRequest, AICompletionResult, AIProvider } from '../_shared/ai/types.ts';
import { EntityMatch, ResolverDb } from '../_shared/resolver.ts';
import { QueryDb } from '../_shared/queries.ts';

export const CATALOG = {
  product: [
    { id: 'p-zinger', name: 'Zinger Burger', selling_price_minor: 50000, cost_price_minor: 30000, unit: 'pcs' },
    { id: 'p-pizza', name: 'Pizza', selling_price_minor: 120000, cost_price_minor: 65000, unit: 'pcs' },
    { id: 'p-chicken', name: 'Chicken', selling_price_minor: null, cost_price_minor: 52000, unit: 'kg' },
    { id: 'p-cheese', name: 'Cheese Burger', selling_price_minor: 45000, cost_price_minor: 25000, unit: 'pcs' },
    { id: 'p-cake', name: 'Cake', selling_price_minor: null, cost_price_minor: null, unit: 'pcs' },
  ],
  customer: [{ id: 'c-ahmed', name: 'Ahmed' }, { id: 'c-ali1', name: 'Ali Khan' }, { id: 'c-ali2', name: 'Ali Raza' }],
  supplier: [{ id: 's-poultry', name: 'Fresh Poultry' }],
};

// Rough emulation of the SQL match_entities() function (trigram-like scoring).
function score(a: string, b: string): number {
  const grams = (s: string) => {
    const t = `  ${s.toLowerCase()} `;
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = grams(a), B = grams(b);
  const inter = [...A].filter((g) => B.has(g)).length;
  return inter / (A.size + B.size - inter);
}

export const fakeResolverDb: ResolverDb = {
  matchEntities(kind, names) {
    const rows = CATALOG[kind] as Array<Record<string, any>>;
    const out: EntityMatch[] = [];
    for (const q of names) {
      const ranked = rows.map((r) => ({ r, s: score(r.name, q) }))
        .filter(({ r, s }) => s >= 0.3 || r.name.toLowerCase() === q.toLowerCase()
          || r.name.toLowerCase() === q.toLowerCase().replace(/s$/, ''))
        .sort((x, y) => y.s - x.s).slice(0, 5);
      for (const { r, s } of ranked) {
        out.push({ query: q, id: r.id, name: r.name, score: s, selling_price_minor: r.selling_price_minor ?? null,
          cost_price_minor: r.cost_price_minor ?? null, unit: r.unit ?? null });
      }
    }
    return Promise.resolve(out);
  },
};

export const fakeQueryDb: QueryDb = {
  dashboardSummary: () => Promise.resolve({
    sales_minor: 8745000, sales_count: 23, expenses_minor: 450000, expenses_count: 1, purchases_minor: 520000,
    revenue_minor: 8745000, cogs_minor: null, net_profit_minor: null, other_income_minor: 0,
    net_cash_flow_minor: 7775000, profit_unavailable_reason: 'incomplete_cost_data', receivables_minor: 300000,
    payables_minor: 0, low_stock_count: 1,
  }),
  expenseBreakdown: () => Promise.resolve([{ category: 'Electricity', amount_minor: 450000 }]),
  topProducts: () => Promise.resolve([{ name: 'Zinger Burger', quantity: 40, revenue_minor: 2000000 }, { name: 'Pizza', quantity: 12, revenue_minor: 1440000 }]),
  lowStock: () => Promise.resolve([{ name: 'Chicken', stock_quantity: 3, minimum_stock: 5, unit: 'kg' }]),
  customerBalances: () => Promise.resolve([{ name: 'Ahmed', outstanding_minor: 300000 }, { name: 'Sara', outstanding_minor: 0 }]),
  supplierBalances: () => Promise.resolve([]),
  spendOn: (term) => Promise.resolve(term === 'chicken' ? { total_minor: 1040000, count: 2 } : { total_minor: 0, count: 0 }),
  productStock: () => Promise.resolve([{ name: 'Chicken', stock_quantity: 53, unit: 'kg' }]),
};

export class FakeProvider implements AIProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  calls: AICompletionRequest[] = [];
  constructor(private readonly responder: (req: AICompletionRequest) => string) {}
  complete(req: AICompletionRequest): Promise<AICompletionResult> {
    this.calls.push(req);
    return Promise.resolve({ text: this.responder(req), promptTokens: 100, completionTokens: 50, model: this.model, provider: this.name });
  }
}

export const ctx = { currency: 'PKR', today: '2026-10-01', autoRecordLowRisk: true, confirmThresholdMinor: 2_000_000, role: 'owner' };
