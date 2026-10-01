import { AICompletionRequest, AICompletionResult, AIProvider, AIProviderError } from './types.ts';

/**
 * Any OpenAI-compatible Chat Completions API (OpenAI, Azure OpenAI, Groq,
 * Together, OpenRouter, Mistral, local vLLM/Ollama gateways, ...).
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs = 20_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const userContent: unknown = req.image
      ? [
          { type: 'text', text: req.user },
          { type: 'image_url', image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` } },
        ]
      : req.user;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: userContent },
      ],
      temperature: req.temperature ?? 0,
      max_tokens: req.maxTokens ?? 800,
    };
    if (req.json) body.response_format = { type: 'json_object' };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new AIProviderError(`AI HTTP ${res.status}`, 'http', res.status);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new AIProviderError('No content in AI response', 'bad_response');
      return {
        text,
        promptTokens: data?.usage?.prompt_tokens ?? 0,
        completionTokens: data?.usage?.completion_tokens ?? 0,
        model: this.model,
        provider: this.name,
      };
    } catch (e) {
      if (e instanceof AIProviderError) throw e;
      if ((e as Error).name === 'AbortError') throw new AIProviderError('AI request timed out', 'timeout');
      throw new AIProviderError(`AI request failed: ${(e as Error).message}`, 'http');
    } finally {
      clearTimeout(timer);
    }
  }
}
