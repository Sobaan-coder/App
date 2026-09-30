import "./_env";
import { closePool, sql } from "@/lib/db";
import { migrate } from "@/database/migrate";
import { syncToolRegistry } from "@/tools/registry-sync";
import { signup } from "@/services/users";

/**
 * Seed data: the tool registry, and (optionally) a demo account from SEED_EMAIL / SEED_PASSWORD
 * with the starter workspace (Merchants brand + products, Study project, sample tasks).
 */
async function main() {
  await migrate(() => {});
  await syncToolRegistry();
  console.log("  ✓ tools registry seeded");
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (email && password) {
    const exists = await sql.one("select 1 from users where email = $1", [email.toLowerCase()]);
    if (exists) console.log(`  • user ${email} already exists`);
    else {
      await signup({ email, password, name: "Demo" });
      console.log(`  ✓ created ${email} with starter workspace`);
    }
  } else {
    console.log("  • no SEED_EMAIL/SEED_PASSWORD set — create your account in the app (first sign-up becomes admin)");
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
