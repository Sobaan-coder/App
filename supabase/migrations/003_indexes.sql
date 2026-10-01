-- =============================================================================
-- BusinessPilot — 003 indexes
-- Only indexes that back real query paths (dashboard, lists, balances, RLS).
-- =============================================================================

-- Membership lookups run inside every RLS check.
create index business_members_user_idx on public.business_members (user_id, business_id);

-- Ledger: lists and range aggregates are always (business, date) scoped and
-- exclude soft-deleted rows.
create index transactions_business_date_idx on public.transactions (business_id, transaction_date desc)
  where deleted_at is null;
create index transactions_business_type_date_idx on public.transactions (business_id, type, transaction_date)
  where deleted_at is null;
create index transactions_customer_idx on public.transactions (customer_id) where customer_id is not null;
create index transactions_supplier_idx on public.transactions (supplier_id) where supplier_id is not null;
create index transactions_deleted_idx on public.transactions (business_id, deleted_at) where deleted_at is not null;
create index transactions_invoice_idx on public.transactions (business_id, invoice_number) where invoice_number is not null;
create index transactions_created_at_idx on public.transactions (business_id, created_at desc);
-- (business_id, client_ref) unique constraint already provides the idempotency index.

create index transaction_items_tx_idx on public.transaction_items (transaction_id);
create index transaction_items_product_idx on public.transaction_items (business_id, product_id);

create index inventory_tx_product_idx on public.inventory_transactions (product_id, created_at desc);
create index inventory_tx_business_idx on public.inventory_transactions (business_id, created_at desc);

-- Catalogue & contacts (trigram for fuzzy name resolution used by the AI + search).
create index products_business_idx on public.products (business_id) where deleted_at is null;
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create unique index products_business_barcode_uidx on public.products (business_id, barcode)
  where barcode is not null and deleted_at is null;
create unique index products_business_sku_uidx on public.products (business_id, sku)
  where sku is not null and deleted_at is null;

create index customers_business_idx on public.customers (business_id) where deleted_at is null;
create index customers_name_trgm_idx on public.customers using gin (name gin_trgm_ops);
create index suppliers_business_idx on public.suppliers (business_id) where deleted_at is null;
create index suppliers_name_trgm_idx on public.suppliers using gin (name gin_trgm_ops);

create index subscriptions_status_idx on public.subscriptions (status, current_period_end);

create index ai_requests_business_month_idx on public.ai_requests (business_id, created_at desc);
create index ai_requests_cache_idx on public.ai_requests (business_id, cache_key, created_at desc)
  where cache_key is not null;

create index audit_logs_business_idx on public.audit_logs (business_id, created_at desc);
create index notifications_business_idx on public.notifications (business_id, created_at desc);
create index analytics_events_event_idx on public.analytics_events (event, created_at desc);
create index app_errors_created_idx on public.app_errors (created_at desc);
create index support_requests_status_idx on public.support_requests (status, created_at desc);
