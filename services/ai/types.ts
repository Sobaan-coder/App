export type Tier = "fast" | "reasoning" | "extraction";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AIProvider {
  id: string;
  label: string;
  isLocal: boolean;
  isPaid: boolean;
  defaultModel: string | undefined;
  available(): Promise<{ ok: boolean; detail?: string }>;
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult>;
}
