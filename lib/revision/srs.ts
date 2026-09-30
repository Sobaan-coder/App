// Spaced repetition (SM-2 family) shared by flashcards and topic revision.

export type Rating = "again" | "hard" | "good" | "easy";

export type SrsState = {
  easeFactor: number; // ≥ 1.3
  intervalDays: number; // current interval
  repetitions: number; // successful reviews in a row
};

export const NEW_CARD: SrsState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

const MIN_EASE = 1.3;
const MAX_INTERVAL = 180;
const DAY = 86_400_000;

export function schedule(state: SrsState, rating: Rating, now = new Date()): SrsState & { nextReviewAt: Date } {
  let { easeFactor, intervalDays, repetitions } = state;

  switch (rating) {
    case "again":
      repetitions = 0;
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
      intervalDays = 0; // see it again today (10 minutes)
      break;
    case "hard":
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.15);
      intervalDays = Math.max(1, intervalDays * 1.2);
      repetitions += 1;
      break;
    case "good":
      intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : intervalDays * easeFactor;
      repetitions += 1;
      break;
    case "easy":
      easeFactor = easeFactor + 0.15;
      intervalDays = repetitions === 0 ? 3 : Math.max(intervalDays, 1) * easeFactor * 1.3;
      repetitions += 1;
      break;
  }

  intervalDays = Math.min(MAX_INTERVAL, Math.round(intervalDays * 100) / 100);
  easeFactor = Math.round(easeFactor * 100) / 100;
  const nextReviewAt = new Date(now.getTime() + (intervalDays === 0 ? 10 * 60_000 : intervalDays * DAY));
  return { easeFactor, intervalDays, repetitions, nextReviewAt };
}

/** Map a 1–5 self-rated confidence (end of a study session / quiz) onto a review rating. */
export function ratingFromConfidence(confidence: number): Rating {
  if (confidence <= 1) return "again";
  if (confidence === 2) return "hard";
  if (confidence <= 4) return "good";
  return "easy";
}

/** Map a quiz score on a topic to a rating. */
export function ratingFromScore(correct: number, total: number): Rating {
  if (total <= 0) return "good";
  const pct = correct / total;
  if (pct < 0.4) return "again";
  if (pct < 0.7) return "hard";
  if (pct < 0.9) return "good";
  return "easy";
}

export type TopicStatus = "not_started" | "learning" | "practicing" | "reviewed" | "mastered";

/** Status progression after studying: moves forward with confidence, never jumps backwards past "learning". */
export function nextStatus(current: TopicStatus, confidence: number, repetitions: number): TopicStatus {
  if (confidence >= 5 && repetitions >= 3) return "mastered";
  if (confidence >= 4) return current === "mastered" ? "mastered" : "reviewed";
  if (confidence >= 3) return current === "mastered" || current === "reviewed" ? "reviewed" : "practicing";
  return current === "not_started" ? "learning" : current === "mastered" ? "reviewed" : current;
}

/** 0–100 mastery estimate combining confidence, quiz accuracy and spacing. */
export function masteryScore(confidence: number | null, quizCorrect: number, quizTotal: number, repetitions: number): number {
  const conf = confidence ? (confidence - 1) / 4 : 0;
  const acc = quizTotal > 0 ? quizCorrect / quizTotal : null;
  const spacing = Math.min(repetitions, 5) / 5;
  const score = acc === null ? conf * 0.75 + spacing * 0.25 : conf * 0.45 + acc * 0.35 + spacing * 0.2;
  return Math.round(score * 1000) / 10;
}
