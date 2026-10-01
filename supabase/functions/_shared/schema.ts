import { z } from 'zod';

// Strict schema for what the transaction parser (LLM or deterministic) may
// return. Anything that does not validate is rejected — model output is never
// written to the database directly.

export const INTENTS = [
  'record_sale', 'record_purchase', 'record_expense', 'record_income',
  'record_payment_received', 'record_payment_sent', 'record_customer_debt', 'record_supplier_debt',
  'add_product', 'update_product', 'inventory_adjustment',
  'query_sales', 'query_expenses', 'query_profit', 'query_inventory',
  'query_customer_balance', 'query_supplier_balance', 'generate_report', 'general_business_question',
] as const;
export type Intent = typeof INTENTS[number];

export const PAYMENT_METHODS = ['cash', 'bank', 'card', 'wallet', 'credit', 'other'] as const;
export const PERIODS = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month', 'this_year', 'all'] as const;
export const METRICS = ['sales', 'expenses', 'profit', 'inventory', 'low_stock', 'customer_balance',
  'supplier_balance', 'top_products', 'spend_on', 'report', 'general'] as const;

const amount = z.union([z.number().nonnegative().finite(), z.string().regex(/^\s*[\d,]+(\.\d+)?\s*(k|lac|lakh)?\s*$/i)]).nullable();
const name = z.string().trim().min(1).max(120);
const shortText = z.string().trim().max(500);

export const ParsedItemSchema = z.object({
  product_name: name,
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit_price: amount.optional().default(null),
  unit: z.string().max(20).nullable().optional().default(null),
}).strict();

export const ParsedTransactionSchema = z.object({
  amount: amount.optional().default(null),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional().default(null),
  payment_method: z.enum(PAYMENT_METHODS).nullable().optional().default(null),
  payment_provider: z.string().max(60).nullable().optional().default(null),
  description: shortText.nullable().optional().default(null),
  customer_name: name.nullable().optional().default(null),
  supplier_name: name.nullable().optional().default(null),
  expense_category: z.string().trim().max(60).nullable().optional().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
}).strict();

export const ParsedProductSchema = z.object({
  name,
  selling_price: amount.optional().default(null),
  cost_price: amount.optional().default(null),
  unit: z.string().max(20).nullable().optional().default(null),
  sku: z.string().max(60).nullable().optional().default(null),
}).strict();

export const ParsedInventorySchema = z.object({
  product_name: name,
  quantity_change: z.number().finite().refine((n) => n !== 0).nullable(),
  reason: z.enum(['waste', 'damage', 'return', 'adjustment']).default('adjustment'),
}).strict();

export const ParsedQuerySchema = z.object({
  metric: z.enum(METRICS),
  period: z.enum(PERIODS).default('today'),
  term: z.string().trim().max(80).nullable().optional().default(null),
  entity_name: name.nullable().optional().default(null),
}).strict();

export const ParsedMessageSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  requires_confirmation: z.boolean().default(false),
  clarification_question: z.string().max(300).nullable().optional().default(null),
  missing_fields: z.array(z.string().max(40)).max(10).default([]),
  transaction: ParsedTransactionSchema.nullable().optional().default(null),
  items: z.array(ParsedItemSchema).max(50).default([]),
  product: ParsedProductSchema.nullable().optional().default(null),
  inventory: ParsedInventorySchema.nullable().optional().default(null),
  query: ParsedQuerySchema.nullable().optional().default(null),
}).strict();

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

export const ReceiptSchema = z.object({
  vendor: z.string().max(120).nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().default(null),
  items: z.array(z.object({
    name,
    quantity: z.number().positive().nullable().default(null),
    unit_price: amount.default(null),
    total: amount.default(null),
  })).max(100).default([]),
  subtotal: amount.default(null),
  tax: amount.default(null),
  total: amount.default(null),
  payment_method: z.enum(PAYMENT_METHODS).nullable().default(null),
  confidence: z.number().min(0).max(1),
  unreadable_fields: z.array(z.string().max(40)).max(20).default([]),
});
export type ParsedReceipt = z.infer<typeof ReceiptSchema>;

/** Validate untrusted model output. Returns a typed object or a list of issues. */
export function validateParsed(raw: unknown): { ok: true; value: ParsedMessage } | { ok: false; issues: string[] } {
  const r = ParsedMessageSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

export const INTENT_TO_TYPE: Partial<Record<Intent, string>> = {
  record_sale: 'sale',
  record_purchase: 'purchase',
  record_expense: 'expense',
  record_income: 'income',
  record_payment_received: 'payment_received',
  record_payment_sent: 'payment_sent',
  record_customer_debt: 'adjustment',
  record_supplier_debt: 'adjustment',
};

export const isQueryIntent = (i: Intent) =>
  i.startsWith('query_') || i === 'generate_report' || i === 'general_business_question';
