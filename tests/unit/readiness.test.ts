import { describe, expect, it } from "vitest";
import { computeReadiness } from "@/lib/analytics/readiness";

describe("exam readiness", () => {
  it("combines transparent factors and explains itself", () => {
    const r = computeReadiness(
      {
        topics: [
          { status: "mastered", confidence: 5, lastStudiedAt: "2026-01-01", nextReviewAt: "2026-02-01" },
          { status: "learning", confidence: 2, lastStudiedAt: "2026-01-01", nextReviewAt: "2026-01-02" },
        ],
        quizCorrect: 7, quizTotal: 10, pastPaperSolved: 2, pastPaperAttempted: 4,
      },
      new Date("2026-01-10"),
    );
    const f = Object.fromEntries(r.factors.map((x) => [x.key, x.value]));
    expect(f).toEqual({ coverage: 70, confidence: 63, practice: 70, past_papers: 50, revision: 50 });
    expect(r.score).toBe(Math.round(70 * 0.3 + 63 * 0.2 + 70 * 0.2 + 50 * 0.15 + 50 * 0.15));
    expect(r.note).toMatch(/not a prediction/);
  });

  it("re-weights when data is missing instead of inventing it", () => {
    const r = computeReadiness({
      topics: [{ status: "practicing", confidence: 3, lastStudiedAt: null, nextReviewAt: null }],
      quizCorrect: 0, quizTotal: 0, pastPaperSolved: 0, pastPaperAttempted: 0,
    });
    expect(r.factors.filter((f) => f.value === null).map((f) => f.key)).toEqual(["practice", "past_papers", "revision"]);
    expect(r.score).toBe(Math.round((70 * 0.3 + 50 * 0.2) / 0.5));
    expect(r.note).toContain("Not yet included");
  });

  it("returns no score for an empty subject", () => {
    expect(computeReadiness({ topics: [], quizCorrect: 0, quizTotal: 0, pastPaperSolved: 0, pastPaperAttempted: 0 }).score).toBeNull();
  });
});
