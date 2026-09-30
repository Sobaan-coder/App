import "../scripts/_env";
import { migrate } from "@/database/migrate";
import { closePool } from "@/lib/db";
import { syncToolRegistry } from "@/tools/registry-sync";
import { startWorker } from "./runtime";

/** Standalone worker: `npm run worker` (use with Netlify/Vercel frontends, or on any always-on box). */
async function main() {
  await migrate(() => {});
  await syncToolRegistry();
  const w = startWorker({ embedded: false });
  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await w.stop();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
