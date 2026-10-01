# Troubleshooting

Start with **System Health** (`/health`) — it checks the database, AI provider, worker, scheduler,
browser and storage, with a reason for anything not green.

| Symptom | Cause / fix |
|---|---|
| `Invalid environment configuration` on start | Missing `DATABASE_URL` or `AUTH_SECRET` (≥32 chars). Run `npm run setup`, then edit `.env`. |
| `ECONNREFUSED 5432` | Postgres isn't running: `sudo systemctl start postgresql` (Linux) / `brew services start postgresql@16`. |
| Supabase: `self signed certificate` / SSL errors | Set `DATABASE_SSL=require`. Use the **Session pooler** URL (port 5432). |
| `permission denied to grant role` during migration on hosted Postgres | Connect as the database owner (`postgres` on Supabase). |
| Commands stay **QUEUED** | No worker. Locally keep `EMBEDDED_WORKER=true`; with Netlify/Vercel run `npm run worker` (or cron `npm run worker:once`). Header shows **WORKER OFFLINE**. |
| "AI ONLINE · $0 MODE" and plain-looking text | No model reachable — the offline engine is working. Install Ollama + `ollama pull llama3.2` and set `OLLAMA_MODEL`. Check AI Usage → router status for the exact reason. |
| Ollama "model not pulled" | `ollama pull <model>`; the name in `OLLAMA_MODEL` must match `ollama list`. |
| "Paid API usage may occur" | You enabled paid usage in Settings → AI. Turn it off to return to FREE MODE. |
| Research: "No search results … HTTP 403" | Your network blocks Wikipedia/search. Add `SEARXNG_URL` (self-hosted) or `BRAVE_API_KEY`. |
| Browser worker warning / "Could not start the browser" | `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH`. On Linux servers: `npx playwright install-deps chromium`. |
| "A CAPTCHA … appeared" | By design the bot stops; finish that step manually. |
| "Gemini API free access is unavailable for this operation" | Your key has no free quota for the image model. The app fell back (local SD / Pollinations / built-in card). Use the manual Gemini workflow on the post page. |
| Instagram/TikTok always "manual required" | `PUBLIC_BASE_URL` must be a public **https** URL to this app (e.g. Cloudflare Tunnel), and the account must be connected. |
| Facebook error "(#200) permissions" / code 190 | Reconnect and grant `pages_manage_posts`; tokens expire if you change your password. |
| YouTube "quota exceeded" | Free quota is ~6 uploads/day. Try tomorrow. |
| Post won't publish: "Fix the quality issues first" | A failing check (wrong price, unavailable product, too long, no image). Fix the product data or edit captions; checks re-run on save. |
| Sign-up says closed | Only the first account can self-register. Set `ALLOW_SIGNUP=true` temporarily, or `npm run user:create`, or Admin → Add user. |
| Locked out | `npm run user:create -- you2@example.com "New-password-123"` and sign in with it (first user stays admin). |
| Scheduled automation didn't run | Is it enabled? Are automations paused? Is the worker online? Check `next run` on the automation page; times use your profile timezone (Settings → Profile). |
| E2E tests can't find Chromium | `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`. |
| Integration tests fail to connect | Create `command_center_test` or set `TEST_DATABASE_URL`. The tests **reset** that database. |

Logs: the server prints `[worker]`, `[scheduler]` and `[startup]` lines; every action is also in **Activity Log**.
