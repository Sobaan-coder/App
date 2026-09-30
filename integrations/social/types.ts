import type { CaptionSet, Platform } from "@/services/content/types";

export interface PublishMedia {
  data: Buffer;
  mime: string;
  fileName: string;
  /** Public HTTPS URL of the image (needed by Instagram and TikTok, which fetch media by URL). */
  publicUrl?: string | null;
}

export interface PublishInput {
  caption: CaptionSet;
  image: PublishMedia | null;
  video?: PublishMedia | null;
  credentials: Record<string, string> | null;
  config: Record<string, unknown>;
}

export type PublishOutcome =
  | { status: "published"; externalId: string; url?: string; note?: string }
  | { status: "manual_required"; reason: string };

export interface Metrics {
  available: boolean;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  note?: string;
  raw?: unknown;
}

export class PublishError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public hint: string,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export interface SocialAdapter {
  platform: Platform;
  label: string;
  /** Can this platform be published to automatically via an official API at $0? */
  automation: "official_api" | "official_api_limited" | "manual_only";
  honestNote: string;
  requiredCredentials: { key: string; label: string; secret?: boolean }[];
  publish(input: PublishInput): Promise<PublishOutcome>;
  testConnection?(credentials: Record<string, string>): Promise<{ ok: boolean; detail: string }>;
  fetchMetrics?(externalId: string, credentials: Record<string, string>): Promise<Metrics>;
}

/** Map a Graph/HTTP error to a retryable flag and a human hint. */
export function graphError(status: number, body: { error?: { message?: string; code?: number; error_subcode?: number } }): PublishError {
  const code = body.error?.code;
  const msg = body.error?.message ?? `HTTP ${status}`;
  if (code === 190) return new PublishError(msg, false, "The access token expired or was revoked. Reconnect the account in Social Accounts.");
  if (code === 10 || code === 200 || (code && code >= 200 && code < 300))
    return new PublishError(msg, false, "Missing permission. Reconnect and grant the requested publishing permissions (pages_manage_posts / instagram_content_publish).");
  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) return new PublishError(msg, true, "Rate limited by the platform. It will be retried later.");
  if (status >= 500) return new PublishError(msg, true, "Platform-side error. Usually temporary.");
  return new PublishError(msg, false, "Check the post content and account settings.");
}
