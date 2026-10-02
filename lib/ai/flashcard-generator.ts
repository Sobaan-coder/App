import "server-only";
import { z } from "zod/v4";
import { generateStructured, type AIContext } from "./structured";
import { UNTRUSTED_NOTE } from "@/lib/documents/source";

const CardsSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string(), topic_id: z.string().nullable(), difficulty: z.number().describe("1–5") })),
});

export type CardDraft = { front: string; back: string; topic_id: string | null; difficulty: number };

export async function generateFlashcards(
  ctx: AIContext,
  input: { material: string; label: string; topics: { id: string; name: string }[]; count: number },
): Promise<CardDraft[]> {
  const result = await generateStructured(ctx, {
    tier: "fast",
    schemaName: "flashcards",
    schema: CardsSchema,
    maxTokens: 6000,
    system: `Create concise, exam-useful flashcards (active recall). One fact or rule per card. Front: a specific question. Back: a short, precise answer (max ~40 words). Prefer the student's material; don't invent facts not supported by it or by standard syllabus knowledge. Tag each card with a topic_id from the list when one fits. ${UNTRUSTED_NOTE.replace("The uploaded document is", "The material is")}`,
    messages: [
      {
        role: "user",
        content: `Source: ${input.label}\nTopics:\n${input.topics.map((t) => `${t.id} | ${t.name}`).join("\n")}\n\n<material>\n${input.material.slice(0, 30000)}\n</material>\n\nWrite ${input.count} flashcards.`,
      },
    ],
  });
  const ids = new Set(input.topics.map((t) => t.id));
  return result.cards
    .filter((c) => c.front.trim() && c.back.trim())
    .slice(0, input.count)
    .map((c) => ({
      front: c.front.trim().slice(0, 2000),
      back: c.back.trim().slice(0, 4000),
      topic_id: c.topic_id && ids.has(c.topic_id) ? c.topic_id : null,
      difficulty: Math.max(1, Math.min(5, Math.round(c.difficulty || 3))),
    }));
}
