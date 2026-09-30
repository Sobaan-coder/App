// The AI layer is provider-agnostic; these tests use a fake provider + recorder
// to verify validation, repair-retry, rate limiting and error handling.
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { generateStructured } from "@/lib/ai/structured";
import { AIError, type AIProvider, type GenerateObjectArgs } from "@/lib/ai/types";
import type { AIRecorder } from "@/lib/ai/recorder";
import { ruleBasedRoute } from "@/lib/ai/command-router";
import { validateQuiz } from "@/lib/ai/quiz-generator";
import { sanitiseExtraction } from "@/lib/syllabus/schema";

function fakeProvider(responses: unknown[]): AIProvider & { calls: GenerateObjectArgs<z.ZodType>[] } {
  const calls: GenerateObjectArgs<z.ZodType>[] = [];
  return {
    name: "fake",
    supportsPdfInput: true,
    calls,
    modelFor: () => "fake-model",
    async generateObject(args) {
      calls.push(args as GenerateObjectArgs<z.ZodType>);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { object: next as never, usage: { inputTokens: 10, outputTokens: 5, model: "fake-model" } };
    },
    streamText() {
      throw new Error("not used");
    },
  };
}

function recorder(recent = 0) {
  const usage: { success: boolean }[] = [];
  const errors: string[] = [];
  const r: AIRecorder = {
    countRecent: async () => recent,
    recordUsage: async (row) => void usage.push(row),
    recordError: async (_s, message) => void errors.push(message),
  };
  return { r, usage, errors };
}

const Schema = z.object({ topics: z.array(z.string()) });
const args = { tier: "fast" as const, system: "s", schema: Schema, schemaName: "t", messages: [{ role: "user" as const, content: "x" }] };

describe("structured generation", () => {
  it("returns validated output and logs usage", async () => {
    const p = fakeProvider([{ topics: ["IAS 16"] }]);
    const { r, usage } = recorder();
    await expect(generateStructured({ userId: "u", feature: "f", provider: p, recorder: r }, args)).resolves.toEqual({ topics: ["IAS 16"] });
    expect(usage).toEqual([expect.objectContaining({ success: true, model: "fake-model" })]);
  });

  it("asks the model to repair invalid JSON shape, then succeeds", async () => {
    const p = fakeProvider([{ topics: "not-an-array" }, { topics: ["fixed"] }]);
    const { r } = recorder();
    await expect(generateStructured({ userId: "u", feature: "f", provider: p, recorder: r }, args)).resolves.toEqual({ topics: ["fixed"] });
    expect(p.calls).toHaveLength(2);
    expect(JSON.stringify(p.calls[1].messages)).toContain("did not match the required schema");
  });

  it("never returns unvalidated data: fails with a friendly error after retries", async () => {
    const p = fakeProvider([{ wrong: 1 }, { wrong: 2 }]);
    const { r, errors, usage } = recorder();
    const err = await generateStructured({ userId: "u", feature: "f", provider: p, recorder: r }, args).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).userMessage).not.toMatch(/zod|schema/i);
    expect(errors).toHaveLength(1);
    expect(usage.at(-1)).toMatchObject({ success: false });
  });

  it("does not retry non-retryable errors", async () => {
    const p = fakeProvider([new AIError("The AI declined to process this content.", 422)]);
    const { r } = recorder();
    await expect(generateStructured({ userId: "u", feature: "f", provider: p, recorder: r }, args)).rejects.toThrow(/declined/);
    expect(p.calls).toHaveLength(1);
  });

  it("enforces the hourly rate limit before calling the provider", async () => {
    const p = fakeProvider([{ topics: [] }]);
    const { r } = recorder(10_000);
    await expect(generateStructured({ userId: "u", feature: "f", provider: p, recorder: r }, args)).rejects.toThrow(/hourly AI limit/);
    expect(p.calls).toHaveLength(0);
  });
});

describe("command routing", () => {
  it.each([
    ["I have 3 days before my FAR exam. What should I study?", "plan", { days: 3, subject: "FAR" }],
    ["Create a 2-hour study plan", "plan", { minutes: 120 }],
    ["Give me today's revision", "revision_today", {}],
    ["Find all questions about IAS 16", "find_questions", { topic: "IAS 16" }],
    ["Quiz me on depreciation", "quiz", { topic: "depreciation" }],
    ["Show my weakest topics", "weak_topics", {}],
    ["Summarize my FAR notes", "summarize", {}],
    ["Which topics have appeared most often in my uploaded past papers?", "past_paper_stats", {}],
    ["open calendar", "navigate", { page: "calendar" }],
  ])("%s → %s", (q, intent, fields) => {
    expect(ruleBasedRoute(q)).toMatchObject({ intent, ...fields });
  });
  it("leaves real questions for the tutor / AI router", () => {
    expect(ruleBasedRoute("Explain OAR calculation like I'm a child")).toBeNull();
  });
});

describe("AI output sanitisation", () => {
  it("rejects malformed quiz items and unknown topic ids", () => {
    const items = validateQuiz(
      [
        { question: "Q1", options: ["a", "b", "c", "d"], correct_index: 2, explanation: "e", topic_id: "t1" },
        { question: "Q2", options: ["a", "b", "c"], correct_index: 0, explanation: "e", topic_id: null },
        { question: "Q3", options: ["a", "a", "b", "c"], correct_index: 0, explanation: "e", topic_id: null },
        { question: "Q4", options: ["a", "b", "c", "d"], correct_index: 7, explanation: "e", topic_id: "evil" },
        { question: "Q5", options: ["w", "x", "y", "z"], correct_index: 1, explanation: "e", topic_id: "evil" },
      ],
      new Set(["t1"]),
    );
    expect(items.map((i) => i.question)).toEqual(["Q1", "Q5"]);
    expect(items[1].topic_id).toBeNull();
  });

  it("clamps syllabus confidences/weightages and drops invalid dates", () => {
    const clean = sanitiseExtraction({
      qualification: "CAF",
      uncertainties: [],
      subjects: [
        {
          name: " FAR ", code: "", exam_date: "2026-13-45", confidence: 3,
          chapters: [{ name: "IAS 16", weightage: 250, confidence: -1, topics: [{ name: "Revaluation", description: null, learning_objectives: [], weightage: null, difficulty: 9, confidence: 0.5, subtopics: [{ name: " " }] }, { name: "  ", description: null, learning_objectives: [], weightage: null, difficulty: null, confidence: 1, subtopics: [] }] }],
        },
      ],
    });
    const s = clean.subjects[0];
    expect(s).toMatchObject({ name: "FAR", code: null, exam_date: null, confidence: 1 });
    expect(s.chapters[0]).toMatchObject({ weightage: 100, confidence: 0 });
    expect(s.chapters[0].topics).toHaveLength(1);
    expect(s.chapters[0].topics[0]).toMatchObject({ difficulty: 5, subtopics: [] });
  });
});
