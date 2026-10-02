import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { enforceRateLimit } from "@/lib/ai/structured";
import { enqueueJob } from "@/lib/jobs/queue";
import { contentMatchesKind, kindFromName, SYLLABUS_KINDS } from "@/lib/security/files";
import { BUCKETS, download, isOwnPath } from "@/lib/storage";

const Body = z.union([
  z.object({ storage_path: z.string().min(3).max(500), program_id: z.guid().nullable().optional() }),
  z.object({ text: z.string().trim().min(40, "Paste a bit more of the syllabus").max(150_000), program_id: z.guid().nullable().optional() }),
]);

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  if (!isAIConfigured()) {
    return NextResponse.json({ error: "AI syllabus import isn't configured on this server. You can still create your syllabus manually." }, { status: 503 });
  }

  try {
    await enforceRateLimit({ userId: user.id, feature: "syllabus_extraction" });
    let row: { source_type: "pdf" | "image" | "text"; storage_path?: string; source_text?: string };
    if ("storage_path" in parsed.data) {
      const path = parsed.data.storage_path;
      const kind = kindFromName(path);
      if (!isOwnPath(path, user.id) || !kind || !SYLLABUS_KINDS.includes(kind)) {
        return NextResponse.json({ error: "Invalid file." }, { status: 400 });
      }
      // Read with the student's own client: RLS proves the file is theirs.
      const bytes = await download(supabase, BUCKETS.resources, path);
      if (!contentMatchesKind(bytes, kind)) return NextResponse.json({ error: "That file's contents don't match its type." }, { status: 400 });
      row = { source_type: kind === "image" ? "image" : kind === "txt" ? "text" : "pdf", storage_path: path };
      if (kind === "txt") row = { source_type: "text", source_text: new TextDecoder().decode(bytes).slice(0, 150_000), storage_path: path };
      if (kind === "docx") {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
        row = { source_type: "text", source_text: value.slice(0, 150_000), storage_path: path };
      }
    } else {
      row = { source_type: "text", source_text: parsed.data.text };
    }

    const { data: imp, error } = await supabase
      .from("syllabus_imports")
      .insert({ ...row, user_id: user.id, program_id: parsed.data.program_id ?? null, status: "processing" })
      .select("id")
      .single();
    if (error) throw error;
    await enqueueJob("syllabus", imp.id, user.id);
    return NextResponse.json({ id: imp.id });
  } catch (err) {
    return apiError(err, "We couldn't start the import. Try again.");
  }
}
