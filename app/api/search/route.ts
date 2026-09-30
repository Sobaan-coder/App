import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/api";

const HREF: Record<string, (r: { id: string; subject_id: string | null; parent_id: string | null }) => string> = {
  subject: (r) => `/subjects/${r.id}`,
  topic: (r) => `/topics/${r.id}`,
  resource: (r) => `/resources/${r.id}`,
  chunk: (r) => `/resources/${r.parent_id}`,
  past_paper_question: (r) => `/past-papers/${r.parent_id}#q-${r.id}`,
  question: (r) => `/questions?focus=${r.id}`,
  task: () => `/deadlines`,
  flashcard: () => `/flashcards`,
  study_session: (r) => `/study/session/${r.id}`,
  conversation: (r) => `/tutor/${r.id}`,
};

export async function GET(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const { data, error } = await auth.supabase.rpc("search_workspace", { p_query: q.slice(0, 200), p_limit: 5 });
  if (error) return NextResponse.json({ error: "Search failed." }, { status: 500 });
  return NextResponse.json({
    results: (data ?? []).map((r) => ({ kind: r.kind, id: r.id, title: r.title, snippet: r.snippet, href: HREF[r.kind]?.(r) ?? "/" })),
  });
}
