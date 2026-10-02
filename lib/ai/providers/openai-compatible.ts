import "server-only";
import OpenAI from "openai";
import { z } from "zod/v4";
import { AIError, type AIProvider, type ChatMessage, type GenerateObjectArgs, type ModelTier, type StreamTextArgs, type Usage } from "../types";

type OAIContent = OpenAI.Chat.Completions.ChatCompletionContentPart;

function toContent(content: ChatMessage["content"]): string | OAIContent[] {
  if (typeof content === "string") return content;
  return content.map((part): OAIContent => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } };
      case "pdf":
        return { type: "file", file: { filename: part.name, file_data: `data:application/pdf;base64,${part.data}` } };
    }
  });
}

/**
 * Any OpenAI-compatible Chat Completions API (OpenAI, Azure OpenAI, OpenRouter,
 * Together, Groq, Ollama, vLLM, …). Set AI_BASE_URL for non-OpenAI hosts.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";
  readonly supportsPdfInput: boolean;
  private client: OpenAI;

  constructor(
    apiKey: string,
    baseURL: string | undefined,
    private models: Partial<Record<ModelTier, string>>,
  ) {
    this.client = new OpenAI({ apiKey: apiKey || "not-set", baseURL });
    // Only OpenAI's own API is known to accept inline PDF file parts.
    this.supportsPdfInput = !baseURL || baseURL.includes("api.openai.com");
  }

  modelFor(tier: ModelTier) {
    const model = this.models[tier] || this.models.strong;
    if (!model) throw new AIError("AI is not configured on the server (AI_MODEL is missing).", 503);
    return model;
  }

  private messages(system: string, messages: ChatMessage[]) {
    return [
      { role: "system" as const, content: system },
      ...messages.map((m) =>
        m.role === "user"
          ? { role: "user" as const, content: toContent(m.content) }
          : { role: "assistant" as const, content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("") },
      ),
    ];
  }

  async generateObject<S extends z.ZodType>(args: GenerateObjectArgs<S>) {
    const model = this.modelFor(args.tier);
    const jsonSchema = z.toJSONSchema(args.schema) as Record<string, unknown>;
    delete jsonSchema.$schema;
    const base = {
      model,
      max_tokens: args.maxTokens ?? 16000,
      messages: this.messages(args.system, args.messages),
    };

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        ...base,
        response_format: { type: "json_schema", json_schema: { name: args.schemaName, schema: jsonSchema, strict: true } },
      });
    } catch (err) {
      // Some compatible servers don't support json_schema; fall back to JSON mode
      // with the schema in the prompt. The result is still validated below.
      if (err instanceof OpenAI.BadRequestError) {
        try {
          completion = await this.client.chat.completions.create({
            ...base,
            messages: this.messages(
              `${args.system}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}`,
              args.messages,
            ),
            response_format: { type: "json_object" },
          });
        } catch (err2) {
          throw mapOpenAIError(err2);
        }
      } else {
        throw mapOpenAIError(err);
      }
    }

    const choice = completion.choices[0];
    const usage: Usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model,
    };
    if (choice?.finish_reason === "length") {
      throw new AIError("This document is too large to analyse in one pass. Try splitting it.", 413);
    }
    if (choice?.message.refusal) {
      throw new AIError("The AI declined to process this content.", 422);
    }
    const text = choice?.message.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new AIError("The AI returned an unexpected response.", 502, err, true);
    }
    // Validation happens in structured.ts (shared across providers) — return raw.
    return { object: parsed as z.infer<S>, usage };
  }

  streamText(args: StreamTextArgs) {
    const model = this.modelFor(args.tier);
    const client = this.client;
    const messages = this.messages(args.system, args.messages);
    let resolveUsage!: (u: Usage) => void;
    let rejectUsage!: (e: unknown) => void;
    const usage = new Promise<Usage>((res, rej) => {
      resolveUsage = res;
      rejectUsage = rej;
    });
    usage.catch(() => {});

    async function* textStream() {
      try {
        const stream = await client.chat.completions.create({
          model,
          max_tokens: args.maxTokens ?? 8000,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        });
        let input = 0;
        let output = 0;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) yield delta;
          if (chunk.usage) {
            input = chunk.usage.prompt_tokens;
            output = chunk.usage.completion_tokens;
          }
        }
        resolveUsage({ inputTokens: input, outputTokens: output, model });
      } catch (err) {
        const mapped = mapOpenAIError(err);
        rejectUsage(mapped);
        throw mapped;
      }
    }

    return { textStream: textStream(), usage };
  }
}

function mapOpenAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new AIError("AI is not configured correctly on the server.", 503, err);
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new AIError("The AI service is busy. Please try again in a minute.", 429, err, true);
  }
  if (err instanceof OpenAI.BadRequestError) {
    return new AIError("The AI couldn't read this input.", 400, err);
  }
  if (err instanceof OpenAI.APIError) {
    return new AIError("The AI service had a problem. Please try again.", 502, err, true);
  }
  return new AIError("Something went wrong talking to the AI.", 500, err, true);
}
