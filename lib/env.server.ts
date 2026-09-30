import "server-only";

// Server-only secrets. Importing this file from a client component fails the build.
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  ai: {
    provider: (process.env.AI_PROVIDER ?? "anthropic") as "anthropic" | "openai",
    apiKey: process.env.AI_API_KEY ?? "",
    baseUrl: process.env.AI_BASE_URL || undefined,
    model: process.env.AI_MODEL || "",
    fastModel: process.env.AI_FAST_MODEL || "",
  },
  embeddings: {
    apiKey: process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY || "",
    baseUrl: process.env.EMBEDDING_BASE_URL || undefined,
    model: process.env.EMBEDDING_MODEL ?? "",
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  },
  limits: {
    aiRequestsPerHour: Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 60),
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  },
};
