import { z } from "zod";
import { Cron } from "croner";
import { defineTool } from "../types";
import { getProfile } from "@/lib/profile";
import { dayRange, formatLocal } from "@/lib/time";
import { AppError } from "@/lib/errors";
import { parseTaskText } from "@/services/tasks/parse";
import { buildSchedule, prioritizeTasks, taskLine, type ScoredTask } from "@/services/tasks/prioritize";
import { findProjectByName, insertTask, TASK_SELECT } from "@/services/tasks/repo";
import { OPEN_STATUSES, type Task } from "@/services/tasks/types";
import { saveFile } from "@/services/storage";

const statusEnum = z.enum(["todo", "in_progress", "waiting", "completed", "failed", "cancelled"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export const taskCreate = defineTool({
  name: "task_create",
  description: "Create a task. Accepts structured fields or natural language in `text` (e.g. 'remind me tomorrow to finish the report').",
  category: "tasks",
  risk: "low",
  input: z.object({
    text: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    projectName: z.string().optional(),
    projectId: z.string().uuid().optional(),
    priority: priorityEnum.optional(),
    dueAt: z.string().optional(),
    remindAt: z.string().optional(),
    estimatedMinutes: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
    recurrence: z.string().optional(),
  }),
  describe: (i) => `Create task "${i.title ?? i.text}"`,
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const parsed = i.text ? parseTaskText(i.text, { timezone: profile.timezone, workStart: profile.work_start }) : null;
    const title = i.title ?? parsed?.title;
    if (!title) throw new AppError("A task needs a title");
    let projectId = i.projectId ?? ctx.projectId ?? null;
    const projectName = i.projectName ?? parsed?.projectName;
    if (!i.projectId && projectName) projectId = (await findProjectByName(ctx.db, projectName))?.id ?? projectId;
    const recurrence = i.recurrence ?? parsed?.recurrence;
    let dueAt = i.dueAt ?? parsed?.dueAt;
    if (recurrence && !dueAt) {
      try {
        dueAt = new Cron(recurrence, { timezone: profile.timezone }).nextRun()?.toISOString() ?? null;
      } catch {
        /* invalid cron — keep undated */
      }
    }
    const task = await insertTask(ctx.db, ctx.userId, {
      title,
      description: i.description,
      projectId,
      priority: i.priority ?? parsed?.priority,
      dueAt,
      remindAt: i.remindAt ?? parsed?.remindAt,
      estimatedMinutes: i.estimatedMinutes ?? parsed?.estimatedMinutes,
      tags: i.tags ?? parsed?.tags,
      recurrence: i.recurrence ?? parsed?.recurrence,
      source: "ai",
    });
    const bits = [
      task.due_at ? `due ${formatLocal(task.due_at, profile.timezone)}` : null,
      task.remind_at ? `reminder ${formatLocal(task.remind_at, profile.timezone)}` : null,
      parsed?.recurrenceLabel ? `repeats: ${parsed.recurrenceLabel}` : null,
      `priority ${task.priority}`,
    ].filter(Boolean);
    return { task, summary: `Created task "${task.title}" (${bits.join(", ")})`, markdown: `✅ Task created: **${task.title}**\n\n${bits.map((b) => `- ${b}`).join("\n")}` };
  },
});

export const taskUpdate = defineTool({
  name: "task_update",
  description: "Update a task's status, priority, due date or title.",
  category: "tasks",
  risk: "low",
  input: z.object({
    taskId: z.string().uuid().optional(),
    titleContains: z.string().optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueAt: z.string().nullable().optional(),
    title: z.string().optional(),
  }),
  async execute(i, ctx) {
    let task: Task | null = null;
    if (i.taskId) task = await ctx.db.one<Task>("select * from tasks where id = $1", [i.taskId]);
    else if (i.titleContains)
      task = await ctx.db.one<Task>("select * from tasks where title ilike $1 and status not in ('completed','cancelled') order by updated_at desc limit 1", [
        `%${i.titleContains.replace(/[%_]/g, "")}%`,
      ]);
    if (!task) throw new AppError("I couldn't find that task");
    const updated = await completeAwareUpdate(ctx.db, ctx.userId, task, i);
    return { task: updated, summary: `Updated "${updated.title}" → ${updated.status}`, markdown: `Updated **${updated.title}** (status: ${updated.status}, priority: ${updated.priority})` };
  },
});

/** Update a task; completing a recurring task schedules its next occurrence. */
export async function completeAwareUpdate(
  db: Parameters<typeof insertTask>[0],
  userId: string,
  task: Task,
  patch: { status?: Task["status"]; priority?: Task["priority"]; dueAt?: string | null; title?: string; description?: string; projectId?: string | null; estimatedMinutes?: number | null; tags?: string[] },
): Promise<Task> {
  const completing = patch.status === "completed" && task.status !== "completed";
  const row = await db.one<Task>(
    `update tasks set
       status = coalesce($2, status),
       priority = coalesce($3, priority),
       due_at = case when $4::boolean then $5::timestamptz else due_at end,
       title = coalesce($6, title),
       description = coalesce($7, description),
       project_id = case when $8::boolean then $9::uuid else project_id end,
       estimated_minutes = case when $10::boolean then $11::int else estimated_minutes end,
       tags = coalesce($12, tags),
       completed_at = case when $2 = 'completed' then now() when $2 is not null then null else completed_at end
     where id = $1 returning *`,
    [
      task.id,
      patch.status ?? null,
      patch.priority ?? null,
      patch.dueAt !== undefined,
      patch.dueAt ?? null,
      patch.title ?? null,
      patch.description ?? null,
      patch.projectId !== undefined,
      patch.projectId ?? null,
      patch.estimatedMinutes !== undefined,
      patch.estimatedMinutes ?? null,
      patch.tags ?? null,
    ],
  );
  if (completing && task.recurrence) {
    const profile = await getProfile(db);
    try {
      const next = new Cron(task.recurrence, { timezone: profile.timezone }).nextRun(new Date());
      if (next) {
        await insertTask(db, userId, {
          title: task.title,
          description: task.description,
          projectId: task.project_id,
          priority: task.priority,
          dueAt: next.toISOString(),
          remindAt: task.remind_at ? next.toISOString() : null,
          estimatedMinutes: task.estimated_minutes,
          tags: task.tags,
          recurrence: task.recurrence,
          source: "automation",
        });
      }
    } catch {
      /* invalid cron: skip next occurrence */
    }
  }
  return row!;
}

export const taskList = defineTool({
  name: "task_list",
  description: "List tasks with filters (open/completed, due window, project).",
  category: "tasks",
  risk: "low",
  retryable: true,
  input: z.object({
    status: z.union([z.enum(["open", "all"]), statusEnum]).default("open"),
    dueWithinDays: z.number().optional(),
    dueOn: z.enum(["today", "tomorrow"]).optional(),
    completedSince: z.enum(["today", "week"]).optional(),
    projectName: z.string().optional(),
    projectId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, v: unknown) => {
      params.push(v);
      where.push(clause.replace("?", `$${params.length}`));
    };
    if (i.completedSince) {
      add("t.status = ?", "completed");
      const since = i.completedSince === "today" ? dayRange(profile.timezone).start : new Date(Date.now() - 7 * 86400_000);
      add("t.completed_at >= ?", since.toISOString());
    } else if (i.status === "open") add("t.status = any(?)", OPEN_STATUSES);
    else if (i.status !== "all") add("t.status = ?", i.status);
    if (i.dueOn) {
      const r = dayRange(profile.timezone, new Date(), i.dueOn === "tomorrow" ? 1 : 0);
      // for planning: due that day or overdue, undated open work, and high-priority work due within 3 days
      params.push(r.end.toISOString());
      const end = `$${params.length}`;
      where.push(`(t.due_at < ${end} or t.due_at is null or (t.priority in ('high','urgent') and t.due_at < ${end}::timestamptz + interval '3 days'))`);
    } else if (i.dueWithinDays !== undefined) add("t.due_at <= ?", new Date(Date.now() + i.dueWithinDays * 86400_000).toISOString());
    let projectId = i.projectId ?? null;
    if (!projectId && i.projectName) projectId = (await findProjectByName(ctx.db, i.projectName))?.id ?? null;
    if (projectId) add("t.project_id = ?", projectId);
    params.push(i.limit);
    const tasks = await ctx.db.query<Task>(
      `${TASK_SELECT} ${where.length ? `where ${where.join(" and ")}` : ""}
       order by t.due_at nulls last, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, t.created_at
       limit $${params.length}`,
      params,
    );
    const label = i.completedSince ? "completed" : i.status === "open" ? "open" : i.status;
    const markdown = tasks.length
      ? `**${tasks.length} ${label} task${tasks.length === 1 ? "" : "s"}**\n\n${tasks.map((t) => `- ${taskLine(t, profile.timezone)}`).join("\n")}`
      : `No ${label} tasks found.`;
    return { tasks, count: tasks.length, summary: `${tasks.length} ${label} tasks`, markdown };
  },
});

export const taskPrioritize = defineTool({
  name: "task_prioritize",
  description: "Rank tasks by priority, deadline urgency and progress (explainable scoring).",
  category: "tasks",
  risk: "low",
  input: z.object({ tasks: z.array(z.any()).default([]), top: z.number().int().optional() }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const ranked = prioritizeTasks(i.tasks as Task[]);
    const top = i.top ? ranked.slice(0, i.top) : ranked;
    const markdown = top.length
      ? top.map((t, n) => `${n + 1}. ${taskLine(t, profile.timezone)} — _${t.reason}_`).join("\n")
      : "Nothing to prioritise — you have no open tasks. 🎉";
    return { tasks: ranked, top: top[0] ?? null, summary: top[0] ? `Top priority: ${top[0].title}` : "No open tasks", markdown };
  },
});

export const scheduleGenerate = defineTool({
  name: "schedule_generate",
  description: "Build a time-blocked schedule from prioritised tasks within your work hours.",
  category: "tasks",
  risk: "low",
  input: z.object({ tasks: z.array(z.any()).default([]), day: z.enum(["today", "tomorrow"]).default("today"), title: z.string().optional() }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const tasks = (i.tasks as ScoredTask[]).filter((t) => t.status !== "completed");
    const ranked = tasks.every((t) => typeof t.score === "number") ? tasks : prioritizeTasks(tasks);
    const { blocks, unscheduled } = buildSchedule(ranked, { workStart: profile.work_start, workEnd: profile.work_end });
    const date = dayRange(profile.timezone, new Date(), i.day === "tomorrow" ? 1 : 0).start;
    const dateLabel = formatLocal(new Date(date.getTime() + 12 * 3600_000), profile.timezone, { weekday: "long", day: "numeric", month: "long" });
    const urgent = ranked.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now() + 86400_000);
    const md = [
      `# ${i.title ?? `Plan for ${dateLabel}`}`,
      "",
      urgent.length ? `## ⚠️ Urgent\n${urgent.map((t) => `- ${taskLine(t, profile.timezone)} — _${t.reason}_`).join("\n")}\n` : "",
      "## Schedule",
      blocks.length
        ? `| Time | What |\n|---|---|\n${blocks.map((b) => `| ${b.start}–${b.end} | ${b.kind === "task" ? `**${b.title}**` : `_${b.title}_`} |`).join("\n")}`
        : "_No tasks to schedule. Add tasks or enjoy a free day._",
      "",
      unscheduled.length ? `## Didn't fit today\n${unscheduled.map((t) => `- ${t.title}${t.status === "waiting" ? " (waiting)" : ""}`).join("\n")}` : "",
      "",
      `_Work hours ${profile.work_start}–${profile.work_end} (${profile.timezone}). Change them in Settings._`,
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { blocks, unscheduled, markdown: md, summary: `${blocks.filter((b) => b.kind === "task").length} tasks scheduled, ${unscheduled.length} left over` };
  },
});

export const reviewGenerate = defineTool({
  name: "review_generate",
  description: "End-of-day review: completed work, unfinished work, blockers and tomorrow's focus.",
  category: "tasks",
  risk: "low",
  input: z.object({ completed: z.array(z.any()).default([]), open: z.array(z.any()).default([]) }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const open = prioritizeTasks(i.open as Task[]);
    const blockers = open.filter((t) => t.status === "waiting" || (t.due_at && new Date(t.due_at) < new Date()));
    const md = `# End-of-day review — ${formatLocal(new Date(), profile.timezone, { dateStyle: "full" })}

## ✅ Completed (${i.completed.length})
${i.completed.length ? (i.completed as Task[]).map((t) => `- ${t.title}`).join("\n") : "- Nothing marked complete today."}

## ⏳ Still open (${open.length})
${open.length ? open.slice(0, 15).map((t) => `- ${taskLine(t, profile.timezone)}`).join("\n") : "- All clear!"}

## 🚧 Blockers & overdue
${blockers.length ? blockers.map((t) => `- ${t.title} — ${t.status === "waiting" ? "waiting on something" : "overdue"}`).join("\n") : "- None detected."}

## 🎯 Tomorrow's focus
${open.slice(0, 3).map((t, n) => `${n + 1}. ${t.title} — _${t.reason}_`).join("\n") || "- Plan something new."}
`;
    return { markdown: md, blockers, tomorrow: open.slice(0, 3), summary: `${i.completed.length} done, ${open.length} open, ${blockers.length} blockers` };
  },
});

export const calendarCreate = defineTool({
  name: "calendar_create",
  description: "Create a calendar event as a task with a time and an .ics file you can import into any calendar app.",
  category: "tasks",
  risk: "low",
  input: z.object({ title: z.string().min(1), startsAt: z.string(), durationMinutes: z.number().int().positive().default(60), description: z.string().default("") }),
  async execute(i, ctx) {
    const start = new Date(i.startsAt);
    if (isNaN(start.getTime())) throw new AppError("Invalid start time");
    const end = new Date(start.getTime() + i.durationMinutes * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AI Command Center//EN",
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}@ai-command-center`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${i.title.replace(/[,;\n]/g, " ")}`,
      `DESCRIPTION:${i.description.replace(/\n/g, "\\n").replace(/[,;]/g, " ")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const file = await saveFile(ctx.db, ctx.userId, { name: `${i.title.slice(0, 60)}.ics`, folder: "outputs", data: ics, mime: "text/calendar" });
    const task = await insertTask(ctx.db, ctx.userId, { title: i.title, description: i.description, dueAt: start.toISOString(), remindAt: new Date(start.getTime() - 15 * 60000).toISOString(), estimatedMinutes: i.durationMinutes, source: "ai", tags: ["event"] });
    return { task, files: [{ id: file.id, name: file.name }], summary: `Event "${i.title}" created`, markdown: `📅 Event **${i.title}** saved (reminder 15 min before). Import \`${file.name}\` into Google/Apple/Outlook calendar.` };
  },
});

export const projectCreate = defineTool({
  name: "project_create",
  description: "Create a project workspace.",
  category: "projects",
  risk: "low",
  input: z.object({ name: z.string().min(1).max(80), description: z.string().default(""), kind: z.enum(["general", "business", "study", "personal"]).default("general") }),
  async execute(i, ctx) {
    const sections =
      i.kind === "study"
        ? ["Subjects", "Chapters", "Notes", "Past papers", "Assignments", "Exams", "Revision plans"]
        : i.kind === "business"
          ? ["Tasks", "Files", "Notes", "Documents", "Products", "Content", "Automations", "Deadlines"]
          : ["Tasks", "Files", "Notes", "Documents"];
    const p = await ctx.db.one<{ id: string; name: string }>(
      `insert into projects(user_id, name, description, kind, sections) values ($1,$2,$3,$4,$5)
       on conflict (user_id, name) do update set description = coalesce(nullif(excluded.description,''), projects.description) returning id, name`,
      [ctx.userId, i.name.trim(), i.description, i.kind, sections],
    );
    return { project: p, summary: `Project "${p!.name}" ready`, markdown: `📁 Project **${p!.name}** is ready (${i.kind}). Sections: ${sections.join(", ")}.` };
  },
});

export const taskTools = [taskCreate, taskUpdate, taskList, taskPrioritize, scheduleGenerate, reviewGenerate, calendarCreate, projectCreate];
