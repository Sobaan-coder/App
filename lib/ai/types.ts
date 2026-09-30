import type { z } from "zod/v4";

/** Which model tier a task needs. "fast" = cheap classification/tagging; "strong" = reasoning. */
export type ModelTier = "fast" | "strong";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string }
  | { type: "pdf"; data: string; name: string };

export type ChatMessage = { role: "user" | "assistant"; content: string | ContentPart[] };

export type Usage = { inputTokens: number; outputTokens: number; model: string };

export type GenerateObjectArgs<S extends z.ZodType> = {
  tier: ModelTier;
  system: string;
  messages: ChatMessage[];
  schema: S;
  schemaName: string;
  maxTokens?: number;
  /** Reasoning depth hint; ignored by providers/models that don't support it. */
  effort?: "low" | "medium" | "high";
};

export type StreamTextArgs = {
  tier: ModelTier;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
};

export interface AIProvider {
  readonly name: string;
  modelFor(tier: ModelTier): string;
  /** Whether PDFs can be passed directly (used for OCR of scanned documents). */
  readonly supportsPdfInput: boolean;
  generateObject<S extends z.ZodType>(args: GenerateObjectArgs<S>): Promise<{ object: z.infer<S>; usage: Usage }>;
  streamText(args: StreamTextArgs): { textStream: AsyncIterable<string>; usage: Promise<Usage> };
}

/**
 * A failure we can show to students. `userMessage` is always safe and friendly;
 * technical details stay in `cause` and are logged server-side only.
 */
export class AIError extends Error {
  constructor(
    public userMessage: string,
    public status = 500,
    public cause?: unknown,
    public retryable = false,
  ) {
    super(userMessage);
  }
}
