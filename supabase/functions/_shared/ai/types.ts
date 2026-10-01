// Provider-agnostic AI interface. The app never depends on a specific vendor:
// swap providers with the AI_PROVIDER secret (see docs/AI.md).

export interface AIImage {
  mimeType: string;
  base64: string;
}

export interface AICompletionRequest {
  system: string;
  user: string;
  image?: AIImage;
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object response. */
  json?: boolean;
}

export interface AICompletionResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
}

export class AIProviderError extends Error {
  constructor(message: string, readonly code: 'timeout' | 'http' | 'bad_response' | 'not_configured', readonly status?: number) {
    super(message);
  }
}
