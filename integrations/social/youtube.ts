import { env } from "@/lib/env";
import { PublishError, type Metrics, type SocialAdapter } from "./types";

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const e = env();
  if (!e.YOUTUBE_CLIENT_ID || !e.YOUTUBE_CLIENT_SECRET) throw new PublishError("YOUTUBE_CLIENT_ID/SECRET not set", false, "Add your Google OAuth client to .env.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.YOUTUBE_CLIENT_ID, client_secret: e.YOUTUBE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) throw new PublishError(`Google token refresh failed: ${body.error ?? res.status}`, false, "Reconnect YouTube in Social Accounts.");
  return body.access_token;
}

/** YouTube Data API v3 (official, free quota). Uploads videos; defaults to PRIVATE. */
export const youtubeAdapter: SocialAdapter = {
  platform: "youtube",
  label: "YouTube (Shorts)",
  automation: "official_api_limited",
  honestNote:
    "The official YouTube Data API uploads VIDEOS only (free daily quota; an upload costs ~1,600 of 10,000 units). Still images cannot be published as Shorts, so image posts get a manual package. Uploads default to PRIVATE until you enable public publishing on the account. Note: videos uploaded by unverified API projects may be locked to private by YouTube.",
  requiredCredentials: [{ key: "refreshToken", label: "OAuth refresh token", secret: true }],
  async publish({ caption, video, credentials, config }) {
    if (!video) return { status: "manual_required", reason: "YouTube Shorts need a video. The API can't publish a still image — use the prepared package (title, description, tags) with a short video." };
    if (!credentials?.refreshToken) return { status: "manual_required", reason: "YouTube not connected." };
    const token = await googleAccessToken(credentials.refreshToken);
    const privacyStatus = (config.privacyStatus as string) || "private";
    const meta = {
      snippet: { title: caption.title.slice(0, 100), description: `${caption.caption}\n\n${caption.hashtags.join(" ")}`.slice(0, 5000), tags: caption.hashtags.map((h) => h.replace(/^#/, "")).slice(0, 15), categoryId: "26" },
      status: { privacyStatus, selfDeclaredMadeForKids: false },
    };
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-upload-content-type": video.mime, "x-upload-content-length": String(video.data.length) },
      body: JSON.stringify(meta),
      signal: AbortSignal.timeout(30_000),
    });
    if (!init.ok) throw new PublishError(`YouTube upload init failed: HTTP ${init.status} ${(await init.text()).slice(0, 200)}`, init.status >= 500 || init.status === 429, init.status === 403 ? "Quota exceeded or channel not permitted. Try tomorrow." : "Check account permissions.");
    const location = init.headers.get("location");
    if (!location) throw new PublishError("YouTube did not return an upload URL", true, "Try again.");
    const up = await fetch(location, { method: "PUT", headers: { "content-type": video.mime }, body: new Uint8Array(video.data), signal: AbortSignal.timeout(600_000) });
    const body = (await up.json().catch(() => ({}))) as { id?: string };
    if (!up.ok || !body.id) throw new PublishError(`YouTube upload failed: HTTP ${up.status}`, up.status >= 500, "Try again later.");
    return { status: "published", externalId: body.id, url: `https://www.youtube.com/shorts/${body.id}`, note: `Uploaded as ${privacyStatus.toUpperCase()}` };
  },
  async testConnection(c) {
    try {
      const token = await googleAccessToken(c.refreshToken);
      const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${token}` } });
      const b = (await r.json()) as { items?: { snippet?: { title?: string } }[] };
      return r.ok ? { ok: true, detail: `Connected to channel "${b.items?.[0]?.snippet?.title ?? "?"}"` } : { ok: false, detail: `HTTP ${r.status}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
  async fetchMetrics(id, c): Promise<Metrics> {
    const token = await googleAccessToken(c.refreshToken);
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });
    const b = (await r.json()) as { items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] };
    const s = b.items?.[0]?.statistics;
    if (!s) return { available: false, note: "Statistics not available for this video." };
    return { available: true, views: Number(s.viewCount ?? 0), likes: s.likeCount ? Number(s.likeCount) : null, comments: s.commentCount ? Number(s.commentCount) : null, raw: b };
  },
};
