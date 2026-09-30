import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from "../types";

/** Ollama — local, free, private. https://ollama.com */
export function ollamaProvider(baseUrl: string, model: string | undefined): AIProvider {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    id: "ollama",
    label: "Ollama (local)",
    isLocal: true,
    isPaid: false,
    defaultModel: model,
    async available() {
      try {
        const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        const data = (await res.json()) as { models?: { name: string }[] };
        const names = (data.models ?? []).map((m) => m.name);
        if (!model) return { ok: false, detail: "No OLLAMA_MODEL configured" };
        const has = names.some((n) => n === model || n.split(":")[0] === model || n === `${model}:latest`);
        return has ? { ok: true } : { ok: false, detail: `Model "${model}" not pulled. Run: ollama pull ${model}` };
      } catch {
        return { ok: false, detail: `Ollama not reachable at ${base}` };
      }
    },
    async chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream: false,
          format: opts.json ? "json" : undefined,
          options: { temperature: opts.temperature ?? 0.4, num_predict: opts.maxTokens ?? 1024 },
        }),
        signal: opts.signal ?? AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      return { text: data.message?.content ?? "", promptTokens: data.prompt_eval_count, completionTokens: data.eval_count };
    },
  };
}
