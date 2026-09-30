import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { apiError, requireUserForApi } from "@/lib/api";
import { serverEnv } from "@/lib/env.server";
import { PAPER_KINDS, safeFileName, titleFromFileName, validateUpload } from "@/lib/security/files";

const Body = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().max(120),
  size: z.number().int().positive(),
  subject_id: z.uuid(),
  title: z.string().trim().max(300).optional(),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
  session: z.string().trim().max(60).nullable().optional(),
});

/** Create a past-paper record (status UPLOADING) and reserve its private storage path. */
export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a subject and a PDF or image." }, { status: 400 });
  const b = parsed.data;
  const check = validateUpload({ name: b.file_name, size: b.size, type: b.mime_type }, PAPER_KINDS, serverEnv.limits.maxUploadMb * 1024 * 1024);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}/${safeFileName(b.file_name)}`;
    const yearFromName = b.file_name.match(/(19[5-9]\d|20\d{2})/)?.[1];
    const { error } = await supabase.from("past_papers").insert({
      id,
      user_id: user.id,
      subject_id: b.subject_id,
      title: b.title || titleFromFileName(b.file_name),
      year: b.year ?? (yearFromName ? Number(yearFromName) : null),
      session: b.session || null,
      storage_path: path,
      mime_type: check.mime,
      size_bytes: b.size,
      processing_status: "uploading",
    });
    if (error) throw error;
    return NextResponse.json({ id, path, mime: check.mime });
  } catch (err) {
    return apiError(err, "Upload failed. Try again.");
  }
}
