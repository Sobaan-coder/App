import { describe, expect, it } from "vitest";
import { availableDays, rebalance, type PlanSessionLite } from "@/lib/planner/rebalance";

const s = (over: Partial<PlanSessionLite>): PlanSessionLite => ({
  id: Math.random().toString(36).slice(2), topicId: "t1", title: "x", activity: "learn",
  scheduledDate: "2026-03-02", duration: 60, priority: 0.5, status: "planned", sortOrder: 0, ...over,
});
// 2026-03-02 is a Monday.
const opts = { today: "2026-03-02", endDate: "2026-03-04", dailyMinutes: 120, studyDays: [0, 1, 2, 3, 4, 5, 6], confidence: {} };

describe("plan rebalancing", () => {
  it("moves missed sessions into the earliest day with room, highest priority first", () => {
    const missedHigh = s({ id: "high", scheduledDate: "2026-03-01", priority: 0.9 });
    const missedLow = s({ id: "low", scheduledDate: "2026-03-01", priority: 0.2 });
    const today = s({ id: "today", scheduledDate: "2026-03-02", duration: 90 });
    const { sessions, changes } = rebalance([missedLow, missedHigh, today], opts);
    const byId = Object.fromEntries(sessions.map((x) => [x.id, x]));
    expect(byId.high.scheduledDate).toBe("2026-03-03"); // today only has 30 min left
    expect(byId.low.scheduledDate).toBe("2026-03-03");
    expect(changes.filter((c) => c.kind === "move")).toHaveLength(2);
  });

  it("drops lower-priority work when nothing fits before the exam instead of overloading", () => {
    const full = [
      s({ scheduledDate: "2026-03-02", duration: 120 }),
      s({ scheduledDate: "2026-03-03", duration: 120 }),
      s({ scheduledDate: "2026-03-04", duration: 120 }),
    ];
    const missed = s({ id: "late", scheduledDate: "2026-03-01", priority: 0.1 });
    const { sessions, changes } = rebalance([...full, missed], opts);
    expect(sessions.find((x) => x.id === "late")!.status).toBe("skipped");
    expect(changes.find((c) => c.kind === "drop")).toBeTruthy();
  });

  it("removes extra repetition for topics rated 5/5", () => {
    const rev = s({ id: "rev", activity: "revise", topicId: "t9", scheduledDate: "2026-03-03" });
    const { sessions } = rebalance([rev], { ...opts, confidence: { t9: 5 } });
    expect(sessions[0].status).toBe("skipped");
  });

  it("pulls one session forward when today is finished early", () => {
    const done = s({ id: "done", status: "done", scheduledDate: "2026-03-02", duration: 45 });
    const tomorrowHigh = s({ id: "next", scheduledDate: "2026-03-03", priority: 0.9, duration: 60 });
    const tomorrowLow = s({ id: "later", scheduledDate: "2026-03-03", priority: 0.3, duration: 60 });
    const { sessions } = rebalance([done, tomorrowHigh, tomorrowLow], { ...opts, pullForward: true });
    expect(sessions.find((x) => x.id === "next")!.scheduledDate).toBe("2026-03-02");
    expect(sessions.find((x) => x.id === "later")!.scheduledDate).toBe("2026-03-03");
  });

  it("adds a revision slot for weak topics with nothing scheduled", () => {
    const doneWeak = s({ id: "w", topicId: "weak", status: "done", scheduledDate: "2026-03-02" });
    const { changes } = rebalance([doneWeak], { ...opts, confidence: { weak: 2 } });
    expect(changes).toContainEqual(expect.objectContaining({ kind: "add", topicId: "weak" }));
  });

  it("respects preferred study days", () => {
    // Mon–Wed window, but the student only studies on Tuesdays.
    expect(availableDays({ today: "2026-03-02", endDate: "2026-03-04", studyDays: [2] })).toEqual(["2026-03-03"]);
    // No study days in range → fall back to every day rather than nothing.
    expect(availableDays({ today: "2026-03-02", endDate: "2026-03-03", studyDays: [6] })).toHaveLength(2);
  });
});
