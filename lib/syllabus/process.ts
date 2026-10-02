import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/ai/provider";
import { extractSyllabus } from "@/lib/ai/syllabus-extractor";
import { AIError } from "@/lib/ai/types";
import { prepareSource } from "@/lib/documents/source";
import { contentMatchesKind, kindFromName, type FileKind } from "@/lib/security/files";
import { BUCKETS, download } from "@/lib/storage";
import type { Json } from "@/types/database";

/** Job handler: read a syllabus import, run AI extraction, store the draft for review. */
export async function processSyllabusImport(job: { target_id: string; user_id: string; attempts: number }) {
  const admin = createAdminClient();
  const { data: imp } = await admin.from("syllabus_imports").select("*, programs(name)").eq("id", job.target_id).eq("user_id", job.user_id).single();
  if (!imp) throw Object.assign(new Error("Import not found"), { retryable: false });
  const { data: profile } = await admin.from("profiles").select("education_level").eq("id", job.user_id).single();

  await admin.from("syllabus_imports").update({ status: "analyzing", error: null }).eq("id", imp.id);
  try {
    const provider = getProvider();
    let parts;
    if (imp.source_type === "text") {
      parts = [{ type: "text" as const, text: `<document name="pasted syllabus">\n${imp.source_text ?? ""}\n</document>` }];
    } else {
      const bytes = await download(admin, BUCKETS.resources, imp.storage_path!);
      const kind = (kindFromName(imp.storage_path!) ?? (imp.source_type === "image" ? "image" : "pdf")) as FileKind;
      if (!contentMatchesKind(bytes, kind)) throw new AIError("That file doesn't look like a valid PDF, image or document.", 400);
      const mime = kind === "image" ? (imp.storage_path!.endsWith(".png") ? "image/png" : imp.storage_path!.endsWith(".webp") ? "image/webp" : "image/jpeg") : "application/pdf";
      parts = (await prepareSource(provider, kind, bytes, "syllabus", mime)).parts;
    }
    const result = await extractSyllabus({ userId: job.user_id, feature: "syllabus_extraction", skipRateLimit: true }, parts, {
      program: (imp.programs as { name: string } | null)?.name ?? null,
      level: profile?.education_level ?? null,
      today: new Date().toISOString().slice(0, 10),
    });
    await admin.from("syllabus_imports").update({ status: "ready", result: result as unknown as Json }).eq("id", imp.id);
  } catch (err) {
    const friendly = err instanceof AIError ? err.userMessage : "We couldn't analyse this syllabus yet.";
    const final = job.attempts >= 3 || (err instanceof AIError && !err.retryable);
    await admin.from("syllabus_imports").update({ status: final ? "failed" : "processing", error: friendly }).eq("id", imp.id);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { retryable: !final });
  }
}
