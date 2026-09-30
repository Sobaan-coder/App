-- 002_content_studio.sql — brands, products, content, social publishing

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  legal_name text not null default '',
  tagline text not null default '',
  description text not null default '',
  logo_file_id uuid references files(id) on delete set null,
  colors text[] not null default '{}',
  font_preferences text not null default '',
  visual_style text not null default '',
  tone text not null default '',
  location text not null default '',
  currency text not null default 'USD',
  contact jsonb not null default '{}'::jsonb,
  website text not null default '',
  social_links jsonb not null default '{}'::jsonb,
  default_hashtags text[] not null default '{}',
  posting_time time not null default '19:00',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  category text not null default 'General',
  description text not null default '',
  price numeric(12, 2),
  ingredients text[] not null default '{}',
  image_file_id uuid references files(id) on delete set null,
  special_offer text not null default '',
  available boolean not null default true,
  marketing_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);
create index if not exists products_brand_idx on products(brand_id);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  goal text not null default '',
  description text not null default '',
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  post_id uuid,
  file_id uuid references files(id) on delete set null,
  provider text not null,
  prompt text not null,
  negative_prompt text not null default '',
  spec jsonb not null default '{}'::jsonb,
  width int,
  height int,
  status text not null default 'generated' check (status in ('generated', 'failed', 'manual_required')),
  error text,
  created_at timestamptz not null default now()
);

create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  title text not null,
  idea text not null default '',
  content_category text not null default 'Brand',
  status text not null default 'draft' check (status in ('idea', 'draft', 'approval', 'approved', 'scheduled', 'published', 'failed', 'rejected')),
  platforms text[] not null default '{}',
  scheduled_at timestamptz,
  image_id uuid references generated_images(id) on delete set null,
  image_prompt jsonb,
  quality_report jsonb,
  run_id uuid references automation_runs(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_user_sched_idx on content_posts(user_id, scheduled_at);
create index if not exists posts_user_status_idx on content_posts(user_id, status);

alter table generated_images drop constraint if exists generated_images_post_fk;
alter table generated_images add constraint generated_images_post_fk foreign key (post_id) references content_posts(id) on delete cascade;

create table if not exists captions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  post_id uuid not null references content_posts(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'snapchat')),
  title text not null default '',
  caption text not null default '',
  hashtags text[] not null default '{}',
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (post_id, platform)
);

create table if not exists hashtags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  tag text not null,
  category text not null default 'general',
  usage_count int not null default 0,
  unique (user_id, brand_id, tag)
);

create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'snapchat')),
  account_name text not null default '',
  external_id text,
  status text not null default 'manual' check (status in ('connected', 'manual', 'error', 'expired')),
  credentials_encrypted text,
  token_expires_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  auto_publish boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create table if not exists publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  post_id uuid not null references content_posts(id) on delete cascade,
  platform text not null,
  social_account_id uuid references social_accounts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'publishing', 'published', 'failed', 'manual_required', 'cancelled')),
  attempts int not null default 0,
  external_post_id text,
  url text,
  error text,
  error_hint text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform)
);
create index if not exists pubjobs_user_idx on publishing_jobs(user_id, created_at desc);

create table if not exists analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  publishing_job_id uuid not null references publishing_jobs(id) on delete cascade,
  platform text not null,
  reach int,
  views int,
  likes int,
  comments int,
  shares int,
  saves int,
  raw jsonb,
  available boolean not null default false,
  note text,
  fetched_at timestamptz not null default now()
);
create index if not exists analytics_job_idx on analytics(publishing_job_id, fetched_at desc);

do $$
declare t text;
begin
  foreach t in array array['brands','products','campaigns','content_posts','social_accounts','publishing_jobs']
  loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function cc_touch_updated_at()', t, t);
  end loop;
end $$;
