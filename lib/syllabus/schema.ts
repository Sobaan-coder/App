import { z } from "zod/v4";

/** What the AI must return when reading a syllabus. Confidence is 0–1. */
export const SyllabusExtraction = z.object({
  qualification: z.string().nullable().describe("Qualification / programme named in the document, e.g. 'CAF' or 'BBA Semester 3'"),
  subjects: z.array(
    z.object({
      name: z.string(),
      code: z.string().nullable(),
      exam_date: z.string().nullable().describe("YYYY-MM-DD if the document states one"),
      confidence: z.number().describe("0–1: how sure you are this is a distinct subject"),
      chapters: z.array(
        z.object({
          name: z.string(),
          weightage: z.number().nullable().describe("Percentage weight if stated"),
          confidence: z.number(),
          topics: z.array(
            z.object({
              name: z.string().describe("Short topic name, 2–8 words"),
              description: z.string().nullable(),
              learning_objectives: z.array(z.string()),
              weightage: z.number().nullable(),
              difficulty: z.number().nullable().describe("1–5 estimated difficulty"),
              confidence: z.number(),
              subtopics: z.array(z.object({ name: z.string() })),
            }),
          ),
        }),
      ),
    }),
  ),
  uncertainties: z.array(z.string()).describe("Anything you were unsure about, for the student to check"),
});
export type SyllabusExtraction = z.infer<typeof SyllabusExtraction>;

/** Editable draft shape (review screen → save_syllabus RPC). */
export const SyllabusDraft = z.object({
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Every subject needs a name").max(160),
        code: z.string().trim().max(30).nullable().optional(),
        exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        existing_subject_id: z.uuid().nullable().optional(),
        chapters: z
          .array(
            z.object({
              name: z.string().trim().min(1, "Every chapter needs a name").max(200),
              weightage: z.number().min(0).max(100).nullable().optional(),
              topics: z.array(
                z.object({
                  name: z.string().trim().min(1, "Every topic needs a name").max(200),
                  description: z.string().max(2000).nullable().optional(),
                  learning_objectives: z.array(z.string().max(500)).max(30).optional(),
                  weightage: z.number().min(0).max(100).nullable().optional(),
                  difficulty: z.number().int().min(1).max(5).nullable().optional(),
                  subtopics: z.array(z.object({ name: z.string().trim().min(1).max(200) })).max(50).optional(),
                }),
              ).max(200),
            }),
          )
          .max(100),
      }),
    )
    .min(1, "Add at least one subject")
    .max(20),
});
export type SyllabusDraft = z.infer<typeof SyllabusDraft>;

/** Clamp and clean AI output before it is shown/saved (never trust raw model JSON). */
export function sanitiseExtraction(x: SyllabusExtraction): SyllabusExtraction {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
  const pctOrNull = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n)));
  const date = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);
  return {
    qualification: x.qualification?.slice(0, 120) ?? null,
    uncertainties: x.uncertainties.slice(0, 20).map((u) => u.slice(0, 300)),
    subjects: x.subjects
      .filter((s) => s.name.trim())
      .slice(0, 20)
      .map((s) => ({
        name: s.name.trim().slice(0, 160),
        code: s.code?.trim().slice(0, 30) || null,
        exam_date: date(s.exam_date),
        confidence: clamp01(s.confidence),
        chapters: s.chapters
          .filter((c) => c.name.trim())
          .slice(0, 100)
          .map((c) => ({
            name: c.name.trim().slice(0, 200),
            weightage: pctOrNull(c.weightage),
            confidence: clamp01(c.confidence),
            topics: c.topics
              .filter((t) => t.name.trim())
              .slice(0, 200)
              .map((t) => ({
                name: t.name.trim().slice(0, 200),
                description: t.description?.slice(0, 2000) ?? null,
                learning_objectives: t.learning_objectives.slice(0, 30).map((o) => o.slice(0, 500)),
                weightage: pctOrNull(t.weightage),
                difficulty: t.difficulty === null ? null : Math.max(1, Math.min(5, Math.round(t.difficulty))),
                confidence: clamp01(t.confidence),
                subtopics: t.subtopics.filter((st) => st.name.trim()).slice(0, 50).map((st) => ({ name: st.name.trim().slice(0, 200) })),
              })),
          })),
      })),
  };
}
