import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Library, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { getProfile, requireUser } from "@/lib/auth";
import { daysUntil, getSubjects, todayIn } from "@/lib/data/workspace";
import { daysLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Subjects" };

const ACCENT: Record<string, string> = {
  indigo: "from-[oklch(0.55_0.2_275)] to-[oklch(0.6_0.18_295)]",
  violet: "from-[oklch(0.55_0.2_300)] to-[oklch(0.62_0.18_320)]",
  emerald: "from-[oklch(0.6_0.14_160)] to-[oklch(0.66_0.13_185)]",
  amber: "from-[oklch(0.72_0.15_70)] to-[oklch(0.7_0.16_45)]",
  rose: "from-[oklch(0.62_0.19_15)] to-[oklch(0.62_0.2_350)]",
  sky: "from-[oklch(0.62_0.14_235)] to-[oklch(0.66_0.12_210)]",
  slate: "from-[oklch(0.5_0.03_260)] to-[oklch(0.6_0.03_260)]",
};

export default async function SubjectsPage() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile?.timezone);
  const subjects = await getSubjects(supabase, user.id);

  const actions = (
    <>
      <Button asChild variant="outline">
        <Link href="/subjects/new">
          <Plus /> Add subject
        </Link>
      </Button>
      <Button asChild>
        <Link href="/subjects/import">
          <Upload /> Import syllabus
        </Link>
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader title="Subjects" description="Each subject is its own workspace: topics, resources, past papers, plans and progress." actions={actions} />
      {subjects.length === 0 ? (
        <EmptyState icon={Library} title="No subjects yet" description="Upload your syllabus and Study OS will build subjects, chapters and topics for you." action={actions} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const days = s.exam_date ? daysUntil(s.exam_date, today) : null;
            return (
              <li key={s.id}>
                <Link href={`/subjects/${s.id}`} className="group block h-full overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-md">
                  <div className={cn("h-2 bg-gradient-to-r", ACCENT[s.color] ?? ACCENT.indigo)} />
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 font-semibold leading-snug group-hover:text-primary">{s.name}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{s.topicCount} topics</p>
                      </div>
                      {s.code && <Badge variant="secondary">{s.code}</Badge>}
                    </div>
                    <div>
                      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span className="tabular-nums">{s.progress}%</span>
                      </div>
                      <Progress value={s.progress} className="h-1.5" aria-label={`${s.name} progress`} />
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      {days === null ? "No exam date" : days < 0 ? "Exam passed" : <span className={days <= 7 ? "font-medium text-destructive" : undefined}>Exam {days === 0 ? "today" : `in ${daysLabel(days)}`}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
