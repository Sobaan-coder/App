import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SessionSetup } from "@/components/study/session-setup";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Start study session" };

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ topic?: string; plan_session?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: topics }, planSession] = await Promise.all([
    supabase.from("topics").select("id, name, subjects(name, code)").eq("owner_id", user.id).is("parent_topic_id", null).order("sort_order"),
    sp.plan_session
      ? supabase.from("study_plan_sessions").select("id, title, topic_id, goals, duration, topics(name)").eq("id", sp.plan_session).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const ps = planSession.data;
  const topicName = ps ? (ps.topics as { name: string } | null)?.name : topics?.find((t) => t.id === sp.topic)?.name;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Study session" title={ps?.title ?? topicName ?? "Start a focused session"} description="Set your goals, then focus. At the end you'll rate your confidence — Study OS adapts your plan and revision." />
      <Card>
        <CardContent>
          <SessionSetup
            topics={(topics ?? []).map((t) => {
              const s = t.subjects as { name: string; code: string | null } | null;
              return { id: t.id, name: t.name, subject: s?.code || s?.name || "" };
            })}
            defaultTopicId={ps?.topic_id ?? sp.topic ?? null}
            planSessionId={ps?.id ?? null}
            defaultGoals={ps?.goals ?? []}
            duration={ps?.duration ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
