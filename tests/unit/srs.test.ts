import { describe, expect, it } from "vitest";
import { NEW_CARD, masteryScore, nextStatus, ratingFromConfidence, ratingFromScore, schedule } from "@/lib/revision/srs";

const now = new Date("2026-01-01T09:00:00Z");
const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86_400_000);

describe("spaced repetition", () => {
  it("grows intervals with successive good reviews", () => {
    const a = schedule(NEW_CARD, "good", now);
    expect(a.intervalDays).toBe(1);
    const b = schedule(a, "good", now);
    expect(b.intervalDays).toBe(3);
    const c = schedule(b, "good", now);
    expect(c.intervalDays).toBeCloseTo(7.5, 1);
    expect(days(c.nextReviewAt)).toBe(8);
  });

  it("resets on again and shows the card again within the session", () => {
    const learned = schedule(schedule(NEW_CARD, "good", now), "good", now);
    const again = schedule(learned, "again", now);
    expect(again.repetitions).toBe(0);
    expect(again.intervalDays).toBe(0);
    expect(again.easeFactor).toBeLessThan(learned.easeFactor);
    expect(again.nextReviewAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it("never lets ease drop below 1.3 and caps intervals", () => {
    let s = { ...NEW_CARD };
    for (let i = 0; i < 20; i++) s = schedule(s, "again", now);
    expect(s.easeFactor).toBe(1.3);
    let e = { ...NEW_CARD };
    for (let i = 0; i < 30; i++) e = schedule(e, "easy", now);
    expect(e.intervalDays).toBeLessThanOrEqual(180);
  });

  it("maps confidence and quiz scores to ratings", () => {
    expect([1, 2, 3, 4, 5].map(ratingFromConfidence)).toEqual(["again", "hard", "good", "good", "easy"]);
    expect(ratingFromScore(1, 5)).toBe("again");
    expect(ratingFromScore(3, 5)).toBe("hard");
    expect(ratingFromScore(4, 5)).toBe("good");
    expect(ratingFromScore(5, 5)).toBe("easy");
  });

  it("progresses topic status with confidence", () => {
    expect(nextStatus("not_started", 2, 0)).toBe("learning");
    expect(nextStatus("learning", 3, 1)).toBe("practicing");
    expect(nextStatus("practicing", 4, 2)).toBe("reviewed");
    expect(nextStatus("reviewed", 5, 3)).toBe("mastered");
    expect(nextStatus("mastered", 2, 0)).toBe("reviewed");
  });

  it("computes mastery from confidence, accuracy and spacing", () => {
    expect(masteryScore(null, 0, 0, 0)).toBe(0);
    expect(masteryScore(5, 10, 10, 5)).toBe(100);
    expect(masteryScore(3, 1, 2, 1)).toBeGreaterThan(30);
  });
});
