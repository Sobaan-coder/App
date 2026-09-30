import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { DraftPlan } from "./plan";

export async function savePlan(
  supabase: ServerClient,
  userId: string,
  plan: DraftPlan,
  meta: { subjectId: string | null; request: string; examDate: string | null; startDate: string; endDate: string; dailyMinutes: number; replacePlanId?: string | null },
) {
  // One active plan per subject: older ones are archived, not deleted.
  if (meta.replacePlanId) await supabase.from("study_plans").update({ status: "archived" }).eq("id", meta.replacePlanId).eq("user_id", userId);
  if (meta.subjectId) await supabase.from("study_plans").update({ status: "archived" }).eq("user_id", userId).eq("subject_id", meta.subjectId).eq("status", "active");

  const { data: row, error } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      subject_id: meta.subjectId,
      title: plan.title,
      request: meta.request,
      exam_date: meta.examDate,
      start_date: meta.startDate,
      end_date: meta.endDate,
      daily_minutes: meta.dailyMinutes,
      summary: plan.summary,
      strategy: plan.strategy,
      skip_if_short: plan.skipIfShort,
    })
    .select("id")
    .single();
  if (error) throw error;

  const order = new Map<string, number>();
  if (plan.sessions.length) {
    const { error: sErr } = await supabase.from("study_plan_sessions").insert(
      plan.sessions.map((s) => {
        const n = order.get(s.date) ?? 0;
        order.set(s.date, n + 1);
        return {
          study_plan_id: row.id,
          user_id: userId,
          topic_id: s.topicId,
          title: s.title,
          activity: s.activity,
          scheduled_date: s.date,
          start_time: s.startTime,
          duration: s.duration,
          goals: s.goals,
          details: s.details,
          priority: Math.round(s.priority * 1000) / 1000,
          sort_order: n,
        };
      }),
    );
    if (sErr) throw sErr;
  }
  return row.id;
}
