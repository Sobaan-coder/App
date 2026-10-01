# $0 Architecture — Content Bot

```
ME ─► COMMAND CENTER ─► CONTENT PLANNER ─► AI WRITER ─► IMAGE GENERATOR ─► CONTENT OPTIMIZER
                         (planner +        (Ollama/free   (router below)     (per-platform
                          brand/product)    API/offline)                     limits & hashtags)
   ─► QUALITY CHECK ─► APPROVAL ─► SOCIAL PUBLISHER ─► POST VERIFICATION ─► ANALYTICS ─► MEMORY
      (price, avail.,  (Approval    (official APIs or   (publishing_jobs:  (real API      (post history,
       claims, format,  Center or    manual package)     published/manual/  numbers or     duplicate
       duplicates)      post page)                       failed + hints)    "Data          check)
                                                                            unavailable")
```

## Image generation router

1. **Gemini API** (`GEMINI_API_KEY`) — if it returns 429/403/region errors the app shows
   *"Gemini API free access is unavailable for this operation"* and moves on. It never buys credits.
2. **Local Stable Diffusion** (`LOCAL_SD_URL`) — free, private, needs a GPU.
3. **Pollinations.ai** — free public API, **opt-in** (Settings) because prompts leave your machine.
4. **Built-in brand card** — always works offline: brand colours, product name, verified offer/price.
5. **Manual Gemini workflow** — every post stores the full prompt + steps; upload the result with
   *Replace image*.

## Every dependency and its cost

| Component | Choice | Cost |
|---|---|---|
| App + API | Next.js (self-hosted) | $0 |
| Database | Postgres local / Supabase free | $0 |
| Worker & scheduler | Built-in (Postgres queue, croner) | $0 |
| Text AI | Offline engine / Ollama / free tiers | $0 (paid only if you enable it) |
| Images | Built-in / local SD / Pollinations / Gemini free quota | $0 |
| Captions & hashtags | Templates or your AI model | $0 |
| Quality control | Built-in rules against your database | $0 |
| Facebook + Instagram publishing | Meta Graph API | $0 |
| YouTube | Data API v3 (free quota) | $0 |
| TikTok | Content Posting API | $0 (private until audited) |
| Snapchat | Manual package | $0 |
| Packages | ZIP (image + per-platform text + metadata) | $0 |
| Analytics | Platform APIs only | $0 |
| Hosting | Own machine / Oracle Always Free + Cloudflare Tunnel | $0 |

## AUTO MODE vs MANUAL MODE

- **MANUAL MODE (default):** every post needs **APPROVE & PUBLISH** (or *Approve & schedule*).
- **AUTO MODE:** Settings → Content → AUTO MODE **and** the account's *Allow AUTO MODE* switch.
  Even then: a brand's **first** post always needs approval, and posts that fail quality checks never publish.

## What cannot be automated for $0 (and the closest free alternative)

| Want | Why not | Free alternative |
|---|---|---|
| Snapchat auto-posting | No public API for organic posts | ZIP package + post from the app (2 taps) |
| YouTube Short from a still image | API needs a video file | Package with title/description/tags; record a 5-sec clip |
| Public TikTok posts from an unaudited app | TikTok restricts unaudited apps to private posts | Package, or submit your app for TikTok audit (free) |
| Gemini images without quota | Image model may have no free API quota | Gemini app (manual), local SD, Pollinations, built-in card |
