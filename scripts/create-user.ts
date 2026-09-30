import "./_env";
import { closePool } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { signup } from "@/services/users";

/** Admin helper: npm run user:create -- email@example.com "Long password 123" "Name" */
async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.log('Usage: npm run user:create -- <email> <password> [name]');
    process.exit(1);
  }
  process.env.ALLOW_SIGNUP = "true"; // CLI is trusted (it has DB access anyway)
  resetEnvCache();
  const u = await signup({ email, password, name });
  console.log(`✓ Created ${u.email} (${u.role})`);
}

main()
  .catch((e) => {
    console.error("Failed:", e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
