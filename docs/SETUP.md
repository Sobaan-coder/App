# Setup

## Requirements

- **Node.js 20+** (22 recommended) — `node -v`
- **PostgreSQL 14+** — either local, or a free **Supabase** project
- Optional: **Ollama** (local AI), **Chromium for Playwright** (browser automation)

## 1. Install

```bash
git clone <your repo url> && cd App
npm install
npm run setup        # writes .env with random AUTH_SECRET + ENCRYPTION_KEY (never overwrites an existing .env)
```

## 2. Database

### Option A — local Postgres (fully offline, $0)

```bash
# Ubuntu/Debian
sudo apt install postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE command_center;"
# macOS: brew install postgresql@16 && brew services start postgresql@16 && createdb command_center
```

`.env`:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/command_center
```

### Option B — Supabase free tier

1. Create a project at https://supabase.com (free plan).
2. **Project Settings → Database → Connection string → Session pooler** (port 5432). Copy it.
3. `.env`:
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   DATABASE_SSL=require
   ```

> The app connects as the `postgres` role and switches to a restricted `cc_user` role for every user
> request, so Row Level Security applies. Migrations create that role automatically.

## 3. Migrate and run

```bash
npm run db:migrate          # creates all tables, indexes, RLS policies, tool registry
npm run build
npm start                   # http://localhost:3000  (or `npm run dev` while developing)
```

Open the app and **create your account** — the first account becomes **admin**. Later sign-ups are
closed unless `ALLOW_SIGNUP=true` (admins can add users in **Admin**, or `npm run user:create`).

Each new account gets a starter workspace: the **Merchants** brand (THE MERCHANTS' COMPANY ·
TRADING FLAVORS SINCE 2026) with products, a **Study** project and a couple of tasks. Product prices
are deliberately empty — set them in **Content → Brands & Products** (the bot never invents prices).

Optional demo account: set `SEED_EMAIL` / `SEED_PASSWORD` and run `npm run db:seed`.

## 4. Optional free upgrades

| Want | Do |
|---|---|
| AI-written text & smarter planning (local) | Install https://ollama.com, `ollama pull llama3.2`, set `OLLAMA_MODEL=llama3.2` |
| Cloud free tier instead | Set `OPENAI_COMPAT_BASE_URL/API_KEY/MODEL` (Groq, OpenRouter `:free`, Gemini) |
| Browser automation | `npx playwright install chromium` (or `PLAYWRIGHT_CHROMIUM_PATH`) |
| Better web search | Self-host SearXNG (`SEARXNG_URL`) or Brave free plan (`BRAVE_API_KEY`). Wikipedia works with no key. |
| Images from Gemini | `GEMINI_API_KEY` from https://aistudio.google.com/apikey (use a project **without billing** to guarantee $0) |
| Local images | AUTOMATIC1111/Forge with `--api`, set `LOCAL_SD_URL` |
| Telegram alerts | Create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, enable in Settings → Notifications |
| Email | `SMTP_*` (e.g. Gmail app password), enable in Settings |
| OCR | Works out of the box via tesseract.js (downloads English data on first use) |

Check everything in **System Health** and **AI Usage & Cost**.

## 5. Verify

```bash
npm run typecheck
npm test               # unit + integration (uses the command_center_test database)
npm run test:e2e       # Playwright end-to-end (needs `npm run build` first)
```

Create the test database once: `createdb command_center_test` (or `psql -c "CREATE DATABASE command_center_test;"`).
Override with `TEST_DATABASE_URL`.
