import { describe, expect, it } from "vitest";
import { deadlineGroup } from "@/lib/deadlines";

describe("deadline grouping", () => {
  const today = "2026-05-10";
  it.each([
    ["2026-05-09", "overdue"],
    ["2026-05-10", "today"],
    ["2026-05-11", "tomorrow"],
    ["2026-05-17", "week"],
    ["2026-05-18", "later"],
  ])("%s → %s", (due, group) => {
    expect(deadlineGroup({ status: "todo", localDue: due }, today)).toBe(group);
  });
  it("puts done and undated tasks in their own groups", () => {
    expect(deadlineGroup({ status: "done", localDue: "2026-05-01" }, today)).toBe("done");
    expect(deadlineGroup({ status: "todo", localDue: null }, today)).toBe("no_date");
  });
});
