import { route } from "@/lib/api";
import { sql, withUser } from "@/lib/db";
import { storageWritable } from "@/services/storage";
import { providerStatuses } from "@/services/ai/router";
import { imageProviderStatus } from "@/services/image-generation";

type Status = "online" | "warning" | "offline";

/** SYSTEM HEALTH: database, AI provider, worker, scheduler, browser, storage. */
export const GET = route({}, async ({ user }) => {
  const components: { name: string; status: Status; detail: string }[] = [];
  const t0 = Date.now();
  try {
    await sql.query("select 1");
    components.push({ name: "Database", status: "online", detail: `PostgreSQL reachable (${Date.now() - t0} ms)` });
  } catch (err) {
    components.push({ name: "Database", status: "offline", detail: (err as Error).message });
  }
  const providers = await withUser(user.id, (db) => providerStatuses(db, user.id)).catch(() => []);
  const usable = providers.filter((p) => p.ok && !p.skippedReason);
  components.push({
    name: "AI provider",
    status: usable.length ? "online" : "warning",
    detail: usable.length ? `Using ${usable.map((p) => `${p.label} (${p.model})`).join(", ")}` : `No AI model reachable — offline engine active ($0). ${providers.map((p) => `${p.label}: ${p.skippedReason ?? p.detail ?? "?"}`).join("; ")}`,
  });
  const beats = await sql.query<{ component: string; status: Status; updated_at: string; details: Record<string, unknown> }>("select * from system_status");
  for (const [key, label] of [["worker", "Automation worker"], ["scheduler", "Scheduler"]] as const) {
    const b = beats.find((x) => x.component === key);
    const age = b ? (Date.now() - new Date(b.updated_at).getTime()) / 1000 : Infinity;
    components.push({
      name: label,
      status: !b || b.status === "offline" || age > 180 ? "offline" : age > 75 || b.status === "warning" ? "warning" : "online",
      detail: b ? `Last heartbeat ${Math.round(age)}s ago${b.details?.embedded ? " (embedded)" : ""}${b.details?.error ? ` — ${b.details.error}` : ""}` : "Never started. Run `npm run worker` or set EMBEDDED_WORKER=true.",
    });
  }
  const { browserAvailable } = await import("@/automation/browser/session");
  const br = await Promise.race([browserAvailable(), new Promise<{ ok: boolean; detail: string }>((r) => setTimeout(() => r({ ok: false, detail: "Browser start timed out" }), 20_000))]);
  components.push({ name: "Browser worker", status: br.ok ? "online" : "warning", detail: br.ok ? "Headless Chromium ready (Playwright)" : `${br.detail}` });
  components.push({ name: "Storage", status: (await storageWritable()) ? "online" : "offline", detail: "Local file storage (STORAGE_DIR)" });
  const jobs = await sql.one<{ queued: number; failed: number }>("select count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'failed' and updated_at > now() - interval '1 day')::int as failed from jobs");
  return { components, jobs, imageProviders: imageProviderStatus(), checkedAt: new Date().toISOString() };
});
