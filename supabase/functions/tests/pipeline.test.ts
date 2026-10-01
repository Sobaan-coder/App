import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { processMessage } from '../_shared/pipeline.ts';
import { ctx, fakeQueryDb, fakeResolverDb, FakeProvider } from './fakes.ts';

const deps = (provider: FakeProvider | null = null, over: Partial<typeof ctx> = {}) => ({
  provider, resolverDb: fakeResolverDb, queryDb: fakeQueryDb, ctx: { ...ctx, ...over },
});
const never = () => new FakeProvider(() => { throw new Error('LLM must not be called'); });

Deno.test('heart flow: "Sold 5 zinger burgers for Rs 2500 cash" — no LLM, full preview', async () => {
  const provider = never();
  const { proposal, usage } = await processMessage('Sold 5 zinger burgers for Rs 2500 cash', deps(provider));
  assertEquals(provider.calls.length, 0);
  assertEquals(usage.usedLlm, false);
  assertEquals(proposal.kind, 'action');
  assertEquals(proposal.preview?.title, 'Sale detected');
  assertEquals(proposal.preview?.lines, [
    { label: 'Items', value: '5 × Zinger Burger' },
    { label: 'Amount', value: 'Rs 2,500' },
    { label: 'Payment', value: 'Cash' },
  ]);
  assertEquals(proposal.preview?.effects, ['Inventory will decrease: Zinger Burger −5']);
  assertEquals(proposal.action?.payload, {
    type: 'sale', source: 'ai', amount_minor: 250000, payment_method: 'cash',
    items: [{ product_id: 'p-zinger', name: 'Zinger Burger', quantity: 5 }],
    description: 'sold 5 zinger burgers for rs 2500 cash',
  });
  assertEquals(proposal.auto_commit, true);   // low risk + owner opted in
});

Deno.test('auto-record is off by default => confirmation required', async () => {
  const { proposal } = await processMessage('Sold 5 zinger burgers for 2500 cash', deps(null, { autoRecordLowRisk: false }));
  assertEquals(proposal.requires_confirmation, true);
  assert(proposal.risk_reasons.includes('auto_record_disabled'));
});

Deno.test('ambiguous product asks which one', async () => {
  const { proposal } = await processMessage('Sold 3 burgers for 1500 cash', deps());
  assertEquals(proposal.kind, 'clarification');
  assertStringIncludes(proposal.question!, 'Which one did you mean?');
  assertEquals(proposal.options?.map((o) => o.label).sort(), ['Cheese Burger', 'Zinger Burger']);
});

Deno.test('"Sold some burgers" -> clarification, no guess', async () => {
  const { proposal } = await processMessage('Sold some burgers.', deps());
  assertEquals(proposal.kind, 'clarification');
  assertEquals(proposal.question, 'How many burgers did you sell, and for what amount?');
  assertEquals(proposal.action, undefined);
});

Deno.test('Sold 20 pizzas: amount computed from the real price list', async () => {
  const { proposal } = await processMessage('Sold 20 pizzas today', deps());
  assertEquals(proposal.kind, 'action');
  assertEquals(proposal.preview?.lines.find((l) => l.label === 'Amount')?.value, 'Rs 24,000');
  assertEquals(proposal.action?.payload.amount_minor, undefined);   // DB computes it from the same prices
});

Deno.test('Sold 4 cakes with no price anywhere -> asks for the amount', async () => {
  const { proposal } = await processMessage('Sold 4 cakes', deps());
  assertEquals(proposal.kind, 'clarification');
  assertEquals(proposal.question, 'What was the total amount of the sale?');
});

Deno.test('Paid electricity bill 4500 -> expense', async () => {
  const { proposal } = await processMessage('Paid electricity bill 4500', deps());
  assertEquals(proposal.action?.payload.type, 'expense');
  assertEquals(proposal.action?.payload.expense_category_name, 'Electricity');
  assertEquals(proposal.action?.payload.amount_minor, 450000);
});

Deno.test('Ahmed owes me 3000 -> adjustment on existing customer', async () => {
  const { proposal } = await processMessage('Ahmed owes me 3000', deps());
  assertEquals(proposal.action?.payload.type, 'adjustment');
  assertEquals(proposal.action?.payload.customer_id, 'c-ahmed');
  assertEquals(proposal.requires_confirmation, true);   // adjustments are always confirmed
});

Deno.test('Ali owes me 3000 with two Alis -> asks which', async () => {
  const { proposal } = await processMessage('Ali owes me 3000', deps());
  assertEquals(proposal.kind, 'clarification');
  assertEquals(proposal.options?.length, 2);
});

Deno.test('new customer is created only with confirmation', async () => {
  const { proposal } = await processMessage('Bilal owes me 3000', deps());
  assertEquals(proposal.action?.payload.create_customer, true);
  assert(proposal.risk_reasons.includes('new_contact'));
  assertEquals(proposal.requires_confirmation, true);
});

Deno.test('I received 5000 from Ahmed', async () => {
  const { proposal } = await processMessage('I received 5000 from Ahmed', deps());
  assertEquals(proposal.action?.payload.type, 'payment_received');
  assertEquals(proposal.action?.payload.customer_id, 'c-ahmed');
});

Deno.test('Transfer 100,000 to Ahmed: customer recipient -> clarify refund vs payment', async () => {
  const { proposal } = await processMessage('Transfer 100,000 to Ahmed', deps());
  assertEquals(proposal.kind, 'clarification');
});

Deno.test('Transfer 100,000 to a supplier requires confirmation and never auto-commits', async () => {
  const { proposal } = await processMessage('Transfer 100,000 to Fresh Poultry', deps());
  assertEquals(proposal.kind, 'action');
  assertEquals(proposal.requires_confirmation, true);
  assertEquals(proposal.auto_commit, false);
  assert(proposal.risk_reasons.includes('large_amount'));
  assert(proposal.risk_reasons.includes('sensitive_type'));
  assertEquals(proposal.preview?.lines.find((l) => l.label === 'Amount')?.value, 'Rs 100,000');
});

Deno.test('Add a product called Zinger Burger for 600 -> offers price update (exists)', async () => {
  const { proposal } = await processMessage('Add a product called Zinger Burger for 600', deps());
  assertEquals(proposal.action?.kind, 'update_product');
  assertEquals(proposal.action?.payload, { product_id: 'p-zinger', selling_price_minor: 60000 });
});

Deno.test('Add a new product -> add_product, always confirmed', async () => {
  const { proposal } = await processMessage('Add product Club Sandwich for 750', deps());
  assertEquals(proposal.action?.kind, 'add_product');
  assertEquals(proposal.requires_confirmation, true);
});

Deno.test('viewer cannot be offered actions', async () => {
  const { proposal } = await processMessage('Paid rent 5000', deps(null, { role: 'viewer' }));
  assertEquals(proposal.kind, 'error');
});

Deno.test('queries answer from database numbers only (no LLM)', async () => {
  const provider = never();
  const d = deps(provider);
  assertEquals((await processMessage('How much did I sell today?', d)).proposal.answer?.text,
    'You sold Rs 87,450 today across 23 sales.');
  assertEquals((await processMessage('What did I spend on chicken this month?', d)).proposal.answer?.text,
    'You spent Rs 10,400 on chicken this month (2 entries).');
  assertEquals((await processMessage('Which product sold the most?', d)).proposal.answer?.text,
    'Zinger Burger is your best seller in the last 30 days: 40 sold for Rs 20,000. Next: Pizza (12).');
  assertEquals((await processMessage('How much money do customers owe me?', d)).proposal.answer?.text,
    'Customers owe you Rs 3,000 in total. Ahmed: Rs 3,000.');
  assertStringIncludes((await processMessage('What was my profit this month?', d)).proposal.answer!.text,
    'Profit estimate unavailable because product cost data is incomplete.');
  assertEquals(provider.calls.length, 0);
});

Deno.test('LLM fallback: valid JSON is validated and resolved', async () => {
  const provider = new FakeProvider(() => JSON.stringify({
    intent: 'record_payment_sent', confidence: 0.93, requires_confirmation: false,
    transaction: { amount: 5000, payment_method: 'cash', supplier_name: 'Fresh Poultry' }, items: [],
  }));
  const { proposal, usage } = await processMessage('Paid Fresh Poultry 5000', deps(provider));
  assertEquals(provider.calls.length, 1);
  assertEquals(usage.usedLlm, true);
  assertEquals(usage.promptTokens, 100);
  assertEquals(proposal.action?.payload.supplier_id, 's-poultry');
  assertEquals(proposal.action?.payload.amount_minor, 500000);
  // The prompt sends only the message, date and currency — no business data dump.
  assertEquals(Object.keys(JSON.parse(provider.calls[0].user)), ['today', 'currency', 'message']);
});

Deno.test('LLM output violating the schema is rejected', async () => {
  const provider = new FakeProvider(() => JSON.stringify({ intent: 'record_sale', confidence: 0.99, run_sql: 'drop table x' }));
  const { proposal, usage } = await processMessage('the oven broke again', deps(provider));
  assertEquals(usage.errorCode, 'schema_violation');
  assertEquals(proposal.kind, 'clarification');
  assertEquals(proposal.action, undefined);
});

Deno.test('LLM non-JSON output is rejected', async () => {
  const provider = new FakeProvider(() => 'Sure! I recorded that for you.');
  const { proposal, usage } = await processMessage('the oven broke again', deps(provider));
  assertEquals(usage.errorCode, 'invalid_json');
  assertEquals(proposal.kind, 'clarification');
});

Deno.test('LLM-proposed numbers for questions are ignored', async () => {
  const provider = new FakeProvider((req) => req.system.includes('Business analyst')
    ? JSON.stringify({ answer: 'Based on the facts, sales were Rs 87,450.' })
    : JSON.stringify({ intent: 'general_business_question', confidence: 0.9, query: { metric: 'general', period: 'today' } }));
  const { proposal } = await processMessage('How is my business doing compared to normal?', deps(provider));
  assertEquals(proposal.kind, 'answer');
  // analyst prompt received only server-computed facts
  const analystCall = provider.calls.find((c) => c.system.includes('Business analyst'))!;
  assertEquals(JSON.parse(analystCall.user).facts.sales, 'Rs 87,450');
});

Deno.test('no provider configured -> helpful clarification', async () => {
  const { proposal } = await processMessage('the oven broke again', deps(null));
  assertEquals(proposal.kind, 'clarification');
  assertStringIncludes(proposal.question!, 'Sold 3 burgers for 1500 cash');
});
