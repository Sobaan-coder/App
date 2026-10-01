# Voice, wake word & Urdu

Your assistant has a name — **KHOKHAR (کھوکھر)** by default — and you can talk to it like Siri,
in **English, Urdu (اردو) or Roman Urdu**. Rename it any time in **Settings → Assistant & Voice**.

## Talking to it

| How | What happens |
|---|---|
| **Tap the mic** (floating orb, or the mic in the command box) | Speak one command. |
| **Hands-free wake word** (ear icon in the voice panel, or Settings) | The app keeps listening for the name. Say **"KHOKHAR, plan my day"** in one breath, or say **"KHOKHAR"**, hear a chime + "Yes? / جی؟", then say the command. |
| **Type** | Typed commands can start with the name too: "KHOKHAR, kal ka schedule banao". |

The name is matched in English and Urdu script ("KHOKHAR", "Khokar", "Kokhar", "کھوکھر"…) with one-letter tolerance, and
only near the **start** of what you say — so mentioning the word in conversation doesn't trigger it. Add extra
spellings or nicknames under *Other spellings*.

Replies are shown and **spoken** in the language you used (or a fixed language you choose). Urdu replies use
neutral wording (no assumed gender).

## What it understands in Urdu

Works offline (no AI needed) for the everyday commands — and with an AI model connected, anything else is
translated automatically.

| Urdu | Roman Urdu | Does |
|---|---|---|
| میرا دن پلان کرو | mera din plan karo | Plan my day |
| کل کا شیڈول بناؤ | kal ka schedule banao | Tomorrow's schedule |
| مجھے کل شام 5 بجے رپورٹ مکمل کرنے کی یاد دلانا | kal shaam 5 baje report complete karne ki yaad dilana | Reminder (title kept in your words) |
| ہر جمعہ کو انوائس بھیجنے کی یاد دلانا | har jumma invoice bhejne ki yaad dilana | Recurring task |
| میرے ادھورے کام دکھاؤ | mere adhoore kaam dikhao | Unfinished tasks |
| اب میں کیا کروں؟ | ab main kya karun? | What next |
| آج کی دستاویزات کا خلاصہ بناؤ | aaj ki documents ka khulasa banao | Summarise documents |
| میری فائلیں ترتیب دو | files tarteeb do | Organise files |
| … کے بارے میں تحقیق کرو | … ke bare mein research karo | Research |
| Crown Crust Pizza کی پوسٹ بنا کر انسٹاگرام پر لگا دو | Zinger Burger ki post banao instagram ke liye | Content (+ publish with approval) |
| سات دن کا کانٹینٹ پلان بناؤ | hafte ka content banao | 7-day content plan |
| ہر صبح 8 بجے میرا دن پلان کرو اور مجھے بتاؤ | har roz shaam 6 baje content post karo | **Creates an automation** (you confirm) |
| یاد رکھو کہ … / … بھول جاؤ / تمہیں کیا یاد ہے | yaad rakho ke … / bhool jao | Memory |
| سب آٹومیشن روک دو | sab automation band karo | Pause automations |
| آج کیا کیا؟ | aaj kya kiya | Today's activity |
| تمہارا نام کیا ہے؟ | tumhara naam kya hai | Introduces itself |

Times and dates: آج/کل/پرسوں, صبح/دوپہر/شام/رات, "5 بجے", "5:30 بجے", Urdu digits (۵), ہر روز / ہر صبح /
ہر پیر…اتوار / ہر ہفتے / ہر مہینے, and the Roman equivalents (aaj, kal, subah, shaam, 5 baje, har jumma…).

For full, free-form Urdu (questions, long instructions) connect a model — local and free:
`ollama pull qwen2.5` (good multilingual support) and set `OLLAMA_MODEL=qwen2.5`. Groq/Gemini free tiers also work.

## Speech recognition engines ($0)

| Engine | Cost | Browsers | Privacy |
|---|---|---|---|
| **Browser** (default) | Free | Chrome, Edge, Safari, Android Chrome | Audio is processed by the browser vendor's service (Google for Chrome) |
| **Whisper server** | Free (local) or free tier | All browsers (records a clip, sends to *your* server) | Fully local with faster-whisper / Speaches |

Whisper setup (`.env`):

```bash
# fully local (CPU is fine for short commands)
docker run -p 8000:8000 ghcr.io/speaches-ai/speaches:latest-cpu
STT_BASE_URL=http://localhost:8000/v1
STT_MODEL=Systran/faster-whisper-small

# or Groq free tier (supports Urdu)
STT_BASE_URL=https://api.groq.com/openai/v1
STT_API_KEY=...
STT_MODEL=whisper-large-v3
```

Then pick **Whisper server** in Settings → Assistant & Voice.

## Spoken replies

Uses your device's built-in voices (free). English voices exist everywhere. For **Urdu voice replies** install an
Urdu voice: Windows → Settings → Time & language → Speech → add Urdu; Android → Google Text-to-speech →
Urdu. Without one, Urdu replies are shown as text. Use *Test the voice* in Settings.

## Honest limits

- **Wake word works while the app is open** (a browser tab or the installed app on your phone/PC) — browsers
  don't allow web apps to listen in the background or when the screen is locked, unlike Siri which is built into
  the OS. Keep a tab open (or the installed PWA) on a PC/tablet for an always-ready assistant.
- It **recognises speech**, not *who* is speaking. Voice-ID ("only respond to my voice") isn't reliable or secure
  in a browser at $0, so your account login remains the security boundary.
- Voice can start any command, but **approvals still need a tap** (Approve / type CONFIRM) — a voice in the room
  should never be able to publish or send things on your behalf.
- Offline Urdu covers the command vocabulary above; free-form Urdu needs an AI model.
