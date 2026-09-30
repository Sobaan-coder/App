import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, isAIConfigured } from "@/lib/ai/provider";
import { analyzeDocument, transcribe } from "@/lib/ai/document-analyzer";
import { embed, embeddingsEnabled, toVector } from "@/lib/ai/embeddings";
import { AIError } from "@/lib/ai/types";
import { chunkPages, sampleForAnalysis, type Page } from "./chunk";
import { extractText, looksScanned } from "./extract";
import { fetchWebText, youtubeMeta } from "./web";
import { contentMatchesKind, type FileKind } from "@/lib/security/files";
import { BUCKETS, download, toBase64 } from "@/lib/storage";
import type { Json } from "@/types/database";

const FILE_KINDS = new Set(["pdf", "docx", "pptx", "txt", "image"]);

/**
 * Background pipeline for one resource:
 *   PROCESSING: read file / page / note → text by page (OCR for scans) → chunks → embeddings
 *   ANALYZING:  AI classification (subject, topics, definitions, formulas, questions) + topic links
 *   READY / FAILED
 */
export async function processResource(job: { target_id: string; user_id: string; attempts: number }) {
  const admin = createAdminClient();
  const { data: res } = await admin.from("resources").select("*").eq("id", job.target_id).eq("user_id", job.user_id).single();
  if (!res) throw Object.assign(new Error("Resource not found"), { retryable: false });

  const setStatus = (processing_status: "processing" | "analyzing" | "ready" | "failed", extra: Record<string, unknown> = {}) =>
    admin.from("resources").update({ processing_status, ...extra }).eq("id", res.id);

  await setStatus("processing", { processing_error: null });
  try {
    // ---------- 1. Text by page ----------
    let pages: Page[] = [];
    let title = res.title;
    let ocr = false;
    if (FILE_KINDS.has(res.type) && res.storage_path) {
      const kind = res.type as FileKind;
      const bytes = await download(admin, BUCKETS.resources, res.storage_path);
      if (!contentMatchesKind(bytes, kind)) throw new AIError("This file's contents don't match its type, so it wasn't processed.", 400);
      const extraction = kind === "image" ? null : await extractText(kind, bytes);
      if (extraction && !(kind === "pdf" && looksScanned(extraction))) {
        pages = extraction.pages;
      } else if (isAIConfigured()) {
        const provider = getProvider();
        if (kind === "pdf" && !provider.supportsPdfInput) {
          throw new AIError("This PDF looks scanned and the configured AI provider can't read scanned PDFs.", 422);
        }
        ocr = true;
        pages = await transcribe(
          { userId: job.user_id, feature: "ocr", skipRateLimit: true },
          kind === "image"
            ? [{ type: "image", mediaType: (res.mime_type as "image/png" | "image/jpeg" | "image/webp") ?? "image/jpeg", data: toBase64(bytes) }]
            : [{ type: "pdf", data: toBase64(bytes), name: res.title }],
        );
      } else {
        throw new AIError("This looks like a scan or photo. Text recognition needs AI to be configured on the server.", 422);
      }
    } else if (res.type === "note") {
      pages = [{ page: 1, text: res.content ?? "" }];
    } else if (res.type === "web" && res.url) {
      try {
        const page = await fetchWebText(res.url);
        pages = [{ page: 1, text: page.text }];
        if (page.title && (!title || title === res.url)) title = page.title.slice(0, 300);
      } catch {
        // Unreachable page: keep the link as a bookmark.
        pages = [];
      }
    } else if (res.type === "youtube" && res.url) {
      const meta = await youtubeMeta(res.url);
      if (meta && (!title || title === res.url)) title = meta.title;
      const described = [meta?.title, meta?.author && `Channel: ${meta.author}`, res.content].filter(Boolean).join("\n");
      pages = described ? [{ page: 1, text: described }] : [];
    }

    // ---------- 2. Chunks + embeddings ----------
    const chunks = chunkPages(pages);
    await admin.from("resource_chunks").delete().eq("resource_id", res.id);
    if (chunks.length) {
      const vectors = embeddingsEnabled() ? await embed(chunks.map((c) => c.content)) : [];
      const rows = chunks.map((c, i) => ({
        resource_id: res.id,
        user_id: job.user_id,
        chunk_index: c.index,
        page_number: c.pageNumber,
        content: c.content,
        token_count: c.tokenEstimate,
        embedding: toVector(vectors[i]),
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin.from("resource_chunks").insert(rows.slice(i, i + 200));
        if (error) throw error;
      }
    }
    await setStatus("analyzing", { title, page_count: pages.length || null });

    // ---------- 3. Catalogue for linking ----------
    const [{ data: subjects }, { data: topics }] = await Promise.all([
      admin.from("subjects").select("id, name, code").eq("owner_id", job.user_id),
      admin.from("topics").select("id, subject_id, name, chapters(name)").eq("owner_id", job.user_id).limit(600),
    ]);
    const scopedTopics = (topics ?? []).filter((t) => !res.subject_id || t.subject_id === res.subject_id);
    const { data: savedChunks } = await admin.from("resource_chunks").select("id, content, embedding").eq("resource_id", res.id).order("chunk_index");

    // Chunk → topic: vector match when available, otherwise topic-name keyword match.
    const chunkTopic = new Map<string, string>();
    for (const c of savedChunks ?? []) {
      if (c.embedding) {
        const { data: match } = await admin.rpc("match_topics_for_user", {
          p_user_id: job.user_id,
          query_embedding: c.embedding as unknown as string,
          filter_subject_id: res.subject_id ?? undefined,
        });
        if (match?.[0]) chunkTopic.set(c.id, match[0].topic_id);
      } else {
        const lower = c.content.toLowerCase();
        const hit = scopedTopics
          .filter((t) => t.name.length > 3 && lower.includes(t.name.toLowerCase()))
          .sort((a, b) => b.name.length - a.name.length)[0];
        if (hit) chunkTopic.set(c.id, hit.id);
      }
    }
    await Promise.all([...chunkTopic.entries()].map(([chunkId, topicId]) => admin.from("resource_chunks").update({ topic_id: topicId }).eq("id", chunkId)));

    // ---------- 4. AI analysis (cheap model, bounded sample — never the whole document) ----------
    let analysis: Awaited<ReturnType<typeof analyzeDocument>> | null = null;
    if (isAIConfigured() && chunks.length) {
      analysis = await analyzeDocument(
        { userId: job.user_id, feature: "document_analysis", skipRateLimit: true },
        {
          title,
          sample: [{ type: "text", text: sampleForAnalysis(chunks) }],
          catalogue: {
            subjects: (subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name })),
            topics: scopedTopics.map((t) => ({ id: t.id, subject_id: t.subject_id, chapter: (t.chapters as { name: string } | null)?.name ?? "", name: t.name })),
          },
        },
      );
    }

    // Topic links: AI suggestions + chunk-level matches (unconfirmed until the student reviews).
    const linkScores = new Map<string, number>();
    for (const t of analysis?.topics ?? []) linkScores.set(t.topic_id, Math.max(linkScores.get(t.topic_id) ?? 0, t.confidence));
    const chunkCounts = new Map<string, number>();
    for (const topicId of chunkTopic.values()) chunkCounts.set(topicId, (chunkCounts.get(topicId) ?? 0) + 1);
    for (const [topicId, count] of chunkCounts) linkScores.set(topicId, Math.max(linkScores.get(topicId) ?? 0, Math.min(0.95, 0.5 + count * 0.1)));
    if (linkScores.size) {
      await admin.from("topic_resource_links").delete().eq("resource_id", res.id).eq("source", "ai").eq("confirmed", false);
      await admin.from("topic_resource_links").upsert(
        [...linkScores.entries()].map(([topic_id, confidence]) => ({ user_id: job.user_id, resource_id: res.id, topic_id, confidence, source: "ai" as const })),
        { onConflict: "topic_id,resource_id", ignoreDuplicates: true },
      );
    }

    await setStatus("ready", {
      summary: analysis?.summary ?? null,
      ai_analysis: analysis ? ({ ...analysis, ocr } as unknown as Json) : ({ ocr } as Json),
      suggested_subject_id: !res.subject_id ? analysis?.subject_id ?? null : null,
    });
  } catch (err) {
    const friendly = err instanceof AIError ? err.userMessage : "We couldn't analyze this document yet.";
    const final = job.attempts >= 3 || (err instanceof AIError && !err.retryable);
    await setStatus(final ? "failed" : "processing", { processing_error: friendly });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { retryable: !final });
  }
}
