import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BookOpen, CalendarClock, FileQuestion, FileText, Layers, ListChecks, Play, Sparkles, Timer } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TopicNotes, TopicStatusControls } from "@/components/topics/topic-controls";
import { requireUser } from "@/lib/auth";
import { getTopicSignals } from "@/lib/data/workspace";
import { formatDate, formatDateTime, minutesLabel } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("topics").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Topic" };
}

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: topic } = await supabase
    .from("topics")
    .select("*, chapters(id, name), subjects(id, name, code)")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!topic) notFound();
  const subject = topic.subjects as { id: string; name: string; code: string | null };
  const chapter = topic.chapters as { id: string; name: string };

  const [progressRes, subtopics, links, chunkResources, ppLinks, practice, sessions, signals] = await Promise.all([
    supabase.from("student_topic_progress").select("*").eq("user_id", user.id).eq("topic_id", id).maybeSingle(),
    supabase.from("topics").select("id, name").eq("parent_topic_id", id).order("sort_order"),
    supabase.from("topic_resource_links").select("confidence, confirmed, resources(id, title, type, processing_status)").eq("topic_id", id),
    supabase.from("resource_chunks").select("resource_id, page_number, resources(id, title, type)").eq("topic_id", id).limit(20),
    supabase
      .from("question_topic_links")
      .select("confidence, needs_review, past_paper_questions(id, question_number, question_text, marks, past_papers(id, title, year))")
      .eq("topic_id", id)
      .order("confidence", { ascending: false }),
    supabase.from("questions").select("id, question_text, question_type, difficulty, solved_status").eq("topic_id", id).neq("source_type", "past_paper").limit(10),
    supabase.from("study_sessions").select("id, started_at, duration, confidence_after, status").eq("topic_id", id).order("started_at", { ascending: false }).limit(6),
    getTopicSignals(supabase, user.id, [subject.id]),
  ]);
  const progress = progressRes.data;
  const signal = signals.find((s) => s.topicId === id);

  // Resources: explicit links + resources whose chunks were auto-linked to this topic.
  const resources = new Map<string, { id: string; title: string; type: string; pages: Set<number>; confidence: number | null }>();
  for (const l of links.data ?? []) {
    const r = l.resources as { id: string; title: string; type: string } | null;
    if (r) resources.set(r.id, { ...r, pages: new Set(), confidence: l.confidence !== null ? Number(l.confidence) : null });
  }
  for (const c of chunkResources.data ?? []) {
    const r = c.resources as { id: string; title: string; type: string } | null;
    if (!r) continue;
    const entry = resources.get(r.id) ?? { ...r, pages: new Set<number>(), confidence: null };
    if (c.page_number) entry.pages.add(c.page_number);
    resources.set(r.id, entry);
  }

  const questions = (ppLinks.data ?? [])
    .map((l) => ({ ...(l.past_paper_questions as unknown as { id: string; question_number: string; question_text: string; marks: number | null; past_papers: { id: string; title: string; year: number | null } }), confidence: Number(l.confidence), needsReview: l.needs_review }))
    .filter((q) => q.id)
    .sort((a, b) => (b.past_papers.year ?? 0) - (a.past_papers.year ?? 0));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link href={`/subjects/${subject.id}`} className="hover:text-foreground">
            {subject.code || subject.name}
          </Link>
          <span>/</span>
          <Link href={`/subjects/${subject.id}?tab=topics`} className="hover:text-foreground">
            {chapter.name}
          </Link>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{topic.name}</h1>
            {topic.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{topic.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/study/session/new?topic=${id}`}>
                <Play /> Study now
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/quiz?topic=${id}`}>
                <FileQuestion /> Quiz me
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/flashcards?generate=${id}`}>
                <Layers /> Flashcards
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/tutor?topic=${id}`}>
                <Sparkles /> Ask tutor
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <TopicStatusControls topicId={id} status={progress?.status ?? "not_started"} confidence={progress?.confidence ?? null} difficulty={topic.difficulty} />
          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Weakness score</p>
              <p className="mt-1 font-semibold tabular-nums">{signal?.priority.weakness ?? "—"}</p>
              {signal && <Progress value={signal.priority.weakness} className="mt-1.5 h-1" indicatorClassName="bg-destructive/70" aria-label="Weakness" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last studied</p>
              <p className="mt-1 font-semibold">{progress?.last_studied_at ? formatDate(progress.last_studied_at) : "Never"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next revision</p>
              <p className="mt-1 font-semibold">{progress?.next_review_at ? formatDate(progress.next_review_at) : "Not scheduled"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time studied</p>
              <p className="mt-1 font-semibold">{minutesLabel(progress?.minutes_studied ?? 0)}</p>
            </div>
          </div>
          {signal && signal.priority.reasons.length > 0 && (
            <p className="text-xs text-muted-foreground">Why this matters: {signal.priority.reasons.join(" · ")}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileQuestion className="size-4" /> Past-paper questions
            </CardTitle>
            <CardDescription>{questions.length ? `Mapped from your uploaded papers (${new Set(questions.map((q) => q.past_papers.id)).size} papers).` : "None of your uploaded papers were mapped to this topic."}</CardDescription>
          </CardHeader>
          <CardContent>
            {questions.length ? (
              <ul className="space-y-3">
                {questions.map((q) => (
                  <li key={q.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Link href={`/past-papers/${q.past_papers.id}#q-${q.id}`} className="font-medium text-foreground hover:text-primary">
                        {q.past_papers.year ?? q.past_papers.title} · Q{q.question_number}
                      </Link>
                      {q.marks !== null && <span>{Number(q.marks)} marks</span>}
                      <Badge variant={q.needsReview ? "warning" : "muted"}>
                        {q.needsReview && <AlertTriangle />} {Math.round(q.confidence * 100)}% match
                      </Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-sm">{q.question_text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/past-papers?subject=${subject.id}&upload=1`}>Upload a past paper</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" /> Resources
            </CardTitle>
            <CardDescription>Material in your library linked to this topic.</CardDescription>
          </CardHeader>
          <CardContent>
            {resources.size ? (
              <ul className="space-y-1">
                {[...resources.values()].map((r) => (
                  <li key={r.id}>
                    <Link href={`/resources/${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/50">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                      {r.pages.size > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          p.{[...r.pages].sort((a, b) => a - b).slice(0, 4).join(", ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing linked yet.{" "}
                <Link href={`/resources?subject=${subject.id}&upload=1`} className="font-medium text-primary hover:underline">
                  Upload notes
                </Link>{" "}
                and Study OS will link them automatically.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4" /> My notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopicNotes topicId={id} initial={progress?.notes ?? ""} />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {(subtopics.data?.length || topic.learning_objectives.length) ? (
            <Card>
              <CardHeader>
                <CardTitle>Syllabus detail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {subtopics.data && subtopics.data.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Subtopics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {subtopics.data.map((s) => (
                        <Link key={s.id} href={`/topics/${s.id}`}>
                          <Badge variant="secondary">{s.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {topic.learning_objectives.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Learning objectives</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {topic.learning_objectives.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4" /> Practice questions
              </CardTitle>
              <CardAction>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/questions?topic=${id}`}>Bank</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {practice.data?.length ? (
                <ul className="space-y-2">
                  {practice.data.map((q) => (
                    <li key={q.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="line-clamp-2">{q.question_text}</span>
                      <Badge variant={q.solved_status === "solved" ? "success" : "muted"}>{q.solved_status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Take a{" "}
                  <Link href={`/quiz?topic=${id}`} className="font-medium text-primary hover:underline">
                    quiz on this topic
                  </Link>{" "}
                  — questions you get wrong are saved here for practice.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="size-4" /> Study sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.data?.length ? (
                <ul className="space-y-2 text-sm">
                  {sessions.data.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <Link href={`/study/session/${s.id}`} className="flex items-center gap-2 hover:text-primary">
                        <CalendarClock className="size-3.5 text-muted-foreground" />
                        {formatDateTime(s.started_at)}
                      </Link>
                      <span className="text-muted-foreground">
                        {s.duration ? minutesLabel(s.duration) : s.status}
                        {s.confidence_after ? ` · ${s.confidence_after}/5` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
