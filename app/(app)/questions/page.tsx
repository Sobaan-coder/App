import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { QuestionFilters } from "@/components/questions/question-filters";
import { QuestionItem, type QuestionRow } from "@/components/questions/question-item";
import { AddQuestionDialog } from "@/components/questions/add-question-dialog";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Question Bank" };

const PAGE_SIZE = 20;
type Search = {
  q?: string; subject?: string; topic?: string; type?: string; difficulty?: string; year?: string;
  source?: string; status?: string; flag?: string; page?: string; focus?: string;
};

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ data: subjects }, { data: topics }] = await Promise.all([
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
    supabase.from("topics").select("id, name, subject_id").eq("owner_id", user.id).is("parent_topic_id", null).order("sort_order"),
  ]);

  let query = supabase
    .from("questions")
    .select("*, subjects(name, code), topics(id, name), past_paper_questions(past_paper_id, past_papers(title))", { count: "exact" })
    .eq("user_id", user.id)
    .order("year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.focus) query = query.eq("id", sp.focus);
  if (sp.subject) query = query.eq("subject_id", sp.subject);
  if (sp.topic) query = query.eq("topic_id", sp.topic);
  if (sp.type) query = query.eq("question_type", sp.type as "mcq");
  if (sp.difficulty) query = query.eq("difficulty", Number(sp.difficulty));
  if (sp.year) query = query.eq("year", Number(sp.year));
  if (sp.source) query = query.eq("source_type", sp.source);
  if (sp.status) query = query.eq("solved_status", sp.status as "solved");
  if (sp.flag === "bookmarked") query = query.eq("bookmarked", true);
  if (sp.flag === "difficult") query = query.eq("marked_difficult", true);
  if (sp.q) {
    const words = sp.q.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 8) ?? [];
    if (words.length) query = query.textSearch("question_text", words.join(" | "), { config: "english" });
  }
  const { data, count } = await query;

  const rows: QuestionRow[] = (data ?? []).map((q) => {
    const ppq = q.past_paper_questions as { past_paper_id: string; past_papers: { title: string } | null } | null;
    const subj = q.subjects as { name: string; code: string | null } | null;
    return {
      id: q.id,
      question_text: q.question_text,
      answer: q.answer,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      question_type: q.question_type,
      difficulty: q.difficulty,
      marks: q.marks !== null ? Number(q.marks) : null,
      year: q.year,
      source_type: q.source_type as QuestionRow["source_type"],
      source_id: q.source_id,
      paper_id: ppq?.past_paper_id ?? null,
      paper_title: ppq?.past_papers?.title ?? null,
      solved_status: q.solved_status,
      bookmarked: q.bookmarked,
      marked_difficult: q.marked_difficult,
      note: q.note,
      attempts: q.attempts,
      subject: subj ? subj.code || subj.name : null,
      topic: q.topics as { id: string; name: string } | null,
    };
  });

  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }));
  const makeHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    params.set("page", String(p));
    return `/questions?${params}`;
  };
  const filtered = Object.entries(sp).some(([k, v]) => v && k !== "page");

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description="Every past-paper question, quiz question and question you've added — practise, bookmark and track what you've solved."
        actions={<AddQuestionDialog subjects={subjectOptions} topics={topics ?? []} />}
      />
      <QuestionFilters subjects={subjectOptions} topics={topics ?? []} />
      {rows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={filtered ? "No questions match" : "Your question bank is empty"}
          description={filtered ? "Try different filters." : "Upload past papers or take quizzes — questions collect here automatically."}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{count} question{count === 1 ? "" : "s"}</p>
          <ul className="space-y-3">
            {rows.map((q) => (
              <QuestionItem key={q.id} q={q} defaultOpen={sp.focus === q.id} />
            ))}
          </ul>
          <Pagination page={page} pageCount={Math.ceil((count ?? 0) / PAGE_SIZE)} makeHref={makeHref} />
        </>
      )}
    </div>
  );
}
