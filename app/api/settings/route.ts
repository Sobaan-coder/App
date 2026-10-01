import { route, body } from "@/lib/api";
import { withUser } from "@/lib/db";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { maskSecret } from "@/lib/crypto";

/** Which server-side secrets are configured (never the values themselves). */
function configuredKeys() {
  const e = env();
  return {
    ollama: { url: e.OLLAMA_BASE_URL ?? null, model: e.OLLAMA_MODEL ?? null },
    openaiCompat: { url: e.OPENAI_COMPAT_BASE_URL ?? null, model: e.OPENAI_COMPAT_MODEL ?? null, key: maskSecret(e.OPENAI_COMPAT_API_KEY), paid: e.OPENAI_COMPAT_IS_PAID },
    gemini: Boolean(e.GEMINI_API_KEY),
    localSd: e.LOCAL_SD_URL ?? null,
    searxng: e.SEARXNG_URL ?? null,
    brave: Boolean(e.BRAVE_API_KEY),
    telegram: Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID),
    smtp: Boolean(e.SMTP_HOST && e.SMTP_FROM),
    meta: Boolean(e.META_APP_ID && e.META_APP_SECRET),
    youtube: Boolean(e.YOUTUBE_CLIENT_ID && e.YOUTUBE_CLIENT_SECRET),
    tiktok: Boolean(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET),
    publicBaseUrl: e.PUBLIC_BASE_URL ?? null,
    shell: e.SHELL_COMMANDS_ENABLED,
  };
}

export const GET = route({}, async ({ user }) => ({ settings: await withUser(user.id, (db) => getSettings(db)), server: configuredKeys() }));

export const PUT = route({ rateLimit: 30 }, async ({ req, user }) => {
  const patch = await body(req, settingsSchema.partial());
  return withUser(user.id, async (db) => {
    const before = await getSettings(db);
    const settings = await saveSettings(db, user.id, patch);
    const changes: string[] = [];
    if (before.ai.allowPaid !== settings.ai.allowPaid) changes.push(settings.ai.allowPaid ? "PAID AI usage ENABLED" : "paid AI usage disabled");
    if (before.content.autoPublish !== settings.content.autoPublish) changes.push(settings.content.autoPublish ? "AUTO MODE publishing ENABLED" : "auto publishing disabled");
    await logActivity(db, { userId: user.id, category: "settings", action: "settings.updated", status: changes.length ? "warning" : "info", message: `Settings updated (${Object.keys(patch).join(", ")})${changes.length ? ` — ${changes.join(", ")}` : ""}` });
    return { settings };
  });
});
