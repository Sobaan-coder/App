import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, isAIConfigured } from "@/lib/ai/provider";
import { analyzePastPaper } from "@/lib/ai/past-paper-analyzer";
import { AIError } from "@/lib/ai/types";
import { prepareSource } from "@/lib/documents/source";
import { contentMatchesKind, type FileKind } from "@/lib/security/files";
import { BUCKETS, download } from "@/lib/storage";

/** Background job: OCR/extract → detect questions → map to syllabus → save questions, links and question bank. */
export async function processPastPaper(job: { target_id: string; user_id: string; attempts: number }) {
  const admin = createAdminClient();
  const { data: paper } = await admin.from("past_papers").select("*, subjects(name, code)").eq("id", job.target_id).eq("user_id", job.user_id).single();
  if (!paper) throw Object.assign(new Error("Paper not found"), { retryable: false });
  const setStatus = (processing_status: "processing" | "analyzing" | "ready" | "failed", extra: Record<string, unknown> = {}) =>
    admin.from("past_papers").update({ processing_status, ...extra }).eq("id", paper.id);

  await setStatus("processing", { processing_error: null });
  try {
    if (!isAIConfigured()) throw new AIError("Past-paper analysis needs AI to be configured on the server.", 503);
    if (!paper.storage_path) throw new AIError("No file was uploaded for this paper.", 400);
    const kind: FileKind = paper.mime_type === "application/pdf" ? "pdf" : "image";
    const bytes = await download(admin, BUCKETS.papers, paper.storage_path);
    if (!contentMatchesKind(bytes, kind)) throw new AIError("This file doesn't look like a valid PDF or image.", 400);

    const provider = getProvider();
    const source = await prepareSource(provider, kind, bytes, paper.title, paper.mime_type ?? "application/pdf");

    const { data: topics } = await admin.from("topics").select("id, name, chapters(name)").eq("subject_id", paper.subject_id).eq("owner_id", job.user_id).order("sort_order");
    if (!topics?.length) throw new AIError("This subject has no topics yet. Add your syllabus first so questions can be mapped.", 422);

    await setStatus("analyzing", { ocr_used: source.ocr });
    const subject = paper.subjects as { name: string; code: string | null };
    const analysis = await analyzePastPaper(
      { userId: job.user_id, feature: "past_paper_mapping", skipRateLimit: true },
      {
        paper: source.parts,
        subjectName: subject.code ? `${subject.name} (${subject.code})` : subject.name,
        catalogue: topics.map((t) => ({ id: t.id, name: t.name, chapter: (t.chapters as { name: string } | null)?.name ?? "" })),
      },
    );
    if (!analysis.is_exam_paper || analysis.questions.length === 0) {
      throw new AIError(analysis.notes[0] ?? "No exam questions were found in this document.", 422);
    }

    // Replace any previous extraction (re-processing is idempotent).
    await admin.from("past_paper_questions").delete().eq("past_paper_id", paper.id);
    const { data: inserted, error } = await admin
      .from("past_paper_questions")
      .insert(
        analysis.questions.map((q, i) => ({
          past_paper_id: paper.id,
          user_id: job.user_id,
          question_number: q.number,
          question_text: q.text,
          marks: q.marks,
          question_type: q.type,
          page_number: q.page,
          sort_order: i,
        })),
      )
      .select("id, sort_order");
    if (error) throw error;
    const idByOrder = new Map(inserted.map((r) => [r.sort_order, r.id]));

    const links = analysis.questions.flatMap((q, i) =>
      q.topics.map((t) => ({ user_id: job.user_id, question_id: idByOrder.get(i)!, topic_id: t.topic_id, confidence: t.confidence, source: "ai" as const })),
    );
    if (links.length) {
      const { error: linkError } = await admin.from("question_topic_links").insert(links);
      if (linkError) throw linkError;
    }

    const year = paper.year ?? analysis.year;
    const { error: bankError } = await admin.from("questions").insert(
      analysis.questions.map((q, i) => ({
        user_id: job.user_id,
        subject_id: paper.subject_id,
        topic_id: q.topics[0]?.topic_id ?? null,
        question_text: q.text,
        question_type: q.type,
        marks: q.marks,
        year,
        difficulty: q.marks === null ? 3 : q.marks >= 20 ? 4 : q.marks >= 10 ? 3 : 2,
        source_type: "past_paper",
        source_id: idByOrder.get(i)!,
      })),
    );
    if (bankError) throw bankError;

    await setStatus("ready", {
      year,
      session: paper.session ?? analysis.session,
      total_marks: analysis.total_marks ?? analysis.questions.reduce((a, q) => a + (q.marks ?? 0), 0) ?? null,
      detected_subject: analysis.detected_subject,
      processing_error: analysis.notes.length ? analysis.notes.join(" · ").slice(0, 1000) : null,
    });
  } catch (err) {
    const friendly = err instanceof AIError ? err.userMessage : "We couldn't analyze this paper yet.";
    const final = job.attempts >= 3 || (err instanceof AIError && !err.retryable);
    await setStatus(final ? "failed" : "processing", { processing_error: friendly });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { retryable: !final });
  }
}
