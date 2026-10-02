import { describe, expect, it } from "vitest";
import { rankTopics, topicPriority, weaknessScore, type TopicSignal } from "@/lib/planner/priority";

const base: TopicSignal = {
  topicId: "t", name: "Topic", difficulty: 3, estimatedMinutes: 60, weightage: null,
  paperCount: 0, totalPapers: 5, marks: 0, maxTopicMarks: 80, confidence: 3, status: "practicing",
  quizCorrect: 0, quizTotal: 0, nextReviewAt: null,
};

describe("topic priority", () => {
  it("ranks frequently examined weak topics first", () => {
    const ranked = rankTopics([
      { ...base, topicId: "strong-rare", confidence: 5, status: "mastered", paperCount: 1, marks: 10 },
      { ...base, topicId: "weak-frequent", confidence: 2, status: "learning", paperCount: 4, marks: 80 },
      { ...base, topicId: "weak-rare", confidence: 2, status: "learning", paperCount: 0 },
    ]);
    expect(ranked.map((r) => r.topicId)).toEqual(["weak-frequent", "weak-rare", "strong-rare"]);
    expect(ranked[0].priority.reasons.join(" ")).toContain("4 of 5");
  });

  it("uses syllabus weightage when there are no past papers", () => {
    const p = topicPriority({ ...base, totalPapers: 0, weightage: 30 });
    expect(p.importance).toBe(1);
    expect(p.reasons.join(" ")).toContain("30% syllabus weightage");
  });

  it("weakness reflects confidence, status and quiz accuracy", () => {
    const strong = weaknessScore({ ...base, confidence: 5, status: "mastered", quizCorrect: 10, quizTotal: 10 });
    const weak = weaknessScore({ ...base, confidence: 1, status: "learning", quizCorrect: 1, quizTotal: 10 });
    expect(strong).toBeLessThan(10);
    expect(weak).toBeGreaterThan(80);
  });

  it("boosts topics that are due for review", () => {
    const now = new Date("2026-01-10");
    const due = topicPriority({ ...base, nextReviewAt: "2026-01-09" }, now);
    const notDue = topicPriority({ ...base, nextReviewAt: "2026-01-20" }, now);
    expect(due.score).toBeGreaterThan(notDue.score);
  });
});
