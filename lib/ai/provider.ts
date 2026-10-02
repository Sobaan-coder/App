import "server-only";
import { serverEnv } from "@/lib/env.server";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import type { AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * The configured chat/analysis provider.
 *   AI_PROVIDER=anthropic (default) → Claude via the Anthropic SDK
 *   AI_PROVIDER=openai              → any OpenAI-compatible API (set AI_BASE_URL for non-OpenAI hosts)
 */
export function getProvider(): AIProvider {
  if (cached) return cached;
  const { provider, apiKey, baseUrl, model, fastModel } = serverEnv.ai;
  const models = { strong: model || undefined, fast: fastModel || undefined };
  cached =
    provider === "openai"
      ? new OpenAICompatibleProvider(apiKey, baseUrl, models)
      : new AnthropicProvider(apiKey || undefined, baseUrl, models);
  return cached;
}

/** True when an AI key is present. Features that need AI show a clear message otherwise. */
export function isAIConfigured() {
  return Boolean(serverEnv.ai.apiKey || (serverEnv.ai.provider === "anthropic" && process.env.ANTHROPIC_API_KEY));
}
