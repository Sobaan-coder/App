-- ============================================================================
-- STUDY OS — 005 catalogue seed + demo workspace
-- ----------------------------------------------------------------------------
-- 1. Public catalogue templates (owner_id = NULL): education systems, programs
--    and template subjects students can add in one click. Adding a new
--    education system = inserting rows here (or via the admin panel).
-- 2. create_demo_workspace(): fills the CALLER's own account with a realistic
--    CA Pakistan / CAF / FAR workspace. It runs with the caller's privileges,
--    so it can only ever write into their own rows.
--
-- The demo past papers are illustrative practice papers written for this demo;
-- they are clearly labelled and are not reproductions of real ICAP papers.
-- ============================================================================

-- Fixed IDs so the catalogue can be referenced by tests and the app.
insert into public.education_systems (id, name, country, category, description) values
  ('00000000-0000-4000-a000-000000000001', 'CA Pakistan (ICAP)', 'Pakistan', 'ca', 'Institute of Chartered Accountants of Pakistan'),
  ('00000000-0000-4000-a000-000000000002', 'ACCA', 'International', 'acca', 'Association of Chartered Certified Accountants'),
  ('00000000-0000-4000-a000-000000000003', 'CFA Institute', 'International', 'cfa', 'Chartered Financial Analyst program'),
  ('00000000-0000-4000-a000-000000000004', 'MDCAT (PMDC)', 'Pakistan', 'mdcat', 'Medical & Dental College Admission Test'),
  ('00000000-0000-4000-a000-000000000005', 'ECAT (UET)', 'Pakistan', 'ecat', 'Engineering College Admission Test'),
  ('00000000-0000-4000-a000-000000000006', 'CSS (FPSC)', 'Pakistan', 'css', 'Central Superior Services competitive exam'),
  ('00000000-0000-4000-a000-000000000007', 'Cambridge International A Level', 'International', 'a_level', null),
  ('00000000-0000-4000-a000-000000000008', 'Cambridge O Level', 'International', 'o_level', null),
  ('00000000-0000-4000-a000-000000000009', 'University', 'Any', 'university', 'Degree programmes — add your own courses')
on conflict (id) do nothing;

insert into public.programs (id, education_system_id, name, education_system, description, levels) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'CAF', 'CA Pakistan (ICAP)', 'Certificate in Accounting and Finance', '{"CAF"}'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'CFAP', 'CA Pakistan (ICAP)', 'Certified Finance and Accounting Professional', '{"CFAP"}'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002', 'ACCA Applied Skills', 'ACCA', null, '{"Applied Knowledge","Applied Skills","Strategic Professional"}'),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000003', 'CFA Level I', 'CFA Institute', null, '{"Level I","Level II","Level III"}'),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000004', 'MDCAT', 'MDCAT (PMDC)', null, '{"MDCAT"}'),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000005', 'ECAT', 'ECAT (UET)', null, '{"ECAT"}'),
  ('00000000-0000-4000-b000-000000000007', '00000000-0000-4000-a000-000000000006', 'CSS Written', 'CSS (FPSC)', null, '{"Compulsory","Optional"}'),
  ('00000000-0000-4000-b000-000000000008', '00000000-0000-4000-a000-000000000007', 'A Level', 'Cambridge International A Level', null, '{"AS","A2"}'),
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000008', 'O Level', 'Cambridge O Level', null, '{"O Level"}'),
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-4000-a000-000000000009', 'Bachelor''s degree', 'University', null, '{"Semester 1","Semester 2","Semester 3","Semester 4","Semester 5","Semester 6","Semester 7","Semester 8"}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Template subjects. Small helper to keep the seed readable.
-- ---------------------------------------------------------------------------
create or replace function public._seed_template(
  p_id uuid, p_program uuid, p_name text, p_code text, p_color text, p_chapters jsonb
) returns void language plpgsql as $$
declare c jsonb; t jsonb; v_ch uuid; ci int := 0; ti int;
begin
  if exists (select 1 from public.subjects where id = p_id) then return; end if;
  insert into public.subjects (id, program_id, owner_id, name, code, color)
  values (p_id, p_program, null, p_name, p_code, p_color);
  for c in select * from jsonb_array_elements(p_chapters) loop
    insert into public.chapters (subject_id, name, weightage, sort_order)
    values (p_id, c ->> 'name', nullif(c ->> 'weightage', '')::numeric, ci) returning id into v_ch;
    ci := ci + 1; ti := 0;
    for t in select * from jsonb_array_elements(c -> 'topics') loop
      insert into public.topics (chapter_id, name, difficulty, estimated_minutes, sort_order)
      values (v_ch, t ->> 0, coalesce((t ->> 1)::smallint, 3), coalesce((t ->> 2)::int, 60), ti);
      ti := ti + 1;
    end loop;
  end loop;
end $$;

-- FAR — the flagship demo subject. Topics: [name, difficulty 1-5, est. minutes]
select public._seed_template(
  '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
  'Financial Accounting & Reporting', 'FAR', 'indigo',
  '[
    {"name": "IAS 16 — Property, Plant and Equipment", "weightage": 30, "topics": [
      ["Recognition", 2, 40], ["Initial Measurement", 2, 50], ["Subsequent Costs", 2, 30],
      ["Depreciation", 3, 70], ["Revaluation", 4, 90], ["Derecognition", 3, 45], ["Disclosure", 2, 30]]},
    {"name": "IAS 36 — Impairment of Assets", "weightage": 25, "topics": [
      ["Impairment Indicators", 2, 40], ["Recoverable Amount", 4, 80], ["Cash-Generating Units (CGU)", 5, 90],
      ["Goodwill Impairment", 5, 80], ["Reversal of Impairment", 4, 60]]},
    {"name": "IAS 38 — Intangible Assets", "weightage": 25, "topics": [
      ["Recognition Criteria", 2, 40], ["Research vs Development", 3, 60], ["Internally Generated Intangibles", 3, 45],
      ["Measurement after Recognition", 3, 50], ["Amortisation and Useful Life", 3, 45]]},
    {"name": "IAS 40 — Investment Property", "weightage": 20, "topics": [
      ["Definition and Classification", 2, 40], ["Fair Value vs Cost Model", 3, 60],
      ["Transfers", 4, 60], ["Disposals", 2, 30]]}
  ]'::jsonb);

select public._seed_template(
  '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000003',
  'Financial Reporting', 'FR', 'violet',
  '[
    {"name": "Conceptual Framework", "topics": [["Qualitative characteristics", 2], ["Elements of financial statements", 2]]},
    {"name": "Group Accounts", "topics": [["Consolidated SOFP", 4, 90], ["Consolidated P&L", 4, 90], ["Associates", 3]]},
    {"name": "IFRS 15 Revenue", "topics": [["Five-step model", 3], ["Contract costs", 3]]},
    {"name": "IFRS 16 Leases", "topics": [["Lessee accounting", 4], ["Sale and leaseback", 5]]}
  ]'::jsonb);

select public._seed_template(
  '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000005',
  'Biology', 'BIO', 'emerald',
  '[
    {"name": "Cell Structure and Function", "topics": [["Cell organelles", 2], ["Cell membrane transport", 3]]},
    {"name": "Biological Molecules", "topics": [["Carbohydrates", 2], ["Proteins", 3], ["Enzymes", 3]]},
    {"name": "Genetics", "topics": [["Mendelian inheritance", 3], ["DNA replication", 4]]}
  ]'::jsonb);

select public._seed_template(
  '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000005',
  'Chemistry', 'CHEM', 'amber',
  '[
    {"name": "Atomic Structure", "topics": [["Quantum numbers", 3], ["Electronic configuration", 2]]},
    {"name": "Chemical Equilibrium", "topics": [["Le Chatelier''s principle", 3], ["Kc and Kp", 4]]},
    {"name": "Organic Chemistry", "topics": [["Hydrocarbons", 3], ["Functional groups", 3]]}
  ]'::jsonb);

select public._seed_template(
  '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000007',
  'English Essay', 'ESSAY', 'rose',
  '[
    {"name": "Essay Structure", "topics": [["Thesis statements", 2], ["Outlining", 2], ["Argument development", 3]]},
    {"name": "Writing Quality", "topics": [["Coherence and cohesion", 3], ["Vocabulary and style", 3]]}
  ]'::jsonb);

select public._seed_template(
  '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000008',
  'Economics', '9708', 'sky',
  '[
    {"name": "Basic Economic Ideas", "topics": [["Scarcity and opportunity cost", 1], ["Economic systems", 2]]},
    {"name": "The Price System", "topics": [["Demand and supply", 2], ["Elasticities", 3]]},
    {"name": "Government Microeconomic Intervention", "topics": [["Market failure", 3], ["Taxes and subsidies", 3]]}
  ]'::jsonb);

drop function public._seed_template(uuid, uuid, text, text, text, jsonb);

-- ============================================================================
-- Demo workspace
-- ============================================================================
create or replace function public.create_demo_workspace()
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_subject uuid;
  v_notes uuid;
  v_notes2 uuid;
  v_plan uuid;
  v_paper uuid;
  v_q uuid;
  v_topic uuid;
  r record;
  i int;
  d date := current_date;
  qrow record;
  j int;
  -- topic name → id for this student's copy
  tid jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if exists (select 1 from subjects where owner_id = v_uid and template_id = '00000000-0000-4000-c000-000000000001') then
    select id into v_subject from subjects where owner_id = v_uid and template_id = '00000000-0000-4000-c000-000000000001';
    return v_subject;
  end if;

  update profiles set
    full_name = coalesce(full_name, 'Demo Student'),
    education_level = coalesce(education_level, 'ca'),
    country = coalesce(country, 'Pakistan'),
    current_level = coalesce(current_level, 'CAF'),
    daily_study_minutes = 180,
    onboarding_completed = true
  where id = v_uid;

  insert into student_programs (user_id, program_id, level)
  values (v_uid, '00000000-0000-4000-b000-000000000001', 'CAF')
  on conflict (user_id, program_id) do nothing;

  v_subject := clone_subject_template('00000000-0000-4000-c000-000000000001', d + 3);

  select jsonb_object_agg(name, id) into tid from topics where subject_id = v_subject;

  -- ---------------- Progress (a realistic mix: strong, weak, untouched) ----------------
  for r in select * from (values
      ('Recognition', 'mastered', 5, 12, 6),
      ('Initial Measurement', 'reviewed', 4, 9, 3),
      ('Subsequent Costs', 'reviewed', 4, 8, 4),
      ('Depreciation', 'practicing', 2, 4, -1),
      ('Revaluation', 'learning', 2, 3, -1),
      ('Derecognition', 'practicing', 3, 5, 1),
      ('Impairment Indicators', 'reviewed', 4, 6, 2),
      ('Recoverable Amount', 'learning', 2, 2, 0),
      ('Cash-Generating Units (CGU)', 'learning', 1, 2, -2),
      ('Recognition Criteria', 'mastered', 5, 10, 5),
      ('Research vs Development', 'practicing', 3, 4, 0),
      ('Internally Generated Intangibles', 'reviewed', 4, 7, 3),
      ('Measurement after Recognition', 'learning', 3, 3, 1),
      ('Definition and Classification', 'practicing', 3, 3, 2),
      ('Fair Value vs Cost Model', 'learning', 2, 2, 0)
    ) as t(name, status, conf, days_ago, next_in)
  loop
    insert into student_topic_progress (user_id, topic_id, status, confidence, last_studied_at, next_review_at,
                                        review_count, interval_days, mastery_score, minutes_studied)
    values (v_uid, (tid ->> r.name)::uuid, r.status::topic_status, r.conf,
            now() - make_interval(days => r.days_ago), now() + make_interval(days => r.next_in),
            greatest(r.conf - 1, 0), greatest(r.next_in, 1), r.conf * 18 + 5, 30 + r.conf * 25);
  end loop;

  -- ---------------- Resources: notes with page-level chunks (searchable by the tutor) ----------------
  insert into resources (user_id, subject_id, title, type, content, tags, processing_status, page_count, summary)
  values (v_uid, v_subject, 'FAR Notes — IAS 16 & IAS 36', 'note', 'Demo study notes (see chunks).', '{FAR,IAS 16,IAS 36,notes}', 'ready', 4,
          'Condensed notes on IAS 16 (recognition, measurement, depreciation, revaluation, derecognition) and IAS 36 (indicators, recoverable amount, CGUs, reversals).')
  returning id into v_notes;

  insert into resource_chunks (resource_id, user_id, chunk_index, page_number, content, topic_id) values
  (v_notes, v_uid, 0, 1,
   'IAS 16 Recognition and initial measurement. An item of property, plant and equipment is recognised when it is probable that future economic benefits will flow to the entity and its cost can be measured reliably. Initial cost includes the purchase price (after trade discounts and rebates), import duties and non-refundable purchase taxes, directly attributable costs of bringing the asset to the location and condition necessary for it to operate as intended (site preparation, delivery, installation, professional fees, testing), and the initial estimate of dismantling and site-restoration costs where there is an obligation. Administration and general overheads, start-up costs and initial operating losses are expensed.',
   (tid ->> 'Initial Measurement')::uuid),
  (v_notes, v_uid, 1, 2,
   'IAS 16 Depreciation. Depreciation is the systematic allocation of the depreciable amount (cost or revalued amount less residual value) over the useful life. Depreciation begins when the asset is available for use, i.e. when it is in the location and condition necessary for it to be capable of operating as intended by management — not when it is first actually used. It stops at the earlier of classification as held for sale (IFRS 5) and derecognition. Each significant part with a different useful life is depreciated separately (component accounting). Residual value, useful life and depreciation method are reviewed at least at each financial year-end; changes are a change in accounting estimate under IAS 8 and are applied prospectively.',
   (tid ->> 'Depreciation')::uuid),
  (v_notes, v_uid, 2, 3,
   'IAS 16 Revaluation model. If the revaluation model is chosen it must be applied to the entire class of assets, and revaluations must be kept sufficiently regular that the carrying amount does not differ materially from fair value. A revaluation increase goes to other comprehensive income and accumulates in the revaluation surplus, except to the extent it reverses a previous decrease recognised in profit or loss. A decrease is recognised in profit or loss unless it reverses a previous surplus on the same asset. After revaluation, depreciation is based on the revalued amount over the remaining useful life. An entity may transfer the excess depreciation (depreciation on revalued amount minus depreciation on historical cost) from revaluation surplus to retained earnings each year; this transfer does not go through profit or loss.',
   (tid ->> 'Revaluation')::uuid),
  (v_notes, v_uid, 3, 3,
   'IAS 16 Derecognition. The carrying amount of an item of PPE is derecognised on disposal or when no future economic benefits are expected from its use or disposal. The gain or loss is the difference between net disposal proceeds and carrying amount, recognised in profit or loss (gains are not classified as revenue). Any revaluation surplus relating to the asset may be transferred directly to retained earnings; it is not recycled to profit or loss.',
   (tid ->> 'Derecognition')::uuid),
  (v_notes, v_uid, 4, 4,
   'IAS 36 Impairment. At each reporting date assess whether there is any indication of impairment (external: market value decline, adverse changes, interest rate increases, market capitalisation below net assets; internal: obsolescence, physical damage, restructuring, worse economic performance). Goodwill and intangibles with indefinite lives or not yet available for use are tested annually regardless. Recoverable amount is the higher of fair value less costs of disposal and value in use (present value of future cash flows from continuing use and ultimate disposal, pre-tax discount rate). An impairment loss is the excess of carrying amount over recoverable amount.',
   (tid ->> 'Recoverable Amount')::uuid),
  (v_notes, v_uid, 5, 4,
   'IAS 36 Cash-generating units. If recoverable amount cannot be estimated for an individual asset, determine it for the cash-generating unit — the smallest identifiable group of assets generating cash inflows largely independent of other assets. An impairment loss on a CGU is allocated first to goodwill allocated to the unit, then pro rata to the other assets on the basis of carrying amount, but no asset is reduced below the highest of its fair value less costs of disposal, value in use and zero. Impairment losses on goodwill are never reversed; other reversals are limited to the carrying amount that would have existed had no impairment been recognised.',
   (tid ->> 'Cash-Generating Units (CGU)')::uuid);

  insert into resources (user_id, subject_id, title, type, content, tags, processing_status, page_count, summary)
  values (v_uid, v_subject, 'FAR Notes — IAS 38 & IAS 40', 'note', 'Demo study notes (see chunks).', '{FAR,IAS 38,IAS 40,notes}', 'ready', 2,
          'Notes on IAS 38 research vs development, internally generated intangibles and IAS 40 measurement models and transfers.')
  returning id into v_notes2;

  insert into resource_chunks (resource_id, user_id, chunk_index, page_number, content, topic_id) values
  (v_notes2, v_uid, 0, 1,
   'IAS 38 Research vs development. Expenditure in the research phase is always expensed. Development expenditure is capitalised only when the entity can demonstrate all of: technical feasibility of completing the asset; intention to complete and use or sell it; ability to use or sell it; how it will generate probable future economic benefits (e.g. a market exists); availability of adequate technical, financial and other resources to complete it; and ability to measure the expenditure reliably. If the research and development phases cannot be distinguished, treat all expenditure as research. Expenditure previously expensed cannot be reinstated as an asset later.',
   (tid ->> 'Research vs Development')::uuid),
  (v_notes2, v_uid, 1, 1,
   'IAS 38 Internally generated intangibles. Internally generated goodwill, brands, mastheads, publishing titles, customer lists and similar items are never recognised as assets because their cost cannot be distinguished from developing the business as a whole. Purchased brands can be recognised at cost. After recognition, choose the cost model or the revaluation model; the revaluation model is only allowed if there is an active market for the intangible.',
   (tid ->> 'Internally Generated Intangibles')::uuid),
  (v_notes2, v_uid, 2, 2,
   'IAS 40 Investment property is property (land or buildings) held to earn rentals or for capital appreciation, not owner-occupied and not held for sale in the ordinary course of business. After initial recognition at cost an entity chooses the fair value model (gains and losses in profit or loss, no depreciation) or the cost model (as IAS 16, with fair value disclosed) and applies it to all investment property. Transfers occur only on a change in use: owner-occupied to investment property at fair value — difference treated as an IAS 16 revaluation; inventory to investment property — difference in profit or loss; investment property carried at fair value to owner-occupied — fair value becomes deemed cost.',
   (tid ->> 'Transfers')::uuid);

  insert into topic_resource_links (user_id, topic_id, resource_id, confidence, source, confirmed)
  select v_uid, (tid ->> n)::uuid, v_notes, 0.95, 'ai', true
  from unnest(array['Initial Measurement','Depreciation','Revaluation','Derecognition','Recoverable Amount','Cash-Generating Units (CGU)','Impairment Indicators']) n;
  insert into topic_resource_links (user_id, topic_id, resource_id, confidence, source, confirmed)
  select v_uid, (tid ->> n)::uuid, v_notes2, 0.93, 'ai', true
  from unnest(array['Research vs Development','Internally Generated Intangibles','Measurement after Recognition','Transfers','Fair Value vs Cost Model']) n;

  insert into resources (user_id, subject_id, title, type, url, tags, processing_status, summary) values
  (v_uid, v_subject, 'IAS 16 revaluation — lecture search', 'youtube',
   'https://www.youtube.com/results?search_query=IAS+16+revaluation+model+lecture', '{IAS 16,lecture}', 'ready',
   'Saved YouTube search for IAS 16 revaluation lectures.'),
  (v_uid, v_subject, 'IFRS Foundation — IAS 36 overview', 'web',
   'https://www.ifrs.org/issued-standards/list-of-standards/ias-36-impairment-of-assets/', '{IAS 36,standard}', 'ready',
   'Official IFRS Foundation page for IAS 36.');

  -- ---------------- Demo past papers with mapped questions ----------------
  -- A pool of illustrative questions; each demo year uses a subset so the
  -- analytics show realistic frequency patterns (e.g. Revaluation: 4 of 5 papers).
  create temporary table if not exists _demo_q_pool (
    key text, num text, txt text, marks numeric, qtype question_type, topics text[], conf numeric[]
  ) on commit drop;
  truncate _demo_q_pool;
  insert into _demo_q_pool values
    ('q1', '1', 'Explain which costs may be capitalised as part of the initial cost of a new production line, including an obligation to dismantle it at the end of its life, and prepare the journal entries.', 15, 'long',
       array['Initial Measurement','Recognition'], array[0.95, 0.82]),
    ('q2', '2', 'Under the revaluation model, calculate the revaluation surplus, the depreciation charge for the year after revaluation of a building, and the annual transfer of excess depreciation to retained earnings.', 20, 'numerical',
       array['Revaluation','Depreciation'], array[0.96, 0.88]),
    ('q3', '3', 'A cash-generating unit that includes goodwill has suffered an impairment. Calculate the impairment loss and allocate it to the assets of the unit.', 20, 'numerical',
       array['Cash-Generating Units (CGU)','Goodwill Impairment'], array[0.93, 0.90]),
    ('q4', '4', 'Discuss whether development expenditure on a new software product meets the capitalisation criteria in IAS 38.', 15, 'theory',
       array['Research vs Development'], array[0.97]),
    ('q5', '5', 'A building changes from owner-occupied to held for rental. Explain the accounting for the transfer and its subsequent measurement under the fair value model.', 15, 'long',
       array['Transfers','Fair Value vs Cost Model'], array[0.91, 0.66]),
    ('q6', '6', 'Determine the recoverable amount of a specialised machine given its fair value less costs of disposal and projected cash flows, and calculate any impairment loss.', 15, 'numerical',
       array['Recoverable Amount','Impairment Indicators'], array[0.94, 0.72]),
    ('q7', '7(a)', 'Calculate the gain or loss on disposal of a revalued asset and explain the treatment of its remaining revaluation surplus.', 10, 'short',
       array['Derecognition','Revaluation'], array[0.92, 0.78]),
    ('q8', '7(b)', 'State whether an internally generated brand can be recognised as an intangible asset and justify your answer.', 10, 'short',
       array['Internally Generated Intangibles'], array[0.95]),
    ('q9', '8', 'Explain when a previously recognised impairment loss may be reversed and calculate the maximum reversal for a non-goodwill asset.', 15, 'numerical',
       array['Reversal of Impairment'], array[0.62]),
    ('q10', '9', 'Calculate amortisation for a licence with a finite useful life and explain the effect of a change in its estimated useful life.', 15, 'numerical',
       array['Amortisation and Useful Life','Measurement after Recognition'], array[0.89, 0.68]);

  for r in select * from (values
    (2021, 'Autumn', array['q1','q2','q3','q4','q6']),
    (2022, 'Autumn', array['q2','q3','q5','q7','q8']),
    (2023, 'Spring', array['q1','q3','q4','q9']),
    (2024, 'Autumn', array['q2','q3','q6','q8','q10']),
    (2025, 'Spring', array['q2','q5','q7','q9','q10'])
  ) as p(yr, sess, keys) loop
    insert into past_papers (user_id, subject_id, title, year, session, processing_status, detected_subject)
    values (v_uid, v_subject, 'FAR practice paper ' || r.yr || ' (demo)', r.yr, r.sess, 'ready', 'Financial Accounting & Reporting')
    returning id into v_paper;

    i := 0;
    for qrow in select * from _demo_q_pool where key = any (r.keys) order by array_position(r.keys, key) loop
      insert into past_paper_questions (past_paper_id, user_id, question_number, question_text, marks, question_type, sort_order)
      values (v_paper, v_uid, qrow.num, qrow.txt, qrow.marks, qrow.qtype, i)
      returning id into v_q;
      i := i + 1;

      for j in 1 .. array_length(qrow.topics, 1) loop
        insert into question_topic_links (user_id, question_id, topic_id, confidence, source)
        values (v_uid, v_q, (tid ->> qrow.topics[j])::uuid, qrow.conf[j], 'ai');
      end loop;

      insert into questions (user_id, subject_id, topic_id, question_text, question_type, difficulty, marks, year, source_type, source_id,
                             solved_status, bookmarked, marked_difficult)
      values (v_uid, v_subject, (tid ->> qrow.topics[1])::uuid, qrow.txt, qrow.qtype,
              case when qrow.marks >= 20 then 4 when qrow.marks >= 15 then 3 else 2 end,
              qrow.marks, r.yr, 'past_paper', v_q,
              case when r.yr <= 2022 then 'solved'::solved_status when r.yr = 2023 then 'attempted'::solved_status else 'unsolved'::solved_status end,
              qrow.key in ('q2', 'q3'), qrow.key = 'q3');
    end loop;

    update past_papers set total_marks = (select sum(marks) from past_paper_questions where past_paper_id = v_paper) where id = v_paper;
  end loop;

  -- ---------------- Study plan: 3 days to the exam ----------------
  insert into study_plans (user_id, subject_id, title, request, exam_date, start_date, end_date, daily_minutes, summary, strategy, skip_if_short)
  values (v_uid, v_subject, 'FAR — 3-day exam sprint', 'I have 3 days before my FAR exam. What should I study?', d + 3, d, d + 2, 180,
          'Three days is enough to lift your weakest high-frequency topics (Revaluation, Depreciation, CGUs) and rehearse under timed conditions. Strong topics like IAS 16 recognition get only a quick recall pass.',
          '["Start each day with your weakest high-frequency topic while you are fresh.", "Practise numericals by hand — Revaluation and CGU questions carried the most marks in your papers.", "Do one timed past-paper question every day.", "Keep the final evening light: formula review and sleep."]',
          '["Disclosure", "Subsequent Costs", "Disposals"]')
  returning id into v_plan;

  insert into study_plan_sessions (study_plan_id, user_id, topic_id, title, activity, scheduled_date, start_time, duration, goals, details, priority, status, sort_order) values
  (v_plan, v_uid, (tid ->> 'Revaluation')::uuid, 'IAS 16 revaluation concepts', 'learn', d, '09:00', 60,
     '{"Understand revaluation surplus vs P&L","Study one worked example","Solve 3 short questions"}', 'Re-read notes p.3, then attempt the 2024 practice Q2 part (a).', 0.92,
     'done', 0),
  (v_plan, v_uid, (tid ->> 'Depreciation')::uuid, 'Depreciation after revaluation — numericals', 'practice', d, '10:15', 60,
     '{"Solve 5 depreciation numericals","Check excess depreciation transfer"}', null, 0.88, 'planned', 1),
  (v_plan, v_uid, (tid ->> 'Revaluation')::uuid, 'Past paper 2024 Q2 (timed)', 'past_paper', d, '12:00', 45,
     '{"Attempt under 36 minutes","Mark against the model approach"}', null, 0.85, 'planned', 2),
  (v_plan, v_uid, (tid ->> 'Recognition')::uuid, 'Active recall: IAS 16 recognition & measurement', 'recall', d, '18:00', 30,
     '{"Write the cost inclusions list from memory"}', null, 0.4, 'planned', 3),
  (v_plan, v_uid, (tid ->> 'Cash-Generating Units (CGU)')::uuid, 'CGU impairment allocation', 'learn', d + 1, '09:00', 75,
     '{"Learn the allocation order","Understand the floor rule","Solve 2 CGU questions"}', 'Use notes p.4.', 0.95, 'planned', 0),
  (v_plan, v_uid, (tid ->> 'Recoverable Amount')::uuid, 'Recoverable amount & value in use', 'practice', d + 1, '10:30', 45,
     '{"Compute VIU from cash flows","Compare with FVLCD"}', null, 0.8, 'planned', 1),
  (v_plan, v_uid, (tid ->> 'Research vs Development')::uuid, 'IAS 38 capitalisation criteria', 'revise', d + 1, '12:00', 45,
     '{"Recall all six criteria","Apply to one scenario"}', null, 0.7, 'planned', 2),
  (v_plan, v_uid, (tid ->> 'Transfers')::uuid, 'IAS 40 transfers', 'learn', d + 1, '17:30', 45,
     '{"Learn transfer rules for each direction"}', null, 0.72, 'planned', 3),
  (v_plan, v_uid, null, 'Mock: mixed past-paper questions (timed)', 'mock', d + 2, '09:00', 120,
     '{"Answer Q2, Q3 and Q5 style questions under exam timing"}', null, 0.9, 'planned', 0),
  (v_plan, v_uid, (tid ->> 'Cash-Generating Units (CGU)')::uuid, 'Fix mistakes from the mock', 'revise', d + 2, '14:00', 60,
     '{"Redo every question you lost marks on"}', null, 0.85, 'planned', 1),
  (v_plan, v_uid, null, 'Formula & rules review — light evening', 'recall', d + 2, '18:00', 30,
     '{"Skim flashcards","Sleep early"}', null, 0.5, 'planned', 2);

  -- ---------------- Study history (last 14 days) ----------------
  for i in 1 .. 14 loop
    if i % 4 <> 0 then
      insert into study_sessions (user_id, topic_id, status, started_at, ended_at, duration, confidence_before, confidence_after, goals)
      select v_uid, t.id, 'done', (d - i) + time '19:00', (d - i) + time '19:00' + make_interval(mins => 40 + (i * 7) % 50),
             40 + (i * 7) % 50, 2, 3, '[{"text":"Read notes","done":true},{"text":"Practice questions","done":true}]'::jsonb
      from topics t where t.subject_id = v_subject order by t.sort_order, t.name offset (i % 10) limit 1;
    end if;
  end loop;

  -- ---------------- Tasks & calendar ----------------
  insert into tasks (user_id, subject_id, topic_id, title, type, due_at, priority, status) values
  (v_uid, v_subject, (tid ->> 'Revaluation')::uuid, 'IAS 16 revision', 'study', d + time '20:00', 'high', 'todo'),
  (v_uid, v_subject, (tid ->> 'Revaluation')::uuid, 'Past Paper 2024 Q2', 'study', d + time '21:00', 'high', 'todo'),
  (v_uid, v_subject, (tid ->> 'Cash-Generating Units (CGU)')::uuid, 'Watch CGU impairment lecture', 'study', d + time '22:00', 'medium', 'todo'),
  (v_uid, v_subject, (tid ->> 'Depreciation')::uuid, 'Practice 10 depreciation questions', 'study', d + time '22:30', 'medium', 'todo'),
  (v_uid, v_subject, null, 'Submit mock exam registration form', 'registration', d + 1 + time '17:00', 'medium', 'todo'),
  (v_uid, v_subject, null, 'Academy assignment: IAS 40 case study', 'assignment', d - 1 + time '23:59', 'high', 'todo'),
  (v_uid, v_subject, null, 'Buy exam stationery & calculator batteries', 'other', d + 2 + time '18:00', 'low', 'todo');

  insert into calendar_events (user_id, subject_id, title, type, start_at, end_at, all_day, description) values
  (v_uid, v_subject, 'FAR exam', 'exam', (d + 3) + time '09:00', (d + 3) + time '12:15', false, 'CAF — Financial Accounting & Reporting'),
  (v_uid, v_subject, 'FAR academy class — IAS 36', 'class', (d + 1) + time '16:00', (d + 1) + time '17:30', false, null),
  (v_uid, v_subject, 'FAR academy class — IAS 38', 'class', (d - 2) + time '16:00', (d - 2) + time '17:30', false, null),
  (v_uid, v_subject, 'Mock test (academy)', 'quiz', (d + 2) + time '09:00', (d + 2) + time '11:00', false, null);

  -- ---------------- Quiz history ----------------
  insert into quiz_attempts (user_id, subject_id, topic_id, difficulty, score, total, duration_seconds, completed_at, created_at) values
  (v_uid, v_subject, (tid ->> 'Depreciation')::uuid, 'medium', 3, 6, 420, now() - interval '6 days', now() - interval '6 days'),
  (v_uid, v_subject, (tid ->> 'Revaluation')::uuid, 'medium', 2, 6, 510, now() - interval '4 days', now() - interval '4 days'),
  (v_uid, v_subject, (tid ->> 'Recognition Criteria')::uuid, 'easy', 6, 6, 240, now() - interval '3 days', now() - interval '3 days'),
  (v_uid, v_subject, (tid ->> 'Cash-Generating Units (CGU)')::uuid, 'hard', 2, 6, 600, now() - interval '2 days', now() - interval '2 days'),
  (v_uid, v_subject, (tid ->> 'Research vs Development')::uuid, 'medium', 5, 6, 360, now() - interval '1 day', now() - interval '1 day');

  update student_topic_progress p set quiz_correct = x.c, quiz_total = x.t
  from (select topic_id, sum(score) c, sum(total) t from quiz_attempts where user_id = v_uid group by topic_id) x
  where p.topic_id = x.topic_id and p.user_id = v_uid;

  -- ---------------- Flashcards ----------------
  insert into flashcards (user_id, subject_id, topic_id, front, back, difficulty, source_type, due_at, repetitions, interval_days) values
  (v_uid, v_subject, (tid ->> 'Internally Generated Intangibles')::uuid, 'When is an internally generated brand recognised?', 'Never — IAS 38 prohibits recognising internally generated brands, mastheads, publishing titles and customer lists.', 2, 'topic', now() - interval '1 hour', 2, 3),
  (v_uid, v_subject, (tid ->> 'Depreciation')::uuid, 'When does depreciation of PPE begin?', 'When the asset is available for use (in the location and condition to operate as intended), not when it is first used.', 2, 'resource', now() - interval '2 hours', 1, 1),
  (v_uid, v_subject, (tid ->> 'Revaluation')::uuid, 'Where does a revaluation increase go?', 'OCI / revaluation surplus — unless it reverses a previous decrease recognised in P&L, in which case that part goes to P&L.', 3, 'resource', now(), 1, 1),
  (v_uid, v_subject, (tid ->> 'Cash-Generating Units (CGU)')::uuid, 'Order of allocating a CGU impairment loss?', 'First to goodwill of the unit, then pro rata to other assets by carrying amount — no asset below the highest of FVLCD, VIU and zero.', 4, 'topic', now() - interval '1 day', 0, 0),
  (v_uid, v_subject, (tid ->> 'Recoverable Amount')::uuid, 'Define recoverable amount.', 'The higher of fair value less costs of disposal and value in use.', 2, 'topic', now() + interval '2 days', 3, 6),
  (v_uid, v_subject, (tid ->> 'Research vs Development')::uuid, 'Treatment of research-phase expenditure?', 'Always expensed as incurred.', 1, 'topic', now() + interval '4 days', 4, 10),
  (v_uid, v_subject, (tid ->> 'Fair Value vs Cost Model')::uuid, 'Is investment property depreciated under the fair value model?', 'No. Changes in fair value go to profit or loss; no depreciation.', 2, 'topic', now() - interval '3 hours', 1, 1),
  (v_uid, v_subject, (tid ->> 'Reversal of Impairment')::uuid, 'Can a goodwill impairment be reversed?', 'No — impairment losses on goodwill are never reversed.', 2, 'past_paper', now() + interval '1 day', 2, 3);

  insert into flashcard_reviews (user_id, flashcard_id, rating, reviewed_at, next_review_at)
  select v_uid, f.id, (array['good','hard','good','easy','again','good'])[1 + (g % 6)]::review_rating,
         now() - make_interval(days => g), now() - make_interval(days => g) + interval '2 days'
  from flashcards f, generate_series(1, 10) g
  where f.user_id = v_uid and f.subject_id = v_subject and (g + length(f.front)) % 3 = 0;

  return v_subject;
end $$;

grant execute on function public.create_demo_workspace() to authenticated;
revoke execute on function public.create_demo_workspace() from public, anon;
