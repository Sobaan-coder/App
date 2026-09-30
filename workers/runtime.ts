import os from "node:os";
import { sql, userDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { explainError } from "@/lib/errors";
import { advanceRun } from "@/workflows/engine";
import { runDueSchedules } from "@/automations/service";
import { notify } from "@/services/notifications";
import { publishPost, publishMarkdown } from "@/services/content/posts";
import { claimNext, completeJob, failJob, maintenance, queueEvents, type Job } from "./queue";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);

const g = globalThis as unknown as { __ccWorker?: { stop: () => Promise<void> } };

async function heartbeat(component: string, status: "online" | "warning" | "offline", details: Record<string, unknown> = {}) {
  await sql
    .query(
      `insert into system_status(component, status, details, updated_at) values ($1,$2,$3, now())
       on conflict (component) do update set status = excluded.status, details = excluded.details, updated_at = now()`,
      [component, status, JSON.stringify({ worker: WORKER_ID, ...details })],
    )
    .catch(() => {});
}

async function handle(job: Job) {
  switch (job.type) {
    case "run.advance":
      await advanceRun(String(job.payload.runId));
      return;
    default:
      console.warn(`[worker] unknown job type ${job.type}`);
  }
}

/** Task reminders due now → notifications. */
async function sendReminders() {
  const due = await sql.query<{ id: string; user_id: string; title: string; due_at: Date | null }>(
    "update tasks set reminded_at = now() where id in (select id from tasks where remind_at <= now() and reminded_at is null and status in ('todo','in_progress','waiting') limit 50) returning id, user_id, title, due_at",
  );
  for (const t of due) {
    const db = userDb(t.user_id);
    await notify(db, t.user_id, { title: `Reminder: ${t.title}`, body: t.due_at ? `Due ${new Date(t.due_at).toUTCString()}` : "", level: "info", link: "/tasks" }).catch(() => {});
    await logActivity(db, { userId: t.user_id, category: "tasks", action: "task.reminder", message: `Reminder sent: ${t.title}` });
  }
}

/** Posts you approved and scheduled are published when their time comes. */
async function publishScheduledPosts() {
  const due = await sql.query<{ id: string; user_id: string; title: string }>(
    "update content_posts set status = 'approved' where id in (select id from content_posts where status = 'scheduled' and scheduled_at <= now() limit 10) returning id, user_id, title",
  );
  for (const p of due) {
    const db = userDb(p.user_id);
    try {
      const results = await publishPost(db, p.user_id, p.id);
      await notify(db, p.user_id, { title: `Scheduled post: ${p.title}`, body: publishMarkdown(results).split("\n")[0], level: results.some((r) => r.status === "failed") ? "error" : "success", link: `/content/posts/${p.id}` });
      await logActivity(db, { userId: p.user_id, category: "content", action: "post.published", status: "success", message: `Scheduled post "${p.title}" processed` });
    } catch (err) {
      await db.query("update content_posts set status = 'failed' where id = $1", [p.id]);
      await notify(db, p.user_id, { title: `Scheduled post failed: ${p.title}`, body: explainError(err), level: "error", link: `/content/posts/${p.id}` });
    }
  }
}

export function startWorker(opts: { embedded?: boolean } = {}) {
  if (g.__ccWorker) return g.__ccWorker;
  let running = true;
  let active = 0;
  let wake: (() => void) | null = null;
  const onJob = () => wake?.();
  queueEvents.on("job", onJob);

  const jobLoop = async (slot: number) => {
    while (running) {
      let job: Job | null = null;
      try {
        job = await claimNext(`${WORKER_ID}#${slot}`);
      } catch (err) {
        console.error("[worker] claim failed:", explainError(err));
      }
      if (!job) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, 1500);
          wake = () => {
            clearTimeout(t);
            r();
          };
        });
        continue;
      }
      active++;
      try {
        await handle(job);
        await completeJob(job.id);
      } catch (err) {
        console.error(`[worker] job ${job.type} failed:`, explainError(err));
        await failJob(job, explainError(err)).catch(() => {});
      } finally {
        active--;
      }
    }
  };

  let tick = 0;
  const schedulerLoop = async () => {
    while (running) {
      try {
        const started = await runDueSchedules();
        await sendReminders();
        await publishScheduledPosts();
        if (tick % 10 === 0) await maintenance();
        await heartbeat("scheduler", "online", { startedRuns: started });
        await heartbeat("worker", "online", { active, concurrency: CONCURRENCY, embedded: Boolean(opts.embedded) });
      } catch (err) {
        console.error("[scheduler] tick failed:", explainError(err));
        await heartbeat("scheduler", "warning", { error: explainError(err) });
      }
      tick++;
      await new Promise((r) => setTimeout(r, 30_000));
    }
  };

  for (let i = 0; i < CONCURRENCY; i++) void jobLoop(i);
  void schedulerLoop();
  console.log(`[worker] started (${opts.embedded ? "embedded in Next.js" : "standalone"}, concurrency ${CONCURRENCY})`);

  g.__ccWorker = {
    async stop() {
      running = false;
      queueEvents.off("job", onJob);
      wake?.();
      await heartbeat("worker", "offline");
      g.__ccWorker = undefined;
    },
  };
  return g.__ccWorker;
}
