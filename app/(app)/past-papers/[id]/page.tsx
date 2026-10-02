import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BarChart3, Download, Info, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { RetryButton } from "@/components/resources/retry-button";
import { PaperDetailsActions } from "@/components/past-papers/paper-details-actions";
import { QuestionMappingList, type MappedQuestion } from "@/components/past-papers/question-mapping";
import { requireUser } from "@/lib/auth";
import { BUCKETS, signedUrl } from "@/lib/storage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("past_papers").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Past paper" };
}

export default async function PastPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: paper } = await supabase.from("past_papers").select("*, subjects(id, name, code)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!paper) notFound();
  const subject = paper.subjects as { id: string; name: string; code: string | null };

  const [{ data: questions }, { data: topics }] = await Promise.all([
    supabase
      .from("past_paper_questions")
      .select("id, question_number, question_text, marks, question_type, page_number, question_topic_links(topic_id, confidence, confirmed, source)")
      .eq("past_paper_id", id)
      .order("sort_order"),
    supabase.from("topics").select("id, name, chapters(name, sort_order), sort_order").eq("subject_id", subject.id).order("sort_order"),
  ]);
  const url = paper.storage_path ? await signedUrl(supabase, BUCKETS.papers, paper.storage_path, 600) : null;
  const working = ["uploading", "processing", "analyzing"].includes(paper.processing_status);
  const subjectLabel = subject.code || subject.name;
  const mismatch =
    paper.detected_subject &&
    paper.processing_status === "ready" &&
    ![subject.name, subject.code ?? ""].some((n) => n && (paper.detected_subject!.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(paper.detected_subject!.toLowerCase())));

  const mapped: MappedQuestion[] = (questions ?? []).map((q) => ({
    id: q.id,
    number: q.question_number,
    text: q.question_text,
    marks: q.marks !== null ? Number(q.marks) : null,
    type: q.question_type,
    page: q.page_number,
    links: (q.question_topic_links ?? [])
      .map((l) => ({ topicId: l.topic_id, confidence: Number(l.confidence), confirmed: l.confirmed, source: l.source }))
      .sort((a, b) => b.confidence - a.confidence),
  }));

  return (
    <div className="space-y-6">
      <AutoRefresh active={working} intervalMs={3000} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Link href="/past-papers" className="text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
            Past papers · {subjectLabel}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{paper.title}</h1>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {paper.year && <Badge variant="secondary">{paper.year}</Badge>}
            {paper.session && <span>{paper.session}</span>}
            {paper.total_marks && <span>· {Number(paper.total_marks)} marks</span>}
            {paper.ocr_used && <Badge variant="muted">Text recognised from scan</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/past-papers/analytics?subject=${subject.id}`}>
              <BarChart3 /> Analytics
            </Link>
          </Button>
          {url && (
            <Button asChild variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Download /> Original
              </a>
            </Button>
          )}
          <PaperDetailsActions paper={{ id: paper.id, title: paper.title, year: paper.year, session: paper.session }} />
        </div>
      </div>

      {working && (
        <Alert variant="info">
          <Loader2 className="animate-spin" />
          <AlertTitle>{paper.processing_status === "analyzing" ? "Detecting questions and mapping them to your syllabus…" : paper.processing_status === "uploading" ? "Uploading…" : "Reading the paper…"}</AlertTitle>
          <AlertDescription>This takes about a minute. You can leave this page.</AlertDescription>
        </Alert>
      )}
      {paper.processing_status === "failed" && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t analyze this paper yet.</AlertTitle>
          <AlertDescription>
            <p>{paper.processing_error}</p>
            <div className="mt-2">
              <RetryButton endpoint={`/api/past-papers/${paper.id}/process`} />
            </div>
          </AlertDescription>
        </Alert>
      )}
      {mismatch && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>This paper looks like it&apos;s for “{paper.detected_subject}”</AlertTitle>
          <AlertDescription>You uploaded it under {subject.name}. If that&apos;s wrong, delete it and upload it under the right subject.</AlertDescription>
        </Alert>
      )}
      {paper.processing_status === "ready" && paper.processing_error && (
        <Alert>
          <Info />
          <AlertTitle>Notes from the analysis</AlertTitle>
          <AlertDescription>{paper.processing_error}</AlertDescription>
        </Alert>
      )}

      {mapped.length > 0 && (
        <QuestionMappingList
          paperId={paper.id}
          questions={mapped}
          topics={(topics ?? []).map((t) => ({ id: t.id, name: t.name, chapter: (t.chapters as { name: string } | null)?.name ?? "" }))}
        />
      )}
    </div>
  );
}
