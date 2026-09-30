export type TaskStatus = "todo" | "in_progress" | "waiting" | "completed" | "failed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  project_name?: string | null;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  remind_at: string | null;
  estimated_minutes: number | null;
  tags: string[];
  recurrence: string | null;
  source: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const OPEN_STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting"];
