import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const opt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: opt,
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: opt,
  APP_URL: z.string().default("http://localhost:3000"),
  PUBLIC_BASE_URL: opt,
  ALLOW_SIGNUP: bool(false),
  EMBEDDED_WORKER: bool(true),
  STORAGE_DIR: z.string().default("./storage"),
  DEFAULT_TIMEZONE: z.string().default("UTC"),

  OLLAMA_BASE_URL: opt,
  OLLAMA_MODEL: opt,
  OPENAI_COMPAT_BASE_URL: opt,
  OPENAI_COMPAT_API_KEY: opt,
  OPENAI_COMPAT_MODEL: opt,
  OPENAI_COMPAT_IS_PAID: bool(false),

  GEMINI_API_KEY: opt,
  GEMINI_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),
  LOCAL_SD_URL: opt,
  POLLINATIONS_ENABLED: bool(false),

  SEARXNG_URL: opt,
  BRAVE_API_KEY: opt,
  PLAYWRIGHT_CHROMIUM_PATH: opt,

  TELEGRAM_BOT_TOKEN: opt,
  TELEGRAM_CHAT_ID: opt,
  SMTP_HOST: opt,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: opt,
  SMTP_PASSWORD: opt,
  SMTP_FROM: opt,

  META_APP_ID: opt,
  META_APP_SECRET: opt,
  META_GRAPH_VERSION: z.string().default("v21.0"),
  TIKTOK_CLIENT_KEY: opt,
  TIKTOK_CLIENT_SECRET: opt,
  YOUTUBE_CLIENT_ID: opt,
  YOUTUBE_CLIENT_SECRET: opt,

  SHELL_COMMANDS_ENABLED: bool(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment. Parsed lazily so `next build` works without a .env file. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example and docs/SETUP.md`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached env so changes to process.env take effect. */
export function resetEnvCache() {
  cached = null;
}
