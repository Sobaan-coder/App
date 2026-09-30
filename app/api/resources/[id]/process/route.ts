import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { enqueueJob } from "@/lib/jobs/queue";
import { contentMatchesKind, type FileKind } from "@/lib/security/files";
import { BUCKETS } from "@/lib/storage";

export const maxDuration = 300;

/** Step 3 of an upload (after the browser uploaded the file): verify it and start processing. Also used for "Retry". */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  try {
    const { data: res } = await supabase.from("resources").select("id, type, storage_path, processing_status").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (res.processing_status === "processing" || res.processing_status === "analyzing") return NextResponse.json({ ok: true });

    if (res.storage_path) {
      // The object must exist in the student's folder and its bytes must match the declared type.
      const { data: head } = await supabase.storage.from(BUCKETS.resources).download(res.storage_path, { transform: undefined });
      if (!head) {
        await supabase.from("resources").update({ processing_status: "failed", processing_error: "Upload failed. Try again." }).eq("id", id);
        return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 });
      }
      const bytes = new Uint8Array(await head.slice(0, 4096).arrayBuffer());
      if (!contentMatchesKind(bytes, res.type as FileKind)) {
        await supabase.storage.from(BUCKETS.resources).remove([res.storage_path]);
        await supabase.from("resources").update({ processing_status: "failed", processing_error: "This file's contents don't match its type." }).eq("id", id);
        return NextResponse.json({ error: "This file's contents don't match its type." }, { status: 400 });
      }
    }
    await supabase.from("resources").update({ processing_status: "processing", processing_error: null }).eq("id", id);
    await enqueueJob("resource", id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "We couldn't start processing. Try again.");
  }
}
