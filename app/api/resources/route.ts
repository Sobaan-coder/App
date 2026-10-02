import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { serverEnv } from "@/lib/env.server";
import { RESOURCE_KINDS, safeFileName, titleFromFileName, validateUpload } from "@/lib/security/files";

const Body = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().max(120),
  size: z.number().int().positive(),
  subject_id: z.guid().nullable().optional(),
  topic_ids: z.array(z.guid()).max(20).optional(),
  title: z.string().trim().max(300).optional(),
});

/** Step 1 of an upload: create the resource record (status UPLOADING) and reserve a private storage path. */
export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const b = parsed.data;

  const check = validateUpload({ name: b.file_name, size: b.size, type: b.mime_type }, RESOURCE_KINDS, serverEnv.limits.maxUploadMb * 1024 * 1024);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    const id = crypto.randomUUID();
    const path = `${user.id}/resources/${id}/${safeFileName(b.file_name)}`;
    const { error } = await supabase.from("resources").insert({
      id,
      user_id: user.id,
      subject_id: b.subject_id ?? null,
      title: b.title || titleFromFileName(b.file_name),
      type: check.kind,
      mime_type: check.mime,
      size_bytes: b.size,
      storage_path: path,
      processing_status: "uploading",
    });
    if (error) throw error;
    if (b.topic_ids?.length) {
      await supabase.from("topic_resource_links").insert(b.topic_ids.map((topic_id) => ({ user_id: user.id, resource_id: id, topic_id, source: "user" as const, confirmed: true, confidence: 1 })));
    }
    return NextResponse.json({ id, path, mime: check.mime });
  } catch (err) {
    return apiError(err, "Upload failed. Try again.");
  }
}
