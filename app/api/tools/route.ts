import { z } from "zod";
import { body, route } from "@/lib/api";
import { sql, withUser } from "@/lib/db";
import { defaultMode, effectiveMode } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/errors";
import { TOOLS, getTool } from "@/tools/registry";

export const GET = route({}, async ({ user }) => {
  return withUser(user.id, async (db) => {
    const overrides = await db.query<{ tool_name: string; mode: string }>("select tool_name, mode from tool_permissions");
    const global = await db.query<{ name: string; enabled: boolean }>("select name, enabled from tools");
    const tools = TOOLS.map((t) => {
      const risk = typeof t.risk === "function" ? "dynamic" : t.risk;
      const o = overrides.find((x) => x.tool_name === t.name)?.mode ?? null;
      const base = risk === "dynamic" ? "low" : risk;
      return {
        name: t.name,
        description: t.description,
        category: t.category,
        risk,
        defaultMode: defaultMode(base),
        override: o,
        effectiveMode: effectiveMode(base, o as never),
        enabledGlobally: global.find((g) => g.name === t.name)?.enabled ?? true,
      };
    });
    return { tools };
  });
});

/** Set a per-user permission override. HIGH-risk tools can't be relaxed below "confirm". */
export const PUT = route({ rateLimit: 60 }, async ({ req, user }) => {
  const p = await body(req, z.object({ tool: z.string(), mode: z.enum(["auto", "approval", "confirm", "disabled"]).nullable().optional(), enabledGlobally: z.boolean().optional() }));
  const tool = getTool(p.tool);
  if (!tool) throw new AppError("Unknown tool", 404);
  if (p.enabledGlobally !== undefined) {
    if (user.role !== "admin") throw new AppError("Only admins can enable/disable tools globally", 403);
    await sql.query("update tools set enabled = $2 where name = $1", [p.tool, p.enabledGlobally]);
  }
  if (p.mode === undefined) return { ok: true };
  await withUser(user.id, async (db) => {
    if (p.mode === null) await db.query("delete from tool_permissions where tool_name = $1", [p.tool]);
    else
      await db.query("insert into tool_permissions(user_id, tool_name, mode) values ($1,$2,$3) on conflict (user_id, tool_name) do update set mode = excluded.mode, updated_at = now()", [
        user.id,
        p.tool,
        p.mode,
      ]);
    await logActivity(db, { userId: user.id, category: "security", action: "permission.changed", status: "warning", tool: p.tool, message: `Permission for ${p.tool} set to ${p.mode ?? "default"}` });
  });
  return { ok: true };
});
