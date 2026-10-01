# KHOKHAR on Windows — complete guide

**Goal:** you switch on your PC → KHOKHAR starts by itself → you say **"KHOKHAR …"** → it answers and does the job.
Works on **Windows 10 and 11**. Cost: **$0**.

> **Short version:** download the project → double-click `scripts\windows\install.bat` → answer 1 question
> (a database password) → when the KHOKHAR window opens, create your account and click **Allow** on the microphone.
> Done. The rest of this page explains every step and what to do if something goes wrong.

---

## What you need

| | Minimum | Recommended |
|---|---|---|
| Windows | 10 (version 1809+) or 11 | 11 |
| RAM | 4 GB | 8 GB+ (16 GB if you want the local AI) |
| Free disk | 3 GB | 10 GB (local AI model ≈ 5 GB) |
| Microphone | any (laptop mic is fine) | a headset or USB mic for noisy rooms |
| Internet | for the first install, and for **voice recognition in Chrome/Edge** | |
| Browser | **Google Chrome** (best Urdu recognition) or Microsoft Edge (already installed) | Chrome |

---

## Step 1 — Download KHOKHAR

**Option A — ZIP (easiest)**
1. Open the repository on GitHub (signed in to your account) → green **Code** button → **Download ZIP**.
2. Right-click the ZIP → **Extract All…** → extract to a simple folder, for example **`C:\KHOKHAR`**.
   (Avoid OneDrive folders like *Documents* or *Desktop* — syncing slows the app down.)
3. Open the folder: you should see `package.json`, `app`, `scripts`, … directly inside `C:\KHOKHAR`.
   If you see one more folder inside, move its contents up so `package.json` is directly in `C:\KHOKHAR`.

**Option B — Git (easier to update later)**
```powershell
winget install --id Git.Git -e
# close and reopen PowerShell, then:
git clone https://github.com/<your-account>/<repo>.git C:\KHOKHAR
```

---

## Step 2 — Run the installer

1. Open `C:\KHOKHAR\scripts\windows\`.
2. Double-click **`install.bat`**.
   - If Windows shows *"Windows protected your PC"* → **More info** → **Run anyway** (it's your own script).
   - If it asks *"Do you want to allow this app to make changes"* (while installing Node.js/PostgreSQL) → **Yes**.
3. It asks one question: **a new password for the database.** Type one (letters and numbers, e.g. `Khokhar2026`)
   and **write it down**. If PostgreSQL is already installed, type the password you chose back then.
4. Wait 5–15 minutes. It does all of this for you:

| # | Step | Notes |
|---|---|---|
| 1 | Installs **Node.js LTS** | via winget (built into Windows) |
| 2 | Installs **PostgreSQL 17** (the database) | runs as a Windows service, starts with Windows |
| 3 | `npm ci` — downloads the app's packages | ~400 MB |
| 4 | Creates **`.env`** with fresh secret keys | never share this file |
| 5 | Creates the database + tables | |
| 6 | Installs the browser-automation engine | optional; skipped if it fails |
| 7 | Builds the app | |
| 8 | **Autostart**: a Windows Scheduled Task "KHOKHAR AI Command Center" | runs 20 s after you sign in |
| 9 | **KHOKHAR** shortcut on the Desktop and in the Start menu | |
| 10 | Starts KHOKHAR | the KHOKHAR window opens |

**Installer options** (run from PowerShell in `C:\KHOKHAR`):
```powershell
# also install the FREE local AI brain (recommended if you have 8 GB+ RAM)
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1 -WithAI
# 8 GB RAM laptop: smaller model
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1 -WithAI -AIModel qwen2.5:3b
# use Microsoft Edge for the KHOKHAR window instead of Chrome
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1 -Browser edge
# never sleep while plugged in (so KHOKHAR is always listening)
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1 -KeepAwake
# use a free Supabase database instead of installing PostgreSQL
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1 -DbUrl "postgresql://postgres.xxxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres"
```
Options can be combined, e.g. `-WithAI -KeepAwake`. Running the installer again is safe — finished steps are skipped.

---

## Step 3 — First start (one time only)

The **KHOKHAR window** opens (a small app window, no address bar).

1. **Create your account** → name, email, password. The first account is the admin.
   You stay signed in for a year on this PC.
2. The browser asks **"Use your microphone?"** → **Allow**. (It's remembered — KHOKHAR has its own browser
   profile, separate from your normal Chrome.)
3. Look at the purple orb at the bottom-right: the **ear icon** is on = hands-free listening.
4. Say: **"KHOKHAR, what's your name?"** → you hear a reply.
5. Set your language: open **Settings** (left menu; on a narrow window: ☰ menu) → tab **Assistant & Voice**:
   - **Listening language**: *اردو (Pakistan)* if you mostly speak Urdu, *English* if you mostly speak English.
     (Roman-Urdu/English mixes work best with *English (India/Pakistan)*.)
   - **Reply language**: *Auto* (answers in the language you used).
   - **Speak replies**: on.

### Spoken Urdu replies (free)
Windows → **Settings → Time & language → Speech → Manage voices → Add voices → Urdu (Pakistan)**.
In Edge the free *Microsoft Online (Natural)* Urdu voices also work automatically.

---

## Step 4 — Check that it starts by itself

1. **Restart** the PC and sign in.
2. Wait ~30–60 seconds (Windows starts, PostgreSQL starts, then KHOKHAR).
3. The KHOKHAR window appears by itself. Say **"KHOKHAR"** → you hear a chime and *"Yes?" / "جی؟"* → say your command.

You can **minimise** the window — it keeps listening. Don't **close** it (closing = KHOKHAR stops listening;
double-click the Desktop **KHOKHAR** shortcut to bring it back).

---

## How to talk to KHOKHAR

Say the name **first**, then the command — in one breath, or wait for the chime:

| You say | KHOKHAR does |
|---|---|
| KHOKHAR, open YouTube · *کھوکھر، یوٹیوب کھولو* · *khokhar youtube kholo* | opens YouTube |
| KHOKHAR, open Notepad / Excel / Word / Chrome / Calculator / Settings | opens the app |
| KHOKHAR, open my Downloads · *ڈاؤن لوڈز کھولو* | opens the folder |
| KHOKHAR, open daraz.pk | opens any website |
| KHOKHAR, lock my PC · *کمپیوٹر لاک کرو* · *pc lock karo* | locks the PC |
| KHOKHAR, restart / shut down my computer · *کمپیوٹر بند کرو* | asks you to type **CONFIRM**, then gives 60 s |
| KHOKHAR, cancel the shutdown | stops a pending shutdown/restart |
| KHOKHAR, plan my day · *میرا دن پلان کرو* | builds your day plan from your tasks |
| KHOKHAR, remind me tomorrow at 5 pm to call Ali · *کل شام 5 بجے علی کو کال کرنے کی یاد دلانا* | creates a reminder |
| KHOKHAR, research electric bikes in Pakistan and make a report | web research → report document |
| KHOKHAR, summarize the documents I added today | summary |
| KHOKHAR, every Monday at 8 am check my unfinished tasks and notify me | creates an automation |
| KHOKHAR, create today's Merchants post | Content Studio post + image + captions |
| KHOKHAR, remember that our brand colour is gold | saves to memory |
| KHOKHAR, what did you do today? · *آج کیا کیا؟* | activity summary |
| KHOKHAR, any question (*"how do I make biryani?"*) | needs the local AI (`-WithAI`) — see below |

**Safety:** anything that sends, publishes, deletes, moves many files, restarts or shuts down **asks you first**
(the approval card appears in the KHOKHAR window; for HIGH-risk actions you type `CONFIRM`). Nothing is
ever sent or posted without you.

### "Can it do anything I can imagine?" — honestly
KHOKHAR does what its **tools** can do (the table above, plus files, documents, spreadsheets, web pages, email
drafts, Telegram notifications, social posting via official APIs, automations — 55+ tools). For **free-form
questions and conversation** it needs an AI brain:

| Brain | Cost | How |
|---|---|---|
| Built-in offline engine | $0 | always on — handles commands, plans, summaries, templates; **can't chat freely** |
| **Ollama + qwen2.5** (local, private) | $0 | `install.ps1 -WithAI` — understands Urdu & English, answers questions |
| Free cloud tier (Groq / Gemini / OpenRouter free models) | $0 within free limits | put the URL/key/model in `.env` (`OPENAI_COMPAT_*`) — see [FREE_TOOLS.md](FREE_TOOLS.md) |

It **cannot**: run arbitrary programs or commands you didn't whitelist (on purpose — a voice command must never be
able to wipe your disk), click around inside other desktop apps, bypass logins/CAPTCHAs, or post to platforms
without their official API. Want another app or site in the "open" list? Add it to `tools/impl/pc.ts`
(`SITES` / `APPS`), then `npm run build`.

---

## Daily use

| Want to… | Do this |
|---|---|
| Open the KHOKHAR window | Desktop / Start menu → **KHOKHAR** |
| Stop KHOKHAR now | PowerShell in `C:\KHOKHAR`: `powershell -ExecutionPolicy Bypass -File scripts\windows\stop-khokhar.ps1` |
| Start it again | Desktop **KHOKHAR** shortcut (or `scripts\windows\start-khokhar.bat`) |
| Turn off autostart | `powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Uninstall` |
| Turn autostart back on | `powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1` |
| Pause listening for a while | click the **ear** icon in the KHOKHAR window (click again to resume) |
| Rename KHOKHAR | Settings → Assistant & Voice → Name (the wake word changes too) |
| Use it from your phone | see [MOBILE.md](MOBILE.md) (Tailscale, free) |

### Update to a new version
```powershell
cd C:\KHOKHAR
powershell -ExecutionPolicy Bypass -File scripts\windows\stop-khokhar.ps1
git pull                       # or download the new ZIP and copy it over (keep your .env!)
npm ci
npm run db:migrate
npm run build
powershell -ExecutionPolicy Bypass -File scripts\windows\khokhar.ps1
```

### Backups
Your data lives in PostgreSQL + the `storage` folder. Back up once a week:
```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -d command_center -f "$HOME\Documents\khokhar-backup.sql"
```
Also copy `C:\KHOKHAR\storage` and `C:\KHOKHAR\.env` somewhere safe (USB / private cloud).

---

## Keep it listening — Windows settings that matter

| Setting | Where | Why |
|---|---|---|
| Don't sleep when plugged in | Settings → System → Power → *Screen and sleep* → "When plugged in, put my device to sleep after" → **Never** (or install with `-KeepAwake`) | a sleeping PC can't hear you |
| Microphone access | Settings → Privacy & security → **Microphone** → *Microphone access* **On** and *Let desktop apps access your microphone* **On** | otherwise the browser gets silence |
| Default microphone | Settings → System → Sound → *Input* → choose your mic, speak and watch the bar | the wrong input = no reaction |
| Chrome/Edge background | Chrome → Settings → System → *Continue running background apps when Chrome is closed* (optional) | |
| Battery saver | off while you want hands-free | Windows may throttle the browser |

The screen **may** turn off and lock (`Win + L`) — KHOKHAR keeps running. When the PC is **locked**, Windows
still lets the browser hear the microphone, but KHOKHAR can't open apps on a locked screen.

---

## Troubleshooting

Logs are in **`%LOCALAPPDATA%\KHOKHAR\logs`** (paste that into the Explorer address bar):
`launcher.log` (what the autostart did), `server.log` (the app), `build.log`.

| Problem | Fix |
|---|---|
| Nothing opens after sign-in | Wait 1 minute. Then Task Scheduler → *Task Scheduler Library* → **KHOKHAR AI Command Center** → *Last Run Result* and read `launcher.log`. Run the Desktop shortcut to test. |
| "server did not start" / `ECONNREFUSED 5432` in `server.log` | PostgreSQL isn't running: `Win + R` → `services.msc` → **postgresql-x64-17** → *Start*, and set *Startup type* = **Automatic**. |
| `password authentication failed` | Wrong DB password in `.env`. Run the installer again with `-DbPassword YOURPASSWORD`. |
| It doesn't react to "KHOKHAR" | (1) Is the ear icon on? (2) Windows mic privacy settings above. (3) Click the orb and speak — do you see your words? If not, it's the mic. (4) Say the name clearly **first**: "KHOKHAR … open YouTube". (5) Listening language: Urdu speakers often get the name recognised better with *English (Pakistan/India)*. |
| "network" error in the voice panel | Chrome/Edge speech recognition uses Google/Microsoft servers — needs internet. For offline: set up the Whisper engine ([VOICE.md](VOICE.md)). KHOKHAR retries automatically. |
| It hears me but replies in the wrong language | Settings → Assistant & Voice → Reply language → *Auto* / *اردو* / *English*. |
| No spoken Urdu reply | Install the Urdu voice (Step 3) or use Edge (`install-autostart.ps1 -Browser edge`). |
| Two KHOKHAR windows | close one — they would compete for the microphone. The launcher never opens a second one by itself. |
| `npm` / `node` not recognised | Close and reopen PowerShell (PATH refresh) or restart the PC. |
| Port 3000 busy | add `PORT=3001` to `.env`, then run the launcher again. |
| "running scripts is disabled on this system" | always run scripts with `powershell -ExecutionPolicy Bypass -File …` (or the `.bat` files). |
| Opening apps says "works when KHOKHAR runs on your Windows PC" | you're using KHOKHAR from a phone/another PC — PC control acts on the computer running the server. |

Still stuck? `npm run doctor` in `C:\KHOKHAR` checks everything and tells you what to fix.

---

## Privacy & cost

- Everything runs **on your PC**; the app only listens on `localhost` unless you add phone access.
- **Voice recognition** in Chrome/Edge is done by Google/Microsoft's free speech service (audio leaves your PC
  while you speak a command). For fully offline voice use the Whisper engine ([VOICE.md](VOICE.md)).
- Local AI (Ollama) is 100 % offline. Cloud AI tiers are optional and labelled; KHOKHAR never uses a paid service
  unless you switch it on.
- Total cost: **$0**.
