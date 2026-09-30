import "server-only";
import type { z } from "zod/v4";
import { serverEnv } from "@/lib/env.server";
import { getProvider } from "./provider";
import { dbRecorder, type AIRecorder } from "./recorder";
import { AIError, type AIProvider, type GenerateObjectArgs, type StreamTextArgs } from "./types";

export type AIContext = {
  userId: string | null;
  feature: string;
  provider?: AIProvider;
  recorder?: AIRecorder;
  /** Background jobs already passed the limit when they were queued. */
  skipRateLimit?: boolean;
};

const HOUR = 60 * 60 * 1000;

export async function enforceRateLimit(ctx: AIContext) {
  if (!ctx.userId || ctx.skipRateLimit) return;
  const recorder = ctx.recorder ?? dbRecorder;
  const used = await recorder.countRecent(ctx.userId, HOUR);
  if (used >= serverEnv.limits.aiRequestsPerHour) {
    throw new AIError("You've reached the hourly AI limit. Please try again a little later.", 429);
  }
}

function describe(err: unknown) {
  if (err instanceof AIError) return `${err.userMessage} :: ${String((err.cause as Error)?.message ?? err.cause ?? "")}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Structured generation used by every AI feature:
 *   rate limit → provider call → schema validation → one repair retry → usage log.
 * Never returns unvalidated data: callers can write the result straight to the DB
 * after their own referential checks (e.g. topic IDs belong to the student).
 */
export async function generateStructured<S extends z.ZodType>(
  ctx: AIContext,
  args: GenerateObjectArgs<S>,
  maxAttempts = 2,
): Promise<z.infer<S>> {
  const provider = ctx.provider ?? getProvider();
  const recorder = ctx.recorder ?? dbRecorder;
  await enforceRateLimit(ctx);

  let lastError: unknown;
  let messages = args.messages;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { object, usage } = await provider.generateObject({ ...args, messages });
      await recorder.recordUsage({ userId: ctx.userId, feature: ctx.feature, provider: provider.name, model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, success: true }).catch(() => {});
      const parsed = args.schema.safeParse(object);
      if (parsed.success) return parsed.data;
      lastError = new AIError("The AI returned data in an unexpected shape.", 502, parsed.error, true);
      // Ask the model to repair its own output on the next attempt.
      messages = [
        ...args.messages,
        { role: "assistant", content: JSON.stringify(object).slice(0, 20000) },
        { role: "user", content: `That JSON did not match the required schema:\n${parsed.error.message.slice(0, 2000)}\nReturn corrected JSON only.` },
      ];
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AIError ? err.retryable : true;
      if (!retryable) break;
    }
  }

  const aiErr = lastError instanceof AIError ? lastError : new AIError("We couldn't complete this AI request.", 502, lastError);
  await recorder.recordUsage({ userId: ctx.userId, feature: ctx.feature, provider: provider.name, model: provider.modelFor(args.tier), inputTokens: 0, outputTokens: 0, success: false }).catch(() => {});
  await recorder.recordError(`ai:${ctx.feature}`, describe(aiErr), ctx.userId).catch(() => {});
  throw aiErr;
}

/** Streaming text with the same rate limiting and usage accounting. */
export async function streamWithAccounting(ctx: AIContext, args: StreamTextArgs) {
  const provider = ctx.provider ?? getProvider();
  const recorder = ctx.recorder ?? dbRecorder;
  await enforceRateLimit(ctx);
  const { textStream, usage } = provider.streamText(args);
  usage.then(
    (u) => recorder.recordUsage({ userId: ctx.userId, feature: ctx.feature, provider: provider.name, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, success: true }),
    (err) => recorder.recordError(`ai:${ctx.feature}`, describe(err), ctx.userId),
  ).catch(() => {});
  return textStream;
}

export { AIError };
