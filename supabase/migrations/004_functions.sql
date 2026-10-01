-- =============================================================================
-- BusinessPilot — 004 functions & triggers
-- -----------------------------------------------------------------------------
-- All financial writes go through these SECURITY DEFINER functions. Each one:
--   1. resolves the caller with auth.uid() (never trusts a client user id),
--   2. checks membership + minimum role for the target business,
--   3. validates input and that every referenced row belongs to that business,
--   4. enforces subscription limits,
--   5. writes an audit log entry.
--
-- Errors are raised with stable, machine-readable messages that the client
-- maps to friendly text:  not_authenticated | forbidden | not_found[:x] |
-- invalid_input:<field> | invalid_state:<x> | plan_limit:<resource> |
-- ambiguous:<entity> | rate_limited
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger set_updated_at before update on public.profiles          for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.businesses        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.business_settings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.products          for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.customers         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.suppliers         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.employees         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.transactions      for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions     for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.support_requests  for each row execute function public.set_updated_at();

create or replace function public._require_role(p_business_id uuid, p_min public.member_role)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_business_id is null or not public.is_member(p_business_id) then
    raise exception 'not_found:business' using errcode = 'P0002';
  end if;
  if not public.has_min_role(p_business_id, p_min) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public._audit(
  p_business_id uuid, p_action text, p_entity text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (business_id, user_id, action, entity, entity_id, metadata)
  values (p_business_id, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function public._is_internal()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.internal', true), '') = 'on';
$$;

-- -----------------------------------------------------------------------------
-- New user bootstrap
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''))
  on conflict (id) do nothing;

  -- Pending invitations for this email become memberships.
  insert into public.business_members (business_id, user_id, role)
  select i.business_id, new.id, i.role from public.business_invitations i
  where lower(i.email) = lower(new.email) and i.accepted_at is null
  on conflict (business_id, user_id) do nothing;

  update public.business_invitations set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Plans & limits
-- -----------------------------------------------------------------------------
-- Effective plan: the subscribed plan while the subscription is in good
-- standing (3-day grace for past_due), otherwise 'free'.
create or replace function public.effective_plan(p_business_id uuid)
returns public.plans language sql stable security definer set search_path = public as $$
  select p.* from public.plans p
  where p.id = coalesce((
    select s.plan_id from public.subscriptions s
    where s.business_id = p_business_id
      and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days')
  ), 'free');
$$;

create or replace function public._month_start(p_business_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select date_trunc('month', now() at time zone b.timezone) at time zone b.timezone
  from public.businesses b where b.id = p_business_id;
$$;

create or replace function public._check_limit(p_business_id uuid, p_resource text)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_used integer;
begin
  v_plan := public.effective_plan(p_business_id);
  if p_resource = 'transactions' and v_plan.max_transactions_per_month is not null then
    select count(*) into v_used from public.transactions
    where business_id = p_business_id and created_at >= public._month_start(p_business_id) and source <> 'demo';
    if v_used >= v_plan.max_transactions_per_month then
      raise exception 'plan_limit:transactions' using errcode = 'P0001';
    end if;
  elsif p_resource = 'products' and v_plan.max_products is not null then
    select count(*) into v_used from public.products where business_id = p_business_id and deleted_at is null;
    if v_used >= v_plan.max_products then
      raise exception 'plan_limit:products' using errcode = 'P0001';
    end if;
  elsif p_resource = 'users' and v_plan.max_users is not null then
    select (select count(*) from public.business_members where business_id = p_business_id)
         + (select count(*) from public.business_invitations where business_id = p_business_id and accepted_at is null)
      into v_used;
    if v_used >= v_plan.max_users then
      raise exception 'plan_limit:users' using errcode = 'P0001';
    end if;
  end if;
end $$;

create or replace function public.plan_usage(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_sub public.subscriptions;
begin
  perform public._require_role(p_business_id, 'viewer');
  v_plan := public.effective_plan(p_business_id);
  select * into v_sub from public.subscriptions where business_id = p_business_id;
  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'subscription', to_jsonb(v_sub),
    'transactions_this_month', (select count(*) from public.transactions
        where business_id = p_business_id and created_at >= public._month_start(p_business_id) and source <> 'demo'),
    'products', (select count(*) from public.products where business_id = p_business_id and deleted_at is null),
    'users', (select count(*) from public.business_members where business_id = p_business_id),
    'ai_requests_this_month', (select count(*) from public.ai_requests
        where business_id = p_business_id and created_at >= public._month_start(p_business_id) and used_llm)
  );
end $$;

-- Called by the ai-* Edge Functions with the *user's* JWT before doing any work.
create or replace function public.ai_quota_check(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_used integer;
  v_last_minute integer;
begin
  perform public._require_role(p_business_id, 'viewer');
  v_plan := public.effective_plan(p_business_id);
  select count(*) into v_used from public.ai_requests
    where business_id = p_business_id and created_at >= public._month_start(p_business_id) and used_llm;
  select count(*) into v_last_minute from public.ai_requests
    where business_id = p_business_id and user_id = auth.uid() and created_at > now() - interval '1 minute';
  return jsonb_build_object(
    'allowed', (v_plan.ai_requests_per_month is null or v_used < v_plan.ai_requests_per_month) and v_last_minute < 20,
    'rate_limited', v_last_minute >= 20,
    'used', v_used,
    'limit', v_plan.ai_requests_per_month,
    'plan', v_plan.id,
    'role', public.member_role_of(p_business_id)
  );
end $$;

-- -----------------------------------------------------------------------------
-- Business lifecycle
-- -----------------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_business_type text default 'other',
  p_currency text default 'PKR',
  p_timezone text default 'Asia/Karachi',
  p_country text default null,
  p_is_demo boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bid uuid;
  v_owned integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(trim(p_name), '') = '' or char_length(p_name) > 120 then
    raise exception 'invalid_input:name' using errcode = '22023';
  end if;
  if upper(coalesce(p_currency, '')) !~ '^[A-Z]{3}$' then
    raise exception 'invalid_input:currency' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_input:timezone' using errcode = '22023';
  end if;
  if p_is_demo and not public._is_internal() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_owned from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.user_id = v_uid and m.role = 'owner' and b.deleted_at is null and not b.is_demo;
  if v_owned >= 20 then raise exception 'plan_limit:businesses' using errcode = 'P0001'; end if;

  insert into public.businesses (name, business_type, currency, timezone, country, created_by, is_demo)
  values (trim(p_name), coalesce(nullif(p_business_type, ''), 'other'), upper(p_currency), p_timezone, p_country, v_uid, p_is_demo)
  returning id into v_bid;

  insert into public.business_members (business_id, user_id, role) values (v_bid, v_uid, 'owner');
  insert into public.business_settings (business_id) values (v_bid);
  insert into public.subscriptions (business_id, plan_id, status, provider) values (v_bid, 'free', 'active', 'none');
  insert into public.accounts (business_id, name, type, is_default) values (v_bid, 'Cash', 'cash', true);
  insert into public.expense_categories (business_id, name, is_default)
  select v_bid, n, true from unnest(array['Rent', 'Electricity', 'Gas', 'Water', 'Internet', 'Salaries',
    'Transport', 'Marketing', 'Supplies', 'Maintenance', 'Packaging', 'Other']) as n;

  update public.profiles set last_business_id = v_bid where id = v_uid;
  insert into public.analytics_events (event, business_id, user_id, properties)
    values ('business_created', v_bid, v_uid, jsonb_build_object('type', p_business_type, 'demo', p_is_demo));
  perform public._audit(v_bid, 'business.created', 'business', v_bid, jsonb_build_object('name', p_name));
  return v_bid;
end $$;

create or replace function public.soft_delete_business(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_business_id, 'owner');
  update public.businesses set deleted_at = now() where id = p_business_id;
  perform public._audit(p_business_id, 'business.deleted', 'business', p_business_id);
end $$;

-- -----------------------------------------------------------------------------
-- Team management
-- -----------------------------------------------------------------------------
create or replace function public.invite_member(p_business_id uuid, p_email text, p_role public.member_role)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_email text := lower(trim(p_email));
begin
  perform public._require_role(p_business_id, 'admin');
  if p_role = 'owner' then raise exception 'invalid_input:role' using errcode = '22023'; end if;
  if p_role = 'admin' and not public.has_min_role(p_business_id, 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input:email' using errcode = '22023'; end if;
  perform public._check_limit(p_business_id, 'users');

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null then
    insert into public.business_members (business_id, user_id, role) values (p_business_id, v_user, p_role)
    on conflict (business_id, user_id) do nothing;
  else
    insert into public.business_invitations (business_id, email, role, invited_by)
    values (p_business_id, v_email, p_role, auth.uid())
    on conflict (business_id, email) do update set role = excluded.role;
  end if;
  perform public._audit(p_business_id, 'member.invited', 'business_member', null,
    jsonb_build_object('role', p_role, 'existing_user', v_user is not null));
  return jsonb_build_object('added', v_user is not null, 'invited', v_user is null);
end $$;

create or replace function public.accept_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(auth.email());
  v_count integer;
begin
  if auth.uid() is null or v_email is null then return 0; end if;
  insert into public.business_members (business_id, user_id, role)
    select business_id, auth.uid(), role from public.business_invitations
    where lower(email) = v_email and accepted_at is null
  on conflict (business_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  update public.business_invitations set accepted_at = now() where lower(email) = v_email and accepted_at is null;
  return v_count;
end $$;

create or replace function public.update_member_role(p_member_id uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_m public.business_members;
  v_owners integer;
begin
  select * into v_m from public.business_members where id = p_member_id;
  if not found or not public.is_member(v_m.business_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_role(v_m.business_id, 'admin');
  -- Only owners may grant/revoke owner or admin, or touch another admin/owner.
  if (p_role in ('owner', 'admin') or v_m.role in ('owner', 'admin'))
     and not public.has_min_role(v_m.business_id, 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_m.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners from public.business_members where business_id = v_m.business_id and role = 'owner';
    if v_owners <= 1 then raise exception 'invalid_state:last_owner' using errcode = 'P0001'; end if;
  end if;
  update public.business_members set role = p_role where id = p_member_id;
  perform public._audit(v_m.business_id, 'member.role_changed', 'business_member', p_member_id,
    jsonb_build_object('from', v_m.role, 'to', p_role, 'user_id', v_m.user_id));
end $$;

create or replace function public.remove_member(p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_m public.business_members;
  v_owners integer;
begin
  select * into v_m from public.business_members where id = p_member_id;
  if not found or not public.is_member(v_m.business_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_m.user_id <> auth.uid() then   -- anyone may leave; removing others needs admin
    perform public._require_role(v_m.business_id, 'admin');
    if v_m.role in ('owner', 'admin') and not public.has_min_role(v_m.business_id, 'owner') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if v_m.role = 'owner' then
    select count(*) into v_owners from public.business_members where business_id = v_m.business_id and role = 'owner';
    if v_owners <= 1 then raise exception 'invalid_state:last_owner' using errcode = 'P0001'; end if;
  end if;
  delete from public.business_members where id = p_member_id;
  perform public._audit(v_m.business_id, 'member.removed', 'business_member', p_member_id,
    jsonb_build_object('user_id', v_m.user_id, 'role', v_m.role));
end $$;

-- -----------------------------------------------------------------------------
-- Inventory: stock_quantity is ONLY changed by inserting an inventory movement.
-- -----------------------------------------------------------------------------
create or replace function public._apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.products where id = new.product_id and business_id = new.business_id) then
    raise exception 'invalid_input:product_business_mismatch' using errcode = '22023';
  end if;
  update public.products set stock_quantity = stock_quantity + new.quantity_change where id = new.product_id;
  return new;
end $$;

create trigger inventory_apply after insert on public.inventory_transactions
  for each row execute function public._apply_inventory_movement();

create or replace function public.adjust_inventory(
  p_product_id uuid,
  p_type public.inventory_movement_type,
  p_quantity_change numeric,
  p_note text default null,
  p_unit_cost_minor bigint default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_p public.products;
  v_stock numeric;
begin
  select * into v_p from public.products where id = p_product_id and deleted_at is null;
  if not found or not public.is_member(v_p.business_id) then raise exception 'not_found:product' using errcode = 'P0002'; end if;
  if p_type in ('sale', 'purchase') then
    raise exception 'invalid_input:type' using errcode = '22023';   -- these come from transactions
  end if;
  -- Employees can log waste/damage/returns; anything else needs a manager.
  perform public._require_role(v_p.business_id,
    case when p_type in ('waste', 'damage', 'return') then 'employee'::public.member_role else 'manager'::public.member_role end);
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'invalid_input:quantity' using errcode = '22023';
  end if;
  if p_type in ('waste', 'damage') and p_quantity_change > 0 then
    p_quantity_change := -p_quantity_change;     -- waste always reduces stock
  end if;
  insert into public.inventory_transactions (business_id, product_id, type, quantity_change, unit_cost_minor, note, created_by)
  values (v_p.business_id, p_product_id, p_type, p_quantity_change, p_unit_cost_minor, left(p_note, 300), auth.uid());
  select stock_quantity into v_stock from public.products where id = p_product_id;
  perform public._audit(v_p.business_id, 'inventory.adjusted', 'product', p_product_id,
    jsonb_build_object('type', p_type, 'change', p_quantity_change, 'stock_after', v_stock, 'note', p_note));
  return v_stock;
end $$;

-- Products: plan limit + audit price changes + low-stock notifications.
create or replace function public._products_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.businesses where id = new.business_id and is_demo) then
    perform public._check_limit(new.business_id, 'products');
  end if;
  return new;
end $$;
create trigger products_limit before insert on public.products
  for each row execute function public._products_before_insert();

create or replace function public._products_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._audit(new.business_id, 'product.created', 'product', new.id, jsonb_build_object('name', new.name));
    if auth.uid() is not null then
      insert into public.analytics_events (event, business_id, user_id) values ('product_created', new.business_id, auth.uid());
    end if;
    return new;
  end if;
  if new.selling_price_minor is distinct from old.selling_price_minor
     or new.cost_price_minor is distinct from old.cost_price_minor then
    perform public._audit(new.business_id, 'product.price_changed', 'product', new.id, jsonb_build_object(
      'selling_from', old.selling_price_minor, 'selling_to', new.selling_price_minor,
      'cost_from', old.cost_price_minor, 'cost_to', new.cost_price_minor));
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    perform public._audit(new.business_id, 'product.deleted', 'product', new.id);
  end if;
  if new.track_inventory and new.minimum_stock > 0
     and new.stock_quantity <= new.minimum_stock and old.stock_quantity > old.minimum_stock then
    if exists (select 1 from public.business_settings where business_id = new.business_id and low_stock_alerts) then
      insert into public.notifications (business_id, type, title, body, data, dedupe_key)
      values (new.business_id, 'low_stock', 'Low stock: ' || new.name,
              new.name || ' is down to ' || trim(to_char(new.stock_quantity, 'FM999999990.###')) || ' ' || new.unit || '.',
              jsonb_build_object('product_id', new.id),
              'low_stock:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD'))
      on conflict (business_id, dedupe_key) do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger products_after_change after insert or update on public.products
  for each row execute function public._products_after_change();

create or replace function public._contacts_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._audit(new.business_id,
    tg_table_name || case when tg_op = 'INSERT' then '.created'
                          when new.deleted_at is not null and old.deleted_at is null then '.deleted'
                          else '.updated' end,
    rtrim(tg_table_name, 's'), new.id);
  return new;
end $$;
create trigger customers_audit after insert or update on public.customers
  for each row execute function public._contacts_audit();
create trigger suppliers_audit after insert or update on public.suppliers
  for each row execute function public._contacts_audit();

create or replace function public._subscriptions_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.plan_id is distinct from old.plan_id or new.status is distinct from old.status) then
    perform public._audit(new.business_id, 'subscription.changed', 'subscription', new.id,
      jsonb_build_object('plan_from', old.plan_id, 'plan_to', new.plan_id, 'status_from', old.status, 'status_to', new.status));
  end if;
  return new;
end $$;
create trigger subscriptions_audit after update on public.subscriptions
  for each row execute function public._subscriptions_audit();

-- -----------------------------------------------------------------------------
-- Ledger: record / update / soft-delete transactions
-- -----------------------------------------------------------------------------
-- Resolve a contact by id or exact (case-insensitive) name, optionally creating it.
create or replace function public._resolve_contact(
  p_table text, p_business_id uuid, p_id text, p_name text, p_create boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count integer;
begin
  if nullif(p_id, '') is not null then
    execute format('select id from public.%I where id = $1 and business_id = $2 and deleted_at is null', p_table)
      into v_id using p_id::uuid, p_business_id;
    if v_id is null then raise exception 'not_found:%', rtrim(p_table, 's') using errcode = 'P0002'; end if;
    return v_id;
  end if;
  if nullif(trim(p_name), '') is null then return null; end if;
  execute format('select count(*), min(id::text)::uuid from public.%I where business_id = $1 and deleted_at is null and lower(name) = lower($2)', p_table)
    into v_count, v_id using p_business_id, trim(p_name);
  if v_count > 1 then raise exception 'ambiguous:%', rtrim(p_table, 's') using errcode = 'P0001'; end if;
  if v_count = 1 then return v_id; end if;
  if not coalesce(p_create, false) then raise exception 'not_found:%', rtrim(p_table, 's') using errcode = 'P0002'; end if;
  execute format('insert into public.%I (business_id, name) values ($1, $2) returning id', p_table)
    into v_id using p_business_id, left(trim(p_name), 120);
  return v_id;
end $$;

/*
  record_transaction(p jsonb) -> jsonb
  {
    business_id*, client_ref (uuid, idempotency key), type*, amount_minor, currency,
    payment_method, payment_provider, description, transaction_date,
    customer_id | customer_name (+create_customer), supplier_id | supplier_name (+create_supplier),
    expense_category_id | expense_category_name, account_id, discount_minor, tax_minor,
    source ('manual'|'ai'|'import'|'offline'), ai_request_id,
    items: [{ product_id?, name?, quantity*, unit_price_minor?, unit_cost_minor? }]
  }
  Idempotent: replaying the same (business_id, client_ref) returns the original row.
*/
create or replace function public.record_transaction(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bid uuid;
  v_ref uuid;
  v_type public.transaction_type;
  v_method public.payment_method;
  v_source public.transaction_source;
  v_business public.businesses;
  v_existing public.transactions;
  v_amount bigint;
  v_discount bigint := coalesce((p ->> 'discount_minor')::bigint, 0);
  v_tax bigint := coalesce((p ->> 'tax_minor')::bigint, 0);
  v_customer uuid;
  v_supplier uuid;
  v_category uuid;
  v_account uuid;
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_item jsonb;
  v_product public.products;
  v_qty numeric;
  v_unit bigint;
  v_cost bigint;
  v_total bigint;
  v_subtotal bigint := 0;
  v_tx_id uuid;
  v_invoice text;
  v_date timestamptz;
  v_item_count integer;
begin
  -- 1. identity, tenant, role --------------------------------------------------
  begin
    v_bid := (p ->> 'business_id')::uuid;
    v_ref := coalesce((p ->> 'client_ref')::uuid, gen_random_uuid());
    v_type := (p ->> 'type')::public.transaction_type;
    v_method := coalesce(nullif(p ->> 'payment_method', ''), 'cash')::public.payment_method;
    v_source := coalesce(nullif(p ->> 'source', ''), 'manual')::public.transaction_source;
    v_amount := (p ->> 'amount_minor')::bigint;
    v_date := coalesce((p ->> 'transaction_date')::timestamptz, now());
  exception when others then
    raise exception 'invalid_input:payload' using errcode = '22023';
  end;
  if v_type is null then raise exception 'invalid_input:type' using errcode = '22023'; end if;
  perform public._require_role(v_bid, 'employee');
  if v_source in ('demo', 'system') and not public._is_internal() then
    raise exception 'invalid_input:source' using errcode = '22023';
  end if;

  -- 2. idempotency --------------------------------------------------------------
  select * into v_existing from public.transactions where business_id = v_bid and client_ref = v_ref;
  if found then
    return jsonb_build_object('id', v_existing.id, 'invoice_number', v_existing.invoice_number,
      'amount_minor', v_existing.amount_minor, 'currency', v_existing.currency, 'duplicate', true);
  end if;

  -- 3. limits & validation ------------------------------------------------------
  if v_source <> 'demo' then perform public._check_limit(v_bid, 'transactions'); end if;
  select * into v_business from public.businesses where id = v_bid;
  if coalesce(nullif(p ->> 'currency', ''), v_business.currency) <> v_business.currency then
    raise exception 'invalid_input:currency' using errcode = '22023';
  end if;
  if v_date > now() + interval '1 day' then raise exception 'invalid_input:transaction_date' using errcode = '22023'; end if;
  if v_discount < 0 or v_tax < 0 then raise exception 'invalid_input:amount' using errcode = '22023'; end if;
  if jsonb_typeof(v_items) <> 'array' then raise exception 'invalid_input:items' using errcode = '22023'; end if;
  v_item_count := jsonb_array_length(v_items);
  if v_item_count > 200 then raise exception 'invalid_input:items' using errcode = '22023'; end if;

  v_customer := public._resolve_contact('customers', v_bid, p ->> 'customer_id', p ->> 'customer_name',
                                        coalesce((p ->> 'create_customer')::boolean, false));
  v_supplier := public._resolve_contact('suppliers', v_bid, p ->> 'supplier_id', p ->> 'supplier_name',
                                        coalesce((p ->> 'create_supplier')::boolean, false));
  if v_type = 'adjustment' and v_customer is null and v_supplier is null then
    raise exception 'invalid_input:party_required' using errcode = '22023';
  end if;
  if v_method = 'credit' and v_type in ('sale', 'refund') and v_customer is null then
    raise exception 'invalid_input:customer_required' using errcode = '22023';
  end if;
  if v_method = 'credit' and v_type in ('purchase', 'expense') and v_supplier is null then
    raise exception 'invalid_input:supplier_required' using errcode = '22023';
  end if;

  if v_type = 'expense' then
    if nullif(p ->> 'expense_category_id', '') is not null then
      select id into v_category from public.expense_categories
        where id = (p ->> 'expense_category_id')::uuid and business_id = v_bid;
      if v_category is null then raise exception 'not_found:expense_category' using errcode = 'P0002'; end if;
    else
      select id into v_category from public.expense_categories
        where business_id = v_bid and lower(name) = lower(coalesce(nullif(trim(p ->> 'expense_category_name'), ''), 'Other'));
      if v_category is null then
        insert into public.expense_categories (business_id, name)
          values (v_bid, left(trim(p ->> 'expense_category_name'), 60)) returning id into v_category;
      end if;
    end if;
  end if;

  if nullif(p ->> 'account_id', '') is not null then
    select id into v_account from public.accounts where id = (p ->> 'account_id')::uuid and business_id = v_bid;
    if v_account is null then raise exception 'not_found:account' using errcode = 'P0002'; end if;
  elsif v_method = 'cash' then
    select id into v_account from public.accounts where business_id = v_bid and type = 'cash' order by is_default desc, created_at limit 1;
  end if;

  if v_amount is null and v_item_count = 0 then raise exception 'invalid_input:amount' using errcode = '22023'; end if;

  -- 4. write -----------------------------------------------------------------------
  begin
    insert into public.transactions (business_id, type, amount_minor, currency, discount_minor, tax_minor,
      payment_method, payment_provider, description, customer_id, supplier_id, account_id, expense_category_id,
      client_ref, source, ai_request_id, transaction_date, created_by)
    values (v_bid, v_type, coalesce(v_amount, 0), v_business.currency, v_discount, v_tax,
      v_method, left(nullif(trim(p ->> 'payment_provider'), ''), 60), left(nullif(trim(p ->> 'description'), ''), 500),
      v_customer, v_supplier, v_account, v_category, v_ref, v_source,
      nullif(p ->> 'ai_request_id', '')::uuid, v_date, v_uid)
    returning id into v_tx_id;
  exception when unique_violation then
    -- Concurrent replay of the same client_ref: return the winner.
    select * into v_existing from public.transactions where business_id = v_bid and client_ref = v_ref;
    return jsonb_build_object('id', v_existing.id, 'invoice_number', v_existing.invoice_number,
      'amount_minor', v_existing.amount_minor, 'currency', v_existing.currency, 'duplicate', true);
  end;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_input:quantity' using errcode = '22023'; end if;
    v_product := null;
    if nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
        where id = (v_item ->> 'product_id')::uuid and business_id = v_bid and deleted_at is null;
      if v_product.id is null then raise exception 'not_found:product' using errcode = 'P0002'; end if;
    end if;

    v_unit := (v_item ->> 'unit_price_minor')::bigint;
    if v_unit is null then
      v_unit := case when v_type = 'purchase' then v_product.cost_price_minor else v_product.selling_price_minor end;
    end if;
    if v_unit is null and v_item_count = 1 and v_amount is not null then
      -- "Sold 3 burgers for 1500": the stated amount is authoritative.
      v_total := v_amount + v_discount - v_tax;
      v_unit := round(v_total::numeric / v_qty);
    elsif v_unit is null then
      raise exception 'invalid_input:price_missing' using errcode = '22023';
    else
      v_total := round(v_qty * v_unit);
    end if;
    if v_unit < 0 then raise exception 'invalid_input:price' using errcode = '22023'; end if;

    v_cost := case
      when v_type = 'purchase' then v_unit
      else coalesce((v_item ->> 'unit_cost_minor')::bigint, v_product.cost_price_minor) end;

    insert into public.transaction_items (business_id, transaction_id, product_id, name, quantity,
      unit_price_minor, unit_cost_minor, total_minor)
    values (v_bid, v_tx_id, v_product.id,
      left(coalesce(v_product.name, nullif(trim(v_item ->> 'name'), ''), 'Item'), 120),
      v_qty, v_unit, v_cost, v_total);
    v_subtotal := v_subtotal + v_total;

    if v_product.id is not null and v_product.track_inventory and v_type in ('sale', 'purchase', 'refund') then
      insert into public.inventory_transactions (business_id, product_id, type, quantity_change, unit_cost_minor, transaction_id, created_by)
      values (v_bid, v_product.id,
        case v_type when 'sale' then 'sale'::public.inventory_movement_type
                    when 'purchase' then 'purchase'::public.inventory_movement_type
                    else 'return'::public.inventory_movement_type end,
        case when v_type = 'sale' then -v_qty else v_qty end,
        v_cost, v_tx_id, v_uid);
    end if;

    -- Purchases refresh the product's cost price (last-purchase-cost method).
    if v_type = 'purchase' and v_product.id is not null and v_unit > 0
       and v_unit is distinct from v_product.cost_price_minor then
      update public.products set cost_price_minor = v_unit where id = v_product.id;
    end if;
  end loop;

  if v_item_count > 0 then
    if v_amount is null then
      v_amount := v_subtotal - v_discount + v_tax;
    elsif v_discount = 0 and v_subtotal + v_tax > v_amount then
      v_discount := v_subtotal + v_tax - v_amount;          -- implicit discount
    end if;
  end if;
  if v_amount < 0 and v_type <> 'adjustment' then raise exception 'invalid_input:amount' using errcode = '22023'; end if;

  if v_type = 'sale' then
    update public.businesses set next_invoice_number = next_invoice_number + 1
      where id = v_bid returning invoice_prefix || (next_invoice_number - 1)::text into v_invoice;
  end if;

  update public.transactions
    set amount_minor = v_amount, subtotal_minor = case when v_item_count > 0 then v_subtotal end,
        discount_minor = v_discount, invoice_number = v_invoice
    where id = v_tx_id;

  if v_source <> 'demo' then
    perform public._audit(v_bid, 'transaction.created', 'transaction', v_tx_id,
      jsonb_build_object('type', v_type, 'amount_minor', v_amount, 'source', v_source));
    insert into public.analytics_events (event, business_id, user_id, properties)
      values ('transaction_created', v_bid, v_uid, jsonb_build_object('type', v_type, 'source', v_source));
  end if;

  return jsonb_build_object('id', v_tx_id, 'invoice_number', v_invoice, 'amount_minor', v_amount,
    'currency', v_business.currency, 'customer_id', v_customer, 'supplier_id', v_supplier, 'duplicate', false);
end $$;

create or replace function public.update_transaction(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions;
  v_has_items boolean;
  v_new public.transactions;
begin
  select * into v_tx from public.transactions where id = p_id for update;
  if not found or not public.is_member(v_tx.business_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_role(v_tx.business_id, 'manager');
  if v_tx.deleted_at is not null then raise exception 'invalid_state:deleted' using errcode = 'P0001'; end if;

  select exists (select 1 from public.transaction_items where transaction_id = p_id) into v_has_items;
  if p ? 'amount_minor' and v_has_items and (p ->> 'amount_minor')::bigint <> v_tx.amount_minor then
    raise exception 'invalid_input:amount_locked_items' using errcode = '22023';
  end if;
  if p ? 'amount_minor' and (p ->> 'amount_minor')::bigint < 0 and v_tx.type <> 'adjustment' then
    raise exception 'invalid_input:amount' using errcode = '22023';
  end if;
  if p ? 'customer_id' and nullif(p ->> 'customer_id', '') is not null and not exists (
      select 1 from public.customers where id = (p ->> 'customer_id')::uuid and business_id = v_tx.business_id) then
    raise exception 'not_found:customer' using errcode = 'P0002';
  end if;
  if p ? 'supplier_id' and nullif(p ->> 'supplier_id', '') is not null and not exists (
      select 1 from public.suppliers where id = (p ->> 'supplier_id')::uuid and business_id = v_tx.business_id) then
    raise exception 'not_found:supplier' using errcode = 'P0002';
  end if;
  if p ? 'expense_category_id' and nullif(p ->> 'expense_category_id', '') is not null and not exists (
      select 1 from public.expense_categories where id = (p ->> 'expense_category_id')::uuid and business_id = v_tx.business_id) then
    raise exception 'not_found:expense_category' using errcode = 'P0002';
  end if;

  update public.transactions set
    amount_minor        = case when p ? 'amount_minor' then (p ->> 'amount_minor')::bigint else amount_minor end,
    description         = case when p ? 'description' then left(nullif(trim(p ->> 'description'), ''), 500) else description end,
    payment_method      = case when p ? 'payment_method' then (p ->> 'payment_method')::public.payment_method else payment_method end,
    payment_provider    = case when p ? 'payment_provider' then nullif(trim(p ->> 'payment_provider'), '') else payment_provider end,
    transaction_date    = case when p ? 'transaction_date' then (p ->> 'transaction_date')::timestamptz else transaction_date end,
    customer_id         = case when p ? 'customer_id' then nullif(p ->> 'customer_id', '')::uuid else customer_id end,
    supplier_id         = case when p ? 'supplier_id' then nullif(p ->> 'supplier_id', '')::uuid else supplier_id end,
    expense_category_id = case when p ? 'expense_category_id' then nullif(p ->> 'expense_category_id', '')::uuid else expense_category_id end
  where id = p_id returning * into v_new;

  perform public._audit(v_tx.business_id, 'transaction.updated', 'transaction', p_id, jsonb_build_object(
    'before', jsonb_build_object('amount_minor', v_tx.amount_minor, 'payment_method', v_tx.payment_method,
       'description', v_tx.description, 'transaction_date', v_tx.transaction_date),
    'after', jsonb_build_object('amount_minor', v_new.amount_minor, 'payment_method', v_new.payment_method,
       'description', v_new.description, 'transaction_date', v_new.transaction_date)));
end $$;

-- Soft delete with stock reversal. Managers+ may delete; the creator may undo
-- their own entry within 10 minutes (powers the AI "Undo" button).
create or replace function public.soft_delete_transaction(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_id for update;
  if not found or not public.is_member(v_tx.business_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.has_min_role(v_tx.business_id, 'manager')
          or (v_tx.created_by = auth.uid() and v_tx.created_at > now() - interval '10 minutes'
              and public.has_min_role(v_tx.business_id, 'employee'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_tx.deleted_at is not null then raise exception 'invalid_state:deleted' using errcode = 'P0001'; end if;

  update public.transactions set deleted_at = now(), deleted_by = auth.uid(), delete_reason = left(p_reason, 300)
    where id = p_id;

  insert into public.inventory_transactions (business_id, product_id, type, quantity_change, transaction_id, note, created_by)
  select business_id, product_id, 'adjustment', -sum(quantity_change), p_id, 'Reversal: transaction deleted', auth.uid()
  from public.inventory_transactions where transaction_id = p_id
  group by business_id, product_id having sum(quantity_change) <> 0;

  perform public._audit(v_tx.business_id, 'transaction.deleted', 'transaction', p_id,
    jsonb_build_object('reason', p_reason, 'amount_minor', v_tx.amount_minor, 'type', v_tx.type));
end $$;

-- -----------------------------------------------------------------------------
-- Reporting. All numbers are calculated here — never by the AI.
-- Date presets are resolved in the BUSINESS timezone.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_range(
  p_business_id uuid, p_preset text default 'today', p_from date default null, p_to date default null,
  out start_at timestamptz, out end_at timestamptz, out from_date date, out to_date date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
begin
  select timezone into v_tz from public.businesses where id = p_business_id;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;
  case coalesce(p_preset, 'today')
    when 'today'      then from_date := v_today;     to_date := v_today;
    when 'yesterday'  then from_date := v_today - 1; to_date := v_today - 1;
    when '7d'         then from_date := v_today - 6; to_date := v_today;
    when '30d'        then from_date := v_today - 29; to_date := v_today;
    when 'this_month' then from_date := date_trunc('month', v_today)::date; to_date := v_today;
    when 'last_month' then
      from_date := (date_trunc('month', v_today) - interval '1 month')::date;
      to_date := (date_trunc('month', v_today) - interval '1 day')::date;
    when 'this_year'  then from_date := date_trunc('year', v_today)::date; to_date := v_today;
    when 'all'        then from_date := date '2000-01-01'; to_date := v_today;
    when 'custom' then
      if p_from is null or p_to is null or p_from > p_to then
        raise exception 'invalid_input:range' using errcode = '22023';
      end if;
      from_date := p_from; to_date := p_to;
    else raise exception 'invalid_input:preset' using errcode = '22023';
  end case;
  start_at := from_date::timestamp at time zone v_tz;
  end_at := (to_date + 1)::timestamp at time zone v_tz;
end $$;

/*
  Profit methodology (also shown in the app):
    revenue          = sales − refunds
    cogs             = Σ(sold quantity × unit cost captured at time of sale)
    gross_profit     = revenue − cogs
    net_profit       = revenue + other income − cogs − operating expenses
  Purchases are stock (not an expense) and are therefore excluded from profit.
  If any sale in the period lacks cost data, profit is NOT estimated
  (net_profit = null, profit_unavailable_reason = 'incomplete_cost_data').
*/
create or replace function public.dashboard_summary(
  p_business_id uuid, p_preset text default 'today', p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  s record;
  c record;
  v_receivables bigint;
  v_payables bigint;
  v_low_stock integer;
  v_revenue bigint;
  v_complete boolean;
begin
  perform public._require_role(p_business_id, 'viewer');
  select * into r from public.resolve_range(p_business_id, p_preset, p_from, p_to);

  select
    coalesce(sum(amount_minor) filter (where type = 'sale'), 0)              as sales,
    count(*) filter (where type = 'sale')                                     as sales_count,
    coalesce(sum(amount_minor) filter (where type = 'refund'), 0)            as refunds,
    coalesce(sum(amount_minor) filter (where type = 'income'), 0)            as income,
    coalesce(sum(amount_minor) filter (where type = 'expense'), 0)           as expenses,
    count(*) filter (where type = 'expense')                                  as expenses_count,
    coalesce(sum(amount_minor) filter (where type = 'purchase'), 0)          as purchases,
    coalesce(sum(amount_minor) filter (where type = 'payment_received'), 0)  as payments_received,
    coalesce(sum(amount_minor) filter (where type = 'payment_sent'), 0)      as payments_sent,
    coalesce(sum(amount_minor) filter (where payment_method <> 'credit' and type in ('sale', 'income', 'payment_received')), 0) as cash_in,
    coalesce(sum(amount_minor) filter (where payment_method <> 'credit' and type in ('purchase', 'expense', 'payment_sent', 'refund')), 0) as cash_out,
    count(*)                                                                  as tx_count
  into s
  from public.transactions
  where business_id = p_business_id and deleted_at is null
    and transaction_date >= r.start_at and transaction_date < r.end_at;

  select
    coalesce(sum(round(i.quantity * i.unit_cost_minor)) filter (where t.type = 'sale'), 0)
      - coalesce(sum(round(i.quantity * i.unit_cost_minor)) filter (where t.type = 'refund'), 0) as cogs,
    count(*) filter (where t.type = 'sale' and i.unit_cost_minor is null)                         as missing_cost
  into c
  from public.transaction_items i
  join public.transactions t on t.id = i.transaction_id
  where t.business_id = p_business_id and t.deleted_at is null and t.type in ('sale', 'refund')
    and t.transaction_date >= r.start_at and t.transaction_date < r.end_at;

  v_complete := c.missing_cost = 0 and not exists (
    select 1 from public.transactions t
    where t.business_id = p_business_id and t.deleted_at is null and t.type = 'sale'
      and t.transaction_date >= r.start_at and t.transaction_date < r.end_at
      and not exists (select 1 from public.transaction_items i where i.transaction_id = t.id));

  select coalesce(sum(greatest(outstanding_minor, 0)), 0) into v_receivables
    from public.customer_balances where business_id = p_business_id;
  select coalesce(sum(greatest(outstanding_minor, 0)), 0) into v_payables
    from public.supplier_balances where business_id = p_business_id;
  select count(*) into v_low_stock from public.products
    where business_id = p_business_id and deleted_at is null and is_active and track_inventory
      and minimum_stock > 0 and stock_quantity <= minimum_stock;

  v_revenue := s.sales - s.refunds;
  return jsonb_build_object(
    'from', r.from_date, 'to', r.to_date,
    'currency', (select currency from public.businesses where id = p_business_id),
    'sales_minor', s.sales, 'sales_count', s.sales_count, 'refunds_minor', s.refunds,
    'revenue_minor', v_revenue, 'other_income_minor', s.income,
    'expenses_minor', s.expenses, 'expenses_count', s.expenses_count, 'purchases_minor', s.purchases,
    'payments_received_minor', s.payments_received, 'payments_sent_minor', s.payments_sent,
    'cash_in_minor', s.cash_in, 'cash_out_minor', s.cash_out, 'net_cash_flow_minor', s.cash_in - s.cash_out,
    'cogs_minor', case when v_complete then c.cogs end,
    'cogs_complete', v_complete,
    'gross_profit_minor', case when v_complete then v_revenue - c.cogs end,
    'net_profit_minor', case when v_complete then v_revenue + s.income - c.cogs - s.expenses end,
    'profit_unavailable_reason', case when v_complete then null else 'incomplete_cost_data' end,
    'receivables_minor', v_receivables, 'payables_minor', v_payables,
    'low_stock_count', v_low_stock, 'transaction_count', s.tx_count
  );
end $$;

create or replace function public.sales_timeseries(
  p_business_id uuid, p_preset text default '7d', p_from date default null, p_to date default null)
returns table (day date, sales_minor bigint, expenses_minor bigint, purchases_minor bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_tz text;
begin
  perform public._require_role(p_business_id, 'viewer');
  select * into r from public.resolve_range(p_business_id, p_preset, p_from, p_to);
  select timezone into v_tz from public.businesses where id = p_business_id;
  if r.to_date - r.from_date > 400 then r.from_date := r.to_date - 400; end if;
  return query
  with days as (select generate_series(r.from_date, r.to_date, interval '1 day')::date as d),
  agg as (
    select (t.transaction_date at time zone v_tz)::date as d,
      sum(t.amount_minor) filter (where t.type = 'sale') - coalesce(sum(t.amount_minor) filter (where t.type = 'refund'), 0) as sales,
      sum(t.amount_minor) filter (where t.type = 'expense') as expenses,
      sum(t.amount_minor) filter (where t.type = 'purchase') as purchases
    from public.transactions t
    where t.business_id = p_business_id and t.deleted_at is null
      and t.transaction_date >= r.start_at and t.transaction_date < r.end_at
    group by 1)
  select days.d, coalesce(agg.sales, 0)::bigint, coalesce(agg.expenses, 0)::bigint, coalesce(agg.purchases, 0)::bigint
  from days left join agg on agg.d = days.d order by days.d;
end $$;

create or replace function public.expense_breakdown(
  p_business_id uuid, p_preset text default 'this_month', p_from date default null, p_to date default null)
returns table (category text, amount_minor bigint, count bigint)
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  perform public._require_role(p_business_id, 'viewer');
  select * into r from public.resolve_range(p_business_id, p_preset, p_from, p_to);
  return query
  select coalesce(ec.name, 'Uncategorized')::text, sum(t.amount_minor)::bigint, count(*)
  from public.transactions t
  left join public.expense_categories ec on ec.id = t.expense_category_id
  where t.business_id = p_business_id and t.deleted_at is null and t.type = 'expense'
    and t.transaction_date >= r.start_at and t.transaction_date < r.end_at
  group by 1 order by 2 desc;
end $$;

create or replace function public.top_products(
  p_business_id uuid, p_preset text default '30d', p_from date default null, p_to date default null, p_limit integer default 10)
returns table (product_id uuid, name text, quantity numeric, revenue_minor bigint, cost_minor bigint)
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  perform public._require_role(p_business_id, 'viewer');
  select * into r from public.resolve_range(p_business_id, p_preset, p_from, p_to);
  return query
  select i.product_id, max(i.name)::text, sum(i.quantity), sum(i.total_minor)::bigint,
         sum(round(i.quantity * i.unit_cost_minor))::bigint
  from public.transaction_items i
  join public.transactions t on t.id = i.transaction_id
  where t.business_id = p_business_id and t.deleted_at is null and t.type = 'sale'
    and t.transaction_date >= r.start_at and t.transaction_date < r.end_at
  group by i.product_id, lower(i.name)
  order by 4 desc
  limit least(greatest(p_limit, 1), 100);
end $$;

create or replace function public.low_stock_products(p_business_id uuid)
returns table (id uuid, name text, stock_quantity numeric, minimum_stock numeric, unit text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_role(p_business_id, 'viewer');
  return query
  select p.id, p.name, p.stock_quantity, p.minimum_stock, p.unit from public.products p
  where p.business_id = p_business_id and p.deleted_at is null and p.is_active and p.track_inventory
    and p.minimum_stock > 0 and p.stock_quantity <= p.minimum_stock
  order by (p.stock_quantity / nullif(p.minimum_stock, 0)) nulls first, p.name;
end $$;

-- Total spent (expenses + purchases) matching a term, e.g. "chicken".
create or replace function public.spend_on(
  p_business_id uuid, p_term text, p_preset text default 'this_month', p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_total bigint;
  v_count integer;
  v_like text := '%' || replace(replace(replace(lower(trim(p_term)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public._require_role(p_business_id, 'viewer');
  if char_length(trim(coalesce(p_term, ''))) < 2 then raise exception 'invalid_input:term' using errcode = '22023'; end if;
  select * into r from public.resolve_range(p_business_id, p_preset, p_from, p_to);
  select coalesce(sum(t.amount_minor), 0), count(*) into v_total, v_count
  from public.transactions t
  left join public.expense_categories ec on ec.id = t.expense_category_id
  left join public.suppliers s on s.id = t.supplier_id
  where t.business_id = p_business_id and t.deleted_at is null and t.type in ('expense', 'purchase')
    and t.transaction_date >= r.start_at and t.transaction_date < r.end_at
    and (lower(coalesce(t.description, '')) like v_like or lower(coalesce(ec.name, '')) like v_like
         or lower(coalesce(s.name, '')) like v_like
         or exists (select 1 from public.transaction_items i where i.transaction_id = t.id and lower(i.name) like v_like));
  return jsonb_build_object('term', p_term, 'total_minor', v_total, 'count', v_count,
                            'from', r.from_date, 'to', r.to_date);
end $$;

create or replace function public.global_search(p_business_id uuid, p_query text)
returns table (kind text, id uuid, title text, subtitle text, occurred_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_like text := '%' || replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public._require_role(p_business_id, 'viewer');
  if char_length(trim(coalesce(p_query, ''))) < 2 then return; end if;
  return query
  (select 'customer'::text, c.id, c.name, coalesce(c.phone, c.email, ''), c.created_at from public.customers c
    where c.business_id = p_business_id and c.deleted_at is null
      and (lower(c.name) like v_like or coalesce(c.phone, '') like v_like) limit 8)
  union all
  (select 'supplier', s.id, s.name, coalesce(s.phone, s.email, ''), s.created_at from public.suppliers s
    where s.business_id = p_business_id and s.deleted_at is null
      and (lower(s.name) like v_like or coalesce(s.phone, '') like v_like) limit 8)
  union all
  (select 'product', p.id, p.name, coalesce(p.sku, p.barcode, ''), p.created_at from public.products p
    where p.business_id = p_business_id and p.deleted_at is null
      and (lower(p.name) like v_like or lower(coalesce(p.sku, '')) like v_like or coalesce(p.barcode, '') like v_like) limit 8)
  union all
  (select case when t.type = 'expense' then 'expense' else 'transaction' end, t.id,
          coalesce(t.invoice_number || ' · ', '') || coalesce(t.description, t.type::text), t.type::text, t.transaction_date
    from public.transactions t
    left join public.customers c on c.id = t.customer_id
    left join public.suppliers s on s.id = t.supplier_id
    where t.business_id = p_business_id and t.deleted_at is null
      and (lower(coalesce(t.description, '')) like v_like or lower(coalesce(t.invoice_number, '')) like v_like
           or lower(coalesce(c.name, '')) like v_like or lower(coalesce(s.name, '')) like v_like)
    order by t.transaction_date desc limit 15);
end $$;

-- Fuzzy entity lookup used by the AI resolver (minimal context, no full dumps).
create or replace function public.match_entities(p_business_id uuid, p_kind text, p_names text[])
returns table (query text, id uuid, name text, score real, selling_price_minor bigint, cost_price_minor bigint, unit text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_role(p_business_id, 'viewer');
  if p_kind not in ('product', 'customer', 'supplier') or coalesce(array_length(p_names, 1), 0) > 20 then
    raise exception 'invalid_input:kind' using errcode = '22023';
  end if;
  return query
  select q.n, e.id, e.name, e.score, e.sp, e.cp, e.unit
  from unnest(p_names) as q(n)
  cross join lateral (
    select x.id, x.name, x.score, x.sp, x.cp, x.unit from (
      select p.id, p.name, similarity(lower(p.name), lower(q.n)) as score, p.selling_price_minor as sp,
             p.cost_price_minor as cp, p.unit
        from public.products p
        where p_kind = 'product' and p.business_id = p_business_id and p.deleted_at is null and p.is_active
      union all
      select c.id, c.name, similarity(lower(c.name), lower(q.n)), null, null, null from public.customers c
        where p_kind = 'customer' and c.business_id = p_business_id and c.deleted_at is null
      union all
      select s.id, s.name, similarity(lower(s.name), lower(q.n)), null, null, null from public.suppliers s
        where p_kind = 'supplier' and s.business_id = p_business_id and s.deleted_at is null
    ) x
    where x.score >= 0.3 or lower(x.name) = lower(q.n)
       or lower(x.name) = lower(regexp_replace(q.n, 's$', ''))       -- plural "burgers" -> "burger"
    order by (lower(x.name) = lower(q.n) or lower(x.name) = lower(regexp_replace(q.n, 's$', ''))) desc, x.score desc
    limit 5
  ) e;
end $$;

-- -----------------------------------------------------------------------------
-- Data portability ("Export My Data")
-- -----------------------------------------------------------------------------
create or replace function public.export_business_data(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_role(p_business_id, 'admin');
  return jsonb_build_object(
    'exported_at', now(),
    'business', (select to_jsonb(b) from public.businesses b where id = p_business_id),
    'settings', (select to_jsonb(s) from public.business_settings s where business_id = p_business_id),
    'products', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.products x where business_id = p_business_id),
    'product_categories', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.product_categories x where business_id = p_business_id),
    'customers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.customers x where business_id = p_business_id),
    'suppliers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.suppliers x where business_id = p_business_id),
    'expense_categories', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.expense_categories x where business_id = p_business_id),
    'accounts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.accounts x where business_id = p_business_id),
    'employees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.employees x where business_id = p_business_id),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.transactions x where business_id = p_business_id),
    'transaction_items', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.transaction_items x where business_id = p_business_id),
    'inventory_transactions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.inventory_transactions x where business_id = p_business_id)
  );
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges: internal helpers are not callable by clients.
-- -----------------------------------------------------------------------------
revoke execute on function public._require_role(uuid, public.member_role) from public, anon, authenticated;
revoke execute on function public._audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._check_limit(uuid, text) from public, anon, authenticated;
revoke execute on function public._resolve_contact(text, uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public._month_start(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public._is_internal() from public, anon, authenticated;
-- Postgres grants EXECUTE to PUBLIC by default: anonymous callers get nothing.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_member(uuid), public.member_role_of(uuid), public.role_rank(public.member_role),
  public.has_min_role(uuid, public.member_role), public.is_platform_admin(),
  public.plan_usage(uuid), public.ai_quota_check(uuid),
  public.create_business(text, text, text, text, text, boolean), public.soft_delete_business(uuid),
  public.invite_member(uuid, text, public.member_role), public.accept_invitations(),
  public.update_member_role(uuid, public.member_role), public.remove_member(uuid),
  public.adjust_inventory(uuid, public.inventory_movement_type, numeric, text, bigint),
  public.record_transaction(jsonb), public.update_transaction(uuid, jsonb), public.soft_delete_transaction(uuid, text),
  public.resolve_range(uuid, text, date, date), public.dashboard_summary(uuid, text, date, date),
  public.sales_timeseries(uuid, text, date, date), public.expense_breakdown(uuid, text, date, date),
  public.top_products(uuid, text, date, date, integer), public.low_stock_products(uuid),
  public.spend_on(uuid, text, text, date, date), public.global_search(uuid, text),
  public.match_entities(uuid, text, text[]), public.export_business_data(uuid)
to authenticated;
