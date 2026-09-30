import { env } from "@/lib/env";
import { graphError, PublishError, type Metrics, type SocialAdapter } from "./types";

const graph = () => `https://graph.facebook.com/${env().META_GRAPH_VERSION}`;

async function gfetch(path: string, init?: RequestInit) {
  const res = await fetch(`${graph()}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) throw graphError(res.status, body);
  return body;
}

const fullCaption = (c: { caption: string; hashtags: string[] }) => `${c.caption}${c.hashtags.length ? `\n\n${c.hashtags.join(" ")}` : ""}`;

/** Facebook Page photo posts — official Graph API, free. */
export const facebookAdapter: SocialAdapter = {
  platform: "facebook",
  label: "Facebook Page",
  automation: "official_api",
  honestNote: "Publishes photo posts to a Facebook Page you manage via the official Graph API (free). Personal profiles cannot be posted to by API.",
  requiredCredentials: [
    { key: "pageId", label: "Page ID" },
    { key: "pageAccessToken", label: "Page access token", secret: true },
  ],
  async publish({ caption, image, credentials }) {
    if (!credentials?.pageId || !credentials.pageAccessToken) return { status: "manual_required", reason: "Facebook Page not connected." };
    if (!image) return { status: "manual_required", reason: "No image to publish." };
    const form = new FormData();
    form.append("source", new Blob([new Uint8Array(image.data)], { type: image.mime }), image.fileName);
    form.append("caption", fullCaption(caption));
    form.append("access_token", credentials.pageAccessToken);
    const r = (await gfetch(`/${encodeURIComponent(credentials.pageId)}/photos`, { method: "POST", body: form })) as { id?: string; post_id?: string };
    const id = r.post_id ?? r.id;
    if (!id) throw new PublishError("Facebook did not return a post id", true, "Try again.");
    return { status: "published", externalId: id, url: `https://www.facebook.com/${id}` };
  },
  async testConnection(c) {
    try {
      const r = (await gfetch(`/${encodeURIComponent(c.pageId)}?fields=name&access_token=${encodeURIComponent(c.pageAccessToken)}`)) as { name?: string };
      return { ok: true, detail: `Connected to page "${r.name}"` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
  async fetchMetrics(id, c): Promise<Metrics> {
    const r = (await gfetch(`/${id}?fields=reactions.summary(total_count),comments.summary(total_count),shares&access_token=${encodeURIComponent(c.pageAccessToken)}`)) as {
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    };
    let reach: number | null = null;
    try {
      const ins = (await gfetch(`/${id}/insights?metric=post_impressions_unique&access_token=${encodeURIComponent(c.pageAccessToken)}`)) as { data?: { values?: { value?: number }[] }[] };
      reach = ins.data?.[0]?.values?.[0]?.value ?? null;
    } catch {
      /* insights need read_insights permission */
    }
    return { available: true, likes: r.reactions?.summary?.total_count ?? null, comments: r.comments?.summary?.total_count ?? null, shares: r.shares?.count ?? 0, reach, raw: r };
  },
};

/** Instagram professional accounts — official Content Publishing API, free. Needs a public image URL. */
export const instagramAdapter: SocialAdapter = {
  platform: "instagram",
  label: "Instagram (Business/Creator)",
  automation: "official_api",
  honestNote:
    "Publishes via the official Instagram Content Publishing API (free) for Business/Creator accounts linked to a Facebook Page. Instagram downloads the image from a public HTTPS URL, so PUBLIC_BASE_URL must point to this app on the internet.",
  requiredCredentials: [
    { key: "igUserId", label: "Instagram business account ID" },
    { key: "accessToken", label: "Page access token", secret: true },
  ],
  async publish({ caption, image, credentials }) {
    if (!credentials?.igUserId || !credentials.accessToken) return { status: "manual_required", reason: "Instagram account not connected." };
    if (!image?.publicUrl) return { status: "manual_required", reason: "Instagram needs a public HTTPS image URL. Set PUBLIC_BASE_URL to your deployed app URL (localhost can't be reached by Instagram)." };
    const token = encodeURIComponent(credentials.accessToken);
    const created = (await gfetch(`/${credentials.igUserId}/media?image_url=${encodeURIComponent(image.publicUrl)}&caption=${encodeURIComponent(fullCaption(caption))}&access_token=${token}`, {
      method: "POST",
    })) as { id: string };
    for (let i = 0; i < 12; i++) {
      const s = (await gfetch(`/${created.id}?fields=status_code&access_token=${token}`)) as { status_code?: string };
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR") throw new PublishError("Instagram could not process the image", false, "Check the image format (JPEG/PNG, 4:5 to 1.91:1) and that the URL is public.");
      await new Promise((r) => setTimeout(r, 2500));
    }
    const pub = (await gfetch(`/${credentials.igUserId}/media_publish?creation_id=${created.id}&access_token=${token}`, { method: "POST" })) as { id: string };
    let url: string | undefined;
    try {
      url = ((await gfetch(`/${pub.id}?fields=permalink&access_token=${token}`)) as { permalink?: string }).permalink;
    } catch {
      /* permalink optional */
    }
    return { status: "published", externalId: pub.id, url };
  },
  async testConnection(c) {
    try {
      const r = (await gfetch(`/${c.igUserId}?fields=username&access_token=${encodeURIComponent(c.accessToken)}`)) as { username?: string };
      return { ok: true, detail: `Connected to @${r.username}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
  async fetchMetrics(id, c): Promise<Metrics> {
    const r = (await gfetch(`/${id}/insights?metric=reach,likes,comments,shares,saved&access_token=${encodeURIComponent(c.accessToken)}`)) as { data?: { name: string; values?: { value?: number }[] }[] };
    const v = (n: string) => r.data?.find((d) => d.name === n)?.values?.[0]?.value ?? null;
    return { available: true, reach: v("reach"), likes: v("likes"), comments: v("comments"), shares: v("shares"), saves: v("saved"), raw: r };
  },
};
