-- =============================================================================
-- BusinessPilot — 007 reporting exports
-- Range-accurate ledger rows for CSV/PDF exports (dates resolved in the
-- business timezone, same as every other report).
-- =============================================================================
create or replace function public.report_transactions(
  p_business_id uuid, p_preset text default 'this_month', p_from date default null, p_to date default null,
  p_limit integer default 5000)
returns table (
  id uuid, transaction_date timestamptz, type public.transaction_type, invoice_number text, description text,
  customer text, supplier text, category text, payment_method public.payment_method, payment_provider text,
  amount_minor bigint, currency char(3), items text)
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  perform public._require_role(p_business_id, 'viewer');
  select * into r from public.resolve_range(p_business_id, p_preset, p_from, p_to);
  return query
  select t.id, t.transaction_date, t.type, t.invoice_number, t.description, c.name, s.name, ec.name,
         t.payment_method, t.payment_provider, t.amount_minor, t.currency,
         (select string_agg(trim(to_char(i.quantity, 'FM999999990.###')) || ' x ' || i.name, '; ')
            from public.transaction_items i where i.transaction_id = t.id)
  from public.transactions t
  left join public.customers c on c.id = t.customer_id
  left join public.suppliers s on s.id = t.supplier_id
  left join public.expense_categories ec on ec.id = t.expense_category_id
  where t.business_id = p_business_id and t.deleted_at is null
    and t.transaction_date >= r.start_at and t.transaction_date < r.end_at
  order by t.transaction_date
  limit least(greatest(p_limit, 1), 20000);
end $$;

revoke execute on function public.report_transactions(uuid, text, date, date, integer) from public, anon;
grant execute on function public.report_transactions(uuid, text, date, date, integer) to authenticated;
