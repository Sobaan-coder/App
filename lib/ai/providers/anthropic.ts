import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";
import { AIError, type AIProvider, type ChatMessage, type GenerateObjectArgs, type ModelTier, type StreamTextArgs, type Usage } from "../types";

const DEFAULT_MODELS: Record<ModelTier, string> = {
  strong: "claude-opus-5-5",
  fast: "claude-haiku-4-5",
};

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function supportsEffort(model: string) {
  return !model.includes("haiku");
}

type Block = Anthropic.Beta.BetaContentBlockParam;

function toBlocks(content: ChatMessage["content"]): string | Block[] {
  if (typeof content === "string") return content;
  return content.map((part): Block => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
      case "pdf":
        return { type: "document", title: part.name, source: { type: "base64", media_type: "application/pdf", data: part.data } };
    }
  });
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly supportsPdfInput = true;
  private client: Anthropic;

  constructor(
    apiKey: string | undefined,
    baseURL: string | undefined,
    private models: Partial<Record<ModelTier, string>>,
  ) {
    this.client = new Anthropic({ apiKey: apiKey || undefined, baseURL });
  }

  modelFor(tier: ModelTier) {
    return this.models[tier] || DEFAULT_MODELS[tier];
  }

  private commonParams(model: string, effort?: "low" | "medium" | "high") {
    const fallback = FALLBACK_MODELS.has(model);
    return {
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      effort: supportsEffort(model) ? effort ?? "medium" : undefined,
    };
  }

  async generateObject<S extends z.ZodType>(args: GenerateObjectArgs<S>) {
    const model = this.modelFor(args.tier);
    const { effort, ...extra } = this.commonParams(model, args.effort);
    let message;
    try {
      const stream = this.client.beta.messages.stream({
        model,
        max_tokens: args.maxTokens ?? 32000,
        ...extra,
        output_config: {
          ...(effort ? { effort } : {}),
          format: betaZodOutputFormat(args.schema),
        },
        system: args.system,
        messages: args.messages.map((m) => ({ role: m.role, content: toBlocks(m.content) })),
      });
      message = await stream.finalMessage();
    } catch (err) {
      throw mapAnthropicError(err);
    }
    const usage: Usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, model };
    if (message.stop_reason === "refusal") {
      throw new AIError("The AI declined to process this content.", 422);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AIError("This document is too large to analyse in one pass. Try splitting it.", 413);
    }
    if (message.parsed_output == null) {
      throw new AIError("The AI returned an unexpected response.", 502, "parsed_output was null", true);
    }
    return { object: message.parsed_output as z.infer<S>, usage };
  }

  streamText(args: StreamTextArgs) {
    const model = this.modelFor(args.tier);
    const { effort, ...extra } = this.commonParams(model, args.effort);
    const stream = this.client.beta.messages.stream({
      model,
      max_tokens: args.maxTokens ?? 16000,
      ...extra,
      ...(effort ? { output_config: { effort } } : {}),
      system: args.system,
      messages: args.messages.map((m) => ({ role: m.role, content: toBlocks(m.content) })),
    });

    let resolveUsage!: (u: Usage) => void;
    let rejectUsage!: (e: unknown) => void;
    const usage = new Promise<Usage>((res, rej) => {
      resolveUsage = res;
      rejectUsage = rej;
    });
    usage.catch(() => {});

    async function* textStream() {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield event.delta.text;
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          throw new AIError("The AI declined to answer this.", 422);
        }
        resolveUsage({ inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, model });
      } catch (err) {
        const mapped = err instanceof AIError ? err : mapAnthropicError(err);
        rejectUsage(mapped);
        throw mapped;
      }
    }

    return { textStream: textStream(), usage };
  }
}

function mapAnthropicError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AIError("AI is not configured correctly on the server.", 503, err);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AIError("The AI service is busy. Please try again in a minute.", 429, err, true);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AIError("The AI couldn't read this input.", 400, err);
  }
  if (err instanceof Anthropic.APIError) {
    return new AIError("The AI service had a problem. Please try again.", 502, err, true);
  }
  return new AIError("Something went wrong talking to the AI.", 500, err, true);
}
