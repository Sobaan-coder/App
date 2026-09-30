import { PublishError, type SocialAdapter } from "./types";

/**
 * TikTok Content Posting API (official). Photo posts use PULL_FROM_URL, which requires the image
 * domain to be verified in the TikTok developer portal. Apps that have not passed TikTok's audit can
 * only post PRIVATELY (SELF_ONLY). If any requirement is missing we prepare a manual package instead.
 */
export const tiktokAdapter: SocialAdapter = {
  platform: "tiktok",
  label: "TikTok",
  automation: "official_api_limited",
  honestNote:
    "Direct posting needs a TikTok developer app with the video.publish scope and a verified domain for PUBLIC_BASE_URL. Until TikTok audits your app, API posts are private (only you can see them). Otherwise you get a ready-to-post manual package.",
  requiredCredentials: [
    { key: "accessToken", label: "Access token", secret: true },
    { key: "openId", label: "Open ID" },
  ],
  async publish({ caption, image, credentials, config }) {
    if (!credentials?.accessToken) return { status: "manual_required", reason: "TikTok not connected — ready to publish manually." };
    if (!image?.publicUrl) return { status: "manual_required", reason: "TikTok photo posts need a public, domain-verified image URL (set PUBLIC_BASE_URL). Ready to publish manually." };
    const audited = config.audited === true;
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        post_info: { title: caption.title.slice(0, 90), description: `${caption.caption} ${caption.hashtags.join(" ")}`.slice(0, 4000), privacy_level: audited ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY", disable_comment: false, auto_add_music: true },
        source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: [image.publicUrl] },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
    if (!res.ok || (body.error?.code && body.error.code !== "ok")) {
      const code = body.error?.code ?? `HTTP ${res.status}`;
      if (/scope|unaudited|privacy_level|url_ownership|spam_risk/i.test(code))
        return { status: "manual_required", reason: `TikTok refused automated posting (${code}: ${body.error?.message ?? ""}). Ready to publish manually.` };
      throw new PublishError(`TikTok: ${code} ${body.error?.message ?? ""}`, res.status >= 500 || /rate_limit/i.test(code), code === "access_token_invalid" ? "Reconnect TikTok." : "See TikTok developer docs for this error code.");
    }
    return { status: "published", externalId: body.data?.publish_id ?? "unknown", note: audited ? "Submitted publicly" : "Submitted as PRIVATE (app not audited by TikTok)" };
  },
};
