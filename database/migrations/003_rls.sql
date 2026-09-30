-- 003_rls.sql — Row Level Security
--
-- The app connects as the database owner and, for every user request, runs
--   SET LOCAL ROLE cc_user; SELECT set_config('app.user_id', '<uuid>', true);
-- cc_user is NOT the table owner and has no BYPASSRLS, so these policies apply.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cc_user') then
    create role cc_user nologin;
  end if;
end $$;

grant cc_user to current_user;
grant usage on schema public to cc_user;
grant execute on function cc_uid() to cc_user;

-- user-owned tables: full CRUD on own rows only
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','projects','tasks','task_dependencies','automations','automation_runs',
    'workflow_steps','tool_permissions','approvals','activity_logs','files','documents','memories',
    'integrations','ai_models','ai_usage','notifications','webhooks','command_history',
    'automation_suggestions','web_monitors',
    'brands','products','campaigns','generated_images','content_posts','captions','hashtags',
    'social_accounts','publishing_jobs','analytics'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to cc_user', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to cc_user using (user_id = cc_uid()) with check (user_id = cc_uid())',
      t || '_owner', t);
  end loop;
end $$;

-- users: read/update own row only (sign-up and auth run as the system role)
alter table users enable row level security;
grant select, update (name) on users to cc_user;
drop policy if exists users_self on users;
create policy users_self on users for select to cc_user using (id = cc_uid());
drop policy if exists users_self_update on users;
create policy users_self_update on users for update to cc_user using (id = cc_uid()) with check (id = cc_uid());

-- tools registry & system status: readable by everyone signed in, writable by system only
alter table tools enable row level security;
grant select on tools to cc_user;
drop policy if exists tools_read on tools;
create policy tools_read on tools for select to cc_user using (true);

alter table system_status enable row level security;
grant select on system_status to cc_user;
drop policy if exists system_status_read on system_status;
create policy system_status_read on system_status for select to cc_user using (true);

-- jobs: no access for cc_user at all (RLS enabled, no policy)
alter table jobs enable row level security;
revoke all on jobs from cc_user;
