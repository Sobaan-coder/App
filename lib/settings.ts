import { z } from "zod";
import type { Db } from "./db";

/** All user settings with safe ($0) defaults. Stored per key in the `settings` table. */
export const assistantDefaults = {
  name: "KHOKHAR",
  urduName: "کھوکھر",
  // spellings speech engines commonly produce for "Khokhar"
  aliases: ["Khokar", "Kokhar", "Kokar", "Khokher", "Khokhur", "کھوکر"] as string[],
  replyLanguage: "auto" as "auto" | "en" | "ur" | "roman",
  voiceLanguage: "ur-PK" as "ur-PK" | "ur-IN" | "en-US" | "en-GB" | "en-IN" | "en-PK",
  speakReplies: true,
  voiceEngine: "browser" as "browser" | "whisper",
  voiceRate: 1,
};

export const settingsSchema = z.object({
  /** The assistant's identity and voice. */
  assistant: z
    .object({
      name: z.string().trim().min(2).max(30).default(assistantDefaults.name),
      /** How the name is written in Urdu, so "کھوکھر" also wakes it. */
      urduName: z.string().trim().max(30).default(assistantDefaults.urduName),
      /** Extra spellings / nicknames that should also wake the assistant. */
      aliases: z.array(z.string().trim().min(2).max(30)).max(10).default(assistantDefaults.aliases),
      replyLanguage: z.enum(["auto", "en", "ur", "roman"]).default("auto"),
      voiceLanguage: z.enum(["ur-PK", "ur-IN", "en-US", "en-GB", "en-IN", "en-PK"]).default("ur-PK"),
      speakReplies: z.boolean().default(true),
      voiceEngine: z.enum(["browser", "whisper"]).default("browser"),
      voiceRate: z.number().min(0.5).max(1.5).default(1),
    })
    .default(assistantDefaults),
  general: z
    .object({
      defaultProjectId: z.string().uuid().nullable().default(null),
      language: z.string().default("en"),
    })
    .default({ defaultProjectId: null, language: "en" }),
  ai: z
    .object({
      /** Paid providers are never used unless this is true. */
      allowPaid: z.boolean().default(false),
      /** Try local (Ollama) before free cloud APIs. */
      preferLocal: z.boolean().default(true),
      /** Use AI models at all (false = deterministic offline engine only). */
      enabled: z.boolean().default(true),
      ollamaModel: z.string().default(""),
      openaiCompatModel: z.string().default(""),
      /** Optional per-tier model overrides, e.g. {"reasoning": "llama3.1:8b"} */
      tierModels: z.record(z.string(), z.string()).default({}),
      monthlyBudgetUsd: z.number().min(0).default(0),
    })
    .default({ allowPaid: false, preferLocal: true, enabled: true, ollamaModel: "", openaiCompatModel: "", tierModels: {}, monthlyBudgetUsd: 0 }),
  imageGen: z
    .object({
      order: z.array(z.enum(["gemini", "local_sd", "pollinations", "builtin"])).default(["gemini", "local_sd", "pollinations", "builtin"]),
      pollinationsEnabled: z.boolean().default(false),
    })
    .default({ order: ["gemini", "local_sd", "pollinations", "builtin"], pollinationsEnabled: false }),
  content: z
    .object({
      /** AUTO MODE — disabled by default. Even when on, a brand's first post always needs approval. */
      autoPublish: z.boolean().default(false),
      defaultPlatforms: z
        .array(z.enum(["instagram", "facebook", "tiktok", "youtube", "snapchat"]))
        .default(["instagram", "facebook", "tiktok", "youtube", "snapchat"]),
    })
    .default({ autoPublish: false, defaultPlatforms: ["instagram", "facebook", "tiktok", "youtube", "snapchat"] }),
  notifications: z
    .object({
      browser: z.boolean().default(true),
      telegram: z.boolean().default(false),
      email: z.boolean().default(false),
      emailTo: z.string().default(""),
    })
    .default({ browser: true, telegram: false, email: false, emailTo: "" }),
  research: z
    .object({
      maxSources: z.number().int().min(1).max(10).default(5),
      useBrowserForJsPages: z.boolean().default(false),
    })
    .default({ maxSources: 5, useBrowserForJsPages: false }),
  browser: z
    .object({
      enabled: z.boolean().default(true),
      allowedDomains: z.array(z.string()).default([]),
    })
    .default({ enabled: true, allowedDomains: [] }),
  automation: z
    .object({
      paused: z.boolean().default(false),
      maxRetries: z.number().int().min(0).max(5).default(2),
      stepTimeoutSeconds: z.number().int().min(5).max(900).default(120),
    })
    .default({ paused: false, maxRetries: 2, stepTimeoutSeconds: 120 }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsKey = keyof Settings;
export const SETTINGS_KEYS = Object.keys(settingsSchema.shape) as SettingsKey[];

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ key: string; value: unknown }>("select key, value from settings");
  const raw: Record<string, unknown> = {};
  for (const r of rows) if ((SETTINGS_KEYS as string[]).includes(r.key)) raw[r.key] = r.value;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Corrupt/old values: fall back per key so one bad key doesn't break everything.
  const out = defaultSettings() as Record<string, unknown>;
  for (const k of SETTINGS_KEYS) {
    const one = settingsSchema.shape[k].safeParse(raw[k]);
    if (one.success) out[k] = one.data;
  }
  return out as Settings;
}

export async function saveSettings(db: Db, userId: string, patch: Partial<Record<SettingsKey, unknown>>): Promise<Settings> {
  const current = await getSettings(db);
  for (const k of Object.keys(patch) as SettingsKey[]) {
    if (!SETTINGS_KEYS.includes(k)) continue;
    const merged = settingsSchema.shape[k].parse({ ...(current[k] as object), ...(patch[k] as object) });
    await db.query(
      `insert into settings(user_id, key, value) values ($1, $2, $3)
       on conflict (user_id, key) do update set value = excluded.value, updated_at = now()`,
      [userId, k, JSON.stringify(merged)],
    );
  }
  return getSettings(db);
}
