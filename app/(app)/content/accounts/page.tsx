"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { PLATFORM_LABEL } from "@/components/post-bits";
import { Badge, Button, Card, Input, Label, Modal, PageHeader, Select, StatusBadge, Toggle, useToast } from "@/components/ui";

interface Account {
  id: string;
  platform: string;
  account_name: string;
  status: string;
  config: { privacyStatus?: string; audited?: boolean };
  auto_publish: boolean;
  last_error: string | null;
}
interface Cap {
  platform: string;
  label: string;
  automation: string;
  note: string;
  credentials: { key: string; label: string; secret?: boolean }[];
  analytics: boolean;
}
interface Data {
  accounts: Account[];
  capabilities: Cap[];
  oauth: Record<string, boolean>;
  metaPages: { id: string; name: string; instagram: { username?: string } | null }[];
  publicBaseUrl: string | null;
}

const OAUTH: Record<string, string> = { facebook: "meta", instagram: "meta", youtube: "youtube", tiktok: "tiktok" };
const AUTOMATION_LABEL: Record<string, { text: string; tone: "ok" | "gold" | "warn" }> = {
  official_api: { text: "Automated publishing (official API)", tone: "ok" },
  official_api_limited: { text: "Official API with limits", tone: "gold" },
  manual_only: { text: "Manual publishing package", tone: "warn" },
};

function Accounts() {
  const toast = useToast();
  const params = useSearchParams();
  const { data, reload } = useApi<Data>("/api/content/accounts");
  const [manual, setManual] = useState<Cap | null>(null);
  const [pickPage, setPickPage] = useState(false);

  useEffect(() => {
    if (params.get("connected")) toast(`${params.get("connected")} connected`, "ok");
    if (params.get("error")) toast(`Connection failed: ${params.get("error")}`, "bad");
    if (params.get("choosePage")) setPickPage(true);
  }, [params, toast]);

  return (
    <div>
      <PageHeader title="Social Accounts" icon={<Share2 className="h-6 w-6" />} subtitle="Official APIs only — no password storage, no CAPTCHA/2FA bypass. Where automation isn't available for $0, you get a ready-to-post package." />
      {!data?.publicBaseUrl && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-xs text-gold">
          PUBLIC_BASE_URL is not set to a public https URL — Instagram and TikTok (which fetch images by URL) will fall back to manual packages. Facebook Pages work without it.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.capabilities.map((c) => {
          const acct = data.accounts.find((a) => a.platform === c.platform);
          const oauthKey = OAUTH[c.platform];
          const auto = AUTOMATION_LABEL[c.automation];
          return (
            <Card key={c.platform} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{c.label}</span>
                <Badge tone={auto.tone}>{auto.text}</Badge>
                {acct && <StatusBadge status={acct.status} />}
              </div>
              {acct?.account_name && <div className="mt-1 text-sm">{acct.account_name}</div>}
              <p className="mt-2 text-xs text-muted">{c.note}</p>
              {acct?.last_error && <p className="mt-2 text-xs text-bad">{acct.last_error}</p>}
              {c.automation !== "manual_only" && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {oauthKey && (
                    <a
                      href={data.oauth[oauthKey] ? `/api/integrations/oauth/${oauthKey}/start` : undefined}
                      onClick={(e) => {
                        if (!data.oauth[oauthKey]) {
                          e.preventDefault();
                          toast(`Add your ${oauthKey} app credentials to .env first (see docs/DEPLOYMENT.md)`, "bad");
                        }
                      }}
                      className="inline-flex h-8 items-center rounded-xl bg-accent px-3 text-xs font-medium text-accent-ink"
                    >
                      {acct?.status === "connected" ? "Reconnect" : "Connect"} with {oauthKey === "meta" ? "Meta" : PLATFORM_LABEL[c.platform]}
                    </a>
                  )}
                  <Button size="sm" onClick={() => setManual(c)}>
                    Use access token
                  </Button>
                  {acct?.status === "connected" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const r = await api<{ ok: boolean; detail: string }>(`/api/content/accounts/${c.platform}`, { method: "POST" });
                          toast(r.detail, r.ok ? "ok" : "bad");
                          reload();
                        }}
                      >
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api(`/api/content/accounts/${c.platform}`, { method: "DELETE" });
                          reload();
                        }}
                      >
                        Disconnect
                      </Button>
                    </>
                  )}
                </div>
              )}
              {acct?.status === "connected" && (
                <div className="mt-4 space-y-2 border-t border-line pt-3">
                  <Toggle
                    checked={acct.auto_publish}
                    onChange={async (v) => {
                      await api(`/api/content/accounts/${c.platform}`, { method: "PUT", body: { autoPublish: v } });
                      reload();
                    }}
                    label={<span className="text-xs">Allow AUTO MODE for this account (also needs AUTO MODE in Settings; first post always needs approval)</span>}
                  />
                  {c.platform === "youtube" && (
                    <div className="flex items-center gap-2 text-xs">
                      Upload privacy:
                      <Select
                        className="h-8 w-32 text-xs"
                        value={acct.config.privacyStatus ?? "private"}
                        onChange={async (e) => {
                          await api(`/api/content/accounts/youtube`, { method: "PUT", body: { config: { privacyStatus: e.target.value } } });
                          reload();
                        }}
                      >
                        <option value="private">Private (default)</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="public">Public</option>
                      </Select>
                    </div>
                  )}
                  {c.platform === "tiktok" && (
                    <Toggle
                      checked={Boolean(acct.config.audited)}
                      onChange={async (v) => {
                        await api(`/api/content/accounts/tiktok`, { method: "PUT", body: { config: { audited: v } } });
                        reload();
                      }}
                      label={<span className="text-xs">My TikTok app has passed TikTok's audit (allows public posts)</span>}
                    />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={!!manual} onClose={() => setManual(null)} title={`Connect ${manual?.label} with a token`}>
        {manual && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const credentials = Object.fromEntries(manual.credentials.map((c) => [c.key, String(f.get(c.key) ?? "")]));
              try {
                const r = await api<{ status: string; detail: string }>(`/api/content/accounts/${manual.platform}`, { method: "PUT", body: { credentials, accountName: String(f.get("accountName") ?? "") } });
                toast(r.detail || r.status, r.status === "connected" ? "ok" : "bad");
                setManual(null);
                reload();
              } catch (err) {
                toast((err as Error).message, "bad");
              }
            }}
          >
            <p className="text-xs text-muted">Tokens are encrypted on the server (AES-256-GCM) and never shown again. Get them from the platform's official developer tools (see docs/DEPLOYMENT.md).</p>
            <div>
              <Label>Display name</Label>
              <Input name="accountName" placeholder="e.g. Merchants page" />
            </div>
            {manual.credentials.map((c) => (
              <div key={c.key}>
                <Label>{c.label}</Label>
                <Input name={c.key} type={c.secret ? "password" : "text"} required autoComplete="off" />
              </div>
            ))}
            <Button variant="primary" type="submit" className="w-full">
              Save & test connection
            </Button>
          </form>
        )}
      </Modal>
      <Modal open={pickPage} onClose={() => setPickPage(false)} title="Select page">
        <div className="space-y-2">
          {data?.metaPages.map((p) => (
            <button
              key={p.id}
              className="w-full rounded-xl border border-line p-3 text-left text-sm hover:border-accent"
              onClick={async () => {
                await api("/api/content/accounts/meta-select", { body: { pageId: p.id } });
                setPickPage(false);
                reload();
                toast(`Connected ${p.name}`, "ok");
              }}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted">{p.instagram ? `Instagram: @${p.instagram.username ?? "linked"}` : "No Instagram business account linked"}</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Accounts />
    </Suspense>
  );
}
