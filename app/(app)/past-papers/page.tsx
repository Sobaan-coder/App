import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileQuestion, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { PaperUploadDialog } from "@/components/past-papers/paper-uploader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Past Papers" };

export default async function PastPapersPage({ searchParams }: { searchParams: Promise<{ subject?: string; upload?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: subjects }, { data: papers }, { data: review }] = await Promise.all([
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
    supabase
      .from("past_papers")
      .select("id, title, year, session, subject_id, processing_status, processing_error, total_marks, past_paper_questions(count)")
      .eq("user_id", user.id)
      .order("year", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("question_topic_links").select("question_id, past_paper_questions(past_paper_id)").eq("user_id", user.id).eq("needs_review", true),
  ]);
  const needsReview = new Map<string, number>();
  for (const r of review ?? []) {
    const pid = (r.past_paper_questions as { past_paper_id: string } | null)?.past_paper_id;
    if (pid) needsReview.set(pid, (needsReview.get(pid) ?? 0) + 1);
  }
  const options = (subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }));
  const busy = (papers ?? []).some((p) => ["uploading", "processing", "analyzing"].includes(p.processing_status));
  const visibleSubjects = (subjects ?? []).filter((s) => !sp.subject || s.id === sp.subject);

  return (
    <div>
      <AutoRefresh active={busy} />
      <PageHeader
        title="Past Papers"
        description="Upload papers and Study OS maps every question to your syllabus — so you can see what's historically examined."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/past-papers/analytics${sp.subject ? `?subject=${sp.subject}` : ""}`}>
                <BarChart3 /> Analytics
              </Link>
            </Button>
            <PaperUploadDialog subjects={options} defaultSubjectId={sp.subject} defaultOpen={sp.upload === "1"} />
          </>
        }
      />
      {!papers?.length ? (
        <EmptyState
          icon={FileQuestion}
          title="No past papers yet"
          description="Upload a past paper — PDF, scan or photo — and every question gets mapped to your syllabus topics automatically."
          action={<PaperUploadDialog subjects={options} defaultSubjectId={sp.subject} />}
        />
      ) : (
        <div className="space-y-8">
          {visibleSubjects.map((s) => {
            const list = papers.filter((p) => p.subject_id === s.id);
            if (!list.length) return null;
            return (
              <section key={s.id}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">
                    {s.name} {s.code && <span className="text-muted-foreground">· {s.code}</span>}
                  </h2>
                  <Link href={`/past-papers/analytics?subject=${s.id}`} className="text-sm font-medium text-primary hover:underline">
                    Topic frequency →
                  </Link>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((p) => {
                    const count = (p.past_paper_questions as unknown as { count: number }[])[0]?.count ?? 0;
                    const flagged = needsReview.get(p.id) ?? 0;
                    const working = ["uploading", "processing", "analyzing"].includes(p.processing_status);
                    return (
                      <li key={p.id}>
                        <Link href={`/past-papers/${p.id}`} className="block h-full rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
                          <div className="flex items-start justify-between gap-2">
                            <span className="line-clamp-2 font-medium">{p.title}</span>
                            {p.year && <Badge variant="secondary">{p.year}</Badge>}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {working ? "Analysing…" : `${count} questions${p.total_marks ? ` · ${Number(p.total_marks)} marks` : ""}${p.session ? ` · ${p.session}` : ""}`}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {working && (
                              <Badge variant="warning">
                                <Loader2 className="animate-spin" /> {p.processing_status}
                              </Badge>
                            )}
                            {p.processing_status === "failed" && <Badge variant="destructive">Failed</Badge>}
                            {flagged > 0 && <Badge variant="warning">{flagged} mapping{flagged === 1 ? "" : "s"} to review</Badge>}
                            {p.processing_status === "ready" && flagged === 0 && <Badge variant="success">Mapped</Badge>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
