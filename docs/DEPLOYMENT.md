# Deployment

> Beginner, step-by-step: **[INSTALL_PC.md](INSTALL_PC.md)** (Windows/macOS/Linux) and **[MOBILE.md](MOBILE.md)** (iPhone/Android).

## Which setup should I use?

The app has three parts: the **web app** (Next.js), the **automation worker** (job queue + scheduler)
and **file storage** (uploads, generated images and reports on disk under `STORAGE_DIR`).

| Setup | Cost | Works for | Notes |
|---|---|---|---|
| **A. One always-on machine** (your PC, a Raspberry Pi, a home server, Oracle Cloud *Always Free* VM) running `npm start` | $0 | Everything | **Recommended.** Web + embedded worker + persistent files in one process. Add a free Cloudflare Tunnel for a public HTTPS URL. |
| **B. Netlify/Vercel frontend + worker on your own machine** | $0 | Commands, tasks, automations | ⚠️ Serverless filesystems are **ephemeral**: uploads and generated files written by the web functions are lost. Use only if you don't rely on file uploads from the web app, or keep using setup A for files. |
| **C. Cron-only** (`npm run worker:once` every 5 min) | $0 | Hosts without long-running processes | Schedules fire with up to ~5 min delay. |

Database for every setup: local Postgres or **Supabase free tier** (see [SETUP.md](SETUP.md)).

---

## A. Single machine (recommended)

```bash
git clone <repo> && cd App
npm ci
npm run setup                     # then edit .env (DATABASE_URL, APP_URL…)
npm run db:migrate
npm run build
npm start                         # http://localhost:3000 (PORT=xxxx to change)
```

### Keep it running

**systemd** (`/etc/systemd/system/command-center.service`):

```ini
[Unit]
Description=AI Command Center
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/you/App
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
User=you

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now command-center
journalctl -u command-center -f
```

Or **pm2**: `npm i -g pm2 && pm2 start npm --name command-center -- start && pm2 save && pm2 startup`.

### Public HTTPS URL for free (needed for Instagram/TikTok, and for phone access)

[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) is free:

```bash
cloudflared tunnel --url http://localhost:3000     # quick test URL
```

For a stable hostname create a named tunnel, then set in `.env`:

```
APP_URL=https://cc.yourdomain.com
PUBLIC_BASE_URL=https://cc.yourdomain.com
```

### Oracle Cloud Always Free VM

Create an Ampere A1 (Always Free) Ubuntu VM, install Node 22 + Postgres (or use Supabase), then follow the
steps above. Keep billing alerts on; Always Free resources do not charge.

---

## B. Netlify (or Vercel) frontend + separate worker

1. Push the repo to GitHub.
2. Netlify → **Add new site → Import from Git**. Netlify detects Next.js automatically (OpenNext adapter).
   - Build command: `npm run build` · Publish directory: `.next`
3. **Site settings → Environment variables**: `DATABASE_URL`, `DATABASE_SSL=require`, `AUTH_SECRET`,
   `ENCRYPTION_KEY`, `APP_URL=https://<site>.netlify.app`, `PUBLIC_BASE_URL` (same), and
   **`EMBEDDED_WORKER=false`** (serverless functions can't run a background worker).
   Add any optional AI/social keys there — never in frontend code.
4. Run the worker somewhere always-on (your PC is fine), with the **same** `.env`:
   ```bash
   npm run worker
   ```
5. Run migrations once from your machine: `npm run db:migrate`.

Vercel is identical (Project → Settings → Environment Variables).

> Limitation (honest): files uploaded through the serverless site are stored on an ephemeral disk.
> Moving storage to Supabase Storage is on the roadmap; until then prefer setup A for file workflows.

---

## C. Cron-only worker

```cron
*/5 * * * * cd /home/you/App && /usr/bin/npm run worker:once >> /tmp/cc-worker.log 2>&1
```

It starts due schedules, processes queued jobs for up to 4 minutes, and exits.

---

## Supabase setup (free)

1. https://supabase.com → New project (free plan). Save the database password.
2. Project Settings → Database → **Session pooler** connection string → `DATABASE_URL`; set `DATABASE_SSL=require`.
3. `npm run db:migrate` from your machine. All tables get Row Level Security; the app uses its own
   `cc_user` role. (Supabase Auth is not used — the app has built-in auth so it also runs offline.)
4. Free-tier projects pause after a week of inactivity — any request wakes them, or keep the worker running.

## Social accounts (official APIs, all free)

| Platform | What to create | Env vars | Redirect URI |
|---|---|---|---|
| Facebook + Instagram | Meta developer app (Business type) with *Facebook Login for Business*; your Instagram must be a Business/Creator account linked to a Page | `META_APP_ID`, `META_APP_SECRET` | `${APP_URL}/api/integrations/oauth/callback/meta` |
| YouTube | Google Cloud project → enable *YouTube Data API v3* → OAuth client (Web) | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | `${APP_URL}/api/integrations/oauth/callback/youtube` |
| TikTok | TikTok for Developers app with *Content Posting API* (`video.publish`), verify the domain of `PUBLIC_BASE_URL` | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `${APP_URL}/api/integrations/oauth/callback/tiktok` |
| Snapchat | — (no public organic-posting API) | — | — |

Then open **Content → Social Accounts → Connect**. Alternatively paste tokens via **Use access token**
(e.g. a Page access token from Meta's Graph API Explorer). Tokens are encrypted at rest.

While Meta/Google apps are in *development/testing* mode, only accounts added as testers can connect — that's
fine for personal use and requires no app review.

## Production checklist

- [ ] `AUTH_SECRET` and `ENCRYPTION_KEY` are long random values (run `npm run setup`), different per environment
- [ ] `ALLOW_SIGNUP=false` after creating your account
- [ ] HTTPS in front of the app (Cloudflare Tunnel / reverse proxy) — cookies become `Secure` automatically
- [ ] `SHELL_COMMANDS_ENABLED=false` unless you really need it
- [ ] Backups: `pg_dump` your database and copy `STORAGE_DIR` regularly
- [ ] `npm run check` passes
