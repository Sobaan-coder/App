import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/** Persists AI usage and errors. Swappable in tests. */
export interface AIRecorder {
  countRecent(userId: string, sinceMs: number): Promise<number>;
  recordUsage(row: { userId: string | null; feature: string; provider: string; model: string; inputTokens: number; outputTokens: number; success: boolean }): Promise<void>;
  recordError(source: string, message: string, userId: string | null, context?: Record<string, unknown>): Promise<void>;
}

export const dbRecorder: AIRecorder = {
  async countRecent(userId, sinceMs) {
    const since = new Date(Date.now() - sinceMs).toISOString();
    const { count } = await createAdminClient()
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    return count ?? 0;
  },
  async recordUsage(row) {
    await createAdminClient().from("ai_usage").insert({
      user_id: row.userId,
      feature: row.feature,
      provider: row.provider,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      success: row.success,
    });
  },
  async recordError(source, message, userId, context) {
    console.error(`[${source}]`, message, context ?? "");
    await createAdminClient()
      .from("error_logs")
      .insert({ source, message: message.slice(0, 2000), user_id: userId, context: (context ?? null) as Json })
      .then(() => {}, () => {});
  },
};
