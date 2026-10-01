// POST /functions/v1/generate-invoice  { transaction_id }
// Returns invoice data + WhatsApp-style share text for a sale. The PDF itself
// is rendered on-device (works offline); this endpoint is the canonical,
// server-validated invoice payload (also usable for email/WhatsApp API later).
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { formatMoney } from '../_shared/money.ts';
import { requireUser, serviceClient, userClient } from '../_shared/supabase.ts';

serve(async (req) => {
  const { transaction_id } = await readJson<{ transaction_id?: string }>(req);
  if (!transaction_id || !/^[0-9a-f-]{36}$/i.test(transaction_id)) throw new HttpError(400, 'invalid_input:transaction_id');
  const client = userClient(req);
  const user = await requireUser(client);

  // RLS guarantees the caller is a member of the transaction's business.
  const { data: tx } = await client.from('transactions')
    .select('id, business_id, type, amount_minor, subtotal_minor, discount_minor, tax_minor, currency, payment_method, payment_provider, invoice_number, transaction_date, description, deleted_at, customer:customers(name, phone, email, address), items:transaction_items(name, quantity, unit_price_minor, total_minor)')
    .eq('id', transaction_id).maybeSingle();
  if (!tx || tx.deleted_at) throw new HttpError(404, 'not_found:transaction');
  if (tx.type !== 'sale') throw new HttpError(400, 'invalid_input:not_a_sale');

  const [{ data: biz }, { data: settings }, { data: usage }] = await Promise.all([
    client.from('businesses').select('name, address, phone, email, logo_url, tax_enabled, tax_rate_bp').eq('id', tx.business_id).single(),
    client.from('business_settings').select('invoice_footer').eq('business_id', tx.business_id).single(),
    client.rpc('plan_usage', { p_business_id: tx.business_id }),
  ]);
  const m = (v: number | null) => formatMoney(v ?? 0, tx.currency);
  const items = (tx.items ?? []) as Array<{ name: string; quantity: number; unit_price_minor: number; total_minor: number }>;
  const subtotal = tx.subtotal_minor ?? tx.amount_minor + tx.discount_minor - tx.tax_minor;
  const paid = tx.payment_method !== 'credit';

  const shareText = [
    `Invoice ${tx.invoice_number ?? ''}`.trim(),
    '',
    (biz?.name ?? '').toUpperCase(),
    '',
    ...(items.length ? items.map((i) => `${Number(i.quantity)} × ${i.name} — ${m(i.total_minor)}`) : [tx.description ?? 'Sale']),
    '',
    ...(tx.discount_minor ? [`Discount: −${m(tx.discount_minor)}`] : []),
    ...(tx.tax_minor ? [`Tax: ${m(tx.tax_minor)}`] : []),
    `Total: ${m(tx.amount_minor)}`,
    paid ? 'Status: Paid' : 'Status: Unpaid',
    '',
    settings?.invoice_footer ?? 'Thank you!',
  ].join('\n');

  await serviceClient().from('analytics_events').insert({ event: 'invoice_created', business_id: tx.business_id, user_id: user.id });

  return json(req, {
    invoice: {
      number: tx.invoice_number, date: tx.transaction_date, currency: tx.currency,
      business: biz, customer: tx.customer, items, subtotal_minor: subtotal,
      discount_minor: tx.discount_minor, tax_minor: tx.tax_minor, total_minor: tx.amount_minor,
      payment_status: paid ? 'paid' : 'unpaid', payment_method: tx.payment_method, payment_provider: tx.payment_provider,
      footer: settings?.invoice_footer ?? '',
    },
    share_text: shareText,
    pdf_allowed: Boolean(usage?.plan?.features?.pdf_invoices),
  });
});
