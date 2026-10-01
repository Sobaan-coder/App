# Architecture

```
USER ──► voice / text, any language ──► wake-word strip ──► Urdu→English normalise ──► Command box ──► INTENT DETECTION ──► TASK PLANNER ──► (run queued)
                         agents/intent.ts      agents/planner.ts
                                                     │
              ┌──────────────────────────────────────┘
              ▼
      EXECUTION ENGINE (workflows/engine.ts) — per step:
        resolve inputs ({{steps.x.y}}) → validate (zod) → risk → permission
          LOW ─► run          MEDIUM ─► Approval Center ─► pause      HIGH ─► type CONFIRM
        run with timeout + retries (backoff) + circuit breaker → VERIFY → store output
        failure → fallback tool / continue / fail with a plain explanation
              │
              ▼
      RESULT (markdown, files, proposal, post) ─► activity log ─► notifications ─► memory
```

## Layout

| Path | Purpose |
|---|---|
| `app/(app)/*` | Dashboard pages (React, client components polling the API) |
| `app/api/*` | REST API route handlers (validated with zod, wrapped by `lib/api.ts`) |
| `proxy.ts` | Next.js 16 proxy: auth gate for pages + CSRF origin check for mutating API calls |
| `components/` | UI kit, app shell, run view, approval card, workflow builder |
| `lib/` | env, db (+RLS sessions), auth, crypto, permissions, templating, rate limit, circuit breaker, time |
| `components/voice/` | Voice assistant: wake word, push-to-talk, Whisper fallback, spoken replies, orb UI |
| `services/language/` | Urdu / Roman-Urdu detection & normalisation, AI translation fallback, localized replies |
| `agents/` | intent detection, planner, command handling + automation discovery |
| `tools/` | tool interface (`types.ts`), registry, implementations in `tools/impl/*` |
| `workflows/` | step/plan types, engine, templates, natural-language automation parser |
| `automations/` | automation CRUD, scheduling (croner), event triggers |
| `workers/` | Postgres job queue, worker runtime (embedded or standalone), one-shot worker |
| `automation/browser/` | Playwright session + reusable browser agents (read, extract, screenshot, interact, download) |
| `services/` | AI router & providers, documents (parse/generate/analyze), research, storage, notifications, tasks, content, image generation, approvals, users |
| `integrations/` | Social adapters (Meta, YouTube, TikTok, Snapchat), OAuth, integration catalog |
| `database/migrations` | SQL migrations (core, content studio, RLS) |
| `tests/` | unit, integration (real Postgres), e2e (Playwright) |

## Key design decisions

- **Plans come only from the user's words.** External content (web pages, files, emails) can only flow
  into text-generation steps; it can never add steps or tools. This is the main prompt-injection defence.
- **Approve exactly what runs.** When a step needs approval, the resolved input is stored on the approval;
  after approval the engine runs that stored (or user-edited, re-validated) input — not a re-computation.
- **Durable runs.** A run is a persisted plan + context. Pausing (approval/delay) just ends the job;
  resuming is a new `run.advance` job. Crashed jobs are re-queued by maintenance.
- **One queue, no Redis.** `jobs` table with `FOR UPDATE SKIP LOCKED`; multiple workers are safe. Schedules
  are claimed atomically so no automation runs twice.
- **RLS everywhere.** Each user request runs `SET LOCAL ROLE cc_user` + `app.user_id`; policies enforce
  `user_id = cc_uid()`. Long-running work uses `userDb()` (one short RLS transaction per query).
- **Offline first.** `services/ai/offline.ts` provides extractive summaries, keyword/date/action-item
  extraction; planners and caption writers have deterministic templates. AI improves output but is never required.
- **Model router.** local (Ollama) → free API → paid (only when enabled, with a monthly cap). Availability is
  cached; identical prompts are cached for 10 minutes; every call is logged in `ai_usage`.
- **Tool contract.** `{ name, description, category, input (zod), risk | risk(input), retryable, timeoutMs,
  describe, verify, autoApprove, execute }`. Adding a tool = one object + one line in `tools/registry.ts`.
- **Integrations are isolated** behind small interfaces (`SocialAdapter`, notification channels, search
  providers, image providers) so new ones are drop-in.

## Data model (main tables)

users, profiles, settings · projects, tasks, task_dependencies · automations, automation_runs,
workflow_steps, jobs, webhooks · tools, tool_permissions, approvals, activity_logs · files, documents ·
memories · integrations, ai_models, ai_usage · notifications, command_history, automation_suggestions,
web_monitors, system_status · brands, products, campaigns, content_posts, captions, hashtags,
generated_images, social_accounts, publishing_jobs, analytics.

All ids are UUIDs, every table has timestamps, foreign keys and indexes on hot paths.

## Extending

- **New tool**: create it in `tools/impl/…` with `defineTool`, add it to `TOOLS`; it appears in the builder,
  permissions page and planner validation automatically.
- **New intent**: add a rule in `agents/intent.ts` and a case in `agents/planner.ts`.
- **New social platform**: implement `SocialAdapter` in `integrations/social/` and register it.
- **New AI provider**: implement `AIProvider` in `services/ai/providers/`.
- **Future**: voice (Web Speech API → command box), WhatsApp (official Cloud API adapter), mobile/desktop
  (the PWA is installable today; Capacitor/Tauri can wrap it).
