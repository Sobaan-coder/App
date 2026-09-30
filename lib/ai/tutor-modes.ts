// Shared by server pages and the client chat (must not live in a "use client" module).
export const MODES = [
  ["explain_simply", "Explain simply"],
  ["detailed", "Detailed"],
  ["exam_mode", "Exam mode"],
  ["quiz_me", "Quiz me"],
  ["example", "Give example"],
  ["step_by_step", "Step-by-step"],
  ["flashcards", "Flashcards"],
  ["summarize", "Summarize"],
  ["find_mistake", "Find my mistake"],
] as const;
export type Mode = (typeof MODES)[number][0];
