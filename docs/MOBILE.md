# KHOKHAR on your iPhone and Android phone

The phone is a **remote control**: KHOKHAR runs on your PC/laptop ([INSTALL_PC.md](INSTALL_PC.md)) and your
phone opens it as an app — with voice, notifications in the app, and an icon on the home screen. Cost: **$0**.
No App Store needed.

> **Why HTTPS matters:** phones only allow the **microphone** and **"Install app"** on secure (`https://`)
> addresses. So: home Wi-Fi with `http://` works for tapping and typing, but for voice you need one of the
> HTTPS options below. **Tailscale is the recommended one** (free, private — only your devices can reach it).

---

## Step 1 — Give your PC a secure address

### Option A (recommended): Tailscale — private, free, works anywhere (home, office, mobile data)

**On the PC:**
1. Install Tailscale: https://tailscale.com/download → sign in (Google/Microsoft/Apple account, free *Personal* plan).
2. In the Tailscale admin console (https://login.tailscale.com/admin/dns) turn on **MagicDNS** and **HTTPS Certificates**.
3. Open PowerShell / Terminal and run (with KHOKHAR already running on port 3000):
   ```bash
   tailscale serve --bg 3000
   ```
   It prints your address, e.g. **`https://my-laptop.tail1234.ts.net`** (it stays the same and keeps working
   after restarts).
4. Add that address to the end of your `.env` and restart KHOKHAR:
   ```
   ALLOWED_ORIGINS=https://my-laptop.tail1234.ts.net
   ```

**On each phone:** install **Tailscale** from the App Store / Play Store → sign in with the **same account** →
switch it **On**. Then open `https://my-laptop.tail1234.ts.net`.

Nobody else on the internet can open this address — only devices signed into your Tailscale.

### Option B: Cloudflare quick tunnel — no account, but the address changes
```bash
# Windows: winget install --id Cloudflare.cloudflared   ·  macOS: brew install cloudflared  ·  Linux: see developers.cloudflare.com
cloudflared tunnel --url http://localhost:3000
```
It prints `https://something-random.trycloudflare.com`. Add it to `ALLOWED_ORIGINS` in `.env`, restart KHOKHAR,
open it on the phone. The address is **public** (protected by your login) and **changes every time** you restart
the tunnel. (A permanent Cloudflare address needs your own domain, ~$10/year — not $0.)

### Option C: Same Wi-Fi only, no voice
Run `npm run doctor` on the PC — it prints `http://192.168.x.x:3000`. Open that on the phone while on the same
Wi-Fi. Typing and tapping work; the microphone and "install app" don't (phone browsers require HTTPS).
Windows may ask to allow Node.js on **Private networks** — allow it.

---

## Step 2 — Install KHOKHAR on the phone

### iPhone / iPad
1. Open your HTTPS address in **Safari** (it must be Safari for installing).
2. Sign in.
3. Tap **Share** (□↑) → **Add to Home Screen** → name it **KHOKHAR** → **Add**.
4. Open KHOKHAR from the home screen — it runs full-screen like an app.

**Voice on iPhone**
- Settings → **Safari → Microphone → Allow**, and Settings → **Siri → Siri & Dictation ON** (Safari's speech
  recognition uses it). Tap the purple mic and allow the microphone the first time.
- Urdu: KHOKHAR's panel → Settings → *Assistant & Voice* → Listening language **اردو (Pakistan)**.
- Spoken Urdu replies need an Urdu voice: Settings → Accessibility → Spoken Content → Voices → *Urdu*
  (if your iOS version offers it; otherwise Urdu replies are shown as text, English is spoken).
- If the mic doesn't respond **inside the home-screen app**, open the same address in a Safari tab (voice works
  there), or set up the Whisper engine ([VOICE.md](VOICE.md)), which records audio and works in the installed app.

**"Hey Siri, KHOKHAR" (free, built into iPhone)**
1. Open the **Shortcuts** app → **+** → *Add Action* → **Open URLs** → `https://my-laptop.tail1234.ts.net/?voice=1`
2. Name the shortcut **KHOKHAR**. Now say **"Hey Siri, KHOKHAR"** → KHOKHAR opens in Safari, ready to listen
   (iOS may need one tap on the mic). Safari is where iPhone voice recognition works most reliably.

### Android (Chrome)
1. Open your HTTPS address in **Chrome** → sign in.
2. Chrome shows **Install app** (or ⋮ menu → **Install app** / *Add to Home screen*) → **Install**.
3. Open KHOKHAR from the home screen / app drawer.
4. Long-press the icon for shortcuts: **Talk to KHOKHAR**, Approvals, Tasks.

**Voice on Android**
- Allow the microphone when asked. Voice recognition supports **Urdu (Pakistan)** and English.
- Spoken Urdu replies: Settings → *Text-to-speech* → **Speech Services by Google** → install voice data → **Urdu**.
- Hands-free *"KHOKHAR, …"*: tap the **ear** icon in the KHOKHAR panel. Works while the app is open and the
  screen is on.
- **"Hey Google, open KHOKHAR"** opens the installed app. For one-tap voice, long-press the icon → *Talk to KHOKHAR*.

---

## Step 3 — Use it
- Tap the purple orb or say *"KHOKHAR, plan my day"* / *"کھوکھر، میرا دن پلان کرو"*.
- Approvals arrive in the app (bell icon). For alerts when the app is closed, enable **Telegram** in
  Settings → Notifications (free, official Telegram bot) — it pushes to your phone.
- Everything you do on the phone is saved on the PC; the PC must be on and KHOKHAR running.

## Honest limits
| Limit | Why / workaround |
|---|---|
| The PC must be on | It's your free server. For 24/7 without your PC: an Oracle Cloud *Always Free* VM ([DEPLOYMENT.md](DEPLOYMENT.md)). |
| Wake word only while the app is open with the screen on | Phones don't let websites listen in the background. Use "Hey Siri, KHOKHAR" / "Hey Google, open KHOKHAR" to open it hands-free. |
| No App Store / Play Store listing | Publishing costs money (Apple $99/year, Google $25). The installed web app is free and gets updates automatically. |
| Push notifications when the app is closed | Use Telegram notifications (free). |
| Voice in Firefox on Android | Not supported by Firefox — use Chrome, or configure the Whisper engine. |
