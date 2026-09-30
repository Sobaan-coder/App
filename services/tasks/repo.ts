import type { Db } from "@/lib/db";
import type { Task } from "./types";

export const TASK_SELECT = `select t.*, p.name as project_name from tasks t left join projects p on p.id = t.project_id`;

export async function findProjectByName(db: Db, name: string): Promise<{ id: string; name: string } | null> {
  const exact = await db.one<{ id: string; name: string }>("select id, name from projects where lower(name) = lower($1)", [name.trim()]);
  if (exact) return exact;
  return db.one<{ id: string; name: string }>(
    "select id, name from projects where lower(name) like lower($1) order by length(name) limit 1",
    [`%${name.trim().replace(/[%_]/g, "")}%`],
  );
}

/** Find a project whose name appears in free text ("… for Merchants …"). */
export async function projectMentionedIn(db: Db, text: string): Promise<{ id: string; name: string } | null> {
  const projects = await db.query<{ id: string; name: string }>("select id, name from projects where status <> 'archived'");
  const lower = text.toLowerCase();
  return projects.filter((p) => new RegExp(`\\b${p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)).sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

export interface TaskInsert {
  title: string;
  description?: string;
  projectId?: string | null;
  priority?: Task["priority"];
  status?: Task["status"];
  dueAt?: string | null;
  remindAt?: string | null;
  estimatedMinutes?: number | null;
  tags?: string[];
  recurrence?: string | null;
  source?: "user" | "ai" | "automation";
  automationId?: string | null;
}

export async function insertTask(db: Db, userId: string, t: TaskInsert): Promise<Task> {
  const row = await db.one<Task>(
    `insert into tasks(user_id, project_id, title, description, priority, status, due_at, remind_at, estimated_minutes, tags, recurrence, source, automation_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [
      userId,
      t.projectId ?? null,
      t.title,
      t.description ?? "",
      t.priority ?? "medium",
      t.status ?? "todo",
      t.dueAt ?? null,
      t.remindAt ?? null,
      t.estimatedMinutes ?? null,
      t.tags ?? [],
      t.recurrence ?? null,
      t.source ?? "user",
      t.automationId ?? null,
    ],
  );
  return row!;
}
