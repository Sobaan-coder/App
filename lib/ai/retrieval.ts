import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { embedOne, toVector } from "./embeddings";

export type Source = {
  n: number; // citation number [S#]
  kind: "chunk" | "past_paper_question";
  id: string;
  resourceId: string | null;
  title: string;
  page: number | null;
  content: string;
  paperId?: string;
  year?: number | null;
};

/**
 * RAG retrieval over the student's own knowledge base (RLS-scoped client):
 * question → embedding (if configured) → hybrid vector + full-text search →
 * top chunks, plus matching past-paper questions so the tutor can answer
 * "was this asked?" from evidence rather than memory.
 */
export async function retrieve(
  supabase: ServerClient,
  query: string,
  opts: { subjectId?: string | null; topicId?: string | null; resourceId?: string | null; k?: number } = {},
): Promise<Source[]> {
  const embedding = await embedOne(query).catch(() => null);
  const k = opts.k ?? 6;
  const [{ data: chunks }, papers] = await Promise.all([
    supabase.rpc("match_resource_chunks", {
      query_text: query,
      query_embedding: toVector(embedding) ?? undefined,
      match_count: k,
      filter_subject_id: opts.resourceId ? undefined : opts.subjectId ?? undefined,
      filter_topic_id: opts.resourceId ? undefined : opts.topicId ?? undefined,
      filter_resource_id: opts.resourceId ?? undefined,
    }),
    opts.resourceId ? Promise.resolve([]) : searchPastPaperQuestions(supabase, query, opts.subjectId ?? null, opts.topicId ?? null),
  ]);

  const sources: Source[] = [];
  for (const c of chunks ?? []) {
    sources.push({ n: sources.length + 1, kind: "chunk", id: c.chunk_id, resourceId: c.resource_id, title: c.resource_title, page: c.page_number, content: c.content.slice(0, 2400) });
  }
  for (const q of papers) sources.push({ ...q, n: sources.length + 1 });
  return sources;
}

async function searchPastPaperQuestions(supabase: ServerClient, query: string, subjectId: string | null, topicId: string | null) {
  // Topic filter: questions mapped to the topic. Otherwise full-text match on the question.
  if (topicId) {
    const { data } = await supabase
      .from("question_topic_links")
      .select("past_paper_questions(id, question_number, question_text, marks, past_papers(id, title, year))")
      .eq("topic_id", topicId)
      .limit(6);
    return (data ?? []).map((l) => toSource(l.past_paper_questions as unknown as PPQ)).filter(Boolean) as Omit<Source, "n">[];
  }
  const words = query.toLowerCase().match(/[a-z0-9]{3,}/g)?.slice(0, 8) ?? [];
  if (!words.length) return [];
  let q = supabase
    .from("past_paper_questions")
    .select("id, question_number, question_text, marks, past_papers!inner(id, title, year, subject_id)")
    .textSearch("question_text", words.join(" | "), { config: "english" })
    .limit(4);
  if (subjectId) q = q.eq("past_papers.subject_id", subjectId);
  const { data } = await q;
  return (data ?? []).map((d) => toSource(d as unknown as PPQ)).filter(Boolean) as Omit<Source, "n">[];
}

type PPQ = { id: string; question_number: string; question_text: string; marks: number | null; past_papers: { id: string; title: string; year: number | null } } | null;

function toSource(q: PPQ): Omit<Source, "n"> | null {
  if (!q) return null;
  return {
    kind: "past_paper_question",
    id: q.id,
    resourceId: null,
    paperId: q.past_papers.id,
    year: q.past_papers.year,
    title: `${q.past_papers.title} — Q${q.question_number}`,
    page: null,
    content: `${q.question_text}${q.marks ? ` (${Number(q.marks)} marks)` : ""}`,
  };
}

/** Format sources for the prompt. The model may only cite these numbers. */
export function formatSources(sources: Source[]) {
  if (!sources.length) return "<sources>none found in the student's materials</sources>";
  return `<sources>\n${sources
    .map((s) =>
      s.kind === "chunk"
        ? `<source n="${s.n}" type="student material" title="${escapeAttr(s.title)}"${s.page ? ` page="${s.page}"` : ""}>\n${s.content}\n</source>`
        : `<source n="${s.n}" type="past paper question" title="${escapeAttr(s.title)}"${s.year ? ` year="${s.year}"` : ""}>\n${s.content}\n</source>`,
    )
    .join("\n")}\n</sources>`;
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "'").replace(/[<>]/g, "");
}

/** Which sources the answer actually cited ([S1], [S2]…). Unknown numbers are ignored. */
export function citedSources(answer: string, sources: Source[]) {
  const used = new Set([...answer.matchAll(/\[S(\d+)\]/g)].map((m) => Number(m[1])));
  return sources.filter((s) => used.has(s.n));
}
