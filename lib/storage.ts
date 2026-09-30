import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKETS = { resources: "student-resources", papers: "past-papers", avatars: "avatars" } as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

/** Storage paths must live in the caller's own folder: "<user_id>/...". */
export function isOwnPath(path: string, userId: string) {
  return path.startsWith(`${userId}/`) && !path.includes("..") && !path.includes("//");
}

export async function download(client: SupabaseClient, bucket: Bucket, path: string): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) throw Object.assign(new Error(`Could not read uploaded file: ${error?.message ?? "missing"}`), { retryable: true });
  return new Uint8Array(await data.arrayBuffer());
}

/** Short-lived signed URL for previews. Generated with the user's client so RLS applies. */
export async function signedUrl(client: SupabaseClient, bucket: Bucket, path: string, seconds = 300) {
  const { data } = await client.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
