import fs from "node:fs";
import path from "node:path";

/** Load .env for CLI scripts (Next.js loads it automatically for the app). */
export function loadEnv() {
  const file = path.resolve(process.cwd(), process.env.ENV_FILE ?? ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
loadEnv();
