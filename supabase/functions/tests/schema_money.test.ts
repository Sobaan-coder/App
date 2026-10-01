import { assert, assertEquals } from '@std/assert';
import { formatMoney, toMinor } from '../_shared/money.ts';
import { validateParsed } from '../_shared/schema.ts';
import { verifyStripeSignature } from '../_shared/stripe.ts';
import { extractJson } from '../_shared/ai/service.ts';

Deno.test('toMinor converts without floating point errors', () => {
  assertEquals(toMinor('1,500', 'PKR'), 150000);
  assertEquals(toMinor(100.5, 'PKR'), 10050);
  assertEquals(toMinor('0.1', 'USD'), 10);
  assertEquals(toMinor('2.5k', 'PKR'), 250000);
  assertEquals(toMinor('1.2 lakh', 'PKR'), 12000000);
  assertEquals(toMinor('1500', 'JPY'), 1500);
  assertEquals(toMinor('1.005', 'USD'), null);      // more precision than the currency has
  assertEquals(toMinor('-5', 'PKR'), null);
  assertEquals(toMinor('abc', 'PKR'), null);
  assertEquals(toMinor(null, 'PKR'), null);
});

Deno.test('formatMoney', () => {
  assertEquals(formatMoney(250000, 'PKR'), 'Rs 2,500');
  assertEquals(formatMoney(10050, 'PKR'), 'Rs 100.50');
  assertEquals(formatMoney(-320000, 'PKR'), '-Rs 3,200');
  assertEquals(formatMoney(199, 'USD'), '$1.99');
  assertEquals(formatMoney(1000, 'AED'), 'AED 10');
});

const valid = {
  intent: 'record_sale', confidence: 0.96, requires_confirmation: false,
  transaction: { amount: 1200, currency: 'PKR', payment_method: 'cash', description: '3 burgers' },
  items: [{ product_name: 'Burger', quantity: 3 }],
};

Deno.test('schema accepts the documented example', () => {
  const r = validateParsed(valid);
  assert(r.ok);
  if (r.ok) assertEquals(r.value.items[0].unit_price, null);
});

Deno.test('schema rejects unknown intents, extra keys and bad values', () => {
  assert(!validateParsed({ ...valid, intent: 'delete_everything' }).ok);
  assert(!validateParsed({ ...valid, sql: 'drop table transactions' }).ok);
  assert(!validateParsed({ ...valid, confidence: 7 }).ok);
  assert(!validateParsed({ ...valid, transaction: { ...valid.transaction, amount: -100 } }).ok);
  assert(!validateParsed({ ...valid, transaction: { ...valid.transaction, payment_method: 'bitcoin' } }).ok);
  assert(!validateParsed({ ...valid, transaction: { ...valid.transaction, business_id: 'x' } }).ok);
  assert(!validateParsed({ ...valid, items: [{ product_name: 'Burger', quantity: 0 }] }).ok);
  assert(!validateParsed('not an object').ok);
});

Deno.test('extractJson tolerates code fences', () => {
  assertEquals(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(extractJson('Here you go: {"a":2} thanks'), { a: 2 });
});

Deno.test('Stripe signature verification', async () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  assert(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret));
  assert(!(await verifyStripeSignature(payload + ' ', `t=${t},v1=${sig}`, secret)));
  assert(!(await verifyStripeSignature(payload, `t=${t - 10_000},v1=${sig}`, secret)));
});
