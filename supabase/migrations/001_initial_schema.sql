-- ============================================================================
-- STUDY OS — 001 initial schema
-- ----------------------------------------------------------------------------
-- Layering:
--   education_systems → programs → subjects → chapters → topics   (catalogue)
--   Every catalogue row has an owner_id. NULL = public template (curated by
--   admins, readable by everyone). Non-NULL = a student's private copy.
--   Students never edit templates: adding a catalogue subject clones it into a
--   private copy (see clone_subject_template in 004).
--
--   Everything else (progress, resources, papers, plans, …) is private and
--   carries user_id for row level security.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type education_level as enum (
  'university', 'ca', 'acca', 'cfa', 'mdcat', 'ecat', 'css',
  'a_level', 'o_level', 'college', 'professional', 'other'
);
create type topic_status as enum ('not_started', 'learning', 'practicing', 'reviewed', 'mastered');
create type processing_status as enum ('uploading', 'processing', 'analyzing', 'ready', 'failed');
create type resource_type as enum ('pdf', 'docx', 'pptx', 'txt', 'image', 'youtube', 'web', 'drive', 'note');
create type question_type as enum ('mcq', 'short', 'long', 'numerical', 'theory', 'case_study');
create type solved_status as enum ('unsolved', 'attempted', 'solved', 'needs_review');
create type plan_activity as enum ('learn', 'practice', 'past_paper', 'revise', 'recall', 'mock', 'break');
create type session_status as enum ('planned', 'in_progress', 'done', 'skipped');
create type task_type as enum ('assignment', 'project', 'quiz', 'exam', 'application', 'registration', 'study', 'other');
create type task_priority as enum ('low', 'medium', 'high');
create type task_status as enum ('todo', 'in_progress', 'done');
create type event_type as enum ('exam', 'assignment', 'quiz', 'class', 'study_session', 'deadline', 'revision');
create type review_rating as enum ('again', 'hard', 'good', 'easy');
create type job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type job_kind as enum ('resource', 'past_paper', 'syllabus');
create type link_source as enum ('ai', 'user');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  education_level education_level,
  country text check (char_length(country) <= 80),
  current_level text check (char_length(current_level) <= 80), -- semester / level / attempt
  daily_study_minutes integer not null default 120 check (daily_study_minutes between 15 and 960),
  study_days smallint[] not null default '{1,2,3,4,5,6}', -- 0 = Sunday … 6 = Saturday
  timezone text not null default 'UTC',
  avatar_path text,
  onboarding_completed boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile row is created for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Students must not be able to promote themselves to admin.
create or replace function public.protect_profile_admin_flag() returns trigger
language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user in ('authenticated', 'anon') then
    raise exception 'is_admin can only be changed by the service role';
  end if;
  return new;
end $$;
create trigger profiles_protect_admin before update on public.profiles
  for each row execute function public.protect_profile_admin_flag();

-- ---------------------------------------------------------------------------
-- Catalogue: education systems → programs → subjects → chapters → topics
-- ---------------------------------------------------------------------------
create table public.education_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),      -- "CA Pakistan (ICAP)"
  country text,                                                          -- "Pakistan"
  category education_level not null default 'other',
  description text,
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  education_system_id uuid references public.education_systems (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),      -- "CAF"
  education_system text,                                                 -- denormalised label for display
  description text,
  levels text[] not null default '{}',                                   -- e.g. {"CAF","CFAP"} or {"Semester 1",…}
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.student_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  level text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete set null,
  owner_id uuid references auth.users (id) on delete cascade,
  template_id uuid references public.subjects (id) on delete set null,   -- template this copy was cloned from
  name text not null check (char_length(name) between 1 and 160),
  code text check (char_length(code) <= 30),
  description text,
  color text not null default 'indigo',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subjects_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

create table public.student_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  exam_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  unique (user_id, subject_id)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,            -- copied from subject by trigger
  name text not null check (char_length(name) between 1 and 200),
  description text,
  weightage numeric(5, 2) check (weightage is null or weightage between 0 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,  -- copied from chapter
  owner_id uuid references auth.users (id) on delete cascade,                  -- copied from chapter
  parent_topic_id uuid references public.topics (id) on delete cascade,        -- subtopics
  name text not null check (char_length(name) between 1 and 200),
  description text,
  learning_objectives text[] not null default '{}',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  weightage numeric(5, 2) check (weightage is null or weightage between 0 and 100),
  estimated_minutes integer not null default 60 check (estimated_minutes between 5 and 1200),
  sort_order integer not null default 0,
  embedding vector(1536),                                                       -- for auto-linking chunks
  created_at timestamptz not null default now()
);

-- Keep owner_id / subject_id consistent with the parent row so RLS on a single
-- column is trustworthy (a student can't attach a chapter to someone else's subject
-- and have it look like theirs).
create or replace function public.inherit_chapter_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select owner_id into new.owner_id from public.subjects where id = new.subject_id;
  return new;
end $$;
create trigger chapters_inherit_owner before insert or update on public.chapters
  for each row execute function public.inherit_chapter_owner();

create or replace function public.inherit_topic_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select subject_id, owner_id into new.subject_id, new.owner_id
  from public.chapters where id = new.chapter_id;
  return new;
end $$;
create trigger topics_inherit_owner before insert or update on public.topics
  for each row execute function public.inherit_topic_owner();

-- ---------------------------------------------------------------------------
-- Progress & spaced repetition per topic
-- ---------------------------------------------------------------------------
create table public.student_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  status topic_status not null default 'not_started',
  confidence smallint check (confidence between 1 and 5),
  last_studied_at timestamptz,
  next_review_at timestamptz,
  review_count integer not null default 0,
  ease_factor numeric(4, 2) not null default 2.5,
  interval_days numeric(7, 2) not null default 0,
  mastery_score numeric(5, 2) not null default 0 check (mastery_score between 0 and 100),
  quiz_correct integer not null default 0,
  quiz_total integer not null default 0,
  minutes_studied integer not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, topic_id)
);
create trigger progress_updated_at before update on public.student_topic_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Resources & knowledge base
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  type resource_type not null,
  storage_path text,
  url text check (url is null or url ~* '^https?://'),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  content text,                                   -- manual notes body
  tags text[] not null default '{}',
  processing_status processing_status not null default 'uploading',
  processing_error text,
  page_count integer,
  summary text,                                   -- cached AI summary (never re-send the whole doc)
  ai_analysis jsonb,                              -- definitions, formulas, examples, detected questions
  suggested_subject_id uuid references public.subjects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or url is not null or content is not null or processing_status = 'uploading')
);
create trigger resources_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

create table public.resource_chunks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  content text not null,
  token_count integer,
  topic_id uuid references public.topics (id) on delete set null,
  embedding vector(1536),
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  unique (resource_id, chunk_index)
);

create table public.topic_resource_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  source link_source not null default 'ai',
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (topic_id, resource_id)
);

-- ---------------------------------------------------------------------------
-- Past papers
-- ---------------------------------------------------------------------------
create table public.past_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  year integer check (year is null or year between 1950 and 2100),
  session text,                                      -- "Spring", "Autumn", "May/June"
  storage_path text,
  mime_type text,
  size_bytes bigint,
  processing_status processing_status not null default 'uploading',
  processing_error text,
  total_marks numeric(7, 2),
  detected_subject text,                             -- what the AI thinks the paper is
  ocr_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger past_papers_updated_at before update on public.past_papers
  for each row execute function public.set_updated_at();

create table public.past_paper_questions (
  id uuid primary key default gen_random_uuid(),
  past_paper_id uuid not null references public.past_papers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_number text not null check (char_length(question_number) <= 30),
  question_text text not null,
  marks numeric(6, 2),
  question_type question_type not null default 'long',
  page_number integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.question_topic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.past_paper_questions (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  confidence numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  source link_source not null default 'ai',
  confirmed boolean not null default false,
  needs_review boolean generated always as (confidence < 0.7 and not confirmed) stored,
  created_at timestamptz not null default now(),
  unique (question_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Question bank (past-paper, AI-generated and manual questions)
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  question_text text not null,
  answer text,
  options jsonb,                                     -- MCQ options ["…","…"]
  question_type question_type not null default 'short',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  marks numeric(6, 2),
  year integer,
  source_type text not null default 'manual' check (source_type in ('past_paper', 'ai', 'manual')),
  source_id uuid references public.past_paper_questions (id) on delete cascade,
  solved_status solved_status not null default 'unsolved',
  bookmarked boolean not null default false,
  marked_difficult boolean not null default false,
  note text,
  attempts integer not null default 0,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id)
);

-- ---------------------------------------------------------------------------
-- Study plans & sessions
-- ---------------------------------------------------------------------------
create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  title text not null,
  request text,
  exam_date date,
  start_date date not null default current_date,
  end_date date,
  daily_minutes integer,
  summary text,
  strategy jsonb not null default '[]',
  skip_if_short jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'archived')),
  generated_at timestamptz not null default now()
);

create table public.study_plan_sessions (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.study_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null,
  activity plan_activity not null default 'learn',
  scheduled_date date not null,
  start_time time,
  duration integer not null check (duration between 5 and 600),   -- minutes
  goals text[] not null default '{}',
  details text,
  priority numeric(6, 3) not null default 0,
  status session_status not null default 'planned',
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  plan_session_id uuid references public.study_plan_sessions (id) on delete set null,
  goals jsonb not null default '[]',                -- [{text, done}]
  status session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration integer,                                 -- minutes actually studied
  confidence_before smallint check (confidence_before between 1 and 5),
  confidence_after smallint check (confidence_after between 1 and 5),
  notes text
);

-- ---------------------------------------------------------------------------
-- Tasks, deadlines, calendar
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  type task_type not null default 'assignment',
  due_at timestamptz,
  priority task_priority not null default 'medium',
  status task_status not null default 'todo',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  type event_type not null default 'class',
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

-- ---------------------------------------------------------------------------
-- Quizzes & flashcards
-- ---------------------------------------------------------------------------
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'exam')),
  score integer not null default 0 check (score >= 0),
  total integer not null check (total > 0),
  duration_seconds integer,
  items jsonb not null default '[]',               -- [{question, options, answer, chosen, correct, topic_id, explanation}]
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (score <= total)
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  source_type text not null default 'manual' check (source_type in ('manual', 'topic', 'resource', 'past_paper', 'conversation')),
  source_id uuid,
  ease_factor numeric(4, 2) not null default 2.5,
  interval_days numeric(7, 2) not null default 0,
  repetitions integer not null default 0,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  flashcard_id uuid references public.flashcards (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete cascade,     -- topic-level revision reviews
  rating review_rating not null,
  reviewed_at timestamptz not null default now(),
  next_review_at timestamptz not null,
  check (flashcard_id is not null or topic_id is not null)
);

-- ---------------------------------------------------------------------------
-- AI tutor
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null default 'New conversation',
  mode text not null default 'explain_simply',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  mode text,
  citations jsonb not null default '[]',           -- [{n, resource_id, title, page_number, chunk_id}]
  grounded boolean,                                -- true when the answer used the student's material
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Syllabus imports (AI drafts awaiting review)
-- ---------------------------------------------------------------------------
create table public.syllabus_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  source_type text not null check (source_type in ('pdf', 'image', 'text')),
  storage_path text,
  source_text text,
  status processing_status not null default 'processing',
  error text,
  result jsonb,                                     -- validated extraction, editable before saving
  saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger syllabus_imports_updated_at before update on public.syllabus_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Operations: background jobs, AI usage, error log (admin-visible metadata)
-- ---------------------------------------------------------------------------
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind job_kind not null,
  target_id uuid not null,
  status job_status not null default 'queued',
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.error_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  source text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
