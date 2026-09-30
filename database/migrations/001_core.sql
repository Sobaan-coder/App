-- 001_core.sql — core schema for MY AI COMMAND CENTER
-- Works on plain PostgreSQL 14+ and on Supabase.

create extension if not exists pgcrypto;

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function cc_touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Current user id for RLS. Uses the app's per-transaction setting, and also understands
-- Supabase JWT claims so policies work if you later query through PostgREST.
create or replace function cc_uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;

-- ── users & profiles ─────────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  token_version int not null default 0,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name text not null default '',
  timezone text not null default 'UTC',
  language text not null default 'en',
  work_start time not null default '09:00',
  work_end time not null default '17:00',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── projects & tasks ─────────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  kind text not null default 'general' check (kind in ('general', 'business', 'study', 'personal')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  color text not null default '#7c3aed',
  deadline date,
  sections text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists projects_user_idx on projects(user_id);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled')),
  due_at timestamptz,
  remind_at timestamptz,
  reminded_at timestamptz,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes > 0),
  tags text[] not null default '{}',
  recurrence text, -- cron expression, e.g. "0 9 * * 5"
  automation_id uuid,
  source text not null default 'user' check (source in ('user', 'ai', 'automation')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_status_idx on tasks(user_id, status);
create index if not exists tasks_user_due_idx on tasks(user_id, due_at);
create index if not exists tasks_project_idx on tasks(project_id);
create index if not exists tasks_remind_idx on tasks(remind_at) where reminded_at is null and remind_at is not null;

create table if not exists task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

-- ── automations, runs, steps, jobs ───────────────────────────────────────────
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  description text not null default '',
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('schedule', 'webhook', 'file_added', 'manual', 'event')),
  trigger_config jsonb not null default '{}'::jsonb,
  workflow jsonb not null default '{"steps": []}'::jsonb,
  template_key text,
  created_by text not null default 'user' check (created_by in ('user', 'ai', 'template')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_user_idx on automations(user_id);
create index if not exists automations_due_idx on automations(next_run_at) where enabled and trigger_type = 'schedule';

alter table tasks drop constraint if exists tasks_automation_fk;
alter table tasks add constraint tasks_automation_fk foreign key (automation_id) references automations(id) on delete set null;

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  automation_id uuid references automations(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  source text not null default 'command' check (source in ('command', 'automation', 'content', 'system')),
  title text not null,
  command_text text,
  intent text,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'approval_required', 'completed', 'failed', 'cancelled')),
  plan jsonb not null default '{"steps": []}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  current_step int not null default 0,
  progress int not null default 0 check (progress between 0 and 100),
  result jsonb,
  error text,
  trigger_data jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists runs_user_created_idx on automation_runs(user_id, created_at desc);
create index if not exists runs_user_status_idx on automation_runs(user_id, status);
create index if not exists runs_automation_idx on automation_runs(automation_id, created_at desc);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  run_id uuid not null references automation_runs(id) on delete cascade,
  step_index int not null,
  step_key text not null,
  kind text not null default 'tool',
  tool text,
  action text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped', 'waiting_approval', 'cancelled')),
  input jsonb,
  output jsonb,
  error text,
  attempts int not null default 0,
  risk_level text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, step_key)
);
create index if not exists steps_run_idx on workflow_steps(run_id, step_index);

-- System job queue (no user policy — only the worker touches it).
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_ready_idx on jobs(run_at) where status = 'queued';

-- ── tools & permissions ──────────────────────────────────────────────────────
create table if not exists tools (
  name text primary key,
  description text not null,
  category text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists tool_permissions (
  user_id uuid not null references users(id) on delete cascade,
  tool_name text not null references tools(name) on delete cascade,
  mode text not null check (mode in ('auto', 'approval', 'confirm', 'disabled')),
  updated_at timestamptz not null default now(),
  primary key (user_id, tool_name)
);

-- ── approvals & activity ─────────────────────────────────────────────────────
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  run_id uuid references automation_runs(id) on delete cascade,
  step_key text,
  tool_name text,
  kind text not null default 'tool' check (kind in ('tool', 'workflow', 'content_publish')),
  title text not null,
  reason text not null default '',
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  requires_confirmation boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  edited_payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approvals_user_status_idx on approvals(user_id, status, created_at desc);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  run_id uuid references automation_runs(id) on delete set null,
  category text not null default 'system',
  action text not null,
  tool text,
  status text not null default 'info' check (status in ('info', 'success', 'warning', 'error')),
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_created_idx on activity_logs(user_id, created_at desc);
create index if not exists activity_run_idx on activity_logs(run_id);

-- ── files & documents ────────────────────────────────────────────────────────
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  folder text not null default 'uploads',
  storage_path text not null,
  mime text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  sha256 text,
  tags text[] not null default '{}',
  source text not null default 'upload' check (source in ('upload', 'generated', 'browser')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists files_user_folder_idx on files(user_id, folder, created_at desc);
create index if not exists files_user_name_idx on files(user_id, lower(name));

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  file_id uuid not null unique references files(id) on delete cascade,
  title text not null,
  text_content text not null default '',
  summary text,
  key_points jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  word_count int not null default 0,
  injection_flags jsonb not null default '[]'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists documents_user_idx on documents(user_id, created_at desc);

-- ── memory ───────────────────────────────────────────────────────────────────
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  category text not null check (category in ('preference', 'project', 'business', 'task', 'general')),
  subject text not null,
  content text not null,
  source text not null default 'user' check (source in ('user', 'ai', 'system')),
  importance int not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_idx on memories(user_id, category);
create index if not exists memories_subject_idx on memories(user_id, lower(subject));

-- ── integrations, AI models & usage ──────────────────────────────────────────
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  name text not null default '',
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  config jsonb not null default '{}'::jsonb,
  credentials_encrypted text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists ai_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  model text not null,
  label text not null default '',
  is_local boolean not null default false,
  is_paid boolean not null default false,
  tier text not null default 'fast' check (tier in ('fast', 'reasoning', 'extraction')),
  priority int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, provider, model, tier)
);

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  provider text not null,
  model text not null,
  kind text not null default 'text' check (kind in ('text', 'image', 'embedding')),
  task text not null default '',
  prompt_tokens int,
  completion_tokens int,
  estimated_cost_usd numeric(12, 6) not null default 0,
  is_paid boolean not null default false,
  success boolean not null default true,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx on ai_usage(user_id, created_at desc);

-- ── notifications, webhooks, discovery, monitors, system ─────────────────────
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null default '',
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'error')),
  link text,
  channels text[] not null default '{in_app}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  token text not null unique,
  last_called_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists command_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  command text not null,
  intent text,
  signature text,
  run_id uuid references automation_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists command_history_sig_idx on command_history(user_id, signature);

create table if not exists automation_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  signature text not null,
  example_command text not null,
  occurrences int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, signature)
);

create table if not exists web_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  url text not null,
  selector text,
  last_hash text,
  last_excerpt text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

create table if not exists system_status (
  component text primary key,
  status text not null check (status in ('online', 'warning', 'offline')),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['users','profiles','projects','tasks','automations','automation_runs','files','memories','integrations','jobs','automation_suggestions']
  loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function cc_touch_updated_at()', t, t);
  end loop;
end $$;
