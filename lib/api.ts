import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIError } from "@/lib/ai/types";

/** For route handlers: returns the verified user + RLS client, or a 401 response. */
export async function requireUserForApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  return { supabase, user };
}

/** Friendly JSON error; technical details are logged, never returned. */
export function apiError(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof AIError) return NextResponse.json({ error: err.userMessage }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
