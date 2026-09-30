// Exam readiness: a transparent, explainable score. It is an estimate of
// preparation, never a prediction of the exam result.

export type ReadinessInput = {
  topics: {
    status: "not_started" | "learning" | "practicing" | "reviewed" | "mastered";
    confidence: number | null;
    lastStudiedAt: string | null;
    nextReviewAt: string | null;
  }[];
  quizCorrect: number;
  quizTotal: number;
  pastPaperSolved: number; // past-paper questions marked solved
  pastPaperAttempted: number; // solved + attempted + needs_review
};

export type Factor = {
  key: "coverage" | "confidence" | "practice" | "past_papers" | "revision";
  label: string;
  value: number | null; // 0–100, null = no data yet
  weight: number; // nominal weight
  explanation: string;
};

export type Readiness = { score: number | null; factors: Factor[]; note: string };

const COVERAGE_CREDIT = { not_started: 0, learning: 0.4, practicing: 0.7, reviewed: 0.9, mastered: 1 } as const;

export function computeReadiness(input: ReadinessInput, now = new Date()): Readiness {
  const n = input.topics.length;
  const pct = (x: number) => Math.round(x * 100);

  const coverage = n ? input.topics.reduce((a, t) => a + COVERAGE_CREDIT[t.status], 0) / n : null;
  const confidence = n ? input.topics.reduce((a, t) => a + (t.confidence ? (t.confidence - 1) / 4 : 0), 0) / n : null;
  const practice = input.quizTotal > 0 ? input.quizCorrect / input.quizTotal : null;
  const pastPapers = input.pastPaperAttempted > 0 ? input.pastPaperSolved / input.pastPaperAttempted : null;
  const studied = input.topics.filter((t) => t.lastStudiedAt);
  const revision = studied.length ? studied.filter((t) => !t.nextReviewAt || new Date(t.nextReviewAt) >= now).length / studied.length : null;

  const factors: Factor[] = [
    { key: "coverage", label: "Syllabus coverage", value: coverage === null ? null : pct(coverage), weight: 0.3,
      explanation: `Progress status across all ${n} topics (not started 0%, learning 40%, practising 70%, reviewed 90%, mastered 100%).` },
    { key: "confidence", label: "Topic confidence", value: confidence === null ? null : pct(confidence), weight: 0.2,
      explanation: "Average of your 1–5 self-ratings; unrated topics count as 0." },
    { key: "practice", label: "Practice accuracy", value: practice === null ? null : pct(practice), weight: 0.2,
      explanation: practice === null ? "No quizzes taken yet." : `${input.quizCorrect} of ${input.quizTotal} quiz answers correct.` },
    { key: "past_papers", label: "Past-paper performance", value: pastPapers === null ? null : pct(pastPapers), weight: 0.15,
      explanation: pastPapers === null ? "Mark past-paper questions as solved or attempted to include this." : `${input.pastPaperSolved} of ${input.pastPaperAttempted} attempted past-paper questions solved.` },
    { key: "revision", label: "Revision coverage", value: revision === null ? null : pct(revision), weight: 0.15,
      explanation: revision === null ? "No studied topics yet." : "Share of studied topics that are not overdue for review." },
  ];

  const available = factors.filter((f) => f.value !== null);
  const totalWeight = available.reduce((a, f) => a + f.weight, 0);
  const score = totalWeight > 0 ? Math.round(available.reduce((a, f) => a + (f.value as number) * f.weight, 0) / totalWeight) : null;
  const missing = factors.filter((f) => f.value === null).map((f) => f.label.toLowerCase());

  return {
    score,
    factors,
    note:
      "A measure of how prepared you are based on your own activity in Study OS — not a prediction of your result." +
      (missing.length ? ` Not yet included (no data): ${missing.join(", ")}; the other factors are re-weighted.` : ""),
  };
}
