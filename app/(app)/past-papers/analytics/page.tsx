import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, Info, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Stat } from "@/components/common/stat";
import { BarChart } from "@/components/charts/bar-chart";
import { SubjectSwitcher } from "@/components/common/subject-switcher";
import { requireUser } from "@/lib/auth";
import { computePaperAnalytics, frequencyPhrase } from "@/lib/analytics/past-papers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Past-paper analytics" };

const TYPE_LABEL: Record<string, string> = { mcq: "MCQ", short: "Short", long: "Long", numerical: "Numerical", theory: "Theory", case_study: "Case study" };

const TREND = {
  rising: { icon: ArrowUpRight, label: "More frequent recently" },
  falling: { icon: ArrowDownRight, label: "Less frequent recently" },
  steady: { icon: ArrowRight, label: "Steady" },
  none: { icon: Minus, label: "Not seen" },
};

export default async function PaperAnalyticsPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: subjects } = await supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order");
  const subject = subjects?.find((s) => s.id === sp.subject) ?? subjects?.[0];

  if (!subject) {
    return <EmptyState icon={BarChart3} title="No subjects yet" description="Add a subject and upload past papers to see analytics." />;
  }

  const [{ data: papers }, { data: topics }] = await Promise.all([
    supabase.from("past_papers").select("id, year, title").eq("subject_id", subject.id).eq("processing_status", "ready"),
    supabase.from("topics").select("id, name, sort_order, chapter_id, chapters(name, sort_order)").eq("subject_id", subject.id).is("parent_topic_id", null),
  ]);
  const paperIds = (papers ?? []).map((p) => p.id);
  const { data: questions } = paperIds.length
    ? await supabase.from("past_paper_questions").select("id, past_paper_id, marks, question_type, question_topic_links(topic_id, confidence)").in("past_paper_id", paperIds)
    : { data: [] };

  const a = computePaperAnalytics(
    (papers ?? []).map((p) => ({ id: p.id, year: p.year, title: p.title })),
    (questions ?? []).map((q) => ({ id: q.id, paperId: q.past_paper_id, marks: q.marks !== null ? Number(q.marks) : null, type: q.question_type })),
    (questions ?? []).flatMap((q) => (q.question_topic_links ?? []).map((l) => ({ questionId: q.id, topicId: l.topic_id, confidence: Number(l.confidence) }))),
    (topics ?? []).map((t) => {
      const ch = t.chapters as { name: string; sort_order: number } | null;
      return { id: t.id, name: t.name, chapterId: t.chapter_id, chapterName: ch?.name ?? "", chapterOrder: ch?.sort_order ?? 0, order: t.sort_order };
    }),
  );

  const byFrequency = [...a.topics].filter((t) => t.paperCount > 0).sort((x, y) => y.paperCount - x.paperCount || y.marks - x.marks);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Past-paper analytics"
        description="What your uploaded papers have examined — by topic, year and marks."
        actions={<SubjectSwitcher subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }))} current={subject.id} basePath="/past-papers/analytics" />}
      />

      <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        These figures describe only the papers you uploaded. They show what was examined historically — not what will appear in a future exam.
      </p>

      {a.papers.length === 0 ? (
        <EmptyState icon={BarChart3} title={`No analysed papers for ${subject.code || subject.name}`} description="Upload past papers and analytics appear here once they're mapped." action={<Link className="text-sm font-medium text-primary hover:underline" href={`/past-papers?subject=${subject.id}&upload=1`}>Upload past papers</Link>} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Papers analysed" value={a.papers.length} hint={a.papers.map((p) => p.label).join(" · ")} />
            <Stat label="Questions" value={a.totalQuestions} hint={`${Math.round(a.mappedShare * 100)}% mapped to topics`} />
            <Stat label="Topics examined" value={`${a.topics.length - a.unexamined.length}/${a.topics.length}`} />
            <Stat label="Most frequent" value={<span className="line-clamp-1 text-lg">{byFrequency[0]?.name ?? "—"}</span>} hint={byFrequency[0] ? `${byFrequency[0].paperCount} of ${a.papers.length} papers` : undefined} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Topic frequency by year</CardTitle>
              <CardDescription>✓ = the topic was examined in that paper. Sorted by how many papers it appeared in.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    {a.papers.map((p) => (
                      <TableHead key={p.id} className="text-center">
                        {p.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Frequency</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Marks</TableHead>
                    <TableHead className="hidden md:table-cell">Recent trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byFrequency.map((t) => {
                    const trend = TREND[t.trend];
                    return (
                      <TableRow key={t.topicId}>
                        <TableCell className="max-w-56">
                          <Link href={`/topics/${t.topicId}`} className="block truncate font-medium hover:text-primary" title={frequencyPhrase(t)}>
                            {t.name}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">{t.chapter}</span>
                        </TableCell>
                        {a.papers.map((p) => (
                          <TableCell key={p.id} className="text-center">
                            {t.appearedIn[p.label] ? (
                              <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary/12 text-primary">
                                <Check className="size-3.5" aria-label="appeared" />
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50" aria-label="did not appear">
                                ✗
                              </span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-medium tabular-nums">
                          {t.paperCount}/{t.totalPapers}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{t.marks || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <trend.icon className="size-3.5" /> {trend.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {byFrequency[0] && <p className="mt-4 text-sm text-muted-foreground">{byFrequency[0].name}: {frequencyPhrase(byFrequency[0])}</p>}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Marks by chapter</CardTitle>
                <CardDescription>Total marks of questions whose main topic is in each chapter.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  horizontal
                  caption="Marks by chapter across uploaded papers"
                  valueLabel="Marks"
                  data={a.chapterMarks.map((c) => ({ label: c.chapter.length > 22 ? c.chapter.slice(0, 21) + "…" : c.chapter, value: c.marks, hint: `${Math.round(c.share * 100)}% of mapped marks` }))}
                />
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Question types</CardTitle>
                <CardDescription>How questions were asked.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart caption="Number of questions by type" valueLabel="Questions" data={a.types.map((t) => ({ label: TYPE_LABEL[t.type] ?? t.type, value: t.count }))} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Repeated concepts</CardTitle>
                <CardDescription>Topics examined by 3 or more questions across your papers.</CardDescription>
              </CardHeader>
              <CardContent>
                {a.repeated.length ? (
                  <ul className="space-y-2">
                    {a.repeated.map((t) => (
                      <li key={t.topicId} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/topics/${t.topicId}`} className="truncate font-medium hover:text-primary">
                          {t.name}
                        </Link>
                        <Badge variant="secondary">{t.questionCount} questions</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No topic has been examined 3+ times yet.</p>
                )}
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Unattempted topics</CardTitle>
                <CardDescription>Syllabus topics not found in any of your uploaded papers.</CardDescription>
              </CardHeader>
              <CardContent>
                {a.unexamined.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {a.unexamined.map((t) => (
                      <Link key={t.topicId} href={`/topics/${t.topicId}`}>
                        <Badge variant="muted" className={cn("hover:bg-accent")}>
                          {t.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Every topic appeared at least once.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
