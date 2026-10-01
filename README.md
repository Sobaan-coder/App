# MY AI COMMAND CENTER

> *"I have a digital employee. I tell it what I need, and it handles the work."*

A **$0-first, self-hostable personal AI automation OS** with a built-in **social media Content Studio**.
Type what you need in plain English — it plans the work, picks the tools, runs them, verifies the
result, logs everything, and **asks for your approval before anything sensitive**.

It works **with no AI keys at all** (a deterministic offline engine handles planning, summaries and
writing templates) and gets smarter when you connect a **free local model (Ollama)** or a free API tier.

![stack](https://img.shields.io/badge/Next.js-16-black) ![db](https://img.shields.io/badge/Postgres-Supabase%20compatible-3ecf8e) ![cost](https://img.shields.io/badge/cost-%240-brightgreen)

## What it does

| Area | Highlights |
|---|---|
| **KHOKHAR (کھوکھر)** | Your assistant has a name (rename it). Say **"KHOKHAR, plan my day"** hands-free like Siri, tap the mic, or type — in **English, اردو or Roman Urdu**. Replies are shown and spoken in your language. See [VOICE.md](docs/VOICE.md). |
| **Command box** | "Plan my day", "Summarize the documents I added today", "Research X and create a report", "Every Monday at 8am check my unfinished tasks and notify me", "Create today's Merchants post and publish it to Instagram"… |
| **Agent** | Intent detection → structured plan → tool selection → execution → verification → result → memory. Plans are visible; chain-of-thought is not. |
| **Safety levels** | LOW = automatic · MEDIUM = approval (send, publish, move many files, webhooks) · HIGH = type **CONFIRM** (shell…). Configurable per tool, never weaker than the floor. |
| **Tools (45+)** | tasks, schedules, files, PDF/DOCX/XLSX/CSV/OCR read, PDF/DOCX/XLSX/CSV/MD/TXT create, web search, page reading, Playwright browser, email draft/send, Telegram/email/browser notifications, memory, webhooks, content, images… |
| **Automations** | Schedules (cron, natural language), webhooks, file-added, product/deal events, manual. Visual drag-and-drop builder with conditions, delays, loops, approvals, retries. 11 templates. |
| **Reliability** | Postgres job queue, retries with exponential backoff, timeouts, circuit breakers, durable pause/resume for approvals and delays, clear failure explanations + "retry it". |
| **Memory** | Preferences, project, business and task memory. "Remember…", "Forget…", "What do you remember about…". Refuses to store secrets. |
| **Content Studio** | Brands & products (single source of truth for prices), image prompt engine, image router (Gemini → local Stable Diffusion → Pollinations → built-in card + manual Gemini workflow), per-platform captions, quality control (price/availability/claims/format/duplicates), calendar with drag & drop, queue, approvals, official-API publishing, ZIP packages for manual posting, analytics that never fabricate. |
| **Everything else** | Projects, tasks (natural language), work queue, approval center, activity/audit log, AI usage & `COST = $0` monitor, system health, settings, admin, dark/light, mobile bottom nav, installable PWA. |

## Install

- **PC / laptop (Windows, macOS, Linux):** step-by-step in **[docs/INSTALL_PC.md](docs/INSTALL_PC.md)**
- **iPhone & Android:** install it as an app with voice — **[docs/MOBILE.md](docs/MOBILE.md)**

## Quick start (local, 5 minutes)

```bash
git clone <this repo> && cd App
npm install
npm run setup                 # asks for your database, creates .env with fresh secrets
npm run doctor                # checks everything and tells you what to fix
# edit .env → DATABASE_URL (local Postgres or Supabase)
npm run db:migrate
npm run build && npm start    # or: npm run dev
# open http://localhost:3000 → create your account (the first one becomes admin)
```

The automation worker runs **inside** the server by default (`EMBEDDED_WORKER=true`), so that's all you
need locally. Full instructions: **[docs/SETUP.md](docs/SETUP.md)** · Deploying: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Optional free upgrades:

```bash
# smarter writing & planning, 100% local and free
ollama pull llama3.2          # then OLLAMA_MODEL=llama3.2 in .env
# browser automation
npx playwright install chromium
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js app (+ embedded worker) |
| `npm run worker` | Standalone automation worker (for Netlify/Vercel frontends) |
| `npm run worker:once` | One-shot worker for cron-only hosts |
| `npm run db:migrate` / `npm run db:seed` / `npm run db:reset` | Database |
| `npm run user:create -- email "password" Name` | Create an account from the CLI |
| `npm run typecheck` · `npm test` · `npm run test:e2e` | Quality checks |
| `npm run check` | typecheck + unit/integration tests + production build |

## Honest limits ($0)

- **Instagram / Facebook**: automated via the official Graph API (free) for Pages and Business/Creator accounts. Instagram needs the app reachable on a public HTTPS URL (`PUBLIC_BASE_URL`).
- **TikTok**: official Content Posting API; posts are **private** until TikTok audits your developer app. Otherwise → manual package.
- **YouTube**: the official API uploads **videos** only (Shorts can't be a still image) → image posts get a manual package; uploads default to **private**.
- **Snapchat**: no public organic-posting API → always a manual package. No unofficial automation, ever.
- **Gemini image generation** only works if your key has free quota for the image model; otherwise the app says so and falls back.

See **[docs/FREE_TOOLS.md](docs/FREE_TOOLS.md)** and **[docs/FREE_ARCHITECTURE.md](docs/FREE_ARCHITECTURE.md)** for every dependency and its cost.

## Docs

[VOICE & URDU](docs/VOICE.md) · [SETUP](docs/SETUP.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [FREE_TOOLS](docs/FREE_TOOLS.md) · [FREE_ARCHITECTURE](docs/FREE_ARCHITECTURE.md) · [SECURITY](docs/SECURITY.md) · [AUTOMATIONS](docs/AUTOMATIONS.md) · [API](docs/API.md) · [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) · [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md)
