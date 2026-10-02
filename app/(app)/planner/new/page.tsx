import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlanForm } from "@/components/planner/plan-form";
import { getProfile, requireUser } from "@/lib/auth";
import { daysUntil, getSubjects, todayIn } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "New study plan" };

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ prompt?: string; subject?: string; days?: string; minutes?: string; replace?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile?.timezone);
  const subjects = await getSubjects(supabase, user.id);
  if (!subjects.length) {
    return <EmptyState icon={CalendarRange} title="Add a subject first" description="The planner builds your schedule from your syllabus topics." action={<Button asChild><Link href="/subjects/import">Import syllabus</Link></Button>} />;
  }
  const options = subjects.map((s) => ({ id: s.id, name: s.code || s.name, examDays: s.exam_date ? daysUntil(s.exam_date, today) : null }));
  const nearest = options.filter((s) => s.examDays !== null && s.examDays >= 0).sort((a, b) => a.examDays! - b.examDays!)[0];
  const subjectIds = sp.subject && options.some((s) => s.id === sp.subject) ? [sp.subject] : nearest ? [nearest.id] : [options[0].id];
  const days = sp.days ? Number(sp.days) : null;
  const minutes = sp.minutes ? Number(sp.minutes) : null;
  const first = options.find((o) => o.id === subjectIds[0]);
  const prompt =
    sp.prompt ??
    (minutes ? `Create a ${minutes}-minute study plan for today.` : `I have ${days ?? first?.examDays ?? 7} days before my ${first?.name} exam. What should I study?`);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Plan my study" description="Built from your actual syllabus, past-paper frequency, confidence, weak topics, exam date and available time." />
      <Card>
        <CardContent>
          <PlanForm subjects={options} defaults={{ prompt, subjectIds, days, minutes, dailyMinutes: profile?.daily_study_minutes ?? 120, replacePlanId: sp.replace ?? null }} />
        </CardContent>
      </Card>
    </div>
  );
}
