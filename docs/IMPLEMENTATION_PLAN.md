# Implementation Plan — MY AI COMMAND CENTER (+ Content Studio)

## Starting point (inspected 2026-09-30)

| Item | Finding |
|---|---|
| `App` repo | Only `README.md` ("# App"). Nothing to preserve beyond it. |
| `Ai-bot` repo | Empty (no commits). Left untouched. |
| Runtime | Node 22, npm 10, PostgreSQL 16, Chromium for Playwright. No Docker, no Ollama, no AI keys. |

## Key decisions

1. **One app, two modules.** The "AI Command Center" and the "$0 Social Media Content Bot" are
   built as one Next.js application. Social content is the *Content Studio* module, driven by the
   same command box, tool system, approval center, scheduler and activity log. One assistant.
2. **Postgres first, Supabase-compatible.** All schema lives in plain SQL migrations
   (`database/migrations`). They run on local Postgres *or* a Supabase free-tier project
   (Supabase is Postgres). Row Level Security is enforced through a dedicated non-owner role
   (`cc_user`) and a `cc_uid()` helper that also understands Supabase JWT claims.
3. **Built-in auth instead of Supabase Auth (for the MVP).** Email + password (bcrypt) with a
   signed, httpOnly, SameSite cookie (JWT via `jose`). Reason: works fully offline and in tests;
   no dependency on a hosted service. The auth module is isolated (`lib/auth`) so Supabase Auth
   can be swapped in later.
4. **Works with zero AI.** A deterministic "offline" engine (rule-based intent detection,
   template planners, template writers) means every feature runs at $0 with no keys. When a
   model is configured, the AI router upgrades to **Ollama (local)** → **free OpenAI-compatible
   APIs** (Groq, OpenRouter `:free`, Gemini) → **paid** only if explicitly enabled.
5. **Honest integrations.** Publishing only via official APIs (Meta Graph for Facebook/Instagram,
   YouTube Data API). Where an official path is not available for $0 (Snapchat, TikTok without
   audited app, YouTube for still images), the system builds a **manual publishing package**.
6. **Embedded or separate worker.** The automation worker (job queue + scheduler) runs inside the
   Next.js server for local use (`EMBEDDED_WORKER=true`), or as a separate process
   (`npm run worker`) for serverless frontends (Netlify/Vercel).

## Architecture

```
USER → Command box → Intent detection → Planner → Permission check → Execution engine
     → Verification → Result → Memory / Activity log
                         ↘ Approval Center (medium/high risk steps pause the run)
```

## Phases

| # | Phase | Deliverables |
|---|---|---|
| 1 | Foundation | Next.js 16 + TS + Tailwind 4, lint, env validation, folder layout, docs skeleton |
| 2 | Database + auth | SQL migrations (all tables, indexes, FKs, RLS), migration runner, seed, auth (signup/login/logout), CSRF + rate limiting |
| 3 | Dashboard | App shell (desktop sidebar + mobile bottom nav), dark/light, command box, work queue, onboarding |
| 4 | AI command system | AI router (offline / Ollama / OpenAI-compatible), intent detection, planner, executor, verification, prompt-injection defenses, usage tracking |
| 5 | Tool system | Tool registry with schemas + risk levels; files, documents, spreadsheets, research, browser, tasks, memory, notifications, email, webhooks |
| 6 | Tasks + projects | Task manager (NL task creation), projects workspaces |
| 7 | Automation engine | Postgres job queue (SKIP LOCKED), retries with backoff, timeouts, circuit breaker, scheduler (cron), triggers (schedule/webhook/file-added/manual), NL automation creation |
| 8 | Workflow builder | Visual drag/drop step builder, conditions, delays, loops, approvals, retries, templates |
| 9 | Browser automation | Playwright agents (`automation/browser`) – open, read, extract, screenshot, click/type (approval), website monitor |
| 10 | Memory | Preferences / project / business / task memory, remember/forget/show commands, automation discovery |
| 11 | Approvals + security | Approval center (approve/reject/edit/view), explicit confirmation for high risk, audit log, encrypted credentials |
| 12 | Content Studio + integrations | Brands, products, content engine, image generation router (Gemini → local SD → Pollinations → built-in renderer → manual), quality checks, calendar, queue, publishing (Meta/YouTube/TikTok/Snapchat honest), package ZIP export, analytics (no fabrication), Telegram/email notifications |
| 13 | Testing | Vitest unit + integration (real Postgres, RLS), Playwright e2e |
| 14 | Deployment | Production build, docs: SETUP, DEPLOYMENT (Supabase, Netlify/Vercel, worker, cron) |

Each phase: implement → typecheck/build → test → fix → continue.

## Out of scope for the MVP (architecture ready)

Voice, WhatsApp (only via official Cloud API later), CRM/accounting/POS, smart home, native apps
(PWA manifest provided). Integrations are added by dropping a module into `integrations/`.

## Status (2026-10-01)

All 14 phases implemented. Verification:

- `npm run typecheck` — clean
- `npm test` — 107 unit + integration tests (real Postgres: RLS isolation, auth, engine, approvals, scheduler, events, content pipeline)
- `npm run test:e2e` — 8 Playwright flows (sign-up/onboarding, command → plan → result, project + task, NL automation create/pause/resume/run, content approve & publish → manual packages, reject in Approval Center, document upload + processing, mobile layout)
- `npm run build` — production build succeeds

Known gaps / next steps: file storage is local disk (Supabase Storage adapter for serverless hosts);
OAuth publishing paths are implemented against the official APIs but could not be exercised end-to-end
without real app credentials; voice, WhatsApp (official API) and native wrappers are future work.
