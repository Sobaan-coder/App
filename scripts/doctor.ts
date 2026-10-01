import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

/**
 * npm run doctor — checks that everything needed to run the app is in place, explains how to fix
 * what isn't, and prints the addresses to open on your phone. Safe: it never deletes anything; the
 * only thing it may create is the (empty) database if it doesn't exist yet.
 */
const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m: string, fix?: string) => console.log(`  \x1b[33m!\x1b[0m ${m}${fix ? `\n      → ${fix}` : ""}`);
const bad = (m: string, fix?: string) => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}${fix ? `\n      → ${fix}` : ""}`);
  problems++;
};
let problems = 0;

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "0.0.0.0");
  });
}

async function main() {
  console.log("\n  KHOKHAR · AI Command Center — doctor\n");

  // Node
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok(`Node.js ${process.versions.node}`);
  else bad(`Node.js ${process.versions.node} is too old`, "Install Node.js 22 LTS from https://nodejs.org");

  // .env
  if (!fs.existsSync(".env")) {
    bad(".env not found", "Run: npm run setup");
    return finish();
  }
  process.loadEnvFile(".env");
  const e = process.env;
  if (!e.AUTH_SECRET || e.AUTH_SECRET.length < 32) bad("AUTH_SECRET missing or too short", "Run: npm run setup");
  else ok("Secrets present in .env");
  if (!e.DATABASE_URL) {
    bad("DATABASE_URL missing", "Run: npm run setup");
    return finish();
  }

  // Database (create it if it doesn't exist yet)
  const ssl = e.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined;
  let db: Client | null = new Client({ connectionString: e.DATABASE_URL, ssl, connectionTimeoutMillis: 8000 });
  try {
    await db.connect();
    ok("Database connection");
  } catch (err) {
    const msg = (err as Error).message;
    db = null;
    if (/does not exist/.test(msg)) {
      const url = new URL(e.DATABASE_URL);
      const name = url.pathname.slice(1);
      url.pathname = "/postgres";
      const admin = new Client({ connectionString: url.toString(), ssl });
      try {
        await admin.connect();
        await admin.query(`create database "${name.replace(/"/g, "")}"`);
        await admin.end();
        ok(`Created database "${name}"`);
        db = new Client({ connectionString: e.DATABASE_URL, ssl });
        await db.connect();
      } catch (e2) {
        bad(`Database "${name}" doesn't exist and couldn't be created: ${(e2 as Error).message}`);
      }
    } else if (/ECONNREFUSED/.test(msg)) bad("PostgreSQL is not running on this computer", "Start it (Windows: Services → postgresql; macOS: open Postgres.app; Linux: sudo systemctl start postgresql) — or use Supabase via npm run setup");
    else if (/password authentication failed/.test(msg)) bad("Wrong database password", "Run npm run setup again and enter the password you chose when installing PostgreSQL");
    else bad(`Database error: ${msg}`, e.DATABASE_URL.includes("supabase") ? "Check the Supabase connection string and DATABASE_SSL=require" : undefined);
  }
  if (db) {
    try {
      const r = await db.query("select count(*)::int as n from schema_migrations");
      const files = fs.readdirSync(path.join("database", "migrations")).filter((f) => f.endsWith(".sql")).length;
      if (r.rows[0].n >= files) ok(`Database tables up to date (${files} migrations)`);
      else warn(`${files - r.rows[0].n} migration(s) pending`, "Run: npm run db:migrate (also applied automatically when the app starts)");
      const users = await db.query("select count(*)::int as n from users");
      if (users.rows[0].n === 0) warn("No account yet", "Start the app and click “Create an account” — the first account becomes admin");
      else ok(`${users.rows[0].n} account(s)`);
    } catch {
      warn("Tables not created yet", "Run: npm run db:migrate");
    }
    await db.end();
  }

  // Build
  if (fs.existsSync(path.join(".next", "BUILD_ID"))) ok("Production build exists");
  else warn("Not built yet", "Run: npm run build");

  // Port
  const port = Number(e.PORT ?? 3000);
  if (await portFree(port)) ok(`Port ${port} is free`);
  else warn(`Port ${port} is in use (the app may already be running)`, `Open http://localhost:${port} — or start on another port: PORT=3001 npm start`);

  // Browser automation
  try {
    const { chromium } = await import("playwright");
    const exe = e.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
    if (exe && fs.existsSync(exe)) ok("Browser automation (Chromium) installed");
    else warn("Chromium for browser automation not installed (optional)", "Run: npx playwright install chromium");
  } catch {
    warn("Playwright not available (optional)");
  }

  // AI
  if (e.OLLAMA_BASE_URL && e.OLLAMA_MODEL) {
    try {
      const res = await fetch(`${e.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(2000) });
      const tags = ((await res.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? [];
      if (tags.some((t) => t.startsWith(e.OLLAMA_MODEL!))) ok(`Ollama running with ${e.OLLAMA_MODEL}`);
      else warn(`Ollama is running but "${e.OLLAMA_MODEL}" isn't downloaded`, `Run: ollama pull ${e.OLLAMA_MODEL}`);
    } catch {
      warn("Ollama not running (optional — the free offline engine is used)", "Install from https://ollama.com, then: ollama pull qwen2.5");
    }
  } else warn("No AI model configured (optional — KHOKHAR works with the offline engine)", "For smarter English/Urdu: install Ollama and set OLLAMA_MODEL in .env");
  if (e.STT_BASE_URL) ok(`Whisper speech server configured (${e.STT_MODEL})`);

  // Addresses
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => Boolean(i && i.family === "IPv4" && !i.internal))
    .map((i) => i.address);
  console.log(`\n  Open on this computer:   http://localhost:${port}`);
  if (lan.length) {
    console.log(`  Open on your phone (same Wi-Fi, no microphone over plain http):`);
    for (const ip of lan) console.log(`                           http://${ip}:${port}`);
  }
  console.log("  For voice + install on iPhone/Android use HTTPS — see docs/MOBILE.md (Tailscale, free).");
  finish();
}

function finish() {
  console.log(problems ? `\n  ${problems} problem(s) to fix above.\n` : "\n  All required checks passed. Start with: npm start\n");
  process.exitCode = problems ? 1 : 0;
}

main().catch((e) => {
  console.error("doctor failed:", e);
  process.exitCode = 1;
});
