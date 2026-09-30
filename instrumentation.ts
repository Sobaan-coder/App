/**
 * Next.js startup hook. Applies pending migrations and (by default) runs the automation worker
 * inside the server process, so `npm run dev` / `npm start` is all you need locally.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) {
    console.warn("[startup] DATABASE_URL / AUTH_SECRET not set — see .env.example");
    return;
  }
  try {
    if (process.env.AUTO_MIGRATE !== "false") {
      const { migrate } = await import("./database/migrate");
      const { syncToolRegistry } = await import("./tools/registry-sync");
      await migrate((m) => console.log(`[startup] ${m.trim()}`));
      await syncToolRegistry();
    }
    if (process.env.EMBEDDED_WORKER !== "false") {
      const { startWorker } = await import("./workers/runtime");
      startWorker({ embedded: true });
    }
  } catch (err) {
    console.error("[startup] failed:", (err as Error).message);
  }
}
