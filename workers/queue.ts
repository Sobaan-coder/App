import { EventEmitter } from "node:events";
import { sql } from "@/lib/db";

/**
 * Postgres-backed job queue (no Redis needed — $0). Workers claim jobs with
 * FOR UPDATE SKIP LOCKED, so several worker processes can run safely.
 */
export interface Job {
  id: string;
  user_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

const g = globalThis as unknown as { __ccQueueEvents?: EventEmitter };
export const queueEvents = (g.__ccQueueEvents ??= new EventEmitter());

export async function enqueue(type: string, payload: Record<string, unknown>, opts: { userId?: string | null; runAt?: Date; maxAttempts?: number } = {}) {
  const row = await sql.one<{ id: string }>("insert into jobs(user_id, type, payload, run_at, max_attempts) values ($1,$2,$3,$4,$5) returning id", [
    opts.userId ?? null,
    type,
    JSON.stringify(payload),
    (opts.runAt ?? new Date()).toISOString(),
    opts.maxAttempts ?? 3,
  ]);
  if (!opts.runAt || opts.runAt.getTime() <= Date.now()) queueEvents.emit("job");
  return row!.id;
}

export async function claimNext(workerId: string): Promise<Job | null> {
  return sql.one<Job>(
    `update jobs set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
     where id = (select id from jobs where status = 'queued' and run_at <= now() order by run_at limit 1 for update skip locked)
     returning id, user_id, type, payload, attempts, max_attempts`,
    [workerId],
  );
}

export async function completeJob(id: string) {
  await sql.query("update jobs set status = 'completed', locked_at = null where id = $1", [id]);
}

/** Retry with exponential backoff until max_attempts, then mark failed. */
export async function failJob(job: Job, error: string) {
  if (job.attempts < job.max_attempts) {
    const delaySec = Math.min(900, 5 * 2 ** job.attempts);
    await sql.query("update jobs set status = 'queued', locked_at = null, last_error = $2, run_at = now() + ($3 || ' seconds')::interval where id = $1", [job.id, error.slice(0, 2000), String(delaySec)]);
  } else {
    await sql.query("update jobs set status = 'failed', locked_at = null, last_error = $2 where id = $1", [job.id, error.slice(0, 2000)]);
  }
}

/** Jobs stuck in "running" (worker crashed) go back to the queue. Old finished jobs are pruned. */
export async function maintenance() {
  await sql.query("update jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '20 minutes'");
  await sql.query("delete from jobs where status in ('completed','failed') and updated_at < now() - interval '14 days'");
  await sql.query(
    `update automation_runs set status = 'queued' where status = 'running' and updated_at < now() - interval '30 minutes'
     and not exists (select 1 from jobs j where j.status in ('queued','running') and j.payload->>'runId' = automation_runs.id::text)`,
  );
}
