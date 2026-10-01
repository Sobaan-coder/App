import crypto from "node:crypto";
import fs from "node:fs";
import readline from "node:readline/promises";

/**
 * First-time setup: creates .env from .env.example with fresh random secrets.
 * Interactive when run in a terminal (asks for the database URL). Never overwrites an existing .env
 * unless you confirm.
 *
 *   npm run setup                 interactive
 *   npm run setup -- --yes        non-interactive (local Postgres defaults)
 *   npm run setup -- --yes --db-password=secret      local Postgres with your password
 *   npm run setup -- --yes --db-url=postgres://…     any database (e.g. Supabase; SSL turned on for non-local hosts)
 */
const LOCAL_DB = "postgres://postgres:postgres@localhost:5432/command_center";

const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const interactive = process.stdin.isTTY && !process.argv.includes("--yes");
  const flagUrl = flag("db-url");
  const flagPw = flag("db-password");
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q: string, def = "") => (rl ? ((await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim() || def) : def);

  console.log("\n  MY AI COMMAND CENTER — setup (your assistant: KHOKHAR)\n");
  if (fs.existsSync(".env")) {
    const again = await ask(".env already exists. Overwrite it? (y/N)", "N");
    if (!/^y/i.test(again)) {
      console.log("  Keeping your existing .env. Next: npm run doctor");
      rl?.close();
      return;
    }
    fs.copyFileSync(".env", `.env.backup-${Date.now()}`);
    console.log("  (old .env backed up)");
  }

  console.log("  Database — choose one:");
  console.log("    1) Local PostgreSQL on this computer (default password 'postgres')");
  console.log("    2) Supabase (free cloud) — paste the 'Session pooler' connection string");
  const choice = flagUrl || flagPw !== undefined ? "flag" : await ask("  1 or 2", "1");
  let dbUrl = LOCAL_DB;
  let ssl = "";
  if (flagUrl) {
    dbUrl = flagUrl;
    ssl = /@(localhost|127\.0\.0\.1)[:/]/.test(flagUrl) ? "" : "require";
  } else if (flagPw !== undefined) {
    dbUrl = `postgres://postgres${flagPw ? `:${encodeURIComponent(flagPw)}` : ""}@localhost:5432/command_center`;
  } else if (choice === "2") {
    dbUrl = await ask("  Paste your Supabase connection string");
    ssl = "require";
  } else {
    const isMac = process.platform === "darwin";
    const user = await ask("  PostgreSQL username (Postgres.app on Mac: your Mac username)", isMac ? process.env.USER || "postgres" : "postgres");
    const pw = await ask("  PostgreSQL password (leave empty if none)", isMac ? "" : "postgres");
    dbUrl = `postgres://${encodeURIComponent(user)}${pw ? `:${encodeURIComponent(pw)}` : ""}@localhost:5432/command_center`;
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timezone = await ask("  Your timezone", tz);

  const rnd = () => crypto.randomBytes(32).toString("hex");
  const set = (text: string, key: string, value: string) => text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  let env = fs.readFileSync(".env.example", "utf8");
  env = set(env, "AUTH_SECRET", rnd());
  env = set(env, "ENCRYPTION_KEY", rnd());
  env = set(env, "DATABASE_URL", dbUrl);
  env = set(env, "DATABASE_SSL", ssl);
  env = set(env, "DEFAULT_TIMEZONE", timezone);
  fs.writeFileSync(".env", env, { mode: 0o600 });
  rl?.close();
  console.log(`
  ✓ Created .env (fresh secrets — never share or commit this file)

  Next steps:
    npm run doctor        check everything
    npm run db:migrate    create the database tables
    npm run build
    npm start             then open http://localhost:3000
`);
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exitCode = 1;
});
