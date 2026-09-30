import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuizResults, QuizRunner, type GradedItem } from "@/components/quiz/quiz-runner";
import { requireUser } from "@/lib/auth";
import type { QuizItem } from "@/lib/ai/quiz-generator";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: a } = await supabase.from("quiz_attempts").select("*, topics(name), subjects(name, code)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!a) notFound();
  const title = (a.topics as { name: string } | null)?.name ?? (a.subjects as { name: string } | null)?.name ?? "Quiz";
  const again = `/quiz?${a.topic_id ? `topic=${a.topic_id}` : `subject=${a.subject_id}`}`;

  if (!a.completed_at) {
    // Strip answers and explanations before anything reaches the browser.
    const questions = (a.items as unknown as QuizItem[]).map((q) => ({ question: q.question, options: q.options }));
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Quiz · {a.difficulty}</p>
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">{title}</h1>
        <QuizRunner id={a.id} questions={questions} />
      </div>
    );
  }

  const items = a.items as unknown as GradedItem[];
  const topicIds = [...new Set(items.map((i) => i.topic_id).filter(Boolean))] as string[];
  const { data: topics } = topicIds.length ? await supabase.from("topics").select("id, name").in("id", topicIds) : { data: [] };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Quiz results · {a.difficulty}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <Button asChild variant="outline">
          <Link href={again}>
            <RotateCcw /> New quiz
          </Link>
        </Button>
      </div>
      <QuizResults items={items} score={a.score} total={a.total} topicNames={Object.fromEntries((topics ?? []).map((t) => [t.id, t.name]))} />
    </div>
  );
}
