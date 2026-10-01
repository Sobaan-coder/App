import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { triggerAutomation } from "@/automations/service";

/**
 * Public webhook trigger: POST /api/hooks/<secret-token> with an optional JSON body.
 * The token is the only credential (long random, per automation). Body becomes {{trigger.body}}.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!rateLimit(`hook:${token}`, 30, 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const hook = await sql.one<{ id: string; user_id: string; automation_id: string; enabled: boolean }>(
    "select w.id, w.user_id, w.automation_id, a.enabled from webhooks w join automations a on a.id = w.automation_id where w.token = $1",
    [token],
  );
  if (!hook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!hook.enabled) return NextResponse.json({ error: "Automation is paused" }, { status: 409 });
  let payload: unknown = null;
  const text = await req.text();
  if (text.length > 100_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  await sql.query("update webhooks set last_called_at = now() where id = $1", [hook.id]);
  const runId = await triggerAutomation(hook.user_id, hook.automation_id, { body: payload, source: "webhook" });
  return NextResponse.json({ accepted: true, runId }, { status: 202 });
}
