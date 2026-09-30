-- ============================================================================
-- STUDY OS — 002 row level security
-- ----------------------------------------------------------------------------
-- Rule of thumb:
--   * Private tables: every operation requires user_id = auth.uid().
--   * Catalogue tables: anyone signed in can READ templates (owner_id is null)
--     and their own rows; only the owner can write, and only to their own rows.
--     Templates are written by admins through the service role (bypasses RLS).
--   * Operational tables (jobs, usage, error logs): owner may read their own;
--     writes happen server-side with the service role.
-- Identity always comes from auth.uid() (the verified JWT), never from input.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Explicit grants (don't rely on auto-exposed tables). Anonymous visitors get
-- nothing; signed-in students get table access that RLS then narrows.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke insert, update, delete on public.ai_usage, public.error_logs, public.processing_jobs from authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.education_systems      enable row level security;
alter table public.programs               enable row level security;
alter table public.student_programs       enable row level security;
alter table public.subjects               enable row level security;
alter table public.student_subjects       enable row level security;
alter table public.chapters               enable row level security;
alter table public.topics                 enable row level security;
alter table public.student_topic_progress enable row level security;
alter table public.resources              enable row level security;
alter table public.resource_chunks        enable row level security;
alter table public.topic_resource_links   enable row level security;
alter table public.past_papers            enable row level security;
alter table public.past_paper_questions   enable row level security;
alter table public.question_topic_links   enable row level security;
alter table public.questions              enable row level security;
alter table public.study_plans            enable row level security;
alter table public.study_plan_sessions    enable row level security;
alter table public.study_sessions         enable row level security;
alter table public.tasks                  enable row level security;
alter table public.calendar_events        enable row level security;
alter table public.quiz_attempts          enable row level security;
alter table public.flashcards             enable row level security;
alter table public.flashcard_reviews      enable row level security;
alter table public.ai_conversations       enable row level security;
alter table public.ai_messages            enable row level security;
alter table public.syllabus_imports       enable row level security;
alter table public.processing_jobs        enable row level security;
alter table public.ai_usage               enable row level security;
alter table public.error_logs             enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid() and is_admin = false);
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- No delete policy: deleting the auth user cascades.

-- ---------------------------------------------------------------------------
-- Catalogue tables (templates readable, own rows writable)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['education_systems', 'programs', 'subjects', 'chapters', 'topics'] loop
    execute format(
      'create policy "%1$s: read templates and own" on public.%1$I
         for select to authenticated using (owner_id is null or owner_id = auth.uid())', t);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I
         for insert to authenticated with check (owner_id = auth.uid())', t);
    execute format(
      'create policy "%1$s: update own" on public.%1$I
         for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I
         for delete to authenticated using (owner_id = auth.uid())', t);
  end loop;
end $$;

-- chapters/topics inherit owner_id from their parent via trigger (001), so the
-- insert check above rejects attaching rows to a template or another student's
-- subject: the inherited owner_id would not equal auth.uid().

-- ---------------------------------------------------------------------------
-- Private tables: full CRUD on own rows only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'student_programs', 'student_subjects', 'student_topic_progress',
    'resources', 'resource_chunks', 'topic_resource_links',
    'past_papers', 'past_paper_questions', 'question_topic_links', 'questions',
    'study_plans', 'study_plan_sessions', 'study_sessions',
    'tasks', 'calendar_events',
    'quiz_attempts', 'flashcards', 'flashcard_reviews',
    'ai_conversations', 'ai_messages', 'syllabus_imports'
  ] loop
    execute format(
      'create policy "%1$s: select own" on public.%1$I
         for select to authenticated using (user_id = auth.uid())', t);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I
         for insert to authenticated with check (user_id = auth.uid())', t);
    execute format(
      'create policy "%1$s: update own" on public.%1$I
         for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I
         for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Cross-row integrity: a row's user_id matching auth.uid() is not enough if it
-- points at another student's parent row. These triggers make sure every
-- referenced parent (subject, topic, resource, paper, question, plan,
-- conversation) is visible to — i.e. owned by — the same user.
-- ---------------------------------------------------------------------------
create or replace function public.assert_owns(tbl regclass, row_id uuid, uid uuid, allow_template boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare owner uuid; found boolean;
begin
  if row_id is null then return; end if;
  if tbl in ('public.subjects'::regclass, 'public.topics'::regclass, 'public.chapters'::regclass, 'public.programs'::regclass) then
    execute format('select true, owner_id from %s where id = $1', tbl) into found, owner using row_id;
    if found and (owner = uid or (allow_template and owner is null)) then return; end if;
  else
    execute format('select true, user_id from %s where id = $1', tbl) into found, owner using row_id;
    if found and owner = uid then return; end if;
  end if;
  raise exception 'referenced % row % is not accessible', tbl, row_id using errcode = '42501';
end $$;

-- SECURITY INVOKER on purpose: current_user must be the caller's role so the
-- service-role bypass below is accurate. assert_owns (definer) does the lookup.
create or replace function public.enforce_reference_ownership() returns trigger
language plpgsql security invoker set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  -- Service role / migrations bypass the check.
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if j ? 'subject_id'      then perform public.assert_owns('public.subjects', (j->>'subject_id')::uuid, new.user_id); end if;
  if j ? 'topic_id'        then perform public.assert_owns('public.topics', (j->>'topic_id')::uuid, new.user_id); end if;
  if j ? 'program_id'      then perform public.assert_owns('public.programs', (j->>'program_id')::uuid, new.user_id, true); end if;
  if j ? 'resource_id'     then perform public.assert_owns('public.resources', (j->>'resource_id')::uuid, new.user_id); end if;
  if j ? 'past_paper_id'   then perform public.assert_owns('public.past_papers', (j->>'past_paper_id')::uuid, new.user_id); end if;
  if j ? 'question_id'     then perform public.assert_owns('public.past_paper_questions', (j->>'question_id')::uuid, new.user_id); end if;
  if j ? 'study_plan_id'   then perform public.assert_owns('public.study_plans', (j->>'study_plan_id')::uuid, new.user_id); end if;
  if j ? 'plan_session_id' then perform public.assert_owns('public.study_plan_sessions', (j->>'plan_session_id')::uuid, new.user_id); end if;
  if j ? 'conversation_id' then perform public.assert_owns('public.ai_conversations', (j->>'conversation_id')::uuid, new.user_id); end if;
  if j ? 'flashcard_id'    then perform public.assert_owns('public.flashcards', (j->>'flashcard_id')::uuid, new.user_id); end if;
  if j ? 'source_id' and tg_table_name = 'questions' then
    perform public.assert_owns('public.past_paper_questions', (j->>'source_id')::uuid, new.user_id);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'student_programs', 'student_subjects', 'student_topic_progress',
    'resources', 'resource_chunks', 'topic_resource_links',
    'past_papers', 'past_paper_questions', 'question_topic_links', 'questions',
    'study_plans', 'study_plan_sessions', 'study_sessions',
    'tasks', 'calendar_events', 'quiz_attempts', 'flashcards', 'flashcard_reviews',
    'ai_conversations', 'ai_messages', 'syllabus_imports'
  ] loop
    execute format(
      'create trigger %1$s_ownership before insert or update on public.%1$I
         for each row execute function public.enforce_reference_ownership()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Operational tables: read own, write via service role only
-- ---------------------------------------------------------------------------
create policy "processing_jobs: read own" on public.processing_jobs
  for select to authenticated using (user_id = auth.uid());
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());
-- error_logs: no policies → only the service role can read/write.

-- ---------------------------------------------------------------------------
-- Storage: private buckets, files live under "<user_id>/…"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('student-resources', 'student-resources', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/markdown',
    'image/png', 'image/jpeg', 'image/webp'
  ]),
  ('past-papers', 'past-papers', false, 26214400, array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
  ]),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare b text;
begin
  foreach b in array array['student-resources', 'past-papers', 'avatars'] loop
    execute format(
      'create policy "%1$s: read own folder" on storage.objects for select to authenticated
         using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)', b);
    execute format(
      'create policy "%1$s: upload to own folder" on storage.objects for insert to authenticated
         with check (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)', b);
    execute format(
      'create policy "%1$s: update own folder" on storage.objects for update to authenticated
         using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)', b);
    execute format(
      'create policy "%1$s: delete own folder" on storage.objects for delete to authenticated
         using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)', b);
  end loop;
end $$;
