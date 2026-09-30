import { describe, expect, it } from "vitest";
import { buildHeuristicPlan, normalisePlan, type RankedSignal } from "@/lib/planner/plan";
import { rankTopics, type TopicSignal } from "@/lib/planner/priority";

const base: TopicSignal = {
  topicId: "t", name: "T", chapter: "C", difficulty: 3, estimatedMinutes: 60, weightage: null,
  paperCount: 0, totalPapers: 5, marks: 0, maxTopicMarks: 80, confidence: 3, status: "practicing",
  quizCorrect: 0, quizTotal: 0, nextReviewAt: null,
};
const signals = rankTopics([
  { ...base, topicId: "reval", name: "Revaluation", confidence: 2, status: "learning", paperCount: 4, marks: 80 },
  { ...base, topicId: "cgu", name: "CGU", confidence: 1, status: "learning", paperCount: 4, marks: 80, difficulty: 5 },
  { ...base, topicId: "recog", name: "Recognition", confidence: 5, status: "mastered", paperCount: 2 },
  { ...base, topicId: "disc", name: "Disclosure", confidence: 4, status: "reviewed" },
]) as RankedSignal[];
const window = { startDate: "2026-03-02", endDate: "2026-03-04", dailyMinutes: 180, studyDays: [0, 1, 2, 3, 4, 5, 6] };

describe("heuristic planner", () => {
  const plan = buildHeuristicPlan(signals, window, "FAR");

  it("covers weak high-frequency topics first and respects the daily budget", () => {
    const first = plan.sessions.filter((s) => s.date === "2026-03-02");
    expect(["cgu", "reval"]).toContain(first[0].topicId);
    for (const d of ["2026-03-02", "2026-03-03", "2026-03-04"]) {
      expect(plan.sessions.filter((s) => s.date === d).reduce((a, s) => a + s.duration, 0)).toBeLessThanOrEqual(180);
    }
  });

  it("puts a mock on the final day and schedules times without overlap", () => {
    expect(plan.sessions.some((s) => s.date === "2026-03-04" && s.activity === "mock")).toBe(true);
    const day1 = plan.sessions.filter((s) => s.date === "2026-03-02");
    for (let i = 1; i < day1.length; i++) expect(day1[i].startTime! > day1[i - 1].startTime!).toBe(true);
  });
});

describe("plan normalisation (AI output validation)", () => {
  const valid = new Map([["reval", 0.9], ["cgu", 0.95]]);
  it("drops out-of-window dates and unknown topics, clamps durations and fixes times", () => {
    const out = normalisePlan(
      {
        title: "Plan", summary: "s", strategy: [], skipIfShort: [],
        sessions: [
          { date: "2026-03-01", startTime: "09:00", duration: 60, topicId: "reval", title: "before window", activity: "learn", goals: [], details: null, priority: 0 },
          { date: "2026-03-02", startTime: "25:99", duration: 999, topicId: "hacked", title: "x", activity: "learn", goals: ["a"], details: null, priority: 0 },
        ],
      },
      window,
      valid,
    );
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0]).toMatchObject({ topicId: null, startTime: null, duration: 240 });
  });

  it("trims overloaded days by dropping the lowest-priority sessions", () => {
    const s = (topicId: string, duration: number) => ({ date: "2026-03-02", startTime: "09:00", duration, topicId, title: topicId, activity: "learn" as const, goals: [], details: null, priority: 0 });
    const out = normalisePlan({ title: "P", summary: "", strategy: [], skipIfShort: [], sessions: [s("cgu", 120), s("reval", 120)] }, window, valid);
    expect(out.sessions.map((x) => x.topicId)).toEqual(["cgu"]);
  });
});
