import { AICompletionRequest, AICompletionResult, AIProvider, AIProviderError } from './types.ts';

/** Google Gemini (generateContent REST API). */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
    private readonly timeoutMs = 20_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const parts: unknown[] = [{ text: req.user }];
    if (req.image) parts.push({ inline_data: { mime_type: req.image.mimeType, data: req.image.base64 } });
    const body = {
      system_instruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: req.temperature ?? 0,
        maxOutputTokens: req.maxTokens ?? 800,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) throw new AIProviderError(`AI HTTP ${res.status}`, 'http', res.status);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
      if (typeof text !== 'string' || text.length === 0) throw new AIProviderError('No content in AI response', 'bad_response');
      return {
        text,
        promptTokens: data?.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
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
