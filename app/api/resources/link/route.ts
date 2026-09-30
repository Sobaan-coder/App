import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { enqueueJob } from "@/lib/jobs/queue";
import { classifyLink, parseHttpUrl } from "@/lib/security/url";

const Body = z.object({
  url: z.string().trim().max(2000),
  title: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  subject_id: z.guid().nullable().optional(),
});

/** Add a YouTube lecture, web page or Google Drive link as a resource. */
export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const url = parsed.success ? parseHttpUrl(parsed.data.url) : null;
  if (!parsed.success || !url) return NextResponse.json({ error: "Enter a valid http(s) link." }, { status: 400 });
  const kind = classifyLink(url.toString())!;

  try {
    const { data, error } = await supabase
      .from("resources")
      .insert({
        user_id: user.id,
        subject_id: parsed.data.subject_id ?? null,
        title: parsed.data.title || url.toString(),
        type: kind,
        url: url.toString(),
        content: parsed.data.description || null,
        // Drive files are private to Google; we store the link without fetching it.
        processing_status: kind === "drive" ? "ready" : "processing",
      })
      .select("id")
      .single();
    if (error) throw error;
    if (kind !== "drive") await enqueueJob("resource", data.id, user.id);
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return apiError(err, "Couldn't add that link.");
  }
}
