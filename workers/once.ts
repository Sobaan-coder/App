import "../scripts/_env";
import { migrate } from "@/database/migrate";
import { closePool, sql } from "@/lib/db";
import { syncToolRegistry } from "@/tools/registry-sync";
import { runDueSchedules } from "@/automations/service";
import { advanceRun } from "@/workflows/engine";
import { claimNext, completeJob, failJob, maintenance } from "./queue";

/**
 * One-shot worker for cron-only hosting (system cron, GitHub Actions schedule…):
 * starts due schedules, processes queued jobs for up to ~4 minutes, then exits.
 *   cron: every 5 minutes →  cd /path/to/app && npm run worker:once
 */
async function main() {
  await migrate(() => {});
  await syncToolRegistry();
  await maintenance();
  const started = await runDueSchedules();
  const deadline = Date.now() + 4 * 60_000;
  let processed = 0;
  while (Date.now() < deadline) {
    const job = await claimNext("once");
    if (!job) break;
    try {
      if (job.type === "run.advance") await advanceRun(String(job.payload.runId));
      await completeJob(job.id);
    } catch (err) {
      await failJob(job, (err as Error).message);
    }
    processed++;
  }
  await sql.query(
    `insert into system_status(component, status, details, updated_at) values ('scheduler','online',$1, now())
     on conflict (component) do update set status = 'online', details = excluded.details, updated_at = now()`,
    [JSON.stringify({ mode: "cron", startedRuns: started, processed })],
  );
  console.log(`[worker:once] started ${started} scheduled run(s), processed ${processed} job(s)`);
}

main()
  .catch((e) => {
    console.error("[worker:once] failed:", e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
