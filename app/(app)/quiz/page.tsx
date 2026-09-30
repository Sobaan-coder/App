import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuizSetup } from "@/components/quiz/quiz-setup";
import { EmptyState } from "@/components/common/empty-state";
import { FileQuestion } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ searchParams }: { searchParams: Promise<{ subject?: string; topic?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: subjects }, { data: topics }, { data: attempts }] = await Promise.all([
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
    supabase.from("topics").select("id, name, subject_id").eq("owner_id", user.id).is("parent_topic_id", null).order("sort_order"),
    supabase.from("quiz_attempts").select("id, score, total, difficulty, completed_at, created_at, topics(name), subjects(code, name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
  ]);
  const topicSubject = topics?.find((t) => t.id === sp.topic)?.subject_id;
  if (!subjects?.length) return <EmptyState icon={FileQuestion} title="Add a subject first" description="Quizzes are generated from your syllabus and materials." />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <PageHeader title="Quiz me" description="Questions generated from your syllabus, uploaded material and past papers. Score, accuracy and weak areas are tracked." />
        <Card>
          <CardContent>
            <QuizSetup
              subjects={subjects.map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }))}
              topics={topics ?? []}
              defaultSubjectId={topicSubject ?? sp.subject ?? null}
              defaultTopicId={sp.topic ?? null}
            />
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0 self-start">
        <CardHeader>
          <CardTitle className="text-base">Recent quizzes</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts?.length ? (
            <ul className="space-y-2">
              {attempts.map((a) => (
                <li key={a.id}>
                  <Link href={`/quiz/${a.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{(a.topics as { name: string } | null)?.name ?? (a.subjects as { code: string | null; name: string } | null)?.code ?? "Mixed"}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)} · {a.difficulty}</span>
                    </span>
                    {a.completed_at ? <Badge variant={a.score / a.total >= 0.7 ? "success" : "warning"}>{a.score}/{a.total}</Badge> : <Badge variant="muted">In progress</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No quizzes yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
