import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { SOCIAL_ADAPTERS } from "@/integrations/social";
import { PLATFORMS, type Platform } from "@/services/content/types";

function platformOf(p: string): Platform {
  if (!(PLATFORMS as readonly string[]).includes(p)) throw new AppError("Unknown platform", 404);
  return p as Platform;
}

/** Manual token connection (alternative to OAuth), settings, and AUTO MODE per account. */
export const PUT = route<{ platform: string }>({ rateLimit: 30 }, async ({ req, user, params }) => {
  const platform = platformOf(params.platform);
  const p = await body(
    req,
    z.object({
      credentials: z.record(z.string(), z.string().max(4000)).optional(),
      accountName: z.string().max(120).optional(),
      config: z.object({ privacyStatus: z.enum(["private", "unlisted", "public"]).optional(), audited: z.boolean().optional() }).optional(),
      autoPublish: z.boolean().optional(),
    }),
  );
  const adapter = SOCIAL_ADAPTERS[platform];
  return withUser(user.id, async (db) => {
    let status: string | null = null;
    let detail = "";
    if (p.credentials) {
      for (const c of adapter.requiredCredentials) if (!p.credentials[c.key]) throw new AppError(`${c.label} is required`);
      if (adapter.testConnection) {
        const t = await adapter.testConnection(p.credentials);
        status = t.ok ? "connected" : "error";
        detail = t.detail;
      } else status = "connected";
    }
    await db.query(
      `insert into social_accounts(user_id, platform, account_name, status, credentials_encrypted, config, auto_publish, last_error)
       values ($1,$2,coalesce($3,''),coalesce($4,'manual'),$5,coalesce($6,'{}'::jsonb),coalesce($7,false),$8)
       on conflict (user_id, platform) do update set account_name = coalesce($3, social_accounts.account_name), status = coalesce($4, social_accounts.status),
         credentials_encrypted = coalesce($5, social_accounts.credentials_encrypted), config = social_accounts.config || coalesce($6,'{}'::jsonb),
         auto_publish = coalesce($7, social_accounts.auto_publish), last_error = case when $4 is not null then $8 else social_accounts.last_error end`,
      [user.id, platform, p.accountName ?? null, status, p.credentials ? encryptJson(p.credentials) : null, p.config ? JSON.stringify(p.config) : null, p.autoPublish ?? null, status === "error" ? detail : null],
    );
    if (p.autoPublish !== undefined)
      await logActivity(db, { userId: user.id, category: "security", action: "autopublish.changed", status: "warning", message: `AUTO MODE for ${adapter.label} ${p.autoPublish ? "enabled" : "disabled"}` });
    if (status) await logActivity(db, { userId: user.id, category: "integrations", action: "account.connected", status: status === "connected" ? "success" : "error", message: `${adapter.label}: ${detail || status}` });
    return { status, detail };
  });
});

export const POST = route<{ platform: string }>({ rateLimit: 20 }, async ({ user, params }) => {
  const platform = platformOf(params.platform);
  const adapter = SOCIAL_ADAPTERS[platform];
  return withUser(user.id, async (db) => {
    const acct = await db.one<{ credentials_encrypted: string | null }>("select credentials_encrypted from social_accounts where platform = $1", [platform]);
    const creds = decryptJson<Record<string, string>>(acct?.credentials_encrypted);
    if (!creds) return { ok: false, detail: "Not connected" };
    if (!adapter.testConnection) return { ok: true, detail: "Connected (no test available)" };
    const t = await adapter.testConnection(creds);
    await db.query("update social_accounts set status = $2, last_error = $3 where platform = $1", [platform, t.ok ? "connected" : "error", t.ok ? null : t.detail]);
    return t;
  });
});

export const DELETE = route<{ platform: string }>({}, async ({ user, params }) => {
  const platform = platformOf(params.platform);
  await withUser(user.id, async (db) => {
    await db.query("update social_accounts set status = 'manual', credentials_encrypted = null, auto_publish = false, external_id = null where platform = $1", [platform]);
    await logActivity(db, { userId: user.id, category: "integrations", action: "account.disconnected", message: `${SOCIAL_ADAPTERS[platform].label} disconnected` });
  });
  return { ok: true };
});
