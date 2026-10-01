import { NextResponse } from "next/server";

/** Public liveness probe for uptime monitors (no data exposed). */
export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
