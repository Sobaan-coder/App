-- =============================================================================
-- BusinessPilot SQL test-suite: tenant isolation, roles, ledger, inventory,
-- balances, profit, idempotency, plan limits. Any failed assertion aborts.
-- =============================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema if not exists test;
grant usage on schema test to authenticated;

create or replace function test.login(p_email text) returns void language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v::text, false);
  perform set_config('request.jwt.claim.email', p_email, false);
end $$;

create or replace function test.eq(p_actual anyelement, p_expected anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', p_msg, p_expected, p_actual;
  end if;
end $$;

create or replace function test.throws(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~ p_pattern then return; end if;
    raise exception 'ASSERTION FAILED: % (expected error ~ "%", got "%")', p_msg, p_pattern, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (expected error ~ "%", but statement succeeded)', p_msg, p_pattern;
end $$;

grant usage on schema test to anon;
grant execute on all functions in schema test to authenticated, anon;

-- Users (trigger creates profiles)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'employee.a@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'viewer.a@example.com');

select test.eq((select count(*) from public.profiles)::int, 4, 'profiles created by signup trigger');

-- ---------------------------------------------------------------------------
-- Owner A creates a business; owner B creates another.
-- ---------------------------------------------------------------------------
set role authenticated;
select test.login('owner.a@example.com');
select public.create_business('My Restaurant', 'restaurant', 'PKR', 'Asia/Karachi') as biz_a \gset
select test.login('owner.b@example.com');
select public.create_business('Other Shop', 'retail', 'USD', 'America/New_York') as biz_b \gset

select test.login('owner.a@example.com');
select test.eq((select count(*) from public.businesses)::int, 1, 'A sees only own business');
select test.eq((select count(*) from public.expense_categories)::int, 12, 'default expense categories');
select test.eq((select plan_id from public.subscriptions), 'free', 'free subscription created');

-- Team: employee & viewer join A's business
-- Free plan allows only 1 user.
select test.throws(format($$select public.invite_member(%L, 'employee.a@example.com', 'employee')$$, :'biz_a'),
  'plan_limit:users', 'free plan: 1 user');
reset role;
-- Upgrade A to Pro so the team fits (simulates the subscription webhook / service role).
update public.subscriptions set plan_id = 'pro' where business_id = :'biz_a';
set role authenticated;
select test.login('owner.a@example.com');
select public.invite_member(:'biz_a', 'employee.a@example.com', 'employee');
select public.invite_member(:'biz_a', 'viewer.a@example.com', 'viewer');
select test.eq((select count(*) from public.business_members where business_id = :'biz_a')::int, 3, 'team of 3');

-- ---------------------------------------------------------------------------
-- Products & inventory
-- ---------------------------------------------------------------------------
insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit)
  values (:'biz_a', 'Zinger Burger', 50000, 30000, 5, 'pcs');
insert into public.products (business_id, name, selling_price_minor, cost_price_minor, minimum_stock, unit)
  values (:'biz_a', 'Chicken', 60000, 52000, 5, 'kg');
select id as burger from public.products where name = 'Zinger Burger' \gset
select id as chicken from public.products where name = 'Chicken' \gset

select test.throws($$update public.products set stock_quantity = 999$$, 'permission denied',
  'stock cannot be edited directly');
select test.throws(format($$update public.products set business_id = %L$$, :'biz_b'), 'permission denied',
  'business_id cannot be changed');

select public.adjust_inventory(:'chicken', 'opening', 50, 'Opening stock');
select public.adjust_inventory(:'burger', 'opening', 20, 'Opening stock');

-- Spec example: opening 50 + purchase 20 - sale usage 15 - waste 2 = 53
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'purchase',
  'payment_method', 'cash', 'items', jsonb_build_array(jsonb_build_object('product_id', :'chicken', 'quantity', 20, 'unit_price_minor', 52000))));
select public.adjust_inventory(:'chicken', 'adjustment', -15, 'Used in kitchen');
select public.adjust_inventory(:'chicken', 'waste', 2, 'Spoiled');
select test.eq((select stock_quantity from public.products where id = :'chicken'), 53.000, 'chicken stock = 53');
select test.eq((select count(*) from public.inventory_transactions where product_id = :'chicken')::int, 4,
  'every stock change recorded');

-- ---------------------------------------------------------------------------
-- Sales, idempotency, invoice numbers
-- ---------------------------------------------------------------------------
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'client_ref', '11111111-1111-1111-1111-111111111111',
  'type', 'sale', 'amount_minor', 250000, 'payment_method', 'cash', 'description', '5 zinger burgers',
  'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 5)))) as sale1 \gset
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'client_ref', '11111111-1111-1111-1111-111111111111',
  'type', 'sale', 'amount_minor', 250000, 'payment_method', 'cash',
  'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 5)))) as sale1_replay \gset

select test.eq((:'sale1_replay'::jsonb ->> 'duplicate')::boolean, true, 'replay detected as duplicate');
select test.eq(:'sale1_replay'::jsonb ->> 'id', :'sale1'::jsonb ->> 'id', 'replay returns same id');
select test.eq((select count(*) from public.transactions where client_ref = '11111111-1111-1111-1111-111111111111')::int, 1,
  'no duplicate transaction on replay');
select test.eq((select stock_quantity from public.products where id = :'burger'), 15.000, 'burger stock decreased once');
select test.eq(:'sale1'::jsonb ->> 'invoice_number', 'INV-1001', 'invoice number assigned');
select test.eq((select unit_price_minor from public.transaction_items where transaction_id = (:'sale1'::jsonb ->> 'id')::uuid),
  50000::bigint, 'unit price');

-- "Sold 3 burgers for 1200" (stated amount below list price => implicit discount)
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'sale', 'amount_minor', 120000,
  'payment_method', 'cash', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 3)))) as sale2 \gset
select test.eq((select discount_minor from public.transactions where id = (:'sale2'::jsonb ->> 'id')::uuid), 30000::bigint,
  'implicit discount recorded');

-- ---------------------------------------------------------------------------
-- Expenses, receivables, payables
-- ---------------------------------------------------------------------------
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'expense', 'amount_minor', 450000,
  'payment_method', 'cash', 'expense_category_name', 'Electricity', 'description', 'Electricity bill'));
-- "Ali owes me 3000" -> adjustment against a new customer
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'adjustment', 'amount_minor', 300000,
  'payment_method', 'credit', 'customer_name', 'Ali', 'create_customer', true, 'description', 'Ali owes me'));
-- "I received 1000 from Ali"
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'payment_received', 'amount_minor', 100000,
  'payment_method', 'cash', 'customer_name', 'ali'));
select test.eq((select outstanding_minor from public.customer_balances where name = 'Ali'), 200000::bigint,
  'Ali outstanding = 2000');
-- credit purchase from supplier -> payable
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'purchase', 'amount_minor', 520000,
  'payment_method', 'credit', 'supplier_name', 'Poultry Co', 'create_supplier', true));
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'payment_sent', 'amount_minor', 20000,
  'payment_method', 'bank', 'supplier_name', 'Poultry Co'));
select test.eq((select outstanding_minor from public.supplier_balances where name = 'Poultry Co'), 500000::bigint,
  'supplier payable = 5000');

select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"sale","payment_method":"credit","amount_minor":100}')$$, :'biz_a'),
  'customer_required', 'credit sale needs a customer');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"sale","amount_minor":100,"customer_name":"Nobody"}')$$, :'biz_a'),
  'not_found:customer', 'unknown customer is not silently created');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"sale","amount_minor":-5}')$$, :'biz_a'),
  'invalid_input:amount|transactions_amount_sign', 'negative sale rejected');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"sale","amount_minor":100,"currency":"USD"}')$$, :'biz_a'),
  'invalid_input:currency', 'currency mismatch rejected');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"sale","amount_minor":100,"source":"demo"}')$$, :'biz_a'),
  'invalid_input:source', 'clients cannot claim demo source');

-- ---------------------------------------------------------------------------
-- Dashboard / profit
-- revenue = 2500 + 1200 = 3700; COGS = 8 * 300 = 2400; expenses = 4500
-- net = 3700 - 2400 - 4500 = -3200
-- ---------------------------------------------------------------------------
select public.dashboard_summary(:'biz_a', 'today') as dash \gset
select test.eq((:'dash'::jsonb ->> 'sales_minor')::bigint, 370000::bigint, 'today sales');
select test.eq((:'dash'::jsonb ->> 'sales_count')::int, 2, 'today order count');
select test.eq((:'dash'::jsonb ->> 'cogs_minor')::bigint, 240000::bigint, 'cogs');
select test.eq((:'dash'::jsonb ->> 'expenses_minor')::bigint, 450000::bigint, 'expenses');
select test.eq((:'dash'::jsonb ->> 'net_profit_minor')::bigint, -320000::bigint, 'net profit');
select test.eq((:'dash'::jsonb ->> 'receivables_minor')::bigint, 200000::bigint, 'receivables');
select test.eq((:'dash'::jsonb ->> 'payables_minor')::bigint, 500000::bigint, 'payables');

-- A sale without cost data => profit unavailable (never fabricated)
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'sale', 'amount_minor', 80000,
  'payment_method', 'cash', 'description', '20 pizzas'));
select public.dashboard_summary(:'biz_a', 'today') as dash2 \gset
select test.eq(:'dash2'::jsonb ->> 'net_profit_minor', null, 'profit unavailable when costs missing');
select test.eq(:'dash2'::jsonb ->> 'profit_unavailable_reason', 'incomplete_cost_data', 'reason given');

select test.eq((select spend_on(:'biz_a', 'chicken', 'this_month') ->> 'total_minor')::bigint, 1040000::bigint,
  'spend on chicken');
select test.eq((select count(*) from public.top_products(:'biz_a', '30d'))::int, 1, 'top products (only itemised sales)');
select test.eq((select count(*) from public.global_search(:'biz_a', 'ali') where kind = 'customer')::int, 1, 'search finds Ali');
select test.eq((select name from public.match_entities(:'biz_a', 'product', array['zinger burgers']) limit 1), 'Zinger Burger',
  'fuzzy/plural product resolution');

-- ---------------------------------------------------------------------------
-- Soft delete restores stock and hides the row from reports
-- ---------------------------------------------------------------------------
select public.soft_delete_transaction((:'sale1'::jsonb ->> 'id')::uuid, 'Entered by mistake');
select test.eq((select stock_quantity from public.products where id = :'burger'), 17.000, 'stock restored after delete');
select test.eq((select deleted_at is not null from public.transactions where id = (:'sale1'::jsonb ->> 'id')::uuid), true, 'soft deleted');
select test.throws(format($$select public.soft_delete_transaction(%L, 'again')$$, :'sale1'::jsonb ->> 'id'),
  'invalid_state:deleted', 'cannot delete twice');
select test.throws(format($$select public.update_transaction(%L, '{"description":"x"}')$$, :'sale1'::jsonb ->> 'id'),
  'invalid_state:deleted', 'deleted transactions cannot be edited');
select test.throws(format($$update public.transactions set deleted_at = null where id = %L$$, :'sale1'::jsonb ->> 'id'),
  'permission denied', 'clients cannot un-delete directly');
select test.throws($$delete from public.transactions$$, 'permission denied', 'clients cannot hard delete');
select test.eq((select count(*) from public.audit_logs where action = 'transaction.deleted')::int, 1, 'delete audited');

-- ---------------------------------------------------------------------------
-- Tenant isolation: Business B cannot see or touch Business A
-- ---------------------------------------------------------------------------
select test.login('owner.b@example.com');
select test.eq((select count(*) from public.transactions)::int, 0, 'B sees no A transactions');
select test.eq((select count(*) from public.products)::int, 0, 'B sees no A products');
select test.eq((select count(*) from public.customer_balances)::int, 0, 'B sees no A balances (view uses invoker RLS)');
select test.eq((select count(*) from public.audit_logs)::int, 1, 'B sees only its own audit log');
select test.throws(format($$select public.dashboard_summary(%L)$$, :'biz_a'), 'not_found:business', 'B cannot read A dashboard');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"expense","amount_minor":100}')$$, :'biz_a'),
  'not_found:business', 'B cannot write into A');
select test.throws(format($$select public.soft_delete_transaction(%L)$$, :'sale2'::jsonb ->> 'id'), 'not_found', 'B cannot delete A tx');
select test.throws(format($$insert into public.customers (business_id, name) values (%L, 'Spy')$$, :'biz_a'),
  'row-level security', 'B cannot insert into A');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"sale","items":[{"product_id":"%s","quantity":1,"unit_price_minor":1}]}')$$, :'biz_b', :'burger'),
  'not_found:product', 'B cannot reference A product from own business');
update public.businesses set name = 'hacked' where id = :'biz_a';
select test.eq((select count(*) from public.businesses where name = 'hacked')::int, 0, 'B cannot rename A');
select test.throws(format($$select public.export_business_data(%L)$$, :'biz_a'), 'not_found:business', 'B cannot export A');

-- ---------------------------------------------------------------------------
-- Roles inside A
-- ---------------------------------------------------------------------------
select test.login('viewer.a@example.com');
select test.eq((select count(*) from public.transactions where deleted_at is null)::int > 0, true, 'viewer can read');
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"expense","amount_minor":100}')$$, :'biz_a'),
  'forbidden', 'viewer cannot create transactions');
select test.throws(format($$select public.update_transaction(%L, '{"description":"x"}')$$, :'sale2'::jsonb ->> 'id'),
  'forbidden', 'viewer cannot modify transactions');
select test.eq((select count(*) from public.audit_logs)::int, 0, 'viewer cannot read audit logs');

select test.login('employee.a@example.com');
select public.record_transaction(jsonb_build_object('business_id', :'biz_a', 'type', 'expense', 'amount_minor', 1000,
  'payment_method', 'cash', 'expense_category_name', 'Supplies')) as emp_tx \gset
select public.soft_delete_transaction((:'emp_tx'::jsonb ->> 'id')::uuid, 'undo');  -- own entry, within 10 minutes
select test.throws(format($$select public.soft_delete_transaction(%L)$$, :'sale2'::jsonb ->> 'id'),
  'forbidden', 'employee cannot delete others'' transactions');
update public.business_settings set ai_auto_record_low_risk = false where business_id = :'biz_a';
select test.eq((select ai_auto_record_low_risk from public.business_settings where business_id = :'biz_a'), true,
  'employee cannot change owner-only settings');
update public.products set selling_price_minor = 1 where id = :'burger';   -- filtered by RLS
select test.eq((select selling_price_minor from public.products where id = :'burger'), 50000::bigint, 'price unchanged');
select test.throws(format($$select public.invite_member(%L, 'x@example.com', 'admin')$$, :'biz_a'), 'forbidden',
  'employee cannot invite');
select member_id from (select id as member_id from public.business_members where user_id = '00000000-0000-0000-0000-00000000000c') x \gset
select test.throws(format($$select public.update_member_role(%L, 'owner')$$, :'member_id'), 'forbidden',
  'employee cannot promote self');
select test.throws(format($$select public.export_business_data(%L)$$, :'biz_a'), 'forbidden', 'employee cannot export');

select test.login('owner.a@example.com');
select test.throws(format($$select public.remove_member(id) from public.business_members where business_id = %L and role = 'owner'$$, :'biz_a'),
  'last_owner', 'cannot remove last owner');
select test.eq((select count(*) from public.audit_logs where action = 'member.invited')::int, 2, 'invites audited');

-- ---------------------------------------------------------------------------
-- Plan limits (Business B is on Free: 20 products, 100 tx/month)
-- ---------------------------------------------------------------------------
select test.login('owner.b@example.com');
insert into public.products (business_id, name, selling_price_minor)
  select :'biz_b', 'P' || g, 100 from generate_series(1, 20) g;
select test.throws(format($$insert into public.products (business_id, name) values (%L, 'One too many')$$, :'biz_b'),
  'plan_limit:products', 'free product limit enforced');
select public.record_transaction(jsonb_build_object('business_id', :'biz_b', 'type', 'income', 'amount_minor', 1))
  from generate_series(1, 100);
select test.throws(format($$select public.record_transaction('{"business_id":"%s","type":"income","amount_minor":1}')$$, :'biz_b'),
  'plan_limit:transactions', 'free transaction limit enforced');
select test.throws(format($$select public.invite_member(%L, 'friend@example.com', 'viewer')$$, :'biz_b'),
  'plan_limit:users', 'free user limit enforced');
select test.eq((select (ai_quota_check(:'biz_b') ->> 'limit')::int), 30, 'AI quota reported from plan');

-- ---------------------------------------------------------------------------
-- Demo business is isolated and flagged
-- ---------------------------------------------------------------------------
select public.create_demo_business() as demo \gset
select test.eq((select is_demo from public.businesses where id = :'demo'), true, 'demo flagged');
select test.eq((select count(*) > 30 from public.transactions where business_id = :'demo'), true, 'demo has transactions');
select test.eq(public.create_demo_business(), :'demo'::uuid, 'demo creation is idempotent');
select test.eq((select count(*) from public.transactions where business_id = :'biz_b' and source = 'demo')::int, 0,
  'demo data never touches real business');
select test.throws($$select public.create_business('x', 'other', 'PKR', 'Asia/Karachi', null, true)$$, 'forbidden',
  'clients cannot create demo businesses directly');

-- anon has nothing
reset role;
set role anon;
select test.throws($$select count(*) from public.transactions$$, 'permission denied', 'anon cannot read ledger');
select test.eq((select count(*) from public.plans)::int, 3, 'anon can read plans (pricing page)');
reset role;

select 'ALL SQL TESTS PASSED' as result;
