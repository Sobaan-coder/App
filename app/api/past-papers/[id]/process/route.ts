import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { isAIConfigured } from "@/lib/ai/provider";
import { enforceRateLimit } from "@/lib/ai/structured";
import { enqueueJob } from "@/lib/jobs/queue";
import { contentMatchesKind } from "@/lib/security/files";
import { BUCKETS } from "@/lib/storage";

export const maxDuration = 300;

/** Verify the uploaded paper and queue OCR + question mapping. Also used for "Retry". */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  if (!isAIConfigured()) return NextResponse.json({ error: "Past-paper analysis isn't configured on this server yet." }, { status: 503 });

  try {
    await enforceRateLimit({ userId: user.id, feature: "past_paper_mapping" });
    const { data: paper } = await supabase.from("past_papers").select("id, storage_path, mime_type, processing_status").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!paper?.storage_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (paper.processing_status === "processing" || paper.processing_status === "analyzing") return NextResponse.json({ ok: true });

    const { data: blob } = await supabase.storage.from(BUCKETS.papers).download(paper.storage_path);
    const head = blob ? new Uint8Array(await blob.slice(0, 4096).arrayBuffer()) : null;
    if (!head || !contentMatchesKind(head, paper.mime_type === "application/pdf" ? "pdf" : "image")) {
      await supabase.from("past_papers").update({ processing_status: "failed", processing_error: "Upload failed or the file isn't a valid PDF/image." }).eq("id", id);
      return NextResponse.json({ error: "Upload failed or the file isn't a valid PDF/image." }, { status: 400 });
    }
    await supabase.from("past_papers").update({ processing_status: "processing", processing_error: null }).eq("id", id);
    await enqueueJob("past_paper", id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "We couldn't start the analysis. Try again.");
  }
}
