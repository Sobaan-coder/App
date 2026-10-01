-- =============================================================================
-- BusinessPilot — 005 seed: plans, global feature flags, demo-business generator
-- Plans are the SINGLE source of truth for prices & limits (the app reads them).
-- =============================================================================

insert into public.plans (id, name, description, price_monthly_minor, price_currency,
  max_transactions_per_month, max_products, max_users, max_branches, ai_requests_per_month,
  features, sort_order, google_play_product_id, stripe_price_id)
values
  ('free', 'Free', 'For trying BusinessPilot and very small shops.', 0, 'USD',
    100, 20, 1, 1, 30,
    '{"ai_assistant": true, "reports": "basic", "pdf_invoices": false, "csv_export": true, "team": false, "api_access": false, "multi_branch": false}',
    1, null, null),
  ('pro', 'Pro', 'Unlimited records, AI assistant, reports and invoices.', 999, 'USD',
    null, null, 5, 1, 1000,
    '{"ai_assistant": true, "reports": "full", "pdf_invoices": true, "csv_export": true, "team": true, "api_access": false, "multi_branch": false}',
    2, 'businesspilot_pro_monthly', null),
  ('business', 'Business', 'Multiple branches, larger teams and advanced reports.', 2999, 'USD',
    null, null, null, null, 5000,
    '{"ai_assistant": true, "reports": "advanced", "pdf_invoices": true, "csv_export": true, "team": true, "api_access": true, "multi_branch": true}',
    3, 'businesspilot_business_monthly', null)
on conflict (id) do update set
  name = excluded.name, description = excluded.description,
  price_monthly_minor = excluded.price_monthly_minor, price_currency = excluded.price_currency,
  max_transactions_per_month = excluded.max_transactions_per_month, max_products = excluded.max_products,
  max_users = excluded.max_users, max_branches = excluded.max_branches,
  ai_requests_per_month = excluded.ai_requests_per_month, features = excluded.features,
  sort_order = excluded.sort_order, google_play_product_id = excluded.google_play_product_id;

insert into public.settings (key, value) values
  ('feature_flags', '{"ai_enabled": true, "barcode_enabled": true, "receipt_scanning": false, "subscriptions_enabled": true, "multi_branch": false}'),
  ('support', '{"email": "support@businesspilot.app", "privacy_url": "https://businesspilot.app/privacy", "terms_url": "https://businesspilot.app/terms"}')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Demo mode. Creates an ISOLATED "Demo Cafe" business (is_demo = true) owned
-- by the caller, filled with realistic data. Demo data never touches a real
-- business and demo transactions don't count towards plan limits.
-- -----------------------------------------------------------------------------
create or replace function public.create_demo_business()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_existing uuid;
  v_burger uuid; v_pizza uuid; v_fries uuid; v_coke uuid; v_chicken uuid;
  v_ali uuid; v_sara uuid; v_supplier uuid;
  v_day integer;
  v_seed integer;
  v_ts timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select b.id into v_existing from public.businesses b
    join public.business_members m on m.business_id = b.id and m.user_id = auth.uid()
    where b.is_demo and b.deleted_at is null limit 1;
  if v_existing is not null then return v_existing; end if;

  perform set_config('app.internal', 'on', true);
  v_bid := public.create_business('Demo Cafe', 'cafe', 'PKR', 'Asia/Karachi', 'PK', true);

  insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit, sku)
    values (v_bid, 'Burger', 50000, 28000, 10, 'pcs', 'BRG-01') returning id into v_burger;
  insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit, sku)
    values (v_bid, 'Pizza', 120000, 65000, 5, 'pcs', 'PZA-01') returning id into v_pizza;
  insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit, sku)
    values (v_bid, 'Fries', 25000, 9000, 10, 'pcs', 'FRY-01') returning id into v_fries;
  insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit, sku)
    values (v_bid, 'Coke', 15000, 9500, 24, 'pcs', 'CK-01') returning id into v_coke;
  insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit, sku)
    values (v_bid, 'Chicken', 65000, 52000, 15, 'kg', 'CHK-01') returning id into v_chicken;

  insert into public.inventory_transactions (business_id, product_id, type, quantity_change, note, created_by) values
    (v_bid, v_burger, 'opening', 120, 'Opening stock', auth.uid()),
    (v_bid, v_pizza, 'opening', 60, 'Opening stock', auth.uid()),
    (v_bid, v_fries, 'opening', 150, 'Opening stock', auth.uid()),
    (v_bid, v_coke, 'opening', 200, 'Opening stock', auth.uid()),
    (v_bid, v_chicken, 'opening', 50, 'Opening stock', auth.uid());

  insert into public.customers (business_id, name, phone) values (v_bid, 'Ali Khan', '+92 300 1234567') returning id into v_ali;
  insert into public.customers (business_id, name, phone) values (v_bid, 'Sara Ahmed', '+92 321 7654321') returning id into v_sara;
  insert into public.suppliers (business_id, name, phone) values (v_bid, 'Fresh Poultry Co.', '+92 42 111 222') returning id into v_supplier;

  -- 21 days of activity, deterministic pseudo-random volumes.
  for v_day in reverse 20..0 loop
    v_seed := (v_day * 7 + 3) % 5;
    v_ts := date_trunc('day', now()) - make_interval(days => v_day) + interval '13 hours';
    perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'sale', 'source', 'demo',
      'payment_method', 'cash', 'transaction_date', v_ts, 'description', 'Lunch orders',
      'items', jsonb_build_array(
        jsonb_build_object('product_id', v_burger, 'quantity', 3 + v_seed),
        jsonb_build_object('product_id', v_fries, 'quantity', 2 + v_seed),
        jsonb_build_object('product_id', v_coke, 'quantity', 4 + v_seed))));
    perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'sale', 'source', 'demo',
      'payment_method', case when v_day % 3 = 0 then 'wallet' else 'card' end,
      'payment_provider', case when v_day % 3 = 0 then 'Easypaisa' end,
      'transaction_date', v_ts + interval '6 hours', 'description', 'Dinner orders',
      'items', jsonb_build_array(jsonb_build_object('product_id', v_pizza, 'quantity', 1 + v_seed % 3))));
    if v_day % 4 = 0 then
      perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'purchase', 'source', 'demo',
        'payment_method', 'cash', 'supplier_id', v_supplier, 'transaction_date', v_ts - interval '3 hours',
        'description', 'Chicken restock',
        'items', jsonb_build_array(jsonb_build_object('product_id', v_chicken, 'quantity', 10, 'unit_price_minor', 52000))));
    end if;
    if v_day % 7 = 1 then
      perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'expense', 'source', 'demo',
        'payment_method', 'cash', 'amount_minor', 450000, 'expense_category_name', 'Electricity',
        'transaction_date', v_ts, 'description', 'Electricity bill'));
    end if;
  end loop;

  perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'sale', 'source', 'demo',
    'payment_method', 'credit', 'customer_id', v_ali, 'transaction_date', now() - interval '2 days',
    'description', 'Catering order (on credit)',
    'items', jsonb_build_array(jsonb_build_object('product_id', v_burger, 'quantity', 6))));
  perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'payment_received', 'source', 'demo',
    'payment_method', 'cash', 'customer_id', v_ali, 'amount_minor', 100000, 'transaction_date', now() - interval '1 day',
    'description', 'Part payment'));
  perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'adjustment', 'source', 'demo',
    'payment_method', 'credit', 'customer_id', v_sara, 'amount_minor', 300000, 'transaction_date', now() - interval '5 days',
    'description', 'Opening balance owed'));
  perform public.record_transaction(jsonb_build_object('business_id', v_bid, 'type', 'expense', 'source', 'demo',
    'payment_method', 'bank', 'amount_minor', 8000000, 'expense_category_name', 'Rent',
    'transaction_date', date_trunc('month', now()) + interval '10 hours', 'description', 'Shop rent'));

  perform set_config('app.internal', 'off', true);
  return v_bid;
end $$;

revoke execute on function public.create_demo_business() from public, anon;
grant execute on function public.create_demo_business() to authenticated;
