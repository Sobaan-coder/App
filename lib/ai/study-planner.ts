import "server-only";
import { z } from "zod/v4";
import { generateStructured, type AIContext } from "./structured";
import { normalisePlan, type DraftPlan, type PlanWindow, type RankedSignal } from "@/lib/planner/plan";

const PlanSchema = z.object({
  title: z.string(),
  summary: z.string().describe("2–3 sentences: the approach, and plainly what is being sacrificed if time is short"),
  strategy: z.array(z.string()).describe("3–6 tips specific to this student"),
  skip_if_short: z.array(z.string()).describe("Topic names safe to drop if the student runs out of time"),
  days: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      sessions: z.array(
        z.object({
          start_time: z.string().describe("HH:MM, 24h"),
          duration: z.number().describe("minutes"),
          topic_id: z.string().nullable(),
          title: z.string(),
          activity: z.enum(["learn", "practice", "past_paper", "revise", "recall", "mock", "break"]),
          goals: z.array(z.string()).describe("2–4 concrete, checkable goals"),
          details: z.string().nullable().describe("Which questions/papers/material to use"),
        }),
      ),
    }),
  ),
});

const SYSTEM = `You are Study OS's study planner. Build a realistic, day-by-day schedule from the student's own data — never generic advice.

Inputs: the planning window and daily time budget; ranked topics with their priority score, weakness (0–100), past-paper frequency and marks, confidence (1–5), status, difficulty and estimated minutes; the student's saved resources per topic; fixed commitments (classes/events) to schedule around; and the student's request.

Rules:
- Stay within each day's time budget (sessions must fit; add short breaks between long blocks). Only schedule on the given study days.
- Prioritise by expected marks: high past-paper frequency × weak confidence first. Strong, rarely examined topics get a quick recall or go into skip_if_short.
- Interleave learning with active practice and timed past-paper questions; put a mock close to the exam; keep the last evening light.
- Use topic_id values only from the topic list (null for mocks/general sessions). Titles like "IAS 16 concepts" or "IAS 16 numerical practice".
- Goals must be concrete ("Solve 5 revaluation questions", "Attempt 2024 Q2 timed"). In details, reference the student's saved resources or papers by title when relevant.
- Sessions 30–120 minutes; avoid clashing with commitments.
- Do not overwhelm: fewer, well-chosen sessions beat a packed day. If time is short, say plainly what is sacrificed.`;

export async function generateStudyPlan(
  ctx: AIContext,
  input: {
    request: string;
    window: PlanWindow;
    examLabel: string | null;
    signals: RankedSignal[];
    resourcesByTopic: Record<string, string[]>;
    commitments: { date: string; time: string | null; title: string }[];
    studentContext: string;
  },
): Promise<DraftPlan> {
  const topics = input.signals.slice(0, 80).map((t) => ({
    topic_id: t.topicId,
    name: t.name,
    chapter: t.chapter,
    subject: t.subjectName,
    priority: t.priority.score,
    weakness: t.priority.weakness,
    past_papers: `${t.paperCount}/${t.totalPapers}`,
    marks: t.marks,
    confidence: t.confidence,
    status: t.status,
    difficulty: t.difficulty,
    est_minutes: t.estimatedMinutes,
    resources: input.resourcesByTopic[t.topicId]?.slice(0, 3) ?? [],
  }));
  const result = await generateStructured(ctx, {
    tier: "strong",
    effort: "high",
    schemaName: "study_plan",
    schema: PlanSchema,
    maxTokens: 24000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${input.studentContext}

<window>start ${input.window.startDate}, end ${input.window.endDate}, study days (0=Sun) ${input.window.studyDays.join(",")}, ${input.window.dailyMinutes} minutes per day${input.examLabel ? `, exam: ${input.examLabel}` : ""}</window>
<commitments>${JSON.stringify(input.commitments)}</commitments>
<topics>${JSON.stringify(topics)}</topics>

<student_request>${input.request}</student_request>`,
      },
    ],
  });

  const validTopics = new Map(input.signals.map((s) => [s.topicId, s.priority.score]));
  return normalisePlan(
    {
      title: result.title,
      summary: result.summary,
      strategy: result.strategy,
      skipIfShort: result.skip_if_short,
      sessions: result.days.flatMap((d) =>
        d.sessions
          .filter((s) => s.activity !== "break")
          .map((s) => ({ date: d.date, startTime: s.start_time, duration: s.duration, topicId: s.topic_id, title: s.title, activity: s.activity, goals: s.goals, details: s.details, priority: 0 })),
      ),
    },
    input.window,
    validTopics,
  );
}
