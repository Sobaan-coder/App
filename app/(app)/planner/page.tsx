import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Planner" };

export default async function PlannerPage() {
  const { supabase, user } = await requireUser();
  const { data: plans } = await supabase
    .from("study_plans")
    .select("id, title, status, start_date, end_date, summary, generated_at, subjects(name, code), study_plan_sessions(status, duration)")
    .eq("user_id", user.id)
    .order("status")
    .order("generated_at", { ascending: false })
    .limit(30);

  const action = (
    <Button asChild>
      <Link href="/planner/new">
        <Plus /> New plan
      </Link>
    </Button>
  );

  return (
    <div>
      <PageHeader title="Planner" description='Ask things like "I have 3 days before my FAR exam. What should I study?" — plans adapt as you study.' actions={action} />
      {!plans?.length ? (
        <EmptyState icon={CalendarRange} title="No study plans yet" description="Generate a realistic schedule from your syllabus, past papers, progress and exam date." action={action} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plans.map((p) => {
            const sessions = (p.study_plan_sessions as { status: string; duration: number }[]).filter((s) => s.status !== "skipped");
            const total = sessions.reduce((a, s) => a + s.duration, 0);
            const done = sessions.filter((s) => s.status === "done").reduce((a, s) => a + s.duration, 0);
            const subject = p.subjects as { name: string; code: string | null } | null;
            return (
              <li key={p.id}>
                <Link href={`/planner/${p.id}`} className="block h-full rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{p.title}</span>
                    <Badge variant={p.status === "active" ? "success" : "muted"}>{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {subject ? `${subject.code || subject.name} · ` : ""}
                    {formatDate(p.start_date)} – {p.end_date ? formatDate(p.end_date) : "…"}
                  </p>
                  {p.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>}
                  <Progress value={total ? (done / total) * 100 : 0} className="mt-4 h-1.5" aria-label="Plan progress" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
