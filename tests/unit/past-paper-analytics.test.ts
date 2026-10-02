import { describe, expect, it } from "vitest";
import { computePaperAnalytics, frequencyPhrase } from "@/lib/analytics/past-papers";
import { sanitisePaperAnalysis } from "@/lib/ai/past-paper-analyzer";

const topics = [
  { id: "reval", name: "Revaluation", chapterId: "c16", chapterName: "IAS 16", chapterOrder: 0, order: 0 },
  { id: "dep", name: "Depreciation", chapterId: "c16", chapterName: "IAS 16", chapterOrder: 0, order: 1 },
  { id: "cgu", name: "CGU", chapterId: "c36", chapterName: "IAS 36", chapterOrder: 1, order: 0 },
  { id: "rnd", name: "Research vs Development", chapterId: "c38", chapterName: "IAS 38", chapterOrder: 2, order: 0 },
];
const papers = [2021, 2022, 2023, 2024, 2025].map((y) => ({ id: `p${y}`, year: y, title: `FAR ${y}` }));

describe("past-paper analytics", () => {
  // IAS 16 revaluation appears in 2021, 2022, 2024, 2025 (the spec's example).
  const questions = [
    { id: "q1", paperId: "p2021", marks: 20, type: "numerical" },
    { id: "q2", paperId: "p2022", marks: 20, type: "numerical" },
    { id: "q3", paperId: "p2021", marks: 15, type: "theory" },
    { id: "q4", paperId: "p2024", marks: 20, type: "numerical" },
    { id: "q5", paperId: "p2025", marks: 10, type: "short" },
    { id: "q6", paperId: "p2025", marks: 15, type: "numerical" },
  ];
  const links = [
    { questionId: "q1", topicId: "reval", confidence: 0.95 },
    { questionId: "q1", topicId: "dep", confidence: 0.8 },
    { questionId: "q2", topicId: "reval", confidence: 0.9 },
    { questionId: "q3", topicId: "rnd", confidence: 0.97 },
    { questionId: "q4", topicId: "reval", confidence: 0.96 },
    { questionId: "q5", topicId: "reval", confidence: 0.9 },
    { questionId: "q6", topicId: "cgu", confidence: 0.93 },
  ];
  const a = computePaperAnalytics(papers, questions, links, topics);
  const reval = a.topics.find((t) => t.topicId === "reval")!;

  it("computes topic frequency and a year matrix", () => {
    expect(reval.paperCount).toBe(4);
    expect(reval.frequency).toBe(0.8);
    expect(reval.appearedIn).toEqual({ "2021": true, "2022": true, "2023": false, "2024": true, "2025": true });
    expect(reval.lastSeen).toBe("2025");
  });

  it("credits marks to the primary topic only", () => {
    expect(reval.marks).toBe(70);
    expect(a.topics.find((t) => t.topicId === "dep")!.marks).toBe(0);
    expect(a.chapterMarks.find((c) => c.chapter === "IAS 16")!.marks).toBe(70);
    expect(a.chapterMarks.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });

  it("finds repeated concepts, unexamined topics and trends", () => {
    expect(a.repeated.map((t) => t.topicId)).toEqual(["reval"]);
    expect(a.unexamined).toHaveLength(0);
    expect(a.topics.find((t) => t.topicId === "cgu")!.trend).toBe("rising");
    expect(a.topics.find((t) => t.topicId === "rnd")!.trend).toBe("falling");
    expect(a.types[0]).toEqual({ type: "numerical", count: 4 });
    expect(a.mappedShare).toBe(1);
  });

  it("describes history without predicting the future", () => {
    expect(frequencyPhrase(reval)).toBe("Historically, this topic appeared frequently in the uploaded papers (4 of 5).");
    expect(frequencyPhrase({ paperCount: 0, totalPapers: 5 })).toMatch(/Not found/);
    expect(frequencyPhrase(reval)).not.toMatch(/will|likely|expect/i);
  });
});

describe("past-paper AI output validation", () => {
  it("drops unknown topic ids, clamps confidence and rejects impossible values", () => {
    const clean = sanitisePaperAnalysis(
      {
        is_exam_paper: true,
        detected_subject: "FAR",
        year: 3024,
        session: null,
        total_marks: -5,
        notes: [],
        questions: [
          { number: "3(b)", text: "Calculate depreciation using the revaluation model", marks: 12, type: "numerical", page: 2, topics: [{ topic_id: "reval", confidence: 1.4 }, { topic_id: "invented", confidence: 0.9 }] },
          { number: "3(b)", text: "Calculate depreciation using the revaluation model", marks: 12, type: "numerical", page: 2, topics: [] },
          { number: "4", text: "   ", marks: null, type: "short", page: null, topics: [] },
        ],
      },
      new Set(["reval", "dep"]),
    );
    expect(clean.year).toBeNull();
    expect(clean.total_marks).toBeNull();
    expect(clean.questions).toHaveLength(1);
    expect(clean.questions[0].topics).toEqual([{ topic_id: "reval", confidence: 1 }]);
  });
});
