import "./_env";
import { migrate, resetDatabase } from "@/database/migrate";
import { closePool } from "@/lib/db";
import { syncToolRegistry } from "@/tools/registry-sync";

async function main() {
  if (process.argv.includes("--reset")) {
    console.log("⚠ Resetting database (all data will be deleted)…");
    await resetDatabase();
  }
  console.log("Running migrations…");
  const ran = await migrate();
  if (!ran.length) console.log("  (already up to date)");
  await syncToolRegistry();
  console.log("  ✓ tool registry synced");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
