-- =============================================================================
-- BusinessPilot — 002 row level security
-- -----------------------------------------------------------------------------
-- Model
--   * Tenant isolation: a row is visible only to members of its business.
--   * Business membership is resolved from auth.uid(); client-supplied
--     business_id values are never trusted on their own.
--   * Ledger tables (transactions, transaction_items, inventory_transactions,
--     audit_logs, subscriptions, ai_requests) are READ-ONLY for clients.
--     All writes go through SECURITY DEFINER functions (004_functions.sql),
--     which check membership + role, enforce plan limits and write audit logs.
--   * Table privileges are tightened as well (defense in depth): even if a
--     policy were wrong, the client role lacks the privilege.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read business_members without
-- recursive RLS evaluation). search_path pinned to avoid hijacking.
-- -----------------------------------------------------------------------------
create or replace function public.is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members m
    join public.businesses b on b.id = m.business_id and b.deleted_at is null
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.member_role_of(p_business_id uuid)
returns public.member_role language sql stable security definer set search_path = public as $$
  select m.role from public.business_members m
  join public.businesses b on b.id = m.business_id and b.deleted_at is null
  where m.business_id = p_business_id and m.user_id = auth.uid();
$$;

-- Role hierarchy: owner > admin > manager > employee > viewer
create or replace function public.role_rank(p_role public.member_role)
returns integer language sql immutable as $$
  select case p_role
    when 'owner' then 50 when 'admin' then 40 when 'manager' then 30
    when 'employee' then 20 when 'viewer' then 10 else 0 end;
$$;

create or replace function public.has_min_role(p_business_id uuid, p_min public.member_role)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.role_rank(public.member_role_of(p_business_id)) >= public.role_rank(p_min), false);
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Privileges. Supabase grants ALL to anon/authenticated by default; tighten.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.plans to anon;

revoke insert, update, delete on
  public.transactions, public.transaction_items, public.inventory_transactions,
  public.audit_logs, public.subscriptions, public.ai_requests, public.payment_events,
  public.business_members, public.settings, public.platform_admins, public.plans
from authenticated;

revoke select on public.payment_events from authenticated;
revoke select on public.analytics_events, public.app_errors from authenticated;
revoke update, delete on public.analytics_events, public.app_errors, public.support_requests from authenticated;

-- businesses: no direct insert/delete (use create_business()); only safe columns updatable.
revoke insert, update, delete on public.businesses from authenticated;
grant update (name, business_type, currency, timezone, country, address, phone, email,
              logo_url, tax_enabled, tax_rate_bp, invoice_prefix) on public.businesses to authenticated;

-- products: stock_quantity is maintained only via inventory_transactions; business_id immutable.
revoke update on public.products from authenticated;
grant update (category_id, name, sku, description, selling_price_minor, cost_price_minor,
              minimum_stock, unit, barcode, image_url, track_inventory, is_active, deleted_at)
  on public.products to authenticated;
revoke insert on public.products from authenticated;
grant insert (business_id, category_id, name, sku, description, selling_price_minor, cost_price_minor,
              minimum_stock, unit, barcode, image_url, track_inventory, is_active)
  on public.products to authenticated;

-- customers / suppliers / settings / misc: business_id immutable after insert.
revoke update on public.customers, public.suppliers, public.business_settings,
  public.employees, public.accounts, public.product_categories, public.expense_categories
from authenticated;
grant update (name, phone, email, address, notes, deleted_at) on public.customers, public.suppliers to authenticated;
grant update (ai_auto_record_low_risk, ai_confirm_threshold_minor, low_stock_alerts, daily_summary,
              monthly_report, payment_due_reminders, invoice_footer) on public.business_settings to authenticated;
grant update (name, phone, role_title, salary_minor, is_active) on public.employees to authenticated;
grant update (name, type, provider, opening_balance_minor, is_default) on public.accounts to authenticated;
grant update (name) on public.product_categories, public.expense_categories to authenticated;
revoke insert on public.business_settings from authenticated;

-- notifications: only the read marker is client-writable.
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- profiles: id immutable
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, locale, theme_mode, last_business_id) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere.
-- -----------------------------------------------------------------------------
alter table public.plans                  enable row level security;
alter table public.settings               enable row level security;
alter table public.platform_admins        enable row level security;
alter table public.profiles               enable row level security;
alter table public.businesses             enable row level security;
alter table public.business_members       enable row level security;
alter table public.business_invitations   enable row level security;
alter table public.business_settings      enable row level security;
alter table public.product_categories     enable row level security;
alter table public.products               enable row level security;
alter table public.customers              enable row level security;
alter table public.suppliers              enable row level security;
alter table public.expense_categories     enable row level security;
alter table public.accounts               enable row level security;
alter table public.employees              enable row level security;
alter table public.ai_requests            enable row level security;
alter table public.transactions           enable row level security;
alter table public.transaction_items      enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.payment_events         enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.notifications          enable row level security;
alter table public.support_requests       enable row level security;
alter table public.analytics_events       enable row level security;
alter table public.app_errors             enable row level security;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------
-- Platform
create policy plans_read on public.plans for select to anon, authenticated using (is_active);
create policy settings_read on public.settings for select to authenticated using (true);
create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- Profiles: own profile, plus co-members' profiles (names in team list).
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.business_members a
    join public.business_members b on a.business_id = b.business_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Businesses
create policy businesses_select on public.businesses for select to authenticated
  using (deleted_at is null and public.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.has_min_role(id, 'admin')) with check (public.has_min_role(id, 'admin'));

-- Members & invitations
create policy members_select on public.business_members for select to authenticated
  using (public.is_member(business_id));
create policy invitations_select on public.business_invitations for select to authenticated
  using (public.has_min_role(business_id, 'admin'));
create policy invitations_insert on public.business_invitations for insert to authenticated
  with check (public.has_min_role(business_id, 'admin') and invited_by = auth.uid());
create policy invitations_delete on public.business_invitations for delete to authenticated
  using (public.has_min_role(business_id, 'admin'));

create policy business_settings_select on public.business_settings for select to authenticated
  using (public.is_member(business_id));
create policy business_settings_update on public.business_settings for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

-- Catalogue: everyone in the business reads; managers+ maintain products & categories.
create policy product_categories_select on public.product_categories for select to authenticated
  using (public.is_member(business_id));
create policy product_categories_write on public.product_categories for all to authenticated
  using (public.has_min_role(business_id, 'manager')) with check (public.has_min_role(business_id, 'manager'));

create policy products_select on public.products for select to authenticated
  using (public.is_member(business_id));
create policy products_insert on public.products for insert to authenticated
  with check (public.has_min_role(business_id, 'manager'));
create policy products_update on public.products for update to authenticated
  using (public.has_min_role(business_id, 'manager')) with check (public.has_min_role(business_id, 'manager'));

-- Customers / suppliers: employees can add & edit contacts.
create policy customers_select on public.customers for select to authenticated
  using (public.is_member(business_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_min_role(business_id, 'employee'));
create policy customers_update on public.customers for update to authenticated
  using (public.has_min_role(business_id, 'employee')) with check (public.has_min_role(business_id, 'employee'));

create policy suppliers_select on public.suppliers for select to authenticated
  using (public.is_member(business_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.has_min_role(business_id, 'employee'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_min_role(business_id, 'employee')) with check (public.has_min_role(business_id, 'employee'));

create policy expense_categories_select on public.expense_categories for select to authenticated
  using (public.is_member(business_id));
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (public.has_min_role(business_id, 'manager')) with check (public.has_min_role(business_id, 'manager'));

create policy accounts_select on public.accounts for select to authenticated
  using (public.is_member(business_id));
create policy accounts_write on public.accounts for all to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

-- Employees hold salary data: managers+ only.
create policy employees_select on public.employees for select to authenticated
  using (public.has_min_role(business_id, 'manager'));
create policy employees_write on public.employees for all to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

-- Ledger: read-only for members.
create policy transactions_select on public.transactions for select to authenticated
  using (public.is_member(business_id));
create policy transaction_items_select on public.transaction_items for select to authenticated
  using (public.is_member(business_id));
create policy inventory_transactions_select on public.inventory_transactions for select to authenticated
  using (public.is_member(business_id));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_member(business_id));

create policy ai_requests_select on public.ai_requests for select to authenticated
  using (public.has_min_role(business_id, 'admin'));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_min_role(business_id, 'admin'));

create policy notifications_select on public.notifications for select to authenticated
  using (public.is_member(business_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (public.is_member(business_id) and (user_id is null or user_id = auth.uid()))
  with check (public.is_member(business_id) and (user_id is null or user_id = auth.uid()));

create policy support_insert on public.support_requests for insert to authenticated
  with check (user_id = auth.uid() and (business_id is null or public.is_member(business_id)));
create policy support_select on public.support_requests for select to authenticated
  using (user_id = auth.uid());

create policy analytics_insert on public.analytics_events for insert to authenticated
  with check (user_id = auth.uid() and (business_id is null or public.is_member(business_id)));

create policy app_errors_insert on public.app_errors for insert to authenticated
  with check (user_id = auth.uid() and (business_id is null or public.is_member(business_id)));

-- payment_events: no policies => service role only.

-- -----------------------------------------------------------------------------
-- Storage: business assets (logos, product images, receipts) live under
-- "<business_id>/..." in private buckets. Guarded so the migration also runs
-- on plain Postgres (used by the SQL test-suite).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values
      ('business-assets', 'business-assets', false),
      ('receipts', 'receipts', false)
    on conflict (id) do nothing;

    execute $p$
      create policy "members read business files" on storage.objects for select to authenticated
      using (bucket_id in ('business-assets', 'receipts')
             and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "employees upload business files" on storage.objects for insert to authenticated
      with check (bucket_id in ('business-assets', 'receipts')
                  and public.has_min_role(((storage.foldername(name))[1])::uuid, 'employee'))
    $p$;
    execute $p$
      create policy "managers replace business files" on storage.objects for update to authenticated
      using (bucket_id in ('business-assets', 'receipts')
             and public.has_min_role(((storage.foldername(name))[1])::uuid, 'manager'))
    $p$;
    execute $p$
      create policy "managers delete business files" on storage.objects for delete to authenticated
      using (bucket_id in ('business-assets', 'receipts')
             and public.has_min_role(((storage.foldername(name))[1])::uuid, 'manager'))
    $p$;
  end if;
end $$;
