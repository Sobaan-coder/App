# REST API

All endpoints are JSON, under `/api`, require the session cookie (sign in via `/api/auth/login`) unless
marked **public**, and validate input with zod (errors: `400 {error, code:"validation_error", details}`).
Mutating requests must come from the same origin (CSRF check). Errors: `{ error, code }` with
401 unauthorized · 403 forbidden/csrf · 404 not_found · 409 conflict · 429 rate_limited · 500 internal.

## Auth
| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/signup` | `{email, password, name?, timezone?}` → sets cookie. First user = admin. |
| POST | `/auth/login` | `{email, password}` → sets cookie |
| POST | `/auth/logout` | `?everywhere=1` revokes all sessions |
| GET/PATCH | `/auth/me` | profile; PATCH `{name?, timezone?, workStart?, workEnd?, language?, onboardingCompleted?}` |

## Agent
| Method | Path | Notes |
|---|---|---|
| POST | `/command` | `{text, projectId?}` → `{runId, intent, goal, steps[], requiresApproval, suggestion}` |
| GET | `/runs` | `?status=active|queued,running…&automationId=&limit=&offset=` |
| GET | `/runs/:id` | run, plan steps (with risk), step statuses, approvals, audit trail |
| POST | `/runs/:id` | `{action: "cancel"|"retry"}` |
| GET | `/dashboard` | counts, queue, approvals, tasks, activity, suggestion, status |

## Approvals
| Method | Path | Notes |
|---|---|---|
| GET | `/approvals` | `?status=pending|approved|rejected|all` |
| GET | `/approvals/:id` | includes the tool's JSON schema (for editing) |
| POST | `/approvals/:id` | `{decision:"approve"|"reject", editedInput?, confirmText?:"CONFIRM", note?}` |

## Tasks & projects
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/tasks` | GET `?status=open|completed|…&projectId=&q=`; POST `{text}` (natural language) or structured fields |
| PATCH/DELETE | `/tasks/:id` | status/priority/dueAt/projectId/…; completing a recurring task creates the next one |
| GET/POST | `/projects` | POST `{name, description?, kind: general|business|study|personal}` |
| GET/PATCH | `/projects/:id` | workspace: tasks, files, notes, automations, activity |

## Automations
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/automations` | POST `{templateKey, params}` or `{draft:{name, description, trigger, steps}}` |
| GET/PATCH/DELETE | `/automations/:id` | PATCH `{enabled?, name?, trigger?, steps?}` |
| POST | `/automations/:id/run` | `{triggerData?}` |
| GET | `/automations/templates` | templates + tool catalog |
| POST | `/automations/preview` | `{text}` → draft (nothing created) |
| POST | `/hooks/:token` | **public** webhook trigger (rate-limited) → `202 {runId}` |
| GET/POST | `/suggestions`, `/suggestions/:id` | `{action:"accept", cron?}` / `{action:"dismiss"}` |

## Files & memory
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/files` | GET `?folder=&q=&projectId=&archived=1`; POST multipart `file` (multiple), `folder`, `projectId` |
| GET/PATCH | `/files/:id` | GET downloads (`?inline=1` for safe types, `?meta=1` for summary); PATCH `{name?, folder?, tags?, projectId?, archived?}`. DELETE is refused by design. |
| POST | `/files/:id/process` | summarise as a run |
| GET/POST | `/memory` | POST `{category, subject, content, projectId?, importance?}` |
| PATCH/DELETE | `/memory/:id` | DELETE = "forget this" |

## System
| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/settings` | GET also returns which server keys are configured (never values) |
| GET/PUT | `/tools` | permissions; PUT `{tool, mode: auto|approval|confirm|disabled|null, enabledGlobally? (admin)}` |
| GET | `/usage` | AI usage, cost, provider status |
| GET | `/health` | database, AI, worker, scheduler, browser, storage |
| GET | `/health/live` | **public** liveness |
| GET | `/activity` | `?status=&category=&q=` |
| GET/POST | `/notifications` | POST `{ids}` or `{all:true}` marks read |
| GET | `/integrations` | catalog with configured state |
| GET/POST | `/admin/users` | admin only |

## Content Studio
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/content/brands`, PATCH/DELETE `/content/brands/:id` | brand memory |
| GET/POST | `/content/products`, PATCH/DELETE `/content/products/:id` | adding a product/offer fires product/deal events |
| GET/POST | `/content/posts` | GET `?from=&to=&status=`; POST creates a post as a run (never publishes) |
| GET/PATCH/DELETE | `/content/posts/:id` | PATCH captions/platforms/scheduledAt (re-runs quality checks) |
| POST | `/content/posts/:id/actions` | `{action: approve_publish|schedule|reject|regenerate|regenerate_image|recheck|fetch_analytics, platforms?, scheduledAt?, provider?}` |
| POST | `/content/posts/:id/image` | multipart replacement image |
| GET | `/content/posts/:id/package` | ZIP: image, per-platform .txt, image-prompt.txt, metadata.json |
| GET | `/content/accounts`; PUT/POST/DELETE `/content/accounts/:platform` | connect with token / test / disconnect / autoPublish / config |
| POST | `/content/accounts/meta-select` | `{pageId}` after Meta OAuth |
| GET | `/content/analytics` | real metrics only; `null` = unavailable |
| GET | `/integrations/oauth/:provider/start` → `/integrations/oauth/callback/:provider` | meta, youtube, tiktok |
| GET | `/public/media/:token` | **public**, signed 24h image URLs |
