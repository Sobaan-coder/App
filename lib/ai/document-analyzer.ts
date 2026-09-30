import "server-only";
import { z } from "zod/v4";
import { generateStructured, type AIContext } from "./structured";
import type { ContentPart } from "./types";
import { UNTRUSTED_NOTE } from "@/lib/documents/source";

export const DocumentAnalysis = z.object({
  kind: z.enum(["notes", "textbook", "slides", "past_paper", "assignment", "question_bank", "lecture", "other"]),
  summary: z.string().describe("2–4 sentence summary of what the material covers"),
  subject_id: z.string().nullable().describe("ID of the best-matching subject from the catalogue, or null"),
  topics: z.array(z.object({ topic_id: z.string(), confidence: z.number() })).describe("Catalogue topics this material covers, most relevant first"),
  definitions: z.array(z.object({ term: z.string(), definition: z.string(), page: z.number().nullable() })),
  formulas: z.array(z.object({ name: z.string(), expression: z.string(), page: z.number().nullable() })),
  examples: z.array(z.object({ title: z.string(), page: z.number().nullable() })),
  questions: z.array(z.object({ text: z.string(), page: z.number().nullable() })).describe("Practice/exam questions found in the material"),
});
export type DocumentAnalysis = z.infer<typeof DocumentAnalysis>;

const SYSTEM = `You organise a student's study material. Given a sample of a document (with [p.N] page markers) and the student's subject/topic catalogue, identify:
- what kind of material it is, and a short factual summary;
- which subject it belongs to and which catalogue topics it covers (only IDs from the catalogue; confidence 0–1);
- key definitions, formulas, worked examples and questions, each with the page number from the markers when known.
Only report items actually present in the text. Keep definitions and formulas concise and verbatim where possible (max 25 of each).

${UNTRUSTED_NOTE}`;

export async function analyzeDocument(
  ctx: AIContext,
  input: { title: string; sample: ContentPart[]; catalogue: { subjects: { id: string; name: string }[]; topics: { id: string; subject_id: string; chapter: string; name: string }[] } },
) {
  const catalogue = [
    "Subjects:",
    ...input.catalogue.subjects.map((s) => `${s.id} | ${s.name}`),
    "Topics:",
    ...input.catalogue.topics.map((t) => `${t.id} | ${t.chapter} > ${t.name}`),
  ].join("\n");
  const result = await generateStructured(ctx, {
    tier: "fast",
    schemaName: "document_analysis",
    schema: DocumentAnalysis,
    maxTokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...input.sample,
          { type: "text", text: `Document title: ${input.title}\n\n<catalogue>\n${catalogue}\n</catalogue>\n\nAnalyse this document.` },
        ],
      },
    ],
  });
  // Never trust IDs from the model: keep only ones that exist in this student's catalogue.
  const subjectIds = new Set(input.catalogue.subjects.map((s) => s.id));
  const topicIds = new Set(input.catalogue.topics.map((t) => t.id));
  const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  return {
    ...result,
    subject_id: result.subject_id && subjectIds.has(result.subject_id) ? result.subject_id : null,
    topics: result.topics.filter((t) => topicIds.has(t.topic_id)).map((t) => ({ ...t, confidence: clamp(t.confidence) })).slice(0, 15),
    definitions: result.definitions.slice(0, 25),
    formulas: result.formulas.slice(0, 25),
    examples: result.examples.slice(0, 25),
    questions: result.questions.slice(0, 40),
  };
}

const Transcription = z.object({ pages: z.array(z.object({ page: z.number(), text: z.string() })) });

/** OCR for scans and photos: transcribe text page by page. */
export async function transcribe(ctx: AIContext, source: ContentPart[]) {
  const result = await generateStructured(ctx, {
    tier: "fast",
    schemaName: "transcription",
    schema: Transcription,
    maxTokens: 32000,
    system: `Transcribe all readable text from the provided scan or photo, page by page, preserving headings, numbering, tables (as plain rows) and formulas. Do not summarise or add anything. ${UNTRUSTED_NOTE}`,
    messages: [{ role: "user", content: [...source, { type: "text", text: "Transcribe this document." }] }],
  });
  return result.pages.filter((p) => p.text.trim()).map((p, i) => ({ page: Number.isFinite(p.page) && p.page > 0 ? Math.round(p.page) : i + 1, text: p.text }));
}
