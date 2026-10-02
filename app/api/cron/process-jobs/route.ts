import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { processPendingJobs } from "@/lib/jobs/queue";

export const maxDuration = 300;

// Called by Vercel Cron (see vercel.json) with Authorization: Bearer $CRON_SECRET.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!serverEnv.cronSecret || auth !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await processPendingJobs();
  return NextResponse.json({ processed });
}
