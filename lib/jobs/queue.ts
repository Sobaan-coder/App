import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type JobKind = Database["public"]["Enums"]["job_kind"];

const MAX_ATTEMPTS = 3;

/**
 * Queue a background job and start it right after the response is sent
 * (Next.js `after`). A cron route (/api/cron/process-jobs) picks up anything
 * that was interrupted, so the UI never blocks on document processing.
 *
 * Callers MUST have verified that `userId` owns `targetId` (via an RLS query)
 * before enqueueing; handlers use the service role.
 */
export async function enqueueJob(kind: JobKind, targetId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("processing_jobs")
    .insert({ kind, target_id: targetId, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  after(async () => {
    await runJob(data.id);
  });
  return data.id;
}

type Handler = (job: { id: string; target_id: string; user_id: string; attempts: number }) => Promise<void>;

const handlers: Partial<Record<JobKind, () => Promise<Handler>>> = {
  syllabus: async () => (await import("@/lib/syllabus/process")).processSyllabusImport,
  resource: async () => (await import("@/lib/documents/process")).processResource,
  past_paper: async () => (await import("@/lib/past-papers/process")).processPastPaper,
};

/** Claim and run one job. Safe to call concurrently: the claim is atomic. */
export async function runJob(jobId: string) {
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("processing_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, kind, target_id, user_id, attempts")
    .maybeSingle();
  if (!job) return; // already claimed elsewhere

  const attempts = job.attempts + 1;
  try {
    const handler = await handlers[job.kind]!();
    await handler({ ...job, attempts });
    await admin.from("processing_jobs").update({ status: "succeeded", attempts, finished_at: new Date().toISOString(), error: null }).eq("id", job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retry = attempts < MAX_ATTEMPTS && (err as { retryable?: boolean })?.retryable !== false;
    await admin
      .from("processing_jobs")
      .update({ status: retry ? "queued" : "failed", attempts, error: message.slice(0, 2000), finished_at: new Date().toISOString() })
      .eq("id", job.id);
    await admin.from("error_logs").insert({ source: `job:${job.kind}`, message: message.slice(0, 2000), user_id: job.user_id, context: { job_id: job.id, target_id: job.target_id, attempts } });
  }
}

/** Used by the cron route: requeue stuck jobs and run queued ones. */
export async function processPendingJobs(limit = 5) {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  await admin.from("processing_jobs").update({ status: "queued" }).eq("status", "running").lt("started_at", staleBefore);
  const { data: jobs } = await admin.from("processing_jobs").select("id").eq("status", "queued").order("created_at").limit(limit);
  for (const j of jobs ?? []) await runJob(j.id);
  return jobs?.length ?? 0;
}
