export type DeadlineGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "no_date" | "done";

export const GROUP_LABEL: Record<DeadlineGroup, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  week: "Due this week",
  later: "Later",
  no_date: "No due date",
  done: "Completed",
};

function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bucket a task by its due date in the student's local calendar. `localDue` is YYYY-MM-DD. */
export function deadlineGroup(task: { status: string; localDue: string | null }, today: string): DeadlineGroup {
  if (task.status === "done") return "done";
  if (!task.localDue) return "no_date";
  if (task.localDue < today) return "overdue";
  if (task.localDue === today) return "today";
  if (task.localDue === addDays(today, 1)) return "tomorrow";
  if (task.localDue <= addDays(today, 7)) return "week";
  return "later";
}
