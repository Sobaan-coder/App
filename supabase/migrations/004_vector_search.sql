-- ============================================================================
-- STUDY OS — 004 search, retrieval and transactional RPCs
-- All functions are SECURITY INVOKER: they run with the caller's privileges,
-- so row level security still decides what each student can see or write.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Hybrid retrieval over a student's knowledge base.
-- Combines vector similarity (when an embedding is supplied) with Postgres
-- full-text search using reciprocal-rank fusion. Works with FTS alone when no
-- embedding provider is configured.
-- ---------------------------------------------------------------------------
create or replace function public.match_resource_chunks(
  query_text text,
  query_embedding vector(1536) default null,
  match_count integer default 8,
  filter_subject_id uuid default null,
  filter_topic_id uuid default null
)
returns table (
  chunk_id uuid,
  resource_id uuid,
  resource_title text,
  resource_type resource_type,
  page_number integer,
  content text,
  topic_id uuid,
  similarity double precision,
  score double precision
)
language sql stable security invoker set search_path = public, extensions as $$
  with candidates as (
    select c.id, c.resource_id, c.page_number, c.content, c.topic_id, c.embedding, c.fts
    from resource_chunks c
    join resources r on r.id = c.resource_id
    where c.user_id = auth.uid()
      and r.processing_status = 'ready'
      and (filter_subject_id is null or r.subject_id = filter_subject_id)
      and (filter_topic_id is null or c.topic_id = filter_topic_id
           or exists (select 1 from topic_resource_links l where l.resource_id = r.id and l.topic_id = filter_topic_id))
  ),
  vec as (
    select id, 1 - (embedding <=> query_embedding) as sim,
           row_number() over (order by embedding <=> query_embedding) as rnk
    from candidates
    where query_embedding is not null and embedding is not null
    order by embedding <=> query_embedding
    limit greatest(match_count * 4, 20)
  ),
  txt as (
    select id, row_number() over (order by ts_rank_cd(fts, q) desc) as rnk
    from candidates, websearch_to_tsquery('english', coalesce(query_text, '')) q
    where fts @@ q
    order by ts_rank_cd(fts, q) desc
    limit greatest(match_count * 4, 20)
  ),
  fused as (
    select coalesce(v.id, t.id) as id,
           v.sim,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + t.rnk), 0) as score
    from vec v full outer join txt t on t.id = v.id
  )
  select c.id, c.resource_id, r.title, r.type, c.page_number, c.content, c.topic_id,
         f.sim, f.score
  from fused f
  join candidates c on c.id = f.id
  join resources r on r.id = c.resource_id
  -- Drop vector-only hits that are clearly unrelated.
  where f.sim is null or f.sim > 0.2 or f.score > 1.0 / 61
  order by f.score desc
  limit match_count;
$$;

-- Nearest syllabus topic for a chunk embedding (used to auto-link content).
create or replace function public.match_topics(
  query_embedding vector(1536),
  filter_subject_id uuid default null,
  match_count integer default 3,
  min_similarity double precision default 0.35
)
returns table (topic_id uuid, subject_id uuid, name text, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select t.id, t.subject_id, t.name, 1 - (t.embedding <=> query_embedding)
  from topics t
  where t.owner_id = auth.uid()
    and t.embedding is not null
    and (filter_subject_id is null or t.subject_id = filter_subject_id)
    and 1 - (t.embedding <=> query_embedding) >= min_similarity
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Past-paper statistics per topic for one subject (frequency, marks, years).
-- ---------------------------------------------------------------------------
create or replace function public.subject_topic_stats(p_subject_id uuid)
returns table (
  topic_id uuid,
  topic_name text,
  chapter_id uuid,
  chapter_name text,
  question_count bigint,
  paper_count bigint,
  total_marks numeric,
  years integer[],
  last_year integer
)
language sql stable security invoker set search_path = public as $$
  with links as (
    -- Credit a question's marks to its highest-confidence topic only,
    -- so marks are not double-counted across topics.
    select l.topic_id, q.id as question_id, p.id as paper_id, p.year,
           case when row_number() over (partition by q.id order by l.confidence desc) = 1
                then q.marks else 0 end as marks
    from question_topic_links l
    join past_paper_questions q on q.id = l.question_id
    join past_papers p on p.id = q.past_paper_id
    where p.subject_id = p_subject_id and p.user_id = auth.uid()
  )
  select t.id, t.name, c.id, c.name,
         count(distinct l.question_id),
         count(distinct l.paper_id),
         coalesce(sum(l.marks), 0),
         coalesce(array_agg(distinct l.year order by l.year) filter (where l.year is not null), '{}'),
         max(l.year)
  from topics t
  join chapters c on c.id = t.chapter_id
  left join links l on l.topic_id = t.id
  where t.subject_id = p_subject_id
  group by t.id, t.name, c.id, c.name, c.sort_order, t.sort_order
  order by c.sort_order, t.sort_order;
$$;

-- ---------------------------------------------------------------------------
-- Clone a public catalogue subject (template) into the caller's workspace.
-- ---------------------------------------------------------------------------
create or replace function public.clone_subject_template(p_template_id uuid, p_exam_date date default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_subject uuid;
  v_chapter uuid;
  ch record;
  tp record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Already added? return the existing copy.
  select id into v_subject from subjects where template_id = p_template_id and owner_id = v_uid limit 1;
  if v_subject is not null then return v_subject; end if;

  insert into subjects (program_id, owner_id, template_id, name, code, description, color, sort_order)
  select program_id, v_uid, id, name, code, description, color, sort_order
  from subjects where id = p_template_id and owner_id is null
  returning id into v_subject;

  if v_subject is null then raise exception 'template subject not found'; end if;

  for ch in select * from chapters where subject_id = p_template_id order by sort_order loop
    insert into chapters (subject_id, name, description, weightage, sort_order)
    values (v_subject, ch.name, ch.description, ch.weightage, ch.sort_order)
    returning id into v_chapter;

    for tp in select * from topics where chapter_id = ch.id and parent_topic_id is null order by sort_order loop
      insert into topics (chapter_id, name, description, learning_objectives, difficulty, weightage, estimated_minutes, sort_order)
      values (v_chapter, tp.name, tp.description, tp.learning_objectives, tp.difficulty, tp.weightage, tp.estimated_minutes, tp.sort_order);
    end loop;
  end loop;

  insert into student_subjects (user_id, subject_id, exam_date) values (v_uid, v_subject, p_exam_date);
  return v_subject;
end $$;

-- ---------------------------------------------------------------------------
-- Save a reviewed syllabus (JSON produced by the AI and edited by the student)
-- in one transaction.
-- payload: {"subjects":[{"name","code","description","exam_date","existing_subject_id",
--            "chapters":[{"name","description","weightage",
--              "topics":[{"name","description","difficulty","weightage","learning_objectives":[],
--                         "subtopics":[{"name"}]}]}]}]}
-- ---------------------------------------------------------------------------
create or replace function public.save_syllabus(p_payload jsonb, p_program_id uuid default null)
returns uuid[]
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[] := '{}';
  v_subject uuid;
  v_chapter uuid;
  v_topic uuid;
  s jsonb; c jsonb; t jsonb; st jsonb;
  ci integer; ti integer; si integer;
  v_base_order integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_payload -> 'subjects') <> 'array' then raise exception 'payload.subjects must be an array'; end if;

  for s in select * from jsonb_array_elements(p_payload -> 'subjects') loop
    v_subject := nullif(s ->> 'existing_subject_id', '')::uuid;

    if v_subject is null then
      insert into subjects (program_id, owner_id, name, code, description, sort_order)
      values (p_program_id, v_uid, left(s ->> 'name', 160), nullif(left(s ->> 'code', 30), ''), s ->> 'description',
              coalesce((select max(sort_order) + 1 from subjects where owner_id = v_uid), 0))
      returning id into v_subject;
      insert into student_subjects (user_id, subject_id, exam_date)
      values (v_uid, v_subject, nullif(s ->> 'exam_date', '')::date);
    else
      -- Appending chapters to an existing subject: must be the caller's own.
      if not exists (select 1 from subjects where id = v_subject and owner_id = v_uid) then
        raise exception 'subject not found';
      end if;
    end if;

    select coalesce(max(sort_order) + 1, 0) into v_base_order from chapters where subject_id = v_subject;
    ci := 0;
    for c in select * from jsonb_array_elements(coalesce(s -> 'chapters', '[]')) loop
      insert into chapters (subject_id, name, description, weightage, sort_order)
      values (v_subject, left(c ->> 'name', 200), c ->> 'description',
              nullif(c ->> 'weightage', '')::numeric, v_base_order + ci)
      returning id into v_chapter;
      ci := ci + 1;

      ti := 0;
      for t in select * from jsonb_array_elements(coalesce(c -> 'topics', '[]')) loop
        insert into topics (chapter_id, name, description, difficulty, weightage, learning_objectives, sort_order)
        values (v_chapter, left(t ->> 'name', 200), t ->> 'description',
                least(greatest(coalesce((t ->> 'difficulty')::smallint, 3), 1), 5),
                nullif(t ->> 'weightage', '')::numeric,
                coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'learning_objectives', '[]'))), '{}'),
                ti)
        returning id into v_topic;
        ti := ti + 1;

        si := 0;
        for st in select * from jsonb_array_elements(coalesce(t -> 'subtopics', '[]')) loop
          insert into topics (chapter_id, parent_topic_id, name, description, sort_order)
          values (v_chapter, v_topic, left(st ->> 'name', 200), st ->> 'description', si);
          si := si + 1;
        end loop;
      end loop;
    end loop;

    v_ids := v_ids || v_subject;
  end loop;

  return v_ids;
end $$;

-- ---------------------------------------------------------------------------
-- Global search across the student's workspace (one round trip).
-- ---------------------------------------------------------------------------
create or replace function public.search_workspace(p_query text, p_limit integer default 6)
returns table (kind text, id uuid, title text, snippet text, subject_id uuid, parent_id uuid, rank real)
language sql stable security invoker set search_path = public as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq, '%' || p_query || '%' as pat)
  (select 'subject', s.id, s.name, s.code, s.id, null::uuid, 1.0::real
     from subjects s, q where s.owner_id = auth.uid() and (s.name ilike q.pat or s.code ilike q.pat) limit p_limit)
  union all
  (select 'topic', t.id, t.name, c.name, t.subject_id, t.chapter_id,
          ts_rank(to_tsvector('english', t.name), q.tsq)
     from topics t join chapters c on c.id = t.chapter_id, q
     where t.owner_id = auth.uid() and (to_tsvector('english', t.name) @@ q.tsq or t.name ilike q.pat or c.name ilike q.pat)
     limit p_limit)
  union all
  (select 'resource', r.id, r.title, left(coalesce(r.summary, ''), 160), r.subject_id, null, 0.9::real
     from resources r, q where r.user_id = auth.uid() and (r.title ilike q.pat or exists (select 1 from unnest(r.tags) tag where tag ilike q.pat))
     limit p_limit)
  union all
  (select 'chunk', ch.id, r.title || coalesce(' — p.' || ch.page_number, ''),
          ts_headline('english', ch.content, q.tsq, 'MaxWords=24,MinWords=8'), r.subject_id, r.id,
          ts_rank(ch.fts, q.tsq)
     from resource_chunks ch join resources r on r.id = ch.resource_id, q
     where ch.user_id = auth.uid() and ch.fts @@ q.tsq
     order by ts_rank(ch.fts, q.tsq) desc limit p_limit)
  union all
  (select 'past_paper_question', pq.id,
          p.title || ' — Q' || pq.question_number,
          left(pq.question_text, 180), p.subject_id, p.id,
          ts_rank(to_tsvector('english', pq.question_text), q.tsq)
     from past_paper_questions pq join past_papers p on p.id = pq.past_paper_id, q
     where pq.user_id = auth.uid() and (to_tsvector('english', pq.question_text) @@ q.tsq or p.title ilike q.pat)
     limit p_limit)
  union all
  (select 'question', qu.id, left(qu.question_text, 120), qu.note, qu.subject_id, qu.topic_id, 0.5::real
     from questions qu, q where qu.user_id = auth.uid() and qu.source_type <> 'past_paper'
       and to_tsvector('english', qu.question_text) @@ q.tsq limit p_limit)
  union all
  (select 'task', tk.id, tk.title, tk.description, tk.subject_id, null, 0.8::real
     from tasks tk, q where tk.user_id = auth.uid() and (tk.title ilike q.pat or tk.description ilike q.pat) limit p_limit)
  union all
  (select 'flashcard', f.id, left(f.front, 120), left(f.back, 160), f.subject_id, f.topic_id, 0.7::real
     from flashcards f, q where f.user_id = auth.uid() and (f.front ilike q.pat or f.back ilike q.pat) limit p_limit)
  union all
  (select 'study_session', ss.id, coalesce(t.name, 'Study session'), to_char(ss.started_at, 'DD Mon YYYY'), t.subject_id, ss.topic_id, 0.4::real
     from study_sessions ss left join topics t on t.id = ss.topic_id, q
     where ss.user_id = auth.uid() and t.name ilike q.pat limit p_limit)
  union all
  (select 'conversation', m.conversation_id, c.title, left(m.content, 160), c.subject_id, m.id,
          ts_rank(to_tsvector('english', m.content), q.tsq)
     from ai_messages m join ai_conversations c on c.id = m.conversation_id, q
     where m.user_id = auth.uid() and to_tsvector('english', m.content) @@ q.tsq
     limit p_limit)
$$;

grant execute on function public.match_resource_chunks, public.match_topics, public.subject_topic_stats,
  public.clone_subject_template, public.save_syllabus, public.search_workspace to authenticated;
revoke execute on function public.match_resource_chunks, public.match_topics, public.subject_topic_stats,
  public.clone_subject_template, public.save_syllabus, public.search_workspace from public, anon;
