import "server-only";
import { generateStructured, type AIContext } from "./structured";
import type { ContentPart } from "./types";
import { SyllabusExtraction, sanitiseExtraction } from "@/lib/syllabus/schema";
import { UNTRUSTED_NOTE } from "@/lib/documents/source";

const SYSTEM = `You convert course outlines and syllabi into a clean, editable study structure. Students may be at university or preparing for CA, ACCA, CFA, MDCAT, ECAT, CSS, A-Level, O-Level or other exams.

Extract every subject/paper in the document, each with its chapters in syllabus order, and under each chapter the examinable topics (short names), their subtopics, and learning objectives where the document lists them. Keep the document's own wording recognisable so past-paper questions can be matched to topics later. Record weightages exactly as stated; use null when not stated. Estimate difficulty 1–5 from the content.

Give a confidence 0–1 for each subject, chapter and topic: high when the document states it explicitly, lower when you inferred or merged items. Put anything ambiguous in "uncertainties". Never invent subjects or chapters that the document does not support. If the document is not a syllabus, return an empty subjects list and say so in uncertainties.

${UNTRUSTED_NOTE}`;

export async function extractSyllabus(ctx: AIContext, source: ContentPart[], hints: { program?: string | null; level?: string | null; today: string }) {
  const hintText = [hints.program && `Programme: ${hints.program}`, hints.level && `Education level: ${hints.level}`, `Today: ${hints.today}`]
    .filter(Boolean)
    .join("\n");
  const result = await generateStructured(ctx, {
    tier: "strong",
    effort: "medium",
    schemaName: "syllabus",
    schema: SyllabusExtraction,
    maxTokens: 32000,
    system: SYSTEM,
    messages: [{ role: "user", content: [...source, { type: "text", text: `${hintText}\n\nExtract the study structure from this syllabus.` }] }],
  });
  return sanitiseExtraction(result);
}
