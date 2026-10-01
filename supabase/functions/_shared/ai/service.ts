import { GeminiProvider } from './gemini.ts';
import { OpenAICompatibleProvider } from './openai_compatible.ts';
import { AIProvider } from './types.ts';

export type EnvReader = (key: string) => string | undefined;

/**
 * AIService factory. Configure with Supabase secrets (never in the client):
 *   AI_PROVIDER = openai | gemini | none
 *   AI_API_URL  = https://api.openai.com/v1     (openai-compatible only)
 *   AI_API_KEY  = ...
 *   AI_MODEL    = gpt-4o-mini | gemini-1.5-flash | ...
 * Returns null when AI is not configured; callers then fall back to the
 * deterministic parser only.
 */
export function createAIProvider(env: EnvReader): AIProvider | null {
  const provider = (env('AI_PROVIDER') ?? 'openai').toLowerCase();
  const key = env('AI_API_KEY');
  if (provider === 'none' || !key) return null;
  switch (provider) {
    case 'gemini':
      return new GeminiProvider(key, env('AI_MODEL') ?? 'gemini-1.5-flash', env('AI_API_URL') ?? undefined);
    case 'openai':
    case 'openai-compatible':
      return new OpenAICompatibleProvider(env('AI_API_URL') ?? 'https://api.openai.com/v1', key, env('AI_MODEL') ?? 'gpt-4o-mini');
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}"`);
  }
}

/** Extract the first JSON object from model text (tolerates ```json fences). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Model did not return JSON');
  }
}
