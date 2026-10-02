import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TaskDialog } from "@/components/deadlines/task-dialog";
import { TaskRow } from "@/components/deadlines/task-row";
import { getProfile, requireUser } from "@/lib/auth";
import { todayIn } from "@/lib/data/workspace";
import { GROUP_LABEL, deadlineGroup, type DeadlineGroup } from "@/lib/deadlines";

export const metadata: Metadata = { title: "Deadlines" };

const ORDER: DeadlineGroup[] = ["overdue", "today", "tomorrow", "week", "later", "no_date", "done"];

export default async function DeadlinesPage() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  const tz = profile?.timezone || "UTC";
  const today = todayIn(tz);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: tasks }, { data: subjects }] = await Promise.all([
    supabase.from("tasks").select("*, subjects(name, code)").eq("user_id", user.id).or(`status.neq.done,completed_at.gte.${monthAgo}`).order("due_at", { nullsFirst: false }).limit(300),
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
  ]);
  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, name: s.code || s.name }));
  const local = (iso: string) => ({
    date: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)),
  });

  const rows = (tasks ?? []).map((t) => {
    const l = t.due_at ? local(t.due_at) : null;
    return { t, l, group: deadlineGroup({ status: t.status, localDue: l?.date ?? null }, today) };
  });
  const groups = new Map<DeadlineGroup, typeof rows>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);

  return (
    <div>
      <PageHeader title="Deadlines" description="Assignments, projects, quizzes, exams, applications and registrations — nothing slips." actions={<TaskDialog subjects={subjectOptions} />} />
      {!rows.length ? (
        <EmptyState icon={ClipboardCheck} title="No deadlines yet" description="Add assignments, quizzes and registration dates — they show up on your dashboard and calendar." action={<TaskDialog subjects={subjectOptions} />} />
      ) : (
        <div className="space-y-6">
          {ORDER.filter((g) => groups.get(g)?.length).map((g) => (
            <section key={g} aria-label={GROUP_LABEL[g]}>
              <h2 className={`mb-2 text-sm font-semibold ${g === "overdue" ? "text-destructive" : ""}`}>
                {GROUP_LABEL[g]} <span className="font-normal text-muted-foreground">· {groups.get(g)!.length}</span>
              </h2>
              <ul className="divide-y rounded-2xl border bg-card">
                {groups.get(g)!.map(({ t, l }) => {
                  const s = t.subjects as { name: string; code: string | null } | null;
                  return (
                    <TaskRow
                      key={t.id}
                      subjects={subjectOptions}
                      overdue={g === "overdue"}
                      dueLabel={l ? `${l.date === today ? "Today" : new Date(l.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${l.time}` : null}
                      task={{
                        id: t.id, title: t.title, description: t.description ?? "", type: t.type, subject_id: t.subject_id ?? "",
                        date: l?.date ?? "", time: l?.time ?? "23:59", priority: t.priority, status: t.status, subjectName: s ? s.code || s.name : null,
                      }}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
