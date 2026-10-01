import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { encryptJson } from "@/lib/crypto";
import type { Db } from "@/lib/db";

/**
 * Official OAuth flows (free): Meta (Facebook Pages + Instagram), Google (YouTube), TikTok.
 * Tokens are stored encrypted (AES-256-GCM) and never sent to the browser.
 */
export type OAuthProvider = "meta" | "youtube" | "tiktok";

const redirectUri = (p: OAuthProvider) => `${env().APP_URL.replace(/\/+$/, "")}/api/integrations/oauth/callback/${p}`;

function stateSecret() {
  return new TextEncoder().encode(`oauth:${env().AUTH_SECRET}`);
}

export async function signState(userId: string, provider: OAuthProvider) {
  return new SignJWT({ uid: userId, p: provider }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(stateSecret());
}

export async function verifyState(state: string, provider: OAuthProvider): Promise<string> {
  try {
    const { payload } = await jwtVerify(state, stateSecret(), { algorithms: ["HS256"] });
    if (payload.p !== provider || typeof payload.uid !== "string") throw new Error();
    return payload.uid;
  } catch {
    throw new AppError("OAuth state is invalid or expired. Please try connecting again.", 400);
  }
}

export function oauthConfigured(p: OAuthProvider): boolean {
  const e = env();
  if (p === "meta") return Boolean(e.META_APP_ID && e.META_APP_SECRET);
  if (p === "youtube") return Boolean(e.YOUTUBE_CLIENT_ID && e.YOUTUBE_CLIENT_SECRET);
  return Boolean(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET);
}

export async function authorizeUrl(p: OAuthProvider, userId: string): Promise<string> {
  if (!oauthConfigured(p)) throw new AppError(`${p} app credentials are not set in .env (see docs/DEPLOYMENT.md → Social accounts)`);
  const e = env();
  const state = await signState(userId, p);
  if (p === "meta") {
    const scope = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights", "instagram_basic", "instagram_content_publish", "instagram_manage_insights", "business_management"].join(",");
    return `https://www.facebook.com/${e.META_GRAPH_VERSION}/dialog/oauth?${new URLSearchParams({ client_id: e.META_APP_ID!, redirect_uri: redirectUri(p), state, scope, response_type: "code" })}`;
  }
  if (p === "youtube") {
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: e.YOUTUBE_CLIENT_ID!,
      redirect_uri: redirectUri(p),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    })}`;
  }
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: e.TIKTOK_CLIENT_KEY!, scope: "user.info.basic,video.publish", response_type: "code", redirect_uri: redirectUri(p), state })}`;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: unknown; error_description?: string };
  if (!res.ok || (body as { error?: unknown }).error) throw new AppError(`Provider error: ${JSON.stringify((body as { error?: unknown }).error ?? res.status).slice(0, 200)}`, 502);
  return body;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

/** Exchange the code and store credentials. Returns what the UI should do next. */
export async function handleCallback(p: OAuthProvider, userId: string, code: string, db: Db): Promise<{ next: "done" | "choose_page"; detail: string }> {
  const e = env();
  if (p === "meta") {
    const g = `https://graph.facebook.com/${e.META_GRAPH_VERSION}`;
    const short = await json<{ access_token: string }>(
      await fetch(`${g}/oauth/access_token?${new URLSearchParams({ client_id: e.META_APP_ID!, client_secret: e.META_APP_SECRET!, redirect_uri: redirectUri(p), code })}`),
    );
    const long = await json<{ access_token: string }>(
      await fetch(`${g}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: e.META_APP_ID!, client_secret: e.META_APP_SECRET!, fb_exchange_token: short.access_token })}`),
    );
    const pages = await json<{ data: MetaPage[] }>(await fetch(`${g}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(long.access_token)}`));
    if (!pages.data.length) throw new AppError("No Facebook Pages found on this account. Instagram publishing also requires a Page linked to an Instagram Business/Creator account.");
    await db.query(
      `insert into integrations(user_id, provider, name, status, config, credentials_encrypted, connected_at) values ($1,'meta','Meta',
        'connected', $2, $3, now()) on conflict (user_id, provider) do update set status = 'connected', config = excluded.config, credentials_encrypted = excluded.credentials_encrypted, connected_at = now()`,
      [userId, JSON.stringify({ pages: pages.data.map((x) => ({ id: x.id, name: x.name, instagram: x.instagram_business_account ?? null })) }), encryptJson({ pages: pages.data })],
    );
    if (pages.data.length === 1) {
      await connectMetaPage(db, userId, pages.data[0]);
      return { next: "done", detail: `Connected page "${pages.data[0].name}"` };
    }
    return { next: "choose_page", detail: `${pages.data.length} pages found` };
  }
  if (p === "youtube") {
    const tok = await json<{ refresh_token?: string; access_token: string }>(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: e.YOUTUBE_CLIENT_ID!, client_secret: e.YOUTUBE_CLIENT_SECRET!, redirect_uri: redirectUri(p), grant_type: "authorization_code" }),
      }),
    );
    if (!tok.refresh_token) throw new AppError("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
    const ch = await json<{ items?: { id: string; snippet?: { title?: string } }[] }>(await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${tok.access_token}` } }));
    await upsertAccount(db, userId, "youtube", ch.items?.[0]?.snippet?.title ?? "YouTube", ch.items?.[0]?.id ?? null, { refreshToken: tok.refresh_token }, { privacyStatus: "private" });
    return { next: "done", detail: "YouTube connected (uploads default to PRIVATE)" };
  }
  const tok = await json<{ access_token: string; refresh_token?: string; open_id: string; expires_in?: number }>(
    await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: e.TIKTOK_CLIENT_KEY!, client_secret: e.TIKTOK_CLIENT_SECRET!, code, grant_type: "authorization_code", redirect_uri: redirectUri(p) }),
    }),
  );
  await upsertAccount(db, userId, "tiktok", "TikTok", tok.open_id, { accessToken: tok.access_token, refreshToken: tok.refresh_token ?? "", openId: tok.open_id }, { audited: false }, tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null);
  return { next: "done", detail: "TikTok connected (posts are private until your app is audited by TikTok)" };
}

export async function upsertAccount(db: Db, userId: string, platform: string, name: string, externalId: string | null, credentials: Record<string, string>, config: Record<string, unknown> = {}, expires: Date | null = null) {
  await db.query(
    `insert into social_accounts(user_id, platform, account_name, external_id, status, credentials_encrypted, config, token_expires_at)
     values ($1,$2,$3,$4,'connected',$5,$6,$7)
     on conflict (user_id, platform) do update set account_name = excluded.account_name, external_id = excluded.external_id, status = 'connected',
       credentials_encrypted = excluded.credentials_encrypted, config = social_accounts.config || excluded.config, token_expires_at = excluded.token_expires_at, last_error = null`,
    [userId, platform, name, externalId, encryptJson(credentials), JSON.stringify(config), expires?.toISOString() ?? null],
  );
}

export async function connectMetaPage(db: Db, userId: string, page: MetaPage) {
  await upsertAccount(db, userId, "facebook", page.name, page.id, { pageId: page.id, pageAccessToken: page.access_token });
  if (page.instagram_business_account?.id) {
    await upsertAccount(db, userId, "instagram", page.instagram_business_account.username ? `@${page.instagram_business_account.username}` : "Instagram", page.instagram_business_account.id, {
      igUserId: page.instagram_business_account.id,
      accessToken: page.access_token,
    });
  }
}
