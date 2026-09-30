import crypto from "node:crypto";
import fs from "node:fs";

/**
 * First-time helper: creates .env from .env.example with fresh random secrets.
 * Never overwrites an existing .env.
 */
if (fs.existsSync(".env")) {
  console.log(".env already exists — leaving it untouched.");
} else {
  const rnd = () => crypto.randomBytes(32).toString("hex");
  const text = fs
    .readFileSync(".env.example", "utf8")
    .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${rnd()}`)
    .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${rnd()}`);
  fs.writeFileSync(".env", text, { mode: 0o600 });
  console.log("✓ Created .env with fresh AUTH_SECRET and ENCRYPTION_KEY. Now set DATABASE_URL, then run: npm run db:migrate");
}
