# Free tools & dependencies

Policy: **$0 first** — local/open-source → free APIs → free tiers → self-hosted → paid only if you
explicitly enable it. Anything that can cost money is labelled **PAID DEPENDENCY** in the app.

## Runtime services

| Tool | Purpose | Free limit | Alternative | API key? | Local? |
|---|---|---|---|---|---|
| Node.js | Runtime | Free (OSS) | — | No | Yes |
| Next.js 16 / React 19 | Web app | Free (OSS) | — | No | Yes |
| PostgreSQL | Database | Free (OSS) | Supabase free tier | No | Yes |
| Supabase | Hosted Postgres | Free plan: 500 MB DB, pauses after 7 days idle | Local Postgres | DB password | No |
| Built-in auth (bcrypt + JWT) | Accounts & sessions | Free | Supabase Auth (swap later) | No | Yes |
| Postgres job queue | Background jobs | Free | — | No | Yes |
| croner | Cron schedules | Free (OSS) | — | No | Yes |
| Playwright + Chromium | Browser automation | Free (OSS) | Plain HTTP fetch (already the default for reading pages) | No | Yes |

## AI

| Tool | Purpose | Free limit | Alternative | API key? | Local? |
|---|---|---|---|---|---|
| Offline engine (built-in) | Planning, extractive summaries, templates | Unlimited | — | No | Yes |
| **Ollama** | Local LLM (llama3.2, qwen2.5, mistral…) | Unlimited (your hardware) | LM Studio / llama.cpp server (OpenAI-compatible) | No | Yes |
| Groq | Fast free-tier LLM API | Rate-limited free tier | OpenRouter `:free` models | Yes | No |
| OpenRouter `:free` models | Free LLMs | Daily request limits | Groq | Yes | No |
| Gemini API (text) | LLM via OpenAI-compatible endpoint | Free tier quotas (varies by model) | Ollama | Yes | No |
| OpenAI / other paid APIs | LLM | **PAID DEPENDENCY** — off unless "Allow paid" | Any free option above | Yes | No |

## Images

| Tool | Purpose | Free limit | Alternative | API key? | Local? |
|---|---|---|---|---|---|
| Built-in brand card renderer (sharp) | Always-available branded graphic | Unlimited | — | No | Yes |
| Gemini image model | Photorealistic images | Only if your key has free quota for the image model (often not); with a no-billing project you can never be charged | Manual Gemini workflow in the free Gemini app | Yes | No |
| Manual Gemini workflow | Copy prompt → gemini.google.com → upload | Free with a Google account (app limits apply) | — | No | — |
| Stable Diffusion (A1111/Forge/SD.Next) | Local images | Unlimited (needs a GPU) | Pollinations | No | Yes |
| Pollinations.ai | Free public image API | Free, rate-limited; **sends prompts to a third party** (opt-in) | Local SD | No | No |

## Documents, research, notifications

| Tool | Purpose | Free limit | Alternative | API key? | Local? |
|---|---|---|---|---|---|
| unpdf / mammoth / exceljs / papaparse | Read PDF/DOCX/XLSX/CSV | Free (OSS) | — | No | Yes |
| tesseract.js | OCR for images | Free (downloads language data once) | — | No | Yes |
| pdf-lib / docx / exceljs / jszip | Create PDF/DOCX/XLSX/ZIP | Free (OSS) | — | No | Yes |
| Wikipedia API | Research (background facts) | Free, fair use | SearXNG | No | No |
| SearXNG | Private meta-search | Free (self-hosted) | Brave free plan | No | Yes |
| Brave Search API | Web search | Free plan with monthly quota | SearXNG | Yes | No |
| Browser Notification API | Desktop/mobile alerts | Free | — | No | Yes |
| Telegram Bot API | Notifications | Free | Email | Bot token | No |
| SMTP (your mailbox) | Email notifications / sending | Free with your account's sending limits | Telegram | Password/app password | No |

## Social publishing (official APIs only)

| Platform | Automated for $0? | Notes |
|---|---|---|
| Facebook Pages | ✅ Graph API | Free; Page access token |
| Instagram Business/Creator | ✅ Content Publishing API | Free; needs public HTTPS image URL (`PUBLIC_BASE_URL`) |
| TikTok | ⚠️ Content Posting API | Free; private-only until TikTok audits your app; domain verification required |
| YouTube | ⚠️ Data API v3 | Free quota (10,000 units/day, ~1,600 per upload); videos only; default private |
| Snapchat | ❌ | No public organic-posting API → manual package |
| WhatsApp | ❌ (planned) | Only via official WhatsApp Business Cloud API (Meta pricing applies) |

## Hosting

| Option | Free limit | Notes |
|---|---|---|
| Your own computer / Raspberry Pi | Free | Recommended; everything in one process |
| Oracle Cloud Always Free VM | Always Free resources | Good always-on host |
| Cloudflare Tunnel | Free | Public HTTPS URL without opening ports |
| Netlify / Vercel | Free hobby tiers | Frontend only; serverless disk is ephemeral; run the worker elsewhere |
| GitHub Actions / system cron | Free minutes (Actions) | `npm run worker:once` |
