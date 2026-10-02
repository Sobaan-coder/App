import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileQuestion, FileText, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionRunner } from "@/components/study/session-runner";
import { requireUser } from "@/lib/auth";
import { formatDateTime, minutesLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Study session" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: s } = await supabase.from("study_sessions").select("*, topics(id, name), study_plan_sessions(title, duration)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!s) notFound();
  const topic = s.topics as { id: string; name: string } | null;
  const planned = s.study_plan_sessions as { title: string; duration: number } | null;

  const [resources, questions] = topic
    ? await Promise.all([
        supabase.from("topic_resource_links").select("resources(id, title, type)").eq("topic_id", topic.id).limit(6),
        supabase.from("question_topic_links").select("past_paper_questions(id, question_number, question_text, marks, past_papers(id, year, title))").eq("topic_id", topic.id).order("confidence", { ascending: false }).limit(5),
      ])
    : [{ data: [] }, { data: [] }];
  const done = s.status === "done";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Study session</p>
          <h1 className="text-2xl font-semibold tracking-tight">{planned?.title ?? topic?.name ?? "Focused study"}</h1>
          {topic && (
            <Link href={`/topics/${topic.id}`} className="text-sm text-primary hover:underline">
              {topic.name}
            </Link>
          )}
        </div>
        {done && (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="success">Completed</Badge>
              <span>{formatDateTime(s.started_at)}</span>
              <span>· {minutesLabel(s.duration ?? 0)}</span>
              {s.confidence_after && (
                <span>
                  · confidence {s.confidence_before ? `${s.confidence_before} → ` : ""}
                  {s.confidence_after}/5
                </span>
              )}
            </CardContent>
          </Card>
        )}
        <SessionRunner id={s.id} startedAt={s.started_at} plannedMinutes={planned?.duration ?? null} initialGoals={(s.goals as { text: string; done: boolean }[]) ?? []} done={done} />
        {s.notes && <p className="rounded-xl bg-muted/60 p-3 text-sm whitespace-pre-wrap">{s.notes}</p>}
      </div>
      <div className="min-w-0 space-y-6">
        {topic && (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/tutor?topic=${topic.id}`}>
              <Sparkles /> Stuck? Ask the tutor
            </Link>
          </Button>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resources</CardTitle>
          </CardHeader>
          <CardContent>
            {resources.data?.length ? (
              <ul className="space-y-1">
                {resources.data.map((r, i) => {
                  const res = r.resources as { id: string; title: string } | null;
                  return res ? (
                    <li key={i}>
                      <Link href={`/resources/${res.id}`} target="_blank" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="truncate">{res.title}</span>
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No linked resources for this topic.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past-paper questions</CardTitle>
          </CardHeader>
          <CardContent>
            {questions.data?.length ? (
              <ul className="space-y-2">
                {questions.data.map((l, i) => {
                  const q = l.past_paper_questions as unknown as { id: string; question_number: string; question_text: string; marks: number | null; past_papers: { id: string; year: number | null; title: string } } | null;
                  return q ? (
                    <li key={i}>
                      <Link href={`/past-papers/${q.past_papers.id}#q-${q.id}`} target="_blank" className="block rounded-lg border p-2 text-sm hover:bg-accent">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileQuestion className="size-3" /> {q.past_papers.year ?? q.past_papers.title} · Q{q.question_number}
                          {q.marks ? ` · ${Number(q.marks)} marks` : ""}
                        </span>
                        <span className="line-clamp-2">{q.question_text}</span>
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No mapped past-paper questions.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
