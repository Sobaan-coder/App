import type { Db } from "./db";

export type ActivityStatus = "info" | "success" | "warning" | "error";

export interface ActivityEntry {
  userId: string;
  runId?: string | null;
  category?: string;
  action: string;
  tool?: string | null;
  status?: ActivityStatus;
  message: string;
  details?: unknown;
}

/** Append to the audit trail. Never throws (logging must not break the work). */
export async function logActivity(db: Db, e: ActivityEntry): Promise<void> {
  try {
    await db.query(
      `insert into activity_logs(user_id, run_id, category, action, tool, status, message, details)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        e.userId,
        e.runId ?? null,
        e.category ?? "system",
        e.action,
        e.tool ?? null,
        e.status ?? "info",
        e.message.slice(0, 2000),
        e.details === undefined ? null : JSON.stringify(e.details),
      ],
    );
  } catch (err) {
    console.error("[activity] failed to log", (err as Error).message);
  }
}
