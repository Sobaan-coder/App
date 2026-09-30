import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen, CalendarClock, CalendarRange, FileQuestion, FileText, FolderOpen, MessageSquare, NotebookPen, Plus, Sparkles, Upload, BarChart3,
} from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { TabNav } from "@/components/common/tab-nav";
import { ReadinessCard } from "@/components/progress/readiness-card";
import { ChapterBars, StatusDot } from "@/components/progress/topic-bars";
import { SubjectHeaderActions } from "@/components/subjects/subject-header-actions";
import { TopicTree, type TreeChapter } from "@/components/subjects/topic-tree";
import { requireUser, getProfile } from "@/lib/auth";
import { coverageOf, daysUntil, getSubjects, getTopicSignals, getTopicStats, getTopics, todayIn } from "@/lib/data/workspace";
import { getSubjectReadiness } from "@/lib/data/readiness";
import { STATUS_LABEL, daysLabel, formatDate } from "@/lib/format";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "topics", label: "Topics" },
  { key: "resources", label: "Resources" },
  { key: "past-papers", label: "Past Papers" },
  { key: "notes", label: "Notes" },
  { key: "planner", label: "Planner" },
  { key: "progress", label: "Progress" },
  { key: "tutor", label: "AI Tutor" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("subjects").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Subject" };
}

export default async function SubjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab = "overview" }] = await Promise.all([params, searchParams]);
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile?.timezone);

  const subject = (await getSubjects(supabase, user.id)).find((s) => s.id === id);
  if (!subject) notFound();
  const active = TABS.some((t) => t.key === tab) ? tab : "overview";
  const examDays = subject.exam_date ? daysUntil(subject.exam_date, today) : null;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Link href="/subjects" className="hover:text-foreground">
              Subjects
            </Link>
            {subject.code && <Badge variant="secondary">{subject.code}</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">{subject.name}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              Progress
              <Progress value={subject.progress} className="h-1.5 w-24" aria-label={`Progress ${subject.progress}%`} />
              <span className="font-medium tabular-nums text-foreground">{subject.progress}%</span>
            </span>
            {examDays !== null && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-4" /> Exam{" "}
                <span className={examDays <= 7 && examDays >= 0 ? "font-medium text-destructive" : "font-medium text-foreground"}>
                  {examDays < 0 ? `was ${formatDate(subject.exam_date!)}` : `${daysLabel(examDays)} · ${formatDate(subject.exam_date!)}`}
                </span>
              </span>
            )}
            <span>{subject.topicCount} topics</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SubjectHeaderActions subject={{ id: subject.id, name: subject.name, code: subject.code, exam_date: subject.exam_date }} />
        </div>
      </div>

      <TabNav tabs={TABS} active={active} base={`/subjects/${id}`} />

      {active === "overview" && <Overview subjectId={id} userId={user.id} examDays={examDays} code={subject.code || subject.name} />}
      {active === "topics" && <TopicsTab subjectId={id} userId={user.id} />}
      {active === "resources" && <ResourcesTab subjectId={id} userId={user.id} notes={false} />}
      {active === "notes" && <ResourcesTab subjectId={id} userId={user.id} notes />}
      {active === "past-papers" && <PapersTab subjectId={id} userId={user.id} />}
      {active === "planner" && <PlannerTab subjectId={id} userId={user.id} examDays={examDays} />}
      {active === "progress" && <ProgressTab subjectId={id} userId={user.id} />}
      {active === "tutor" && <TutorTab subjectId={id} userId={user.id} />}
    </div>
  );
}

async function Overview({ subjectId, userId, examDays, code }: { subjectId: string; userId: string; examDays: number | null; code: string }) {
  const { supabase } = await requireUser();
  const [topics, readiness, signals, papers, resources] = await Promise.all([
    getTopics(supabase, userId, subjectId),
    getSubjectReadiness(supabase, userId, subjectId),
    getTopicSignals(supabase, userId, [subjectId]),
    supabase.from("past_papers").select("id", { count: "exact", head: true }).eq("subject_id", subjectId),
    supabase.from("resources").select("id", { count: "exact", head: true }).eq("subject_id", subjectId),
  ]);

  if (topics.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No topics yet"
        description="Import your syllabus or add chapters and topics yourself."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/subjects/import">
                <Upload /> Import syllabus
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/subjects/${subjectId}?tab=topics`}>Add topics manually</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Topics</CardTitle>
            <CardDescription>Progress by chapter</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/subjects/${subjectId}?tab=topics`}>Manage</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ChapterBars topics={topics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Focus next
            </CardTitle>
            <CardDescription>
              {examDays !== null && examDays >= 0 ? `${daysLabel(examDays)} to ${code}. ` : ""}Ranked by past-paper frequency, your confidence and progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {signals.slice(0, 5).map((t) => (
              <Link key={t.topicId} href={`/topics/${t.topicId}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-accent/40">
                <StatusDot status={t.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.priority.reasons.join(" · ") || t.chapter}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="min-w-0 space-y-6">
        <ReadinessCard readiness={readiness} compact />
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/planner/new?subject=${subjectId}${examDays && examDays > 0 ? `&days=${examDays}` : ""}`}>
                <CalendarRange /> Generate study plan
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/quiz?subject=${subjectId}`}>
                <FileQuestion /> Quiz me
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/resources?subject=${subjectId}&upload=1`}>
                <FolderOpen /> Upload resource ({resources.count ?? 0})
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/past-papers?subject=${subjectId}&upload=1`}>
                <Upload /> Upload past paper ({papers.count ?? 0})
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/tutor?subject=${subjectId}`}>
                <Sparkles /> Ask the AI tutor
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function TopicsTab({ subjectId, userId }: { subjectId: string; userId: string }) {
  const { supabase } = await requireUser();
  const [topics, stats, chapters, { count: totalPapers }] = await Promise.all([
    getTopics(supabase, userId, subjectId),
    getTopicStats(supabase, subjectId),
    supabase.from("chapters").select("id, name, weightage").eq("subject_id", subjectId).order("sort_order"),
    supabase.from("past_papers").select("id", { count: "exact", head: true }).eq("subject_id", subjectId).eq("processing_status", "ready"),
  ]);
  const statById = new Map(stats.map((s) => [s.topic_id, s]));
  // Order: parent topics with their subtopics right after them.
  const tree: TreeChapter[] = (chapters.data ?? []).map((c) => {
    const inChapter = topics.filter((t) => t.chapter_id === c.id);
    const ordered = inChapter.filter((t) => !t.parent_topic_id).flatMap((p) => [p, ...inChapter.filter((s) => s.parent_topic_id === p.id)]);
    return {
      id: c.id,
      name: c.name,
      weightage: c.weightage !== null ? Number(c.weightage) : null,
      topics: ordered.map((t) => ({
        id: t.id,
        name: t.name,
        parentId: t.parent_topic_id,
        status: t.progress?.status ?? "not_started",
        confidence: t.progress?.confidence ?? null,
        paperCount: statById.get(t.id)?.paper_count ?? 0,
        totalPapers: totalPapers ?? 0,
        difficulty: t.difficulty,
      })),
    };
  });
  return <TopicTree subjectId={subjectId} chapters={tree} />;
}

async function ResourcesTab({ subjectId, userId, notes }: { subjectId: string; userId: string; notes: boolean }) {
  const { supabase } = await requireUser();
  let q = supabase.from("resources").select("id, title, type, processing_status, created_at, summary").eq("user_id", userId).eq("subject_id", subjectId).order("created_at", { ascending: false }).limit(50);
  q = notes ? q.eq("type", "note") : q.neq("type", "note");
  const { data } = await q;
  const cta = notes ? (
    <Button asChild>
      <Link href={`/resources/notes/new?subject=${subjectId}`}>
        <NotebookPen /> New note
      </Link>
    </Button>
  ) : (
    <Button asChild>
      <Link href={`/resources?subject=${subjectId}&upload=1`}>
        <Upload /> Upload resource
      </Link>
    </Button>
  );
  if (!data?.length) {
    return (
      <EmptyState
        icon={notes ? NotebookPen : FolderOpen}
        title={notes ? "No notes yet" : "No resources yet"}
        description={notes ? "Write notes for this subject — the AI tutor can use them to answer your questions." : "Upload your first study resource and Study OS will organize it for you."}
        action={cta}
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={`/resources?subject=${subjectId}`}>Open in library</Link>
        </Button>
        {cta}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.map((r) => (
          <li key={r.id}>
            <Link href={`/resources/${r.id}`} className="flex h-full gap-3 rounded-2xl border bg-card p-4 hover:bg-accent/40">
              <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.title}</span>
                <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.summary ?? formatDate(r.created_at)}</span>
                {r.processing_status !== "ready" && (
                  <Badge variant={r.processing_status === "failed" ? "destructive" : "warning"} className="mt-2">
                    {r.processing_status}
                  </Badge>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function PapersTab({ subjectId, userId }: { subjectId: string; userId: string }) {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("past_papers")
    .select("id, title, year, session, processing_status, total_marks, past_paper_questions(count)")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("year", { ascending: false, nullsFirst: false });
  if (!data?.length) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No past papers yet"
        description="Upload a past paper and Study OS maps every question to your syllabus topics."
        action={
          <Button asChild>
            <Link href={`/past-papers?subject=${subjectId}&upload=1`}>
              <Upload /> Upload past paper
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={`/past-papers/analytics?subject=${subjectId}`}>
            <BarChart3 /> Analytics
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/past-papers?subject=${subjectId}&upload=1`}>
            <Upload /> Upload past paper
          </Link>
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((p) => (
          <li key={p.id}>
            <Link href={`/past-papers/${p.id}`} className="block rounded-2xl border bg-card p-4 hover:bg-accent/40">
              <span className="block truncate font-medium">{p.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {[p.year, p.session].filter(Boolean).join(" · ")} · {(p.past_paper_questions as unknown as { count: number }[])[0]?.count ?? 0} questions
                {p.total_marks ? ` · ${Number(p.total_marks)} marks` : ""}
              </span>
              {p.processing_status !== "ready" && (
                <Badge variant={p.processing_status === "failed" ? "destructive" : "warning"} className="mt-2">
                  {p.processing_status}
                </Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function PlannerTab({ subjectId, userId, examDays }: { subjectId: string; userId: string; examDays: number | null }) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("study_plans").select("id, title, status, start_date, end_date, generated_at, summary").eq("user_id", userId).eq("subject_id", subjectId).order("generated_at", { ascending: false });
  const newHref = `/planner/new?subject=${subjectId}${examDays && examDays > 0 ? `&days=${examDays}` : ""}`;
  if (!data?.length) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No study plan yet"
        description="Generate a realistic schedule from your syllabus, past papers, exam date and progress."
        action={
          <Button asChild>
            <Link href={newHref}>
              <Sparkles /> Generate plan
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link href={newHref}>
            <Plus /> New plan
          </Link>
        </Button>
      </div>
      <ul className="space-y-3">
        {data.map((p) => (
          <li key={p.id}>
            <Link href={`/planner/${p.id}`} className="block rounded-2xl border bg-card p-4 hover:bg-accent/40">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <Badge variant={p.status === "active" ? "success" : "muted"}>{p.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(p.start_date)} – {p.end_date ? formatDate(p.end_date) : "…"}
              </p>
              {p.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function ProgressTab({ subjectId, userId }: { subjectId: string; userId: string }) {
  const { supabase } = await requireUser();
  const [readiness, signals] = await Promise.all([getSubjectReadiness(supabase, userId, subjectId), getTopicSignals(supabase, userId, [subjectId])]);
  const { data: progress } = await supabase.from("student_topic_progress").select("topic_id, mastery_score, last_studied_at, next_review_at").eq("user_id", userId);
  const p = new Map((progress ?? []).map((x) => [x.topic_id, x]));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-1">
        <ReadinessCard readiness={readiness} />
      </div>
      <Card className="min-w-0 lg:col-span-2">
        <CardHeader>
          <CardTitle>Topic mastery</CardTitle>
          <CardDescription>Coverage {coverageOf(signals.map((s) => s.status))}% · sorted by weakness</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="text-right">Weakness</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Next review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...signals]
                .sort((a, b) => b.priority.weakness - a.priority.weakness)
                .map((t) => (
                  <TableRow key={t.topicId}>
                    <TableCell className="max-w-56">
                      <Link href={`/topics/${t.topicId}`} className="block truncate font-medium hover:text-primary">
                        {t.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{t.chapter}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <StatusDot status={t.status} />
                        {STATUS_LABEL[t.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.confidence ? `${t.confidence}/5` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.priority.weakness}</TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                      {p.get(t.topicId)?.next_review_at ? formatDate(p.get(t.topicId)!.next_review_at!) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function TutorTab({ subjectId, userId }: { subjectId: string; userId: string }) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("ai_conversations").select("id, title, updated_at, mode").eq("user_id", userId).eq("subject_id", subjectId).order("updated_at", { ascending: false }).limit(20);
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-accent/60 to-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI Tutor for this subject
          </CardTitle>
          <CardDescription>Answers use your uploaded notes, syllabus and past papers first, with citations.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/tutor?subject=${subjectId}`}>
              <MessageSquare /> Start a conversation
            </Link>
          </Button>
        </CardContent>
      </Card>
      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/tutor/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-accent/40">
                <span className="truncate text-sm font-medium">{c.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(c.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
