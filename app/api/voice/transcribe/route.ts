import { route } from "@/lib/api";
import { sql, withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";

const MAX_AUDIO = 10 * 1024 * 1024;

/**
 * Speech-to-text via a Whisper server (OpenAI-compatible /audio/transcriptions).
 * Used when the browser has no built-in speech recognition, or when "Whisper" is selected.
 */
export const POST = route({ rateLimit: 30 }, async ({ req, user }) => {
  const e = env();
  if (!e.STT_BASE_URL) throw new AppError("Server speech recognition isn't configured. Use Chrome/Edge (built-in, free) or set STT_BASE_URL (see docs/VOICE.md).", 501, "stt_not_configured");
  const settings = await withUser(user.id, (db) => getSettings(db));
  if (e.STT_IS_PAID && !settings.ai.allowPaid) throw new AppError("The configured speech service is marked as PAID and paid usage is disabled in Settings.", 402, "paid_disabled");
  const form = await req.formData();
  const audio = form.get("audio");
  if (!audio || typeof audio !== "object" || !("arrayBuffer" in audio)) throw new AppError("No audio received");
  const blob = audio as File;
  if (blob.size > MAX_AUDIO) throw new AppError("Recording is too long (max 10 MB)");
  const language = String(form.get("language") ?? "").slice(0, 2); // "ur" | "en" | ""
  const out = new FormData();
  out.append("file", blob, blob.name || "speech.webm");
  out.append("model", e.STT_MODEL);
  if (language === "ur" || language === "en") out.append("language", language);
  out.append("response_format", "json");
  const started = Date.now();
  const res = await fetch(`${e.STT_BASE_URL.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: e.STT_API_KEY ? { authorization: `Bearer ${e.STT_API_KEY}` } : undefined,
    body: out,
    signal: AbortSignal.timeout(60_000),
  });
  const ok = res.ok;
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  await sql
    .query("insert into ai_usage(user_id, provider, model, kind, task, is_paid, success, latency_ms, error) values ($1,'stt',$2,'text','transcribe',$3,$4,$5,$6)", [
      user.id,
      e.STT_MODEL,
      e.STT_IS_PAID,
      ok,
      Date.now() - started,
      ok ? null : (body.error?.message ?? `HTTP ${res.status}`).slice(0, 300),
    ])
    .catch(() => {});
  if (res.status === 429) throw new AppError("Speech service free quota reached — try again later or use Chrome's built-in recognition.", 429);
  if (!ok) throw new AppError(`Speech service error: ${body.error?.message ?? res.status}`, 502);
  return { text: (body.text ?? "").trim() };
});

export const GET = route({}, async () => ({ configured: Boolean(env().STT_BASE_URL), model: env().STT_MODEL }));
