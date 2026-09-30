import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from "../types";

const PAID_HOSTS = ["api.openai.com", "api.anthropic.com", "api.mistral.ai", "api.together.xyz"];

/**
 * Any OpenAI-compatible Chat Completions endpoint: Groq, OpenRouter, Gemini's OpenAI endpoint,
 * LM Studio, llama.cpp server, vLLM, OpenAI itself…
 */
export function openAICompatProvider(opts: {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  markedPaid: boolean;
}): AIProvider {
  const base = opts.baseUrl.replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    /* invalid */
  }
  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(host);
  const isPaid = opts.markedPaid || PAID_HOSTS.includes(host);
  return {
    id: "openai_compat",
    label: isLocal ? `Local OpenAI-compatible (${host})` : `${host || "OpenAI-compatible"}${isPaid ? " (PAID)" : " (free tier)"}`,
    isLocal,
    isPaid,
    defaultModel: opts.model,
    async available() {
      if (!host) return { ok: false, detail: "Invalid OPENAI_COMPAT_BASE_URL" };
      if (!opts.model) return { ok: false, detail: "No OPENAI_COMPAT_MODEL configured" };
      if (!isLocal && !opts.apiKey) return { ok: false, detail: "No OPENAI_COMPAT_API_KEY configured" };
      return { ok: true };
    },
    async chat(messages: ChatMessage[], o: ChatOptions): Promise<ChatResult> {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: o.model,
          messages,
          temperature: o.temperature ?? 0.4,
          max_tokens: o.maxTokens ?? 1024,
          ...(o.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: o.signal ?? AbortSignal.timeout(120_000),
      });
      if (res.status === 429) throw new Error("Rate limit / free quota reached (HTTP 429)");
      if (res.status === 402) throw new Error("Provider requires payment (HTTP 402) — skipped");
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      };
    },
  };
}
