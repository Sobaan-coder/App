import { sql } from "@/lib/db";
import { TOOLS, staticRisk } from "./registry";

/** Mirror the code registry into the `tools` table (for the admin UI and permission FKs). */
export async function syncToolRegistry() {
  for (const t of TOOLS) {
    await sql.query(
      `insert into tools(name, description, category, risk_level) values ($1,$2,$3,$4)
       on conflict (name) do update set description = excluded.description, category = excluded.category, risk_level = excluded.risk_level, updated_at = now()`,
      [t.name, t.description, t.category, typeof t.risk === "function" ? "medium" : staticRisk(t)],
    );
  }
  await sql.query("delete from tools where not (name = any($1))", [TOOLS.map((t) => t.name)]);
}
