"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { rebalance, type PlanSessionLite } from "@/lib/planner/rebalance";
import { todayIn } from "@/lib/data/workspace";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh(planId: string) {
  for (const p of ["/planner", `/planner/${planId}`, "/dashboard", "/study", "/calendar"]) revalidatePath(p);
}

/** Adapt a plan to what actually happened: missed/skipped work, early finishes, confidence changes. */
export async function adaptPlan(planId: string, opts: { pullForward?: boolean } = {}): Promise<Result> {
  if (!z.uuid().safeParse(planId).success) return { ok: false, error: "Invalid plan" };
  const { supabase, user } = await requireUser();
  const [{ data: plan }, { data: sessions }, { data: profile }] = await Promise.all([
    supabase.from("study_plans").select("id, end_date, daily_minutes, status").eq("id", planId).eq("user_id", user.id).maybeSingle(),
    supabase.from("study_plan_sessions").select("*").eq("study_plan_id", planId).order("scheduled_date").order("sort_order"),
    supabase.from("profiles").select("study_days, daily_study_minutes, timezone").eq("id", user.id).single(),
  ]);
  if (!plan || !sessions) return { ok: false, error: "Plan not found" };
  const topicIds = [...new Set(sessions.map((s) => s.topic_id).filter(Boolean))] as string[];
  const { data: progress } = await supabase.from("student_topic_progress").select("topic_id, confidence").eq("user_id", user.id).in("topic_id", topicIds.length ? topicIds : ["00000000-0000-0000-0000-000000000000"]);
  const today = todayIn(profile?.timezone);

  const lite: PlanSessionLite[] = sessions.map((s) => ({
    id: s.id, topicId: s.topic_id, title: s.title, activity: s.activity, scheduledDate: s.scheduled_date,
    duration: s.duration, priority: Number(s.priority), status: s.status, sortOrder: s.sort_order,
  }));
  const { sessions: next, changes } = rebalance(lite, {
    today,
    endDate: plan.end_date && plan.end_date >= today ? plan.end_date : today,
    dailyMinutes: plan.daily_minutes ?? profile?.daily_study_minutes ?? 120,
    studyDays: profile?.study_days ?? [1, 2, 3, 4, 5, 6],
    confidence: Object.fromEntries((progress ?? []).map((p) => [p.topic_id, p.confidence])),
    pullForward: opts.pullForward ?? true,
  });

  const original = new Map(sessions.map((s) => [s.id, s]));
  await Promise.all(
    next
      .filter((s) => {
        const o = original.get(s.id)!;
        return o.scheduled_date !== s.scheduledDate || o.status !== s.status || o.sort_order !== s.sortOrder;
      })
      .map((s) =>
        supabase
          .from("study_plan_sessions")
          .update({ scheduled_date: s.scheduledDate, status: s.status, sort_order: s.sortOrder, ...(original.get(s.id)!.scheduled_date !== s.scheduledDate ? { start_time: null } : {}) })
          .eq("id", s.id),
      ),
  );
  const adds = changes.filter((c) => c.kind === "add");
  if (adds.length) {
    const { data: topics } = await supabase.from("topics").select("id, name").in("id", adds.map((a) => (a as { topicId: string }).topicId));
    const name = new Map((topics ?? []).map((t) => [t.id, t.name]));
    await supabase.from("study_plan_sessions").insert(
      adds.map((a) => {
        const add = a as { topicId: string; date: string; duration: number };
        return { study_plan_id: planId, user_id: user.id, topic_id: add.topicId, title: `${name.get(add.topicId) ?? "Topic"} — extra revision`, activity: "revise" as const, scheduled_date: add.date, duration: add.duration, goals: ["Re-learn the weak parts", "Solve 3 questions"], priority: 0.8, sort_order: 99 };
      }),
    );
  }
  refresh(planId);
  const moved = changes.filter((c) => c.kind === "move").length;
  const dropped = changes.filter((c) => c.kind === "drop").length;
  const message = changes.length
    ? [moved && `${moved} moved`, dropped && `${dropped} removed`, adds.length && `${adds.length} revision added`].filter(Boolean).join(", ")
    : "Your plan is already up to date.";
  return { ok: true, message };
}

export async function moveSession(sessionId: string, date: string, startTime: string | null): Promise<Result> {
  if (!z.uuid().safeParse(sessionId).success || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (startTime && !/^\d{2}:\d{2}$/.test(startTime))) return { ok: false, error: "Invalid date" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("study_plan_sessions").update({ scheduled_date: date, start_time: startTime, status: "planned" }).eq("id", sessionId).eq("user_id", user.id).select("study_plan_id").single();
  if (error) return { ok: false, error: "Couldn't move the session." };
  refresh(data.study_plan_id);
  return { ok: true };
}

export async function archivePlan(planId: string): Promise<Result> {
  if (!z.uuid().safeParse(planId).success) return { ok: false, error: "Invalid plan" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("study_plans").update({ status: "archived" }).eq("id", planId).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't archive the plan." };
  refresh(planId);
  return { ok: true };
}

export async function deletePlan(planId: string): Promise<Result> {
  if (!z.uuid().safeParse(planId).success) return { ok: false, error: "Invalid plan" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("study_plans").delete().eq("id", planId).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete the plan." };
  refresh(planId);
  return { ok: true };
}
