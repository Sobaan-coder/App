// Transparent topic prioritisation used by the planner, dashboard and revision.

export type TopicSignal = {
  topicId: string;
  name: string;
  chapter?: string;
  difficulty: number; // 1–5
  estimatedMinutes: number;
  weightage: number | null; // syllabus weightage % if known
  paperCount: number; // papers the topic appeared in
  totalPapers: number; // papers analysed for the subject
  marks: number; // marks credited to this topic across papers
  maxTopicMarks: number; // highest marks of any topic in the subject (for normalising)
  confidence: number | null; // 1–5
  status: "not_started" | "learning" | "practicing" | "reviewed" | "mastered";
  quizCorrect: number;
  quizTotal: number;
  nextReviewAt: string | null;
};

export type Priority = {
  score: number; // 0–1
  importance: number;
  need: number;
  weakness: number; // 0–100
  reasons: string[];
};

const STATUS_NEED: Record<TopicSignal["status"], number> = {
  not_started: 1,
  learning: 0.8,
  practicing: 0.55,
  reviewed: 0.3,
  mastered: 0.1,
};

/** How much the student still needs this topic (0–100). High = weak. */
export function weaknessScore(t: TopicSignal): number {
  const conf = t.confidence === null ? null : (5 - t.confidence) / 4;
  const quizMiss = t.quizTotal > 0 ? 1 - t.quizCorrect / t.quizTotal : null;
  const parts: [number, number][] = [[STATUS_NEED[t.status], 0.3]];
  if (conf !== null) parts.push([conf, 0.4]);
  if (quizMiss !== null) parts.push([quizMiss, 0.3]);
  const w = parts.reduce((a, [, wt]) => a + wt, 0);
  return Math.round((parts.reduce((a, [v, wt]) => a + v * wt, 0) / w) * 100);
}

export function topicPriority(t: TopicSignal, now = new Date()): Priority {
  const reasons: string[] = [];

  // Importance: how much the exam has historically weighted this topic.
  let importance: number;
  if (t.totalPapers > 0) {
    const freq = t.paperCount / t.totalPapers;
    const marks = t.maxTopicMarks > 0 ? t.marks / t.maxTopicMarks : 0;
    const weight = t.weightage !== null ? Math.min(t.weightage / 30, 1) : freq;
    importance = freq * 0.6 + marks * 0.25 + weight * 0.15;
    if (t.paperCount > 0) reasons.push(`appeared in ${t.paperCount} of ${t.totalPapers} of your uploaded papers`);
    else reasons.push("not seen in your uploaded papers");
  } else {
    importance = t.weightage !== null ? Math.min(t.weightage / 30, 1) : 0.5;
    if (t.weightage !== null) reasons.push(`${t.weightage}% syllabus weightage`);
  }

  const weakness = weaknessScore(t);
  const need = weakness / 100;
  if (t.confidence !== null && t.confidence <= 2) reasons.push(`your confidence is ${t.confidence}/5`);
  if (t.status === "not_started") reasons.push("not started yet");
  if (t.quizTotal > 0 && t.quizCorrect / t.quizTotal < 0.6) reasons.push(`${Math.round((t.quizCorrect / t.quizTotal) * 100)}% quiz accuracy`);

  const difficulty = (t.difficulty - 1) / 4;
  const due = t.nextReviewAt && new Date(t.nextReviewAt) <= now ? 1 : 0;
  if (due) reasons.push("due for review");

  const score = importance * 0.4 + need * 0.4 + difficulty * 0.1 + due * 0.1;
  return { score: Math.round(score * 1000) / 1000, importance, need, weakness, reasons };
}

export function rankTopics<T extends TopicSignal>(topics: T[], now = new Date()) {
  return topics
    .map((t) => ({ ...t, priority: topicPriority(t, now) }))
    .sort((a, b) => b.priority.score - a.priority.score);
}
