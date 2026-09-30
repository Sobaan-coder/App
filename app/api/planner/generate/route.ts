import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { generateStudyPlan } from "@/lib/ai/study-planner";
import { buildStudentContext } from "@/lib/ai/context";
import { buildHeuristicPlan, type DraftPlan } from "@/lib/planner/plan";
import { savePlan } from "@/lib/planner/persist";
import { getSubjects, getTopicSignals, todayIn } from "@/lib/data/workspace";

export const maxDuration = 300;

const Body = z.object({
  request: z.string().trim().min(3).max(2000),
  subject_ids: z.array(z.uuid()).min(1, "Choose at least one subject").max(10),
  days: z.number().int().min(1).max(120).nullable().optional(),
  minutes: z.number().int().min(15).max(960).nullable().optional(), // single-session plan, e.g. "2-hour plan"
  daily_minutes: z.number().int().min(15).max(960).nullable().optional(),
  replace_plan_id: z.uuid().nullable().optional(),
});

function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const b = parsed.data;

  try {
    const { data: profile } = await supabase.from("profiles").select("daily_study_minutes, study_days, timezone").eq("id", user.id).single();
    const today = todayIn(profile?.timezone);
    const subjects = (await getSubjects(supabase, user.id)).filter((s) => b.subject_ids.includes(s.id));
    if (!subjects.length) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

    // Window: explicit days > exam date > one week. A "2-hour plan" is today only.
    const exam = subjects.filter((s) => s.exam_date && s.exam_date >= today).sort((x, y) => x.exam_date!.localeCompare(y.exam_date!))[0];
    let endDate: string;
    if (b.minutes) endDate = today;
    else if (b.days) endDate = addDays(today, b.days - 1);
    else if (exam) endDate = exam.exam_date! > today ? addDays(exam.exam_date!, -1) : today;
    else endDate = addDays(today, 6);
    const window = {
      startDate: today,
      endDate,
      dailyMinutes: b.minutes ?? b.daily_minutes ?? profile?.daily_study_minutes ?? 120,
      studyDays: b.minutes ? [0, 1, 2, 3, 4, 5, 6] : profile?.study_days ?? [1, 2, 3, 4, 5, 6],
    };
    const examLabel = exam ? `${exam.code || exam.name} exam on ${exam.exam_date}` : subjects.map((s) => s.code || s.name).join(", ");

    const signals = await getTopicSignals(supabase, user.id, b.subject_ids);
    if (!signals.length) return NextResponse.json({ error: "Add topics to this subject first (import your syllabus)." }, { status: 422 });

    let plan: DraftPlan;
    let generatedBy: "ai" | "rules" = "rules";
    if (isAIConfigured()) {
      const [links, events, context] = await Promise.all([
        supabase.from("topic_resource_links").select("topic_id, resources(title)").eq("user_id", user.id).in("topic_id", signals.map((s) => s.topicId)),
        supabase.from("calendar_events").select("title, start_at, type").eq("user_id", user.id).gte("start_at", window.startDate).lte("start_at", `${window.endDate}T23:59:59`),
        buildStudentContext(supabase, user.id, { subjectId: b.subject_ids.length === 1 ? b.subject_ids[0] : null }),
      ]);
      const resourcesByTopic: Record<string, string[]> = {};
      for (const l of links.data ?? []) {
        const title = (l.resources as { title: string } | null)?.title;
        if (title) (resourcesByTopic[l.topic_id] ??= []).push(title);
      }
      try {
        plan = await generateStudyPlan(
          { userId: user.id, feature: "study_planner" },
          {
            request: b.request,
            window,
            examLabel,
            signals,
            resourcesByTopic,
            commitments: (events.data ?? []).map((e) => ({ date: e.start_at.slice(0, 10), time: e.start_at.slice(11, 16), title: `${e.type}: ${e.title}` })),
            studentContext: context,
          },
        );
        generatedBy = "ai";
        if (!plan.sessions.length) throw new Error("empty plan");
      } catch (err) {
        console.error("[planner] AI failed, using rules", err);
        plan = buildHeuristicPlan(signals, window, examLabel);
        plan.summary = `AI planning was unavailable, so this plan was built with Study OS's priority rules. ${plan.summary}`;
      }
    } else {
      plan = buildHeuristicPlan(signals, window, examLabel);
    }

    const id = await savePlan(supabase, user.id, plan, {
      subjectId: b.subject_ids.length === 1 ? b.subject_ids[0] : null,
      request: b.request,
      examDate: exam?.exam_date ?? null,
      startDate: window.startDate,
      endDate: window.endDate,
      dailyMinutes: window.dailyMinutes,
      replacePlanId: b.replace_plan_id,
    });
    return NextResponse.json({ id, generated_by: generatedBy });
  } catch (err) {
    return apiError(err, "We couldn't build your plan. Try again.");
  }
}
