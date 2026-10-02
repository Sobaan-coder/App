"use client";
import { createClient } from "@/lib/supabase/client";
import { safeFileName, validateUpload, type FileKind } from "@/lib/security/files";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Upload a file straight to Supabase Storage under the student's own folder.
 * Storage RLS only allows "<auth.uid()>/…", so a forged path is rejected server-side.
 */
export async function uploadToStorage(bucket: "student-resources" | "past-papers", folder: string, file: File, allowed: FileKind[]) {
  const check = validateUpload(file, allowed, MAX_UPLOAD_BYTES);
  if (!check.ok) throw new Error(check.error);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session expired. Please sign in again.");
  const path = `${user.id}/${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: check.mime, upsert: false });
  if (error) throw new Error("Upload failed. Try again.");
  return { path, kind: check.kind, mime: check.mime, size: file.size };
}
