import { assert, assertEquals } from '@std/assert';
import { quickParse, singularize } from '../_shared/quick_parser.ts';
import { validateParsed } from '../_shared/schema.ts';

const today = '2026-10-01';
const p = (s: string) => {
  const r = quickParse(s, { today });
  if (r) assert(validateParsed(r).ok, `quick parser output must satisfy the strict schema for "${s}"`);
  return r;
};

Deno.test('Sold 3 burgers for 1500 cash', () => {
  const r = p('Sold 3 burgers for 1500 cash')!;
  assertEquals(r.intent, 'record_sale');
  assertEquals(r.items, [{ product_name: 'Burger', quantity: 3, unit_price: null, unit: null }]);
  assertEquals(r.transaction?.amount, '1500');
  assertEquals(r.transaction?.payment_method, 'cash');
  assert(r.confidence >= 0.9);
});

Deno.test('Sold 5 zinger burgers for Rs 2500 cash', () => {
  const r = p('Sold 5 zinger burgers for Rs 2500 cash.')!;
  assertEquals(r.items[0].product_name, 'Zinger Burger');
  assertEquals(r.items[0].quantity, 5);
  assertEquals(r.transaction?.amount, '2500');
});

Deno.test('Sold 2 pizzas and 3 cokes for 2,700 via Easypaisa', () => {
  const r = p('Sold 2 pizzas and 3 cokes for 2,700 via easypaisa')!;
  assertEquals(r.items.map((i) => [i.product_name, i.quantity]), [['Pizza', 2], ['Coke', 3]]);
  assertEquals(r.transaction?.payment_method, 'wallet');
  assertEquals(r.transaction?.payment_provider, 'Easypaisa');
});

Deno.test('Sold on credit to a customer', () => {
  const r = p('sold 4 pizzas for 4800 on credit to Ali')!;
  assertEquals(r.transaction?.payment_method, 'credit');
  assertEquals(r.transaction?.customer_name, 'Ali');
});

Deno.test('Bought 10 kg chicken for 5000', () => {
  const r = p('Bought 10 kg chicken for 5000')!;
  assertEquals(r.intent, 'record_purchase');
  assertEquals(r.items[0], { product_name: 'Chicken', quantity: 10, unit_price: null, unit: 'kg' });
  assertEquals(r.transaction?.amount, '5000');
});

Deno.test('Bought chicken for Rs 5200 (no quantity is fine for purchases)', () => {
  const r = p('Bought chicken for Rs 5200')!;
  assertEquals(r.intent, 'record_purchase');
  assertEquals(r.items[0].quantity, null);
  assertEquals(r.clarification_question, null);
});

Deno.test('Paid electricity bill 4500', () => {
  const r = p('Paid electricity bill 4500')!;
  assertEquals(r.intent, 'record_expense');
  assertEquals(r.transaction?.expense_category, 'Electricity');
  assertEquals(r.transaction?.amount, '4500');
});

Deno.test('Paid worker Ahmed Rs 25000 -> salary expense', () => {
  const r = p('Paid worker Ahmed Rs 25000')!;
  assertEquals(r.transaction?.expense_category, 'Salaries');
  assertEquals(r.transaction?.description, 'Salary - Ahmed');
});

Deno.test('Ahmed owes me 3000', () => {
  const r = p('Ahmed owes me 3000')!;
  assertEquals(r.intent, 'record_customer_debt');
  assertEquals(r.transaction?.customer_name, 'Ahmed');
  assertEquals(r.transaction?.amount, '3000');
});

Deno.test('I received 5000 from Ahmed', () => {
  const r = p('I received 5000 from Ahmed')!;
  assertEquals(r.intent, 'record_payment_received');
  assertEquals(r.transaction?.customer_name, 'Ahmed');
});

Deno.test('Transfer 100,000 to Ahmed asks for confirmation', () => {
  const r = p('Transfer 100,000 to Ahmed')!;
  assertEquals(r.intent, 'record_payment_sent');
  assertEquals(r.requires_confirmation, true);
  assertEquals(r.transaction?.amount, '100,000');
});

Deno.test('Add a product called Zinger Burger for 600', () => {
  const r = p('Add a product called Zinger Burger for 600')!;
  assertEquals(r.intent, 'add_product');
  assertEquals(r.product?.name, 'Zinger Burger');
  assertEquals(r.product?.selling_price, '600');
});

Deno.test('Ambiguous: "Sold some burgers." asks, never guesses', () => {
  const r = p('Sold some burgers.')!;
  assertEquals(r.clarification_question, 'How many burgers did you sell, and for what amount?');
  assert(r.missing_fields.includes('quantity'));
  assert(r.missing_fields.includes('amount'));
});

Deno.test('Sold 20 pizzas today (amount left for the resolver)', () => {
  const r = p('Sold 20 pizzas today')!;
  assertEquals(r.items[0].quantity, 20);
  assertEquals(r.transaction?.amount, null);
});

Deno.test('Yesterday sets the date', () => {
  assertEquals(p('Paid rent 50000 yesterday')!.transaction?.date, '2026-09-30');
});

Deno.test('Questions map to query intents', () => {
  const cases: Array<[string, string, string, string?]> = [
    ['Show my sales today', 'query_sales', 'sales'],
    ['How much did I sell today?', 'query_sales', 'sales'],
    ['What was my profit this month?', 'query_profit', 'profit'],
    ['Who owes me money?', 'query_customer_balance', 'customer_balance'],
    ['How much money do customers owe me?', 'query_customer_balance', 'customer_balance'],
    ['What were my biggest expenses?', 'query_expenses', 'expenses'],
    ['Which product sold the most?', 'query_sales', 'top_products'],
    ['What product sells the most?', 'query_sales', 'top_products'],
    ['Which products are low in stock?', 'query_inventory', 'low_stock'],
    ['How much did I spend on chicken?', 'query_expenses', 'spend_on', 'chicken'],
    ['What did I spend on chicken this month?', 'query_expenses', 'spend_on', 'chicken'],
    ['How much do I owe suppliers?', 'query_supplier_balance', 'supplier_balance'],
  ];
  for (const [text, intent, metric, term] of cases) {
    const r = p(text);
    assert(r, `parsed: ${text}`);
    assertEquals(r!.intent, intent, text);
    assertEquals(r!.query?.metric, metric, text);
    if (term) assertEquals(r!.query?.term, term, text);
  }
  assertEquals(p('What did I spend on chicken this month?')!.query?.period, 'this_month');
});

Deno.test('Unknown phrasing falls through to the LLM (returns null)', () => {
  assertEquals(p('Paid Bilal 5000'), null);
  assertEquals(p('the oven broke again'), null);
});

Deno.test('singularize', () => {
  assertEquals(singularize('burgers'), 'burger');
  assertEquals(singularize('fries'), 'fries');
  assertEquals(singularize('boxes'), 'box');
  assertEquals(singularize('glass'), 'glass');
});
