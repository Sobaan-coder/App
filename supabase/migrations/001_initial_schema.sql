-- =============================================================================
-- BusinessPilot — 001 initial schema
-- -----------------------------------------------------------------------------
-- Conventions
--   * Every business-owned row carries business_id (tenant key).
--   * Money is stored as BIGINT minor units (e.g. paisa / cents) + an explicit
--     ISO-4217 currency code. Never floating point.
--   * Quantities are NUMERIC(14,3) (supports kg / litres).
--   * All timestamps are timestamptz (stored in UTC).
--   * Financial rows are soft-deleted (deleted_at / deleted_by / delete_reason).
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'manager', 'employee', 'viewer');

create type public.transaction_type as enum (
  'sale', 'purchase', 'expense', 'income',
  'payment_received', 'payment_sent', 'refund', 'adjustment', 'transfer'
);

create type public.payment_method as enum ('cash', 'bank', 'card', 'wallet', 'credit', 'other');

create type public.inventory_movement_type as enum (
  'opening', 'purchase', 'sale', 'waste', 'damage', 'return', 'adjustment', 'transfer'
);

create type public.transaction_source as enum ('manual', 'ai', 'import', 'offline', 'demo', 'system');

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');

create type public.account_type as enum ('cash', 'bank', 'wallet', 'card', 'other');

-- -----------------------------------------------------------------------------
-- Platform-level tables
-- -----------------------------------------------------------------------------

-- Subscription plans: the single source of truth for limits & prices.
create table public.plans (
  id                         text primary key,               -- 'free' | 'pro' | 'business'
  name                       text not null,
  description                text not null default '',
  price_monthly_minor        bigint not null default 0,
  price_currency             char(3) not null default 'USD',
  max_transactions_per_month integer,                         -- null = unlimited
  max_products               integer,
  max_users                  integer,
  max_branches               integer,
  ai_requests_per_month      integer,
  features                   jsonb not null default '{}'::jsonb,
  sort_order                 integer not null default 0,
  is_active                  boolean not null default true,
  google_play_product_id     text,
  stripe_price_id            text,
  created_at                 timestamptz not null default now()
);

-- Global key/value settings (e.g. global feature flags). Written by service role only.
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Platform administrators are completely separate from business roles.
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  avatar_url  text,
  locale      text not null default 'en',
  theme_mode  text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  last_business_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tenancy
-- -----------------------------------------------------------------------------
create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 120),
  business_type       text not null default 'other',
  currency            char(3) not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  timezone            text not null default 'Asia/Karachi',
  country             text,
  address             text,
  phone               text,
  email               text,
  logo_url            text,
  tax_enabled         boolean not null default false,
  tax_rate_bp         integer not null default 0 check (tax_rate_bp between 0 and 10000), -- basis points
  invoice_prefix      text not null default 'INV-',
  next_invoice_number integer not null default 1001,
  is_demo             boolean not null default false,
  is_flagged          boolean not null default false,          -- set by platform admins
  flagged_reason      text,
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'employee',
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.business_invitations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null,
  role        public.member_role not null default 'employee' check (role <> 'owner'),
  invited_by  uuid references auth.users (id),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (business_id, email)
);

create table public.business_settings (
  business_id                 uuid primary key references public.businesses (id) on delete cascade,
  ai_auto_record_low_risk     boolean not null default false,  -- owners can opt in to instant recording
  ai_confirm_threshold_minor  bigint  not null default 2000000,  -- above this amount AI always asks
  low_stock_alerts            boolean not null default true,
  daily_summary               boolean not null default true,
  monthly_report              boolean not null default true,
  payment_due_reminders       boolean not null default true,
  feature_flags               jsonb   not null default '{}'::jsonb,
  invoice_footer              text    not null default 'Thank you for your business!',
  updated_at                  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catalogue & inventory
-- -----------------------------------------------------------------------------
create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  category_id        uuid references public.product_categories (id) on delete set null,
  name               text not null check (char_length(name) between 1 and 120),
  sku                text,
  description        text,
  selling_price_minor bigint check (selling_price_minor >= 0),
  cost_price_minor    bigint check (cost_price_minor >= 0),
  stock_quantity     numeric(14,3) not null default 0,   -- maintained ONLY by inventory_transactions trigger
  minimum_stock      numeric(14,3) not null default 0 check (minimum_stock >= 0),
  unit               text not null default 'pcs',
  barcode            text,
  image_url          text,
  track_inventory    boolean not null default true,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);

-- Money accounts (cash drawer, bank account, wallet ...).
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete cascade,
  name                  text not null,
  type                  public.account_type not null default 'cash',
  provider              text,                       -- e.g. 'Easypaisa', 'Meezan Bank'
  opening_balance_minor bigint not null default 0,
  is_default            boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (business_id, name)
);

create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null,
  phone            text,
  role_title       text,
  salary_minor     bigint check (salary_minor >= 0),
  member_user_id   uuid references auth.users (id) on delete set null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Ledger
-- -----------------------------------------------------------------------------
create table public.ai_requests (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  user_id            uuid references auth.users (id) on delete set null,
  kind               text not null check (kind in ('parse', 'query', 'receipt', 'chat')),
  input_preview      text,                    -- truncated input, for debugging/support only
  intent             text,
  provider           text,
  model              text,
  used_llm           boolean not null default false,
  cache_hit          boolean not null default false,
  prompt_tokens      integer not null default 0,
  completion_tokens  integer not null default 0,
  latency_ms         integer,
  status             text not null default 'ok' check (status in ('ok', 'clarification', 'error', 'rejected', 'rate_limited')),
  error_code         text,
  cache_key          text,
  result             jsonb,
  created_at         timestamptz not null default now()
);

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  type                 public.transaction_type not null,
  amount_minor         bigint not null,
  currency             char(3) not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor       bigint,
  discount_minor       bigint not null default 0 check (discount_minor >= 0),
  tax_minor            bigint not null default 0 check (tax_minor >= 0),
  payment_method       public.payment_method not null default 'cash',
  payment_provider     text,                       -- 'Easypaisa', 'JazzCash', 'Visa', ...
  description          text check (char_length(description) <= 500),
  customer_id          uuid references public.customers (id),
  supplier_id          uuid references public.suppliers (id),
  account_id           uuid references public.accounts (id),
  expense_category_id  uuid references public.expense_categories (id),
  invoice_number       text,
  client_ref           uuid not null,              -- idempotency key generated by the client
  source               public.transaction_source not null default 'manual',
  ai_request_id        uuid references public.ai_requests (id) on delete set null,
  transaction_date     timestamptz not null default now(),
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  deleted_by           uuid references auth.users (id),
  delete_reason        text,
  unique (business_id, client_ref),
  -- Only adjustments may be negative.
  constraint transactions_amount_sign check (amount_minor >= 0 or type = 'adjustment')
);

create table public.transaction_items (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  transaction_id   uuid not null references public.transactions (id) on delete cascade,
  product_id       uuid references public.products (id),
  name             text not null,
  quantity         numeric(14,3) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  unit_cost_minor  bigint check (unit_cost_minor >= 0),  -- captured at time of sale for COGS
  total_minor      bigint not null check (total_minor >= 0),
  created_at       timestamptz not null default now()
);

create table public.inventory_transactions (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete cascade,
  type             public.inventory_movement_type not null,
  quantity_change  numeric(14,3) not null check (quantity_change <> 0),
  unit_cost_minor  bigint,
  transaction_id   uuid references public.transactions (id),
  note             text,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Billing, audit, notifications, support, analytics
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  business_id               uuid not null unique references public.businesses (id) on delete cascade,
  plan_id                   text not null references public.plans (id) default 'free',
  status                    public.subscription_status not null default 'active',
  provider                  text,             -- 'stripe' | 'google_play' | 'manual' | ...
  provider_customer_id      text,
  provider_subscription_id  text,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table public.payment_events (   -- raw, idempotent webhook ledger (service role only)
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  event_id      text not null,
  business_id   uuid references public.businesses (id) on delete set null,
  type          text not null,
  payload       jsonb not null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,   -- null = all members
  type        text not null check (type in ('low_stock', 'customer_payment_due', 'supplier_payment_due',
                                              'monthly_report', 'daily_summary', 'subscription', 'reminder', 'system')),
  title       text not null,
  body        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (business_id, dedupe_key)
);

create table public.support_requests (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete set null,
  user_id     uuid references auth.users (id) on delete set null,
  kind        text not null check (kind in ('contact', 'problem', 'feature')),
  subject     text not null check (char_length(subject) between 1 and 200),
  message     text not null check (char_length(message) between 1 and 5000),
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.analytics_events (
  id          bigint generated always as identity primary key,
  event       text not null check (event ~ '^[a-z_]{2,64}$'),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.app_errors (    -- sanitized client/server error log for observability
  id          bigint generated always as identity primary key,
  source      text not null,          -- 'client' | 'ai-process' | 'sync' | ...
  code        text not null,
  message     text,
  business_id uuid references public.businesses (id) on delete set null,
  user_id     uuid references auth.users (id) on delete set null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Read models (views). security_invoker => RLS of the caller applies.
-- The ledger (transactions) is the single source of truth; these views give
-- convenient, consistently-calculated projections.
-- -----------------------------------------------------------------------------
create view public.expenses with (security_invoker = true) as
  select t.id, t.business_id, t.amount_minor, t.currency, t.payment_method, t.payment_provider,
         t.description, t.expense_category_id, ec.name as category_name, t.supplier_id,
         t.transaction_date, t.created_by, t.created_at
  from public.transactions t
  left join public.expense_categories ec on ec.id = t.expense_category_id
  where t.type = 'expense' and t.deleted_at is null;

create view public.income with (security_invoker = true) as
  select t.id, t.business_id, t.type, t.amount_minor, t.currency, t.payment_method, t.payment_provider,
         t.description, t.customer_id, t.transaction_date, t.created_at
  from public.transactions t
  where t.type in ('sale', 'income') and t.deleted_at is null;

create view public.payments with (security_invoker = true) as
  select t.id, t.business_id, t.type, t.amount_minor, t.currency, t.payment_method, t.payment_provider,
         t.customer_id, t.supplier_id, t.description, t.transaction_date, t.created_at
  from public.transactions t
  where t.type in ('payment_received', 'payment_sent') and t.deleted_at is null;

-- Receivable rules (documented in docs/ARCHITECTURE.md):
--   + sale on credit, + adjustment against a customer (e.g. "Ali owes me 3000")
--   - payment_received, - refund on credit
create view public.customer_balances with (security_invoker = true) as
  select c.id as customer_id, c.business_id, c.name, c.phone,
    coalesce(sum(case when t.type = 'sale' then t.amount_minor end), 0)::bigint                              as total_purchases_minor,
    coalesce(sum(case when t.type = 'payment_received' then t.amount_minor end), 0)::bigint                  as total_payments_minor,
    coalesce(sum(case
      when t.type = 'sale' and t.payment_method = 'credit' then t.amount_minor
      when t.type = 'adjustment' then t.amount_minor
      when t.type = 'payment_received' then -t.amount_minor
      when t.type = 'refund' and t.payment_method = 'credit' then -t.amount_minor
      else 0 end), 0)::bigint                                                                                 as outstanding_minor,
    max(t.transaction_date)                                                                           as last_transaction_at
  from public.customers c
  left join public.transactions t on t.customer_id = c.id and t.deleted_at is null
  where c.deleted_at is null
  group by c.id;

-- Payable rules: + purchase/expense on credit, + adjustment against supplier, - payment_sent
create view public.supplier_balances with (security_invoker = true) as
  select s.id as supplier_id, s.business_id, s.name, s.phone,
    coalesce(sum(case when t.type in ('purchase', 'expense') then t.amount_minor end), 0)::bigint            as total_purchases_minor,
    coalesce(sum(case when t.type = 'payment_sent' then t.amount_minor end), 0)::bigint                      as total_payments_minor,
    coalesce(sum(case
      when t.type in ('purchase', 'expense') and t.payment_method = 'credit' then t.amount_minor
      when t.type = 'adjustment' then t.amount_minor
      when t.type = 'payment_sent' then -t.amount_minor
      else 0 end), 0)::bigint                                                                                 as outstanding_minor,
    max(t.transaction_date)                                                                           as last_transaction_at
  from public.suppliers s
  left join public.transactions t on t.supplier_id = s.id and t.deleted_at is null
  where s.deleted_at is null
  group by s.id;
