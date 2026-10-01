import { migrate, resetDatabase } from "@/database/migrate";
import { syncToolRegistry } from "@/tools/registry-sync";
import { sql, withUser } from "@/lib/db";
import { claimNext, completeJob } from "@/workers/queue";
import { advanceRun } from "@/workflows/engine";
import { signup } from "@/services/users";
import { resetEnvCache } from "@/lib/env";

export async function freshDb() {
  resetEnvCache();
  await resetDatabase();
  await migrate(() => {});
  await syncToolRegistry();
}

let n = 0;
export async function newUser(name = "user") {
  return signup({ email: `${name}${Date.now()}${n++}@test.local`, password: "Test-password-123", name });
}

/** Process every queued job synchronously (stands in for the worker loop). */
export async function drain(max = 50) {
  for (let i = 0; i < max; i++) {
    const j = await sql.one<{ id: string }>("select id from jobs where status = 'queued' and run_at <= now() limit 1");
    if (!j) return;
    const job = await claimNext("test");
    if (!job) return;
    await advanceRun(String(job.payload.runId));
    await completeJob(job.id);
  }
}

export async function runOf(userId: string, runId: string) {
  return withUser(userId, async (db) => ({
    run: (await db.one<{ status: string; error: string | null; result: Record<string, unknown> | null }>("select status, error, result from automation_runs where id = $1", [runId]))!,
    steps: await db.query<{ step_key: string; status: string; error: string | null; attempts: number }>("select step_key, status, error, attempts from workflow_steps where run_id = $1 order by step_index", [runId]),
    approvals: await db.query<{ id: string; status: string; requires_confirmation: boolean; tool_name: string }>("select id, status, requires_confirmation, tool_name from approvals where run_id = $1", [runId]),
  }));
}
