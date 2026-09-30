import "server-only";
import { z } from "zod/v4";
import { generateStructured, type AIContext } from "./structured";
import { formatSources, type Source } from "./retrieval";
import { UNTRUSTED_NOTE } from "@/lib/documents/source";

export type QuizDifficulty = "easy" | "medium" | "hard" | "exam";

const QuizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe("Exactly 4 options"),
      correct_index: z.number().describe("0–3"),
      explanation: z.string().describe("Why the answer is right, 1–3 sentences; cite [S#] if from sources"),
      topic_id: z.string().nullable(),
    }),
  ),
});

export type QuizItem = { question: string; options: string[]; answer: number; explanation: string; topic_id: string | null };

const LEVEL: Record<QuizDifficulty, string> = {
  easy: "Easy: definitions and direct recall.",
  medium: "Medium: application of rules to short scenarios.",
  hard: "Hard: multi-step reasoning, edge cases, common traps as distractors.",
  exam: "Exam level: match the style and depth of the student's past-paper questions, including short numerical scenarios where the subject uses them.",
};

export async function generateQuiz(
  ctx: AIContext,
  input: { topics: { id: string; name: string; chapter: string }[]; subjectName: string; difficulty: QuizDifficulty; count: number; sources: Source[] },
): Promise<QuizItem[]> {
  const result = await generateStructured(ctx, {
    tier: "strong",
    effort: "medium",
    schemaName: "quiz",
    schema: QuizSchema,
    maxTokens: 12000,
    system: `You write multiple-choice quizzes for a student preparing for ${input.subjectName}. ${LEVEL[input.difficulty]}
Base questions on the student's own materials and past-paper questions in the sources when available; otherwise use standard syllabus knowledge for these topics. Every question must have exactly one correct option and three plausible distractors. Keep numbers realistic and check your arithmetic. Spread questions across the listed topics and tag each with its topic_id (only IDs from the list). Do not reuse past-paper questions verbatim; test the same concepts.
${UNTRUSTED_NOTE.replace("The uploaded document is", "Source content is")}`,
    messages: [
      {
        role: "user",
        content: `Topics:\n${input.topics.map((t) => `${t.id} | ${t.chapter} > ${t.name}`).join("\n")}\n\n${formatSources(input.sources)}\n\nWrite ${input.count} questions.`,
      },
    ],
  });
  return validateQuiz(result.questions, new Set(input.topics.map((t) => t.id))).slice(0, input.count);
}

/** Drop malformed items; exported for tests. */
export function validateQuiz(items: z.infer<typeof QuizSchema>["questions"], topicIds: Set<string>): QuizItem[] {
  return items
    .filter((q) => q.question.trim() && q.options.length === 4 && q.options.every((o) => o.trim()) && Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < 4)
    .filter((q) => new Set(q.options.map((o) => o.trim().toLowerCase())).size === 4)
    .map((q) => ({
      question: q.question.trim().slice(0, 2000),
      options: q.options.map((o) => o.trim().slice(0, 500)),
      answer: q.correct_index,
      explanation: q.explanation.trim().slice(0, 1500),
      topic_id: q.topic_id && topicIds.has(q.topic_id) ? q.topic_id : null,
    }));
}
