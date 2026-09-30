-- ============================================================================
-- STUDY OS — 003 indexes
-- Every RLS predicate (user_id / owner_id) is indexed, plus the foreign keys
-- and sort/filter columns the app queries most.
-- ============================================================================

-- Catalogue
create index programs_system_idx            on public.programs (education_system_id);
create index programs_owner_idx             on public.programs (owner_id);
create index education_systems_owner_idx    on public.education_systems (owner_id);
create index subjects_program_idx           on public.subjects (program_id);
create index subjects_owner_idx             on public.subjects (owner_id, sort_order);
create index chapters_subject_idx           on public.chapters (subject_id, sort_order);
create index chapters_owner_idx             on public.chapters (owner_id);
create index topics_chapter_idx             on public.topics (chapter_id, sort_order);
create index topics_subject_idx             on public.topics (subject_id);
create index topics_owner_idx               on public.topics (owner_id);
create index topics_parent_idx              on public.topics (parent_topic_id);
create index topics_name_fts_idx            on public.topics using gin (to_tsvector('english', name));

-- Student ↔ catalogue
create index student_programs_user_idx      on public.student_programs (user_id);
create index student_subjects_user_idx      on public.student_subjects (user_id, status);
create index student_subjects_exam_idx      on public.student_subjects (user_id, exam_date);
create index student_subjects_subject_idx   on public.student_subjects (subject_id);
create index progress_user_idx              on public.student_topic_progress (user_id);
create index progress_topic_idx             on public.student_topic_progress (topic_id);
create index progress_review_idx            on public.student_topic_progress (user_id, next_review_at);

-- Resources & knowledge base
create index resources_user_created_idx     on public.resources (user_id, created_at desc);
create index resources_subject_idx          on public.resources (subject_id);
create index resources_status_idx           on public.resources (processing_status);
create index resources_title_fts_idx        on public.resources using gin (to_tsvector('english', title));
create index resources_tags_idx             on public.resources using gin (tags);
create index chunks_resource_idx            on public.resource_chunks (resource_id, chunk_index);
create index chunks_user_idx                on public.resource_chunks (user_id);
create index chunks_topic_idx               on public.resource_chunks (topic_id);
create index chunks_fts_idx                 on public.resource_chunks using gin (fts);
create index chunks_embedding_idx           on public.resource_chunks using hnsw (embedding vector_cosine_ops);
create index topics_embedding_idx           on public.topics using hnsw (embedding vector_cosine_ops);
create index trl_user_idx                   on public.topic_resource_links (user_id);
create index trl_resource_idx               on public.topic_resource_links (resource_id);
create index trl_topic_idx                  on public.topic_resource_links (topic_id);

-- Past papers
create index past_papers_user_idx           on public.past_papers (user_id, created_at desc);
create index past_papers_subject_idx        on public.past_papers (subject_id, year);
create index past_papers_status_idx         on public.past_papers (processing_status);
create index ppq_paper_idx                  on public.past_paper_questions (past_paper_id, sort_order);
create index ppq_user_idx                   on public.past_paper_questions (user_id);
create index ppq_text_fts_idx               on public.past_paper_questions using gin (to_tsvector('english', question_text));
create index qtl_question_idx               on public.question_topic_links (question_id);
create index qtl_topic_idx                  on public.question_topic_links (topic_id);
create index qtl_user_review_idx            on public.question_topic_links (user_id) where needs_review;

-- Question bank
create index questions_user_idx             on public.questions (user_id, created_at desc);
create index questions_subject_idx          on public.questions (subject_id);
create index questions_topic_idx            on public.questions (topic_id);
create index questions_text_fts_idx         on public.questions using gin (to_tsvector('english', question_text));

-- Plans & sessions
create index study_plans_user_idx           on public.study_plans (user_id, status, generated_at desc);
create index study_plans_subject_idx        on public.study_plans (subject_id);
create index sps_plan_idx                   on public.study_plan_sessions (study_plan_id, scheduled_date, sort_order);
create index sps_user_date_idx              on public.study_plan_sessions (user_id, scheduled_date);
create index sps_topic_idx                  on public.study_plan_sessions (topic_id);
create index study_sessions_user_idx        on public.study_sessions (user_id, started_at desc);
create index study_sessions_topic_idx       on public.study_sessions (topic_id);

-- Tasks & calendar
create index tasks_user_due_idx             on public.tasks (user_id, status, due_at);
create index tasks_subject_idx              on public.tasks (subject_id);
create index events_user_start_idx          on public.calendar_events (user_id, start_at);
create index events_subject_idx             on public.calendar_events (subject_id);

-- Quizzes & flashcards
create index quiz_attempts_user_idx         on public.quiz_attempts (user_id, created_at desc);
create index quiz_attempts_topic_idx        on public.quiz_attempts (topic_id);
create index flashcards_user_due_idx        on public.flashcards (user_id, due_at);
create index flashcards_topic_idx           on public.flashcards (topic_id);
create index flashcard_reviews_user_idx     on public.flashcard_reviews (user_id, reviewed_at desc);
create index flashcard_reviews_card_idx     on public.flashcard_reviews (flashcard_id);

-- AI tutor
create index ai_conversations_user_idx      on public.ai_conversations (user_id, updated_at desc);
create index ai_messages_conversation_idx   on public.ai_messages (conversation_id, created_at);
create index ai_messages_user_idx           on public.ai_messages (user_id);
create index ai_messages_fts_idx            on public.ai_messages using gin (to_tsvector('english', content));

-- Syllabus imports & operations
create index syllabus_imports_user_idx      on public.syllabus_imports (user_id, created_at desc);
create index jobs_status_idx                on public.processing_jobs (status, created_at);
create index jobs_user_idx                  on public.processing_jobs (user_id);
create index jobs_target_idx                on public.processing_jobs (target_id);
create index ai_usage_user_created_idx      on public.ai_usage (user_id, feature, created_at desc);
create index ai_usage_created_idx           on public.ai_usage (created_at desc);
create index error_logs_created_idx         on public.error_logs (created_at desc);
