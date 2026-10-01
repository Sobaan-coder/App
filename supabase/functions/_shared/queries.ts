// Answers business questions from DATABASE calculations. The LLM is optional
// and only rephrases facts computed here; it never produces numbers itself.

import { formatMoney } from './money.ts';
import { ParsedMessage } from './schema.ts';
import { Proposal } from './resolver.ts';

export interface QueryDb {
  dashboardSummary(period: string): Promise<Record<string, any>>;
  expenseBreakdown(period: string): Promise<Array<{ category: string; amount_minor: number }>>;
  topProducts(period: string, limit: number): Promise<Array<{ name: string; quantity: number; revenue_minor: number }>>;
  lowStock(): Promise<Array<{ name: string; stock_quantity: number; minimum_stock: number; unit: string }>>;
  customerBalances(name: string | null): Promise<Array<{ name: string; outstanding_minor: number }>>;
  supplierBalances(name: string | null): Promise<Array<{ name: string; outstanding_minor: number }>>;
  spendOn(term: string, period: string): Promise<{ total_minor: number; count: number }>;
  productStock(name: string): Promise<Array<{ name: string; stock_quantity: number; unit: string }>>;
}

const PERIOD_TEXT: Record<string, string> = {
  today: 'today', yesterday: 'yesterday', '7d': 'in the last 7 days', '30d': 'in the last 30 days',
  this_month: 'this month', last_month: 'last month', this_year: 'this year', all: 'in total',
};

const qty = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));

export interface QueryResult {
  text: string;
  facts: Record<string, unknown>;
  open?: string;
}

export async function answerQuery(parsed: ParsedMessage, db: QueryDb, currency: string): Promise<QueryResult> {
  const q = parsed.query ?? { metric: 'general', period: 'this_month', term: null, entity_name: null };
  const period = q.period ?? 'today';
  const when = PERIOD_TEXT[period] ?? period;
  const m = (v: number | null | undefined) => formatMoney(v ?? 0, currency);

  switch (q.metric) {
    case 'sales': {
      const s = await db.dashboardSummary(period);
      const text = s.sales_count > 0
        ? `You sold ${m(s.sales_minor)} ${when} across ${s.sales_count} ${s.sales_count === 1 ? 'sale' : 'sales'}.`
        : `No sales recorded ${when} yet.`;
      return { text, facts: { period: when, sales: m(s.sales_minor), orders: s.sales_count }, open: '/transactions' };
    }
    case 'expenses': {
      const [s, cats] = await Promise.all([db.dashboardSummary(period), db.expenseBreakdown(period)]);
      if (!s.expenses_count) return { text: `No expenses recorded ${when}.`, facts: { period: when }, open: '/expenses' };
      const top = cats.slice(0, 3).map((c) => `${c.category} ${m(c.amount_minor)}`).join(', ');
      return {
        text: `You spent ${m(s.expenses_minor)} on expenses ${when}. Biggest: ${top}.` +
          (s.purchases_minor ? ` Stock purchases were a further ${m(s.purchases_minor)}.` : ''),
        facts: { period: when, expenses: m(s.expenses_minor), purchases: m(s.purchases_minor),
          top_categories: cats.slice(0, 5).map((c) => ({ category: c.category, amount: m(c.amount_minor) })) },
        open: '/expenses',
      };
    }
    case 'spend_on': {
      const term = (q.term ?? '').trim();
      if (term.length < 2) return { text: 'What item or expense should I total up?', facts: {} };
      const r = await db.spendOn(term, period);
      return {
        text: r.count ? `You spent ${m(r.total_minor)} on ${term} ${when} (${r.count} ${r.count === 1 ? 'entry' : 'entries'}).`
          : `I couldn’t find any spending on “${term}” ${when}.`,
        facts: { term, period: when, total: m(r.total_minor), entries: r.count },
      };
    }
    case 'profit': {
      const s = await db.dashboardSummary(period);
      if (s.net_profit_minor === null || s.net_profit_minor === undefined) {
        return {
          text: `Profit estimate unavailable because product cost data is incomplete. ` +
            `${when[0].toUpperCase()}${when.slice(1)}: revenue ${m(s.revenue_minor)}, expenses ${m(s.expenses_minor)}, ` +
            `net cash flow ${m(s.net_cash_flow_minor)}. Add cost prices to your products to see profit.`,
          facts: { period: when, revenue: m(s.revenue_minor), expenses: m(s.expenses_minor),
            net_cash_flow: m(s.net_cash_flow_minor), profit_unavailable_reason: 'incomplete_cost_data' },
          open: '/reports',
        };
      }
      const word = s.net_profit_minor >= 0 ? 'profit' : 'loss';
      return {
        text: `Estimated net ${word} ${when}: ${m(Math.abs(s.net_profit_minor))} ` +
          `(revenue ${m(s.revenue_minor)} − cost of goods ${m(s.cogs_minor)} − expenses ${m(s.expenses_minor)}` +
          (s.other_income_minor ? ` + other income ${m(s.other_income_minor)}` : '') + ').',
        facts: { period: when, revenue: m(s.revenue_minor), cogs: m(s.cogs_minor), expenses: m(s.expenses_minor),
          other_income: m(s.other_income_minor), net_profit: m(s.net_profit_minor) },
        open: '/reports',
      };
    }
    case 'top_products': {
      const rows = await db.topProducts(period, 5);
      if (!rows.length) return { text: `No itemised sales ${when} yet.`, facts: {} };
      const [first, ...rest] = rows;
      return {
        text: `${first.name} is your best seller ${when}: ${qty(first.quantity)} sold for ${m(first.revenue_minor)}.` +
          (rest.length ? ` Next: ${rest.map((r) => `${r.name} (${qty(r.quantity)})`).join(', ')}.` : ''),
        facts: { period: when, products: rows.map((r) => ({ name: r.name, quantity: qty(r.quantity), revenue: m(r.revenue_minor) })) },
        open: '/reports',
      };
    }
    case 'low_stock': {
      const rows = await db.lowStock();
      return rows.length
        ? { text: `${rows.length} ${rows.length === 1 ? 'product is' : 'products are'} low on stock: ` +
            rows.slice(0, 6).map((r) => `${r.name} (${qty(r.stock_quantity)} ${r.unit} left)`).join(', ') + '.',
            facts: { products: rows }, open: '/inventory' }
        : { text: 'Nothing is low on stock right now.', facts: {}, open: '/inventory' };
    }
    case 'inventory': {
      if (!q.entity_name) {
        const rows = await db.lowStock();
        return { text: rows.length ? `${rows.length} products need restocking.` : 'All products are above their minimum stock.',
          facts: { products: rows }, open: '/inventory' };
      }
      const rows = await db.productStock(q.entity_name);
      if (!rows.length) return { text: `I couldn’t find a product called “${q.entity_name}”.`, facts: {} };
      return { text: rows.map((r) => `${r.name}: ${qty(r.stock_quantity)} ${r.unit} in stock`).join('; ') + '.',
        facts: { products: rows }, open: '/inventory' };
    }
    case 'customer_balance': {
      const rows = (await db.customerBalances(q.entity_name)).filter((r) => r.outstanding_minor > 0);
      if (q.entity_name) {
        return rows.length
          ? { text: rows.map((r) => `${r.name} owes you ${m(r.outstanding_minor)}`).join('; ') + '.', facts: { customers: rows } }
          : { text: `${q.entity_name} doesn’t owe you anything.`, facts: {} };
      }
      if (!rows.length) return { text: 'No customers owe you money right now. 🎉', facts: {}, open: '/customers' };
      const total = rows.reduce((a, r) => a + r.outstanding_minor, 0);
      return {
        text: `Customers owe you ${m(total)} in total. ` +
          rows.slice(0, 5).map((r) => `${r.name}: ${m(r.outstanding_minor)}`).join(', ') + (rows.length > 5 ? ', …' : '.'),
        facts: { total: m(total), customers: rows.slice(0, 10).map((r) => ({ name: r.name, owes: m(r.outstanding_minor) })) },
        open: '/customers',
      };
    }
    case 'supplier_balance': {
      const rows = (await db.supplierBalances(q.entity_name)).filter((r) => r.outstanding_minor > 0);
      if (!rows.length) return { text: 'You don’t owe any suppliers right now.', facts: {}, open: '/suppliers' };
      const total = rows.reduce((a, r) => a + r.outstanding_minor, 0);
      return {
        text: `You owe suppliers ${m(total)}: ` + rows.slice(0, 5).map((r) => `${r.name} ${m(r.outstanding_minor)}`).join(', ') + '.',
        facts: { total: m(total), suppliers: rows.slice(0, 10).map((r) => ({ name: r.name, owed: m(r.outstanding_minor) })) },
        open: '/suppliers',
      };
    }
    case 'report':
    case 'general':
    default: {
      const s = await db.dashboardSummary(period);
      const profit = s.net_profit_minor === null || s.net_profit_minor === undefined
        ? 'profit unavailable (incomplete cost data)' : `estimated profit ${m(s.net_profit_minor)}`;
      return {
        text: `Summary ${when}: sales ${m(s.sales_minor)} (${s.sales_count} orders), expenses ${m(s.expenses_minor)}, ` +
          `${profit}. Customers owe ${m(s.receivables_minor)}; you owe suppliers ${m(s.payables_minor)}.`,
        facts: {
          period: when, sales: m(s.sales_minor), orders: s.sales_count, expenses: m(s.expenses_minor),
          purchases: m(s.purchases_minor), revenue: m(s.revenue_minor),
          net_profit: s.net_profit_minor === null ? null : m(s.net_profit_minor),
          profit_unavailable_reason: s.profit_unavailable_reason ?? undefined,
          receivables: m(s.receivables_minor), payables: m(s.payables_minor), low_stock_items: s.low_stock_count,
        },
        open: '/reports',
      };
    }
  }
}

export function answerProposal(intent: string, r: QueryResult): Proposal {
  return {
    kind: 'answer', intent, confidence: 1, message: r.text, requires_confirmation: false, auto_commit: false,
    risk_reasons: [], answer: { text: r.text, data: r.facts, open: r.open },
  };
}
