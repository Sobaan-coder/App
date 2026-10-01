import { route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { socialCapabilities } from "@/integrations/social";
import { oauthConfigured } from "@/integrations/oauth";
import { env } from "@/lib/env";

export const GET = route({}, async ({ user }) => {
  return withUser(user.id, async (db) => {
    const accounts = await db.query("select id, platform, account_name, external_id, status, config, auto_publish, last_error, token_expires_at, updated_at from social_accounts order by platform");
    const meta = await db.one<{ config: { pages?: { id: string; name: string; instagram: { username?: string } | null }[] } }>("select config from integrations where provider = 'meta'");
    return {
      accounts,
      capabilities: socialCapabilities(),
      oauth: { meta: oauthConfigured("meta"), youtube: oauthConfigured("youtube"), tiktok: oauthConfigured("tiktok") },
      metaPages: meta?.config?.pages ?? [],
      publicBaseUrl: env().PUBLIC_BASE_URL ?? null,
    };
  });
});
