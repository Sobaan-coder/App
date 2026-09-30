# Study OS

**Your entire academic life. One operating system.**

Study OS turns a syllabus into a working study system: subjects, chapters and topics, then resources, past papers, deadlines, an adaptive planner, spaced revision, quizzes, flashcards and an AI tutor that answers from your own notes with citations. You can upload a past paper and it maps every question to a syllabus topic, so you can see what actually gets examined.

It is built for university students and for professional and competitive exams (CA, ACCA, CFA, MDCAT, ECAT, CSS, A/O levels). The demo workspace is CA Pakistan → CAF → Financial Accounting & Reporting.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Quick start (local)](#quick-start-local)
3. [Environment variables and API keys](#environment-variables-and-api-keys)
4. [Setting up a hosted Supabase project](#setting-up-a-hosted-supabase-project)
5. [Deploying to Vercel](#deploying-to-vercel)
6. [Testing](#testing)
7. [Architecture](#architecture)
8. [Security model](#security-model)
9. [Adding a new education system](#adding-a-new-education-system)
10. [Admin panel](#admin-panel)
11. [Project layout](#project-layout)
12. [Known limitations](#known-limitations)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Components, Server Actions, Route Handlers), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui-style components on Radix, lucide icons, Recharts, cmdk command bar, sonner toasts |
| Data | Supabase Postgres with Row Level Security, Supabase Auth (email/password and Google), Supabase Storage (private buckets) |
| Search / RAG | pgvector (1536-d, HNSW) plus Postgres full-text search, fused with Reciprocal Rank Fusion |
| AI | Provider abstraction: Anthropic (default) or any OpenAI-compatible API, with structured JSON output validated by zod |
| Documents | unpdf (PDF), mammoth (DOCX), jszip (PPTX), vision-model OCR for scans and images |
| PWA | Web manifest, install icons, a service worker that caches only the offline shell |
| Tests | Vitest unit tests, RLS integration tests against real Postgres |

---

## Quick start (local)

**Prerequisites:** Node 20+, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install

# 1. Start the local Supabase stack (Postgres, Auth, Storage, Studio, Mailpit)
npm run db:start
#    This prints an API URL, an anon key and a service_role key.

# 2. Configure the environment
cp .env.example .env.local
#    Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
#    SUPABASE_SERVICE_ROLE_KEY from step 1, and AI_API_KEY.

# 3. Apply migrations and the seed (including the local demo and admin users)
npm run db:reset

# 4. Run the app
npm run dev          # http://localhost:3000
```

### Local accounts (seeded by `supabase/seed/*.sql`, local only)

| Account | Email | Password |
| --- | --- | --- |
| Demo student (full FAR workspace) | `demo@studyos.app` | `demo-password-123` |
| Admin | `admin@studyos.app` | `admin-password-123` |

Sign-up confirmation emails go to Mailpit at http://127.0.0.1:54324. New users can also click **Load demo workspace** during onboarding to get the same demo data in their own account.

> The seed files under `supabase/seed/` create users with known passwords. They run only on `supabase db reset` against a local stack. `supabase db push` never runs them, so never apply them to production by hand.

After changing the schema, regenerate the typed client with `npm run db:types`.

---

## Environment variables and API keys

All variables are listed in [`.env.example`](.env.example). Only `NEXT_PUBLIC_*` values reach the browser. `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `EMBEDDING_API_KEY` and `CRON_SECRET` are read only in server modules, which import `server-only`, so a client import fails the build.

### Required

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/public key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role key). **Keep this secret.** |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL, e.g. `https://study-os.vercel.app` |
| `AI_API_KEY` | An Anthropic API key (console.anthropic.com), or a key for your OpenAI-compatible provider |
| `CRON_SECRET` | Any long random string, e.g. `openssl rand -hex 32` |

### AI provider

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` | `anthropic`, or `openai` for any OpenAI-compatible API (OpenAI, OpenRouter, Together, Groq, Azure, Ollama, and others) |
| `AI_BASE_URL` | — | Base URL for OpenAI-compatible hosts |
| `AI_MODEL` | `claude-opus-5-5` | Strong model: syllabus extraction, past-paper mapping, planner, tutor |
| `AI_FAST_MODEL` | `claude-haiku-4-5` | Cheap model: tagging, command routing, flashcards |
| `AI_RATE_LIMIT_PER_HOUR` | `60` | AI requests per user per hour |

### Embeddings (optional but recommended)

Embeddings power semantic retrieval for the tutor and for past-paper mapping. They use an OpenAI-compatible `/embeddings` endpoint, because Anthropic has no embeddings API.

| Variable | Default | Notes |
| --- | --- | --- |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Leave empty to disable embeddings. Retrieval then falls back to full-text search only. |
| `EMBEDDING_API_KEY` | falls back to `AI_API_KEY` | Set this when `AI_PROVIDER=anthropic` and you use OpenAI for embeddings |
| `EMBEDDING_BASE_URL` | OpenAI | Any OpenAI-compatible embeddings host |
| `EMBEDDING_DIMENSIONS` | `1536` | Must match the `vector(1536)` columns. To change it, alter the columns and indexes in a new migration. |

### Other

`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` (shows the Google button), `MAX_UPLOAD_MB` (default 25).

---

## Setting up a hosted Supabase project

1. **Create a project** at [supabase.com](https://supabase.com). Copy the URL, anon key and service_role key into your environment.

2. **Run the migrations.** They enable `pgvector`, create every table, RLS policy, index and RPC, create the three private storage buckets with their policies, and seed the template catalogue:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   Or paste `supabase/migrations/001…005` into the SQL editor, in order.

3. **Configure Auth** (Authentication → URL Configuration):
   - **Site URL:** your app URL.
   - **Redirect URLs:** `https://<your-domain>/**`.

4. **Configure email templates** (Authentication → Email Templates). Token-hash links work even when the email is opened on another device:
   - **Confirm signup:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - **Reset password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

   The default templates also work; they go through `/auth/callback`.

5. **Google sign-in (optional):**
   - Create an OAuth client in Google Cloud and use `https://<project-ref>.supabase.co/auth/v1/callback` as its redirect URI.
   - Enable Google under Authentication → Providers and paste in the client ID and secret.
   - Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.

6. **Create your first admin.** Sign up normally, then run this in the SQL editor. A database trigger blocks users from changing this flag themselves.
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```

**Storage buckets** (created by `002_rls.sql`; all private):
- `student-resources`: notes and documents
- `past-papers`
- `avatars`

Files live under `<user-id>/…`, and storage policies allow access only to the owner's folder. The app downloads files through short-lived signed URLs.

---

## Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel. The framework preset is Next.js, with no build settings to change.
2. Add every variable from [Environment variables](#environment-variables-and-api-keys) to Vercel → Settings → Environment Variables. Set `NEXT_PUBLIC_SITE_URL` to the production URL.
3. Deploy. Then update the Supabase Site URL and redirect URLs to the production domain.
4. **Background jobs.** Document processing and past-paper mapping start right after upload, using `after()` inside the request. As a safety net, `vercel.json` schedules `GET /api/cron/process-jobs` every 5 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET`, and the route rejects any request without it. This picks up retries and any job interrupted by a timeout.
   - Vercel's Hobby plan allows only daily crons. On Hobby, change the schedule to `0 3 * * *` or call the endpoint from any external scheduler.
5. Long AI calls (planner, paper mapping, OCR) set `maxDuration` on their route handlers. The Hobby plan caps functions at 60 s, so use Pro for large documents. Jobs cut off by a timeout are retried by the cron.

---

## Testing

```bash
npm run typecheck                # TypeScript, strict mode
npm test                         # unit tests (SM-2, priority, planner, readiness, chunking, analytics, AI layer…)

# RLS / security integration tests against a real Postgres with the migrations applied:
npm run db:start && npm run db:reset
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:integration
```

The integration suite logs in as two different users in Postgres and checks the following:

- **Cross-user isolation:** neither user can read, update or delete the other's subjects, topics, resources, chunks, papers, plans, conversations or storage objects.
- **Reference ownership:** a user can't attach their row to someone else's subject.
- **Admin flag:** a user can't make themselves admin.
- **Catalogue:** the template catalogue is read-only.
- **Service-role RPCs:** they are not callable by users.

**Manual end-to-end checks.** These were run against a production build (`next build && next start`), using a local Supabase stack and a mock OpenAI-compatible server:

- **Account flows:** signup, email verification, 10-step onboarding, demo workspace.
- **Syllabus:** import, review, then save.
- **Documents:** upload through processing to READY, with citations in the tutor.
- **Past papers:** upload, then topic mapping with low-confidence flags, then analytics.
- **Planning:** AI plan and adapt.
- **Study tools:** study session, quiz grading, flashcards and SM-2 review, command bar, global search.
- **Admin:** admin panel, and the non-admin block.
- **Layout:** mobile layouts.

---

## Architecture

```
Browser ──► Next.js (Vercel)
             ├─ Server Components  ── read data with the user's Supabase session (RLS applies)
             ├─ Server Actions      ── mutations; zod-validated; identity from the session cookie
             ├─ Route Handlers      ── uploads, streaming tutor chat, AI generation, cron
             │    └─ after()/cron ─► job runner ─► extract → chunk → embed → AI analyse
             └─ lib/ai ─ provider abstraction ─► Anthropic | OpenAI-compatible
                                                 embeddings ─► OpenAI-compatible /embeddings
Supabase ── Postgres (RLS on every table, pgvector, FTS, RPCs) · Auth · Storage (private buckets)
```

### Key flows

**Syllabus engine** (`lib/syllabus`, `lib/ai/syllabus-extractor.ts`):
1. You upload a PDF or DOCX, or paste text.
2. The file is extracted and the strong model returns zod-validated JSON (subjects → chapters → topics, weightage, difficulty, estimated hours).
3. You review and edit it on screen, labelled **"AI generated — review before saving"**.
4. `save_syllabus()` writes everything in one transaction.

**Document pipeline** (`lib/documents`, `lib/jobs`):
1. The status moves `UPLOADING → PROCESSING → ANALYZING → READY | FAILED`.
2. Files are checked by extension, MIME type and magic bytes. Text is extracted per page; scans and images go through the AI model for OCR.
3. The text is chunked with page numbers and embedded.
4. The fast model tags each chunk to syllabus topics.
5. Jobs are rows in `processing_jobs`, claimed atomically, retried up to 3 times, and failures are logged.

**RAG tutor** (`lib/ai/retrieval.ts`, `lib/ai/chat.ts`):
- `match_resource_chunks()` fuses vector similarity with full-text rank (RRF), within the user's own chunks only.
- The tutor answers from the top chunks and cites `[1]`, `[2]`, and so on. The UI shows the real source title and page.
- With no relevant material, it says so and marks the answer as general knowledge rather than grounded.
- Citations are only ever built from retrieved chunks, never from model output.

**Past-paper mapper** (`lib/past-papers`, `lib/ai/past-paper-analyzer.ts`):
1. The strong model splits the paper into questions, extracting only what is on the page.
2. Each question is matched to one of the user's own topics; candidate topics are pre-filtered by embeddings when available.
3. It returns confidence, marks, type and difficulty.
4. Topic IDs the model invents are discarded.
5. Mappings under 70% confidence are flagged ("AI isn't fully confident about this mapping") for review.
6. Analytics show frequency, marks share, trends and never-examined topics. They describe history and never promise predictions.

**Planner** (`lib/planner`, `lib/ai/study-planner.ts`):
- Topic priority combines several signals: exam weight, past-paper frequency, weakness (confidence, quiz results, revision lapses), time since last study and days to the exam.
- The AI plan is normalised against real topics and the available hours. A deterministic heuristic planner is the fallback.
- "Adapt" rebalances missed sessions deterministically.

**Revision:** SM-2 (`lib/revision/srs.ts`) with Again/Hard/Good/Easy, used for both flashcards and topic reviews.

**Exam readiness** (`lib/analytics/readiness.ts`): a transparent weighted score. The UI shows every component and its weight.

**AI integrity:**
- All structured output is schema-validated, with one repair retry.
- Page numbers and citations come from stored data, never from the model.
- Past-paper questions are never generated. Quizzes are AI practice questions, based on your own materials when there are any (otherwise on standard syllabus knowledge), and are never presented as real exam questions.

---

## Security model

- **RLS on every table.**
  - Private tables have policies such as `owner_id = auth.uid()` or `user_id = auth.uid()`.
  - Child tables (chapters and topics) inherit the owner through triggers.
  - `enforce_reference_ownership` rejects references to another user's rows. It runs as `SECURITY INVOKER`, so it can't bypass RLS.
- **Identity** always comes from the server session: `requireUser()` in actions and routes, and `auth.uid()` in SQL. Client-supplied user IDs are never trusted.
- **The service role** is used only server-side, for job processing, usage and error logs, and the admin panel. Admin views show aggregate counts and metadata only, never document contents.
- **Admins** have no RLS bypass. `is_admin` can't be changed by users (enforced by a trigger), and admin pages check the flag on the server.
- **Uploads** are treated as untrusted data:
  - Files are validated by size, extension, MIME type and magic bytes, and are never executed.
  - Text is extracted in-process with parsers, never shell tools.
  - Document text is passed to the model as delimited data, with instructions to ignore any instructions inside it.
- **URL resources** go through an SSRF guard: http(s) only, no private or loopback IPs, a DNS check, capped size, and manual redirects.
- **Rate limiting** applies per user for AI calls (`ai_usage`), and sizes are capped on every upload and generation endpoint.
- **Security headers** are set in `next.config.mjs`.
- **Privacy:** the service worker never caches pages or API responses. Users can export all their data as JSON (`/api/account/export`) and delete their account, which also removes their storage objects.

---

## Adding a new education system

Education systems, programmes and **template subjects** make up a public catalogue. When a student picks a template, they get a private, editable copy made by `clone_subject_template()`.

### Option A: from the admin panel (no code)

Go to **Admin → Catalogue** and:
1. Add the **education system**, for example "Cambridge IGCSE" (country, category).
2. Add a **programme** under it, for example "IGCSE Science", with levels.
3. Add **template subjects**, with the outline as one chapter per line: `Chapter: topic, topic, topic`.

The new system appears in onboarding and on *Subjects → Add subject* immediately.

### Option B: as a migration (versioned, repeatable)

Create `supabase/migrations/006_<name>.sql` following the pattern in `005_seed.sql`:

```sql
insert into public.education_systems (id, name, country, category, description) values
  ('00000000-0000-4000-a000-0000000000a1', 'Cambridge IGCSE', 'International', 'o_level', 'Cambridge International');

insert into public.programs (id, education_system_id, name, education_system, description, levels) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000a1',
   'IGCSE Sciences', 'Cambridge IGCSE', 'Core sciences', '{"Year 10","Year 11"}');

-- One template subject with chapters and topics ([name, difficulty 1-5, estimated minutes])
insert into public.subjects (id, program_id, owner_id, name, code, color) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-0000000000a1', null, 'Physics', '0625', 'sky');
with ch as (
  insert into public.chapters (subject_id, name, weightage, sort_order)
  values ('00000000-0000-4000-c000-0000000000a1', 'Motion, forces and energy', 25, 0) returning id
)
insert into public.topics (chapter_id, name, difficulty, estimated_minutes, sort_order)
select ch.id, t.name, t.d, t.m, t.o from ch,
  (values ('Speed and velocity', 2, 60, 0), ('Momentum', 3, 90, 1)) as t(name, d, m, o);
```

Then run `supabase db push`. Rows with `owner_id is null` are templates: every signed-in user can read them and nobody can write them. If a new *category* is needed, extend the `education_level` enum in the same migration.

A syllabus that isn't in the catalogue doesn't need a template at all. Students can import their own syllabus PDF, and the syllabus engine builds the structure for them.

---

## Admin panel

`/admin` requires `profiles.is_admin = true`. It has five views:

- **Overview:** user, content and AI usage counts, token usage and failure rates.
- **Users:** a list of users with per-user counts (subjects, storage used, AI calls this month). It never shows content. Grant or revoke admin with the SQL shown in [Setting up a hosted Supabase project](#setting-up-a-hosted-supabase-project).
- **Catalogue:** manage education systems, programmes and templates.
- **Jobs:** the processing queue, with retries for failed jobs.
- **Errors:** recent server and AI errors.

---

## Project layout

```
app/
  (auth)/           login, signup, verify-email, forgot/reset password
  (app)/            authenticated app: dashboard, subjects, topics, resources, past-papers,
                    questions, planner, study, revision, quiz, flashcards, calendar,
                    deadlines, progress, tutor, search, settings, admin
  api/              route handlers (uploads, tutor stream, AI generation, cron, account export/delete)
  auth/             callback, confirm, signout
  onboarding/       10-step onboarding
components/         UI primitives (components/ui) and feature components
lib/
  ai/               provider abstraction, structured output, extractors, tutor, retrieval
  actions/          server actions (all mutations)
  analytics/ planner/ revision/ documents/ past-papers/ syllabus/ jobs/ security/
  supabase/         browser, server, admin and middleware clients
supabase/
  migrations/       001 schema · 002 RLS and storage · 003 indexes · 004 vector search and RPCs · 005 catalogue and demo
  seed/             local-only demo and admin users
tests/              unit/ and integration/ (RLS)
public/             sw.js, icons
```

---

## Known limitations

- **Real AI calls weren't exercised during development.** No provider key was available in the build environment, so the AI features were verified end to end with a mock OpenAI-compatible server. Before launch, test with your real key and model: syllabus import, paper mapping, planner and tutor.
- **Scanned documents** are OCR'd by sending the whole PDF to the model. This needs a provider that accepts PDF input: Anthropic does, and OpenAI-compatible hosts may not, in which case the resource fails with a clear message. Very long scans are bounded by the model's context and output limits.
- **YouTube** resources are indexed from the video's public oEmbed metadata (title and channel) only. Transcripts are not fetched, because there is no official transcript API without OAuth. **Google Drive** links are stored as bookmarks and not fetched, since Drive files are private to Google.
- **Push notifications** are not implemented. Reminders show in-app on the dashboard, calendar and deadlines pages.
