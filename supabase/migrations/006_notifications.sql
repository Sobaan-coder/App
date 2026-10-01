-- =============================================================================
-- BusinessPilot — 006 scheduled notifications
-- Called hourly by the send-notification Edge Function (service role only).
-- Idempotent: every notification has a dedupe_key.
-- =============================================================================

create or replace function public._fmt_money(p_minor bigint, p_currency text)
returns text language sql immutable as $$
  select case upper(p_currency) when 'PKR' then 'Rs ' when 'USD' then '$' when 'GBP' then '£' when 'EUR' then '€'
         when 'INR' then '₹' else upper(p_currency) || ' ' end
    || case when upper(p_currency) in ('JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF')
            then to_char(p_minor, 'FM999,999,999,999,990')
            when p_minor % 100 = 0 then to_char(p_minor / 100, 'FM999,999,999,999,990')
            else to_char(p_minor / 100.0, 'FM999,999,999,999,990.00') end;
$$;

create or replace function public.generate_scheduled_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_n integer;
  b record;
  v_local timestamp;
  v_sales bigint;
  v_orders integer;
  v_expenses bigint;
begin
  for b in
    select bz.id, bz.currency, bz.timezone, s.daily_summary, s.monthly_report, s.payment_due_reminders
    from public.businesses bz join public.business_settings s on s.business_id = bz.id
    where bz.deleted_at is null and not bz.is_demo
  loop
    v_local := now() at time zone b.timezone;

    -- Daily summary after 9pm local time.
    if b.daily_summary and extract(hour from v_local) >= 21 then
      select coalesce(sum(amount_minor) filter (where type = 'sale'), 0), count(*) filter (where type = 'sale'),
             coalesce(sum(amount_minor) filter (where type = 'expense'), 0)
        into v_sales, v_orders, v_expenses
      from public.transactions
      where business_id = b.id and deleted_at is null
        and transaction_date >= (v_local::date)::timestamp at time zone b.timezone;
      insert into public.notifications (business_id, type, title, body, dedupe_key)
      values (b.id, 'daily_summary', 'Today''s summary',
              'Sales ' || public._fmt_money(v_sales, b.currency) || ' (' || v_orders || ' orders) · Expenses '
              || public._fmt_money(v_expenses, b.currency) || '.',
              'daily:' || v_local::date)
      on conflict (business_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;

    -- Monthly report on the 1st.
    if b.monthly_report and extract(day from v_local) = 1 then
      insert into public.notifications (business_id, type, title, body, data, dedupe_key)
      values (b.id, 'monthly_report', 'Your monthly report is ready',
              'See how ' || to_char(v_local - interval '1 month', 'FMMonth') || ' went: sales, expenses and profit.',
              jsonb_build_object('route', '/reports', 'preset', 'last_month'),
              'monthly:' || to_char(v_local, 'YYYY-MM'))
      on conflict (business_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;

    -- Payment reminders: balances untouched for 30+ days (weekly at most).
    if b.payment_due_reminders then
      insert into public.notifications (business_id, type, title, body, data, dedupe_key)
      select b.id, 'customer_payment_due', cb.name || ' owes you ' || public._fmt_money(cb.outstanding_minor, b.currency),
             'No payment for over 30 days. Send a friendly reminder?',
             jsonb_build_object('customer_id', cb.customer_id),
             'cdue:' || cb.customer_id || ':' || to_char(v_local, 'IYYY-IW')
      from public.customer_balances cb
      where cb.business_id = b.id and cb.outstanding_minor > 0 and cb.last_transaction_at < now() - interval '30 days'
      on conflict (business_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;

      insert into public.notifications (business_id, type, title, body, data, dedupe_key)
      select b.id, 'supplier_payment_due', 'You owe ' || sb.name || ' ' || public._fmt_money(sb.outstanding_minor, b.currency),
             'Outstanding for over 30 days.',
             jsonb_build_object('supplier_id', sb.supplier_id),
             'sdue:' || sb.supplier_id || ':' || to_char(v_local, 'IYYY-IW')
      from public.supplier_balances sb
      where sb.business_id = b.id and sb.outstanding_minor > 0 and sb.last_transaction_at < now() - interval '30 days'
      on conflict (business_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end loop;

  -- Subscription renewals ending within 3 days (paid plans only).
  insert into public.notifications (business_id, type, title, body, dedupe_key)
  select s.business_id, 'subscription',
         case when s.cancel_at_period_end then 'Your plan ends soon' else 'Your plan renews soon' end,
         'Your ' || p.name || ' plan ' || case when s.cancel_at_period_end then 'ends' else 'renews' end
         || ' on ' || to_char(s.current_period_end, 'DD Mon YYYY') || '.',
         'sub:' || s.id || ':' || to_char(s.current_period_end, 'YYYY-MM-DD')
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.plan_id <> 'free' and s.current_period_end between now() and now() + interval '3 days'
  on conflict (business_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end $$;

revoke execute on function public.generate_scheduled_notifications() from public, anon, authenticated;
revoke execute on function public._fmt_money(bigint, text) from public, anon;
grant execute on function public.generate_scheduled_notifications() to service_role;
