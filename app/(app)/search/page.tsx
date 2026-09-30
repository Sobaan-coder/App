import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Search" };

const LABEL: Record<string, string> = {
  subject: "Subjects", topic: "Topics", resource: "Resources", chunk: "Inside your notes & PDFs", past_paper_question: "Past-paper questions",
  question: "Question bank", task: "Tasks", flashcard: "Flashcards", study_session: "Study sessions", conversation: "AI conversations",
};
const HREF: Record<string, (r: { id: string; parent_id: string | null }) => string> = {
  subject: (r) => `/subjects/${r.id}`, topic: (r) => `/topics/${r.id}`, resource: (r) => `/resources/${r.id}`, chunk: (r) => `/resources/${r.parent_id}`,
  past_paper_question: (r) => `/past-papers/${r.parent_id}#q-${r.id}`, question: (r) => `/questions?focus=${r.id}`, task: () => "/deadlines",
  flashcard: () => "/flashcards", study_session: (r) => `/study/session/${r.id}`, conversation: (r) => `/tutor/${r.id}`,
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const query = q.trim().slice(0, 200);
  const { data } = query.length >= 2 ? await supabase.rpc("search_workspace", { p_query: query, p_limit: 10 }) : { data: [] };
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" description="Subjects, topics, notes, PDFs, past papers, questions, tasks, flashcards and conversations." />
      <form action="/search" className="mb-6 flex gap-2">
        <Input name="q" defaultValue={query} placeholder="e.g. depreciation" aria-label="Search your workspace" autoFocus />
        <Button type="submit">
          <Search /> Search
        </Button>
      </form>
      {query.length >= 2 && !data?.length && <EmptyState icon={Search} title="No results" description={`Nothing in your workspace matches “${query}”.`} />}
      <div className="space-y-6">
        {[...groups.entries()].map(([kind, rows]) => (
          <section key={kind}>
            <h2 className="mb-2 text-sm font-semibold">{LABEL[kind] ?? kind}</h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {rows.map((r) => (
                <li key={`${kind}-${r.id}`}>
                  <Link href={HREF[kind]?.(r) ?? "/"} className="block px-4 py-3 hover:bg-accent/40">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    {r.snippet && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.snippet.replace(/<\/?b>/g, "")}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
