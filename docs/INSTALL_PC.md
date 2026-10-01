# Run KHOKHAR on your PC or laptop (Windows · macOS · Linux)

Your computer runs everything: the app, the automation worker and your files. Cost: **$0**.
Time: ~20 minutes the first time. You'll install 3 free things: **Git**, **Node.js** and **PostgreSQL**
(or use the free Supabase cloud database instead of installing PostgreSQL).

> Use a PC/laptop that stays on when you want automations (daily plans, scheduled posts) to run on time.
> Phones then connect to it — see [MOBILE.md](MOBILE.md).

---

## Windows 10 / 11

### 1. Install the tools (one time)
1. **Node.js** → https://nodejs.org → download **LTS** (22.x) → run the installer → keep the defaults
   (tick *"Automatically install the necessary tools"* if it asks).
2. **Git** → https://git-scm.com/download/win → install with defaults.
3. **PostgreSQL** → https://www.postgresql.org/download/windows/ → *Download the installer* (EDB) → version 16 or 17.
   - Set a password for the `postgres` user and **write it down** (e.g. `postgres`).
   - Port **5432**, everything else default. You can untick *Stack Builder* at the end.
   - *Prefer no install?* Use Supabase instead (free cloud database): create a project at https://supabase.com
     and copy **Project Settings → Database → Connection string → Session pooler**.

### 2. Get the app
Open **PowerShell** (Start menu → type *PowerShell*) and run:
```powershell
cd $HOME\Documents
git clone https://github.com/Sobaan-coder/App.git khokhar
cd khokhar
git checkout claude/ai-command-center      # until it's merged into main
npm install
```

### 3. Set it up
```powershell
npm run setup        # asks: local PostgreSQL (type your password) or Supabase (paste the URL), and your timezone
npm run doctor       # checks everything, creates the database if needed, tells you what to fix
npm run db:migrate   # creates the tables
npx playwright install chromium   # optional: browser automation
npm run build
```

### 4. Start it
```powershell
npm start
```
Open **http://localhost:3000** in Chrome or Edge → **Create an account** (the first account is the admin) →
say or type *"KHOKHAR, plan my day"* / *"کھوکھر، میرا دن پلان کرو"*.

Next time just **double-click `scripts\windows\start-khokhar.bat`** (keep the window open).

### 5. Start automatically when Windows starts (optional)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
```
Windows may ask to allow Node.js through the firewall — choose **Private networks** only (needed for your phone on home Wi-Fi).

---

## macOS (Intel or Apple Silicon)

### 1. Install the tools
1. **Node.js** → https://nodejs.org → LTS `.pkg` → install.
2. **Git** → open *Terminal* and run `git --version` (macOS offers to install it).
3. **PostgreSQL** → easiest: **Postgres.app** → https://postgresapp.com → drag to Applications → open it → **Initialize**.
   Default user is your Mac username with no password; or use Supabase (see Windows step 1).

### 2–4. Get, set up and start
```bash
cd ~/Documents
git clone https://github.com/Sobaan-coder/App.git khokhar && cd khokhar
git checkout claude/ai-command-center
npm install
npm run setup     # choose 1; with Postgres.app just press Enter (your Mac username, no password)
npm run doctor
npm run db:migrate
npx playwright install chromium   # optional
npm run build
npm start         # open http://localhost:3000 in Chrome or Safari
```
Next time: double-click **`scripts/macos/start-khokhar.command`** (first time: right-click → Open).

Auto-start at login (optional): `bash scripts/macos/install-autostart.sh`

---

## Linux (Ubuntu / Debian / Mint)

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"

git clone https://github.com/Sobaan-coder/App.git ~/khokhar && cd ~/khokhar
git checkout claude/ai-command-center
npm install
npm run setup && npm run doctor && npm run db:migrate
npx playwright install --with-deps chromium   # optional
npm run build && npm start
```
Auto-start on boot: `sudo bash scripts/linux/install-service.sh`

---

## Make KHOKHAR smarter (free, optional)

| Want | Do |
|---|---|
| Better English **and Urdu** understanding & writing | Install **Ollama** (https://ollama.com) → `ollama pull qwen2.5` → in `.env` set `OLLAMA_MODEL=qwen2.5` → restart. Needs ~8 GB RAM. |
| Weaker laptop | `ollama pull llama3.2` (3B, ~4 GB RAM) and `OLLAMA_MODEL=llama3.2` |
| No GPU / slow PC | Free cloud tier: set `OPENAI_COMPAT_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_COMPAT_API_KEY=...`, `OPENAI_COMPAT_MODEL=llama-3.3-70b-versatile` |
| Spoken Urdu replies | Windows: Settings → Time & language → Speech → *Add voices* → Urdu. macOS: System Settings → Accessibility → Spoken Content → System voice → Manage voices. |
| Voice in Firefox / fully local speech | Whisper server — see [VOICE.md](VOICE.md) |

Restart after editing `.env` (close the window and start again).

## Using it daily
- Keep the app window/tab open; click the **ear icon** in the KHOKHAR panel to enable hands-free *"KHOKHAR, …"*.
- Your data lives in PostgreSQL + the `storage/` folder. **Back up** both: `pg_dump command_center > backup.sql` and copy `storage/`.
- Update to a new version: `git pull && npm install && npm run build` then restart (migrations apply automatically).

## Problems?
Run **`npm run doctor`** first — it explains most issues. More in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

| Problem | Fix |
|---|---|
| `npm` is not recognized (Windows) | Close and reopen PowerShell after installing Node.js. |
| `password authentication failed` | `npm run setup` again and type the password you chose when installing PostgreSQL. |
| `ECONNREFUSED 5432` | PostgreSQL isn't running: Windows → *Services* → start `postgresql-x64-16`; macOS → open Postgres.app. |
| Port 3000 busy | `set PORT=3001 && npm start` (Windows cmd) · `$env:PORT=3001; npm start` (PowerShell) · `PORT=3001 npm start` (mac/Linux). |
| Mic button does nothing | Use Chrome or Edge, allow the microphone (lock icon in the address bar). |
