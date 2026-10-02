import "server-only";
import { z } from "zod/v4";
import { generateStructured, type AIContext } from "./structured";
import type { ContentPart } from "./types";
import { UNTRUSTED_NOTE } from "@/lib/documents/source";

export const PaperAnalysis = z.object({
  is_exam_paper: z.boolean().describe("False if this document is not an exam/past paper"),
  detected_subject: z.string().nullable().describe("Subject the paper is for, as printed"),
  year: z.number().nullable(),
  session: z.string().nullable().describe("e.g. Spring, Autumn, May/June"),
  total_marks: z.number().nullable(),
  questions: z.array(
    z.object({
      number: z.string().describe('Question label exactly as printed, e.g. "3(b)" or "Q12"'),
      text: z.string().describe("The question text, verbatim (trim long data tables to their essentials)"),
      marks: z.number().nullable(),
      type: z.enum(["mcq", "short", "long", "numerical", "theory", "case_study"]),
      page: z.number().nullable(),
      topics: z
        .array(z.object({ topic_id: z.string(), confidence: z.number().describe("0–1") }))
        .describe("Catalogue topics this question examines, most important first (usually 1–3). Empty if nothing fits."),
    }),
  ),
  notes: z.array(z.string()).describe("Problems reading the paper, ambiguous mappings, pages that were unreadable"),
});
export type PaperAnalysis = z.infer<typeof PaperAnalysis>;

const SYSTEM = `You analyse exam past papers for a student and map every question to their own syllabus.

1. Read the paper (it may be a scan or photo — read it carefully). Skip instructions, formula sheets and blank pages.
2. Detect every question and sub-question that carries its own marks or is answered separately: its label exactly as printed, its text, marks (null if not shown), type, and page.
3. Identify the paper's subject, year, session and total marks when printed.
4. Map each question to the catalogue topics it actually examines (IDs only from the catalogue). Map by what is being tested, not by surface keywords: a question that asks to compute depreciation after a revaluation examines both "Revaluation" and "Depreciation".
5. Confidence (0–1): ≥0.9 when the question clearly and directly tests the topic; 0.7–0.9 when it's a strong but partial match; below 0.7 when you're guessing between plausible topics — include those as "possible topics" rather than dropping them.

Never invent questions, years or marks that aren't in the document. If the document isn't an exam paper, set is_exam_paper to false and return no questions.

${UNTRUSTED_NOTE}`;

export async function analyzePastPaper(ctx: AIContext, input: { paper: ContentPart[]; subjectName: string; catalogue: { id: string; chapter: string; name: string }[] }) {
  const catalogue = input.catalogue.map((t) => `${t.id} | ${t.chapter} > ${t.name}`).join("\n");
  const result = await generateStructured(ctx, {
    tier: "strong",
    effort: "high",
    schemaName: "past_paper",
    schema: PaperAnalysis,
    maxTokens: 48000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...input.paper,
          { type: "text", text: `The student uploaded this as a past paper for: ${input.subjectName}\n\n<topic_catalogue>\n${catalogue}\n</topic_catalogue>\n\nExtract and map every question.` },
        ],
      },
    ],
  });
  return sanitisePaperAnalysis(result, new Set(input.catalogue.map((t) => t.id)));
}

/** Validate AI output before it touches the database. Exported for tests. */
export function sanitisePaperAnalysis(x: PaperAnalysis, validTopicIds: Set<string>): PaperAnalysis {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
  const year = x.year && x.year >= 1950 && x.year <= 2100 ? Math.round(x.year) : null;
  const seen = new Set<string>();
  return {
    ...x,
    year,
    detected_subject: x.detected_subject?.slice(0, 200) ?? null,
    session: x.session?.slice(0, 60) ?? null,
    total_marks: x.total_marks !== null && x.total_marks > 0 && x.total_marks < 10000 ? x.total_marks : null,
    notes: x.notes.slice(0, 10).map((n) => n.slice(0, 300)),
    questions: x.questions
      .filter((q) => q.text.trim())
      .slice(0, 300)
      .map((q) => {
        const topics = new Map<string, number>();
        for (const t of q.topics) if (validTopicIds.has(t.topic_id)) topics.set(t.topic_id, Math.max(topics.get(t.topic_id) ?? 0, clamp01(t.confidence)));
        return {
          number: q.number.trim().slice(0, 30) || "?",
          text: q.text.trim().slice(0, 6000),
          marks: q.marks !== null && q.marks >= 0 && q.marks <= 1000 ? q.marks : null,
          type: q.type,
          page: q.page !== null && q.page > 0 ? Math.round(q.page) : null,
          topics: [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic_id, confidence]) => ({ topic_id, confidence })),
        };
      })
      // Drop exact duplicates the model may emit for multi-page questions.
      .filter((q) => {
        const key = `${q.number}|${q.text.slice(0, 80)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
  };
}
