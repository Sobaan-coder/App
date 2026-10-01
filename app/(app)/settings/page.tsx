"use client";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Input, Label, Modal, PageHeader, Select, Tabs, Toggle, useToast } from "@/components/ui";

type S = {
  general: { defaultProjectId: string | null; language: string };
  ai: { allowPaid: boolean; preferLocal: boolean; enabled: boolean; ollamaModel: string; openaiCompatModel: string; tierModels: Record<string, string>; monthlyBudgetUsd: number };
  imageGen: { order: string[]; pollinationsEnabled: boolean };
  content: { autoPublish: boolean; defaultPlatforms: string[] };
  notifications: { browser: boolean; telegram: boolean; email: boolean; emailTo: string };
  research: { maxSources: number; useBrowserForJsPages: boolean };
  browser: { enabled: boolean; allowedDomains: string[] };
  automation: { paused: boolean; maxRetries: number; stepTimeoutSeconds: number };
};
type Server = Record<string, unknown> & { ollama: { url: string | null; model: string | null }; openaiCompat: { url: string | null; model: string | null; key: string; paid: boolean }; telegram: boolean; smtp: boolean; gemini: boolean; publicBaseUrl: string | null };
interface Tool {
  name: string;
  description: string;
  category: string;
  risk: string;
  defaultMode: string;
  override: string | null;
  effectiveMode: string;
}
interface Integration {
  id: string;
  name: string;
  category: string;
  cost: string;
  configured: boolean;
  howTo: string;
}

const MODE_TONE = { auto: "ok", approval: "warn", confirm: "bad", disabled: "neutral" } as const;

export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("general");
  const s = useApi<{ settings: S; server: Server }>("/api/settings");
  const me = useApi<{ profile: { display_name: string; timezone: string; work_start: string; work_end: string } }>("/api/auth/me");
  const tools = useApi<{ tools: Tool[] }>(tab === "permissions" ? "/api/tools" : null);
  const integ = useApi<{ integrations: Integration[] }>(tab === "integrations" ? "/api/integrations" : null);
  const [paidWarn, setPaidWarn] = useState(false);
  const [profile, setProfile] = useState({ name: "", timezone: "", workStart: "09:00", workEnd: "17:00" });
  useEffect(() => {
    if (me.data) setProfile({ name: me.data.profile.display_name, timezone: me.data.profile.timezone, workStart: me.data.profile.work_start, workEnd: me.data.profile.work_end });
  }, [me.data]);

  const save = async (patch: Partial<Record<keyof S, unknown>>) => {
    try {
      await api("/api/settings", { method: "PUT", body: patch });
      s.reload();
      toast("Saved", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const st = s.data?.settings;
  const srv = s.data?.server;
  if (!st || !srv) return <div className="text-sm text-muted">Loading…</div>;

  const row = (label: string, desc: string, control: React.ReactNode) => (
    <div className="flex flex-col gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <div>{control}</div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Settings" icon={<SettingsIcon className="h-6 w-6" />} subtitle="Everything defaults to $0, local and safe. Secrets (API keys) live in .env on the server — never in the browser." />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "general", label: "Profile" },
            { value: "ai", label: "AI & Cost" },
            { value: "content", label: "Content & Images" },
            { value: "notifications", label: "Notifications" },
            { value: "automation", label: "Automation & Browser" },
            { value: "permissions", label: "Permissions & Approvals" },
            { value: "integrations", label: "Integrations" },
            { value: "security", label: "Security" },
          ]}
        />
      </div>

      {tab === "general" && (
        <Card className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Display name</Label>
              <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div>
              <Label hint="(IANA, e.g. Asia/Karachi)">Timezone</Label>
              <Input value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} list="tzs" />
              <datalist id="tzs">
                {(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []).map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Work starts</Label>
              <Input type="time" value={profile.workStart} onChange={(e) => setProfile({ ...profile, workStart: e.target.value })} />
            </div>
            <div>
              <Label>Work ends</Label>
              <Input type="time" value={profile.workEnd} onChange={(e) => setProfile({ ...profile, workEnd: e.target.value })} />
            </div>
          </div>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await api("/api/auth/me", { method: "PATCH", body: profile });
                toast("Profile saved", "ok");
              } catch (e) {
                toast((e as Error).message, "bad");
              }
            }}
          >
            Save profile
          </Button>
        </Card>
      )}

      {tab === "ai" && (
        <Card>
          <CardHeader title="AI provider & model router" subtitle="Local model → free API → paid API (only if explicitly enabled)." />
          {row("Use AI models", "Off = deterministic offline engine only (still fully functional).", <Toggle checked={st.ai.enabled} onChange={(v) => save({ ai: { enabled: v } })} />)}
          {row("Prefer local models", "Try Ollama on this machine before cloud free tiers.", <Toggle checked={st.ai.preferLocal} onChange={(v) => save({ ai: { preferLocal: v } })} />)}
          {row(
            "Ollama model",
            srv.ollama.url ? `Server: ${srv.ollama.url} (default ${srv.ollama.model ?? "none"})` : "Set OLLAMA_BASE_URL in .env",
            <Input className="w-48" placeholder={srv.ollama.model ?? "llama3.2"} defaultValue={st.ai.ollamaModel} onBlur={(e) => e.target.value !== st.ai.ollamaModel && save({ ai: { ollamaModel: e.target.value } })} />,
          )}
          {row(
            "OpenAI-compatible model",
            srv.openaiCompat.url ? `${srv.openaiCompat.url} · key ${srv.openaiCompat.key || "none"}${srv.openaiCompat.paid ? " · PAID DEPENDENCY" : ""}` : "Set OPENAI_COMPAT_BASE_URL in .env (Groq / OpenRouter free / Gemini)",
            <Input className="w-48" placeholder={srv.openaiCompat.model ?? ""} defaultValue={st.ai.openaiCompatModel} onBlur={(e) => e.target.value !== st.ai.openaiCompatModel && save({ ai: { openaiCompatModel: e.target.value } })} />,
          )}
          {row(
            "Model for complex reasoning (optional)",
            "Different tasks can use different models. Leave blank to use the default.",
            <Input className="w-48" placeholder="e.g. qwen2.5:14b" defaultValue={st.ai.tierModels.reasoning ?? ""} onBlur={(e) => save({ ai: { tierModels: { ...st.ai.tierModels, reasoning: e.target.value } } })} />,
          )}
          {row(
            "Allow PAID API usage",
            "Disabled by default. When enabled, paid endpoints may be used and you'll see 'Paid API usage may occur'.",
            <Toggle checked={st.ai.allowPaid} onChange={(v) => (v ? setPaidWarn(true) : save({ ai: { allowPaid: false } }))} />,
          )}
          {st.ai.allowPaid &&
            row("Monthly spending cap (USD)", "Paid providers are skipped once the cap is reached. 0 = no cap.", <Input type="number" min={0} className="w-32" defaultValue={st.ai.monthlyBudgetUsd} onBlur={(e) => save({ ai: { monthlyBudgetUsd: Number(e.target.value) } })} />)}
        </Card>
      )}

      {tab === "content" && (
        <Card>
          <CardHeader title="Content Studio" />
          {row(
            "AUTO MODE publishing",
            "Off by default (MANUAL MODE: every post needs approval). Even when on, a brand's first post always needs approval and each account must allow auto-publish.",
            <Toggle checked={st.content.autoPublish} onChange={(v) => save({ content: { autoPublish: v } })} />,
          )}
          {row(
            "Default platforms",
            "Used when a command doesn't name platforms.",
            <div className="flex flex-wrap gap-2">
              {["instagram", "facebook", "tiktok", "youtube", "snapchat"].map((p) => (
                <label key={p} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={st.content.defaultPlatforms.includes(p)}
                    onChange={(e) => save({ content: { defaultPlatforms: e.target.checked ? [...st.content.defaultPlatforms, p] : st.content.defaultPlatforms.filter((x) => x !== p) } })}
                  />
                  {p}
                </label>
              ))}
            </div>,
          )}
          {row(
            "Image generator order",
            `Gemini ${srv.gemini ? "(key set)" : "(no key)"} → local Stable Diffusion → Pollinations → built-in card (always). Never buys credits.`,
            <Select
              className="w-56"
              value={st.imageGen.order.join(",")}
              onChange={(e) => save({ imageGen: { order: e.target.value.split(",") } })}
            >
              <option value="gemini,local_sd,pollinations,builtin">Gemini first</option>
              <option value="local_sd,gemini,pollinations,builtin">Local SD first</option>
              <option value="pollinations,gemini,local_sd,builtin">Pollinations first</option>
              <option value="builtin">Built-in only (fully offline)</option>
            </Select>,
          )}
          {row("Allow Pollinations.ai", "Free public image API (no key). Your prompt is sent to a third party.", <Toggle checked={st.imageGen.pollinationsEnabled} onChange={(v) => save({ imageGen: { pollinationsEnabled: v } })} />)}
        </Card>
      )}

      {tab === "notifications" && (
        <Card>
          <CardHeader title="Notifications" />
          {row(
            "Browser notifications",
            "Desktop/mobile alerts while the app is open.",
            <Button size="sm" onClick={() => typeof Notification !== "undefined" && Notification.requestPermission().then((p) => toast(`Browser notifications: ${p}`))}>
              {typeof Notification !== "undefined" ? Notification.permission : "unsupported"} — request
            </Button>,
          )}
          {row("Telegram", srv.telegram ? "Bot configured in .env" : "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env", <Toggle disabled={!srv.telegram} checked={st.notifications.telegram} onChange={(v) => save({ notifications: { telegram: v } })} />)}
          {row("Email", srv.smtp ? "SMTP configured" : "Set SMTP_* in .env", <Toggle disabled={!srv.smtp} checked={st.notifications.email} onChange={(v) => save({ notifications: { email: v } })} />)}
          {st.notifications.email && row("Email to", "", <Input className="w-64" type="email" defaultValue={st.notifications.emailTo} onBlur={(e) => save({ notifications: { emailTo: e.target.value } })} />)}
          {row("WhatsApp", "Only via the official WhatsApp Business Cloud API (planned). No unofficial methods.", <Badge>planned</Badge>)}
        </Card>
      )}

      {tab === "automation" && (
        <Card>
          <CardHeader title="Automation engine" />
          {row("Pause all automations", "Stops schedules and triggers. Manual commands still work.", <Toggle checked={st.automation.paused} onChange={(v) => save({ automation: { paused: v } })} />)}
          {row("Retries for transient failures", "Network-type failures are retried with exponential backoff (never endlessly).", <Input type="number" min={0} max={5} className="w-24" defaultValue={st.automation.maxRetries} onBlur={(e) => save({ automation: { maxRetries: Number(e.target.value) } })} />)}
          {row("Step timeout (seconds)", "", <Input type="number" min={5} max={900} className="w-24" defaultValue={st.automation.stepTimeoutSeconds} onBlur={(e) => save({ automation: { stepTimeoutSeconds: Number(e.target.value) } })} />)}
          {row("Browser automation", "Playwright headless Chromium. Never bypasses CAPTCHA or logins.", <Toggle checked={st.browser.enabled} onChange={(v) => save({ browser: { enabled: v } })} />)}
          {row("Research: sources per report", "", <Input type="number" min={1} max={10} className="w-24" defaultValue={st.research.maxSources} onBlur={(e) => save({ research: { maxSources: Number(e.target.value) } })} />)}
          {row("Research: use the browser for JavaScript pages", "Slower, but reads sites that need JavaScript.", <Toggle checked={st.research.useBrowserForJsPages} onChange={(v) => save({ research: { useBrowserForJsPages: v } })} />)}
        </Card>
      )}

      {tab === "permissions" && (
        <Card className="overflow-hidden">
          <CardHeader title="Tool permissions & approval rules" subtitle="LOW → automatic · MEDIUM → approval · HIGH → explicit confirmation. You can make tools stricter, relax medium tools, or disable them. High-risk tools always need CONFIRM." />
          <div className="divide-y divide-line">
            {tools.data?.tools.map((t) => (
              <div key={t.name} className="flex flex-col gap-2 px-5 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.name} <Badge tone={t.risk === "high" ? "bad" : t.risk === "medium" ? "warn" : t.risk === "dynamic" ? "gold" : "ok"}>{t.risk}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted">{t.description}</div>
                </div>
                <Badge tone={MODE_TONE[t.effectiveMode as keyof typeof MODE_TONE]}>{t.effectiveMode}</Badge>
                <Select
                  className="h-8 w-40 text-xs"
                  value={t.override ?? ""}
                  onChange={async (e) => {
                    await api("/api/tools", { method: "PUT", body: { tool: t.name, mode: e.target.value || null } });
                    tools.reload();
                  }}
                >
                  <option value="">Default ({t.defaultMode})</option>
                  <option value="auto">Automatic</option>
                  <option value="approval">Ask for approval</option>
                  <option value="confirm">Explicit confirmation</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "integrations" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {integ.data?.integrations.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{i.name}</span>
                <Badge className="ml-auto" tone={i.category === "planned" ? "neutral" : i.configured ? "ok" : "neutral"}>
                  {i.category === "planned" ? "planned" : i.configured ? "configured" : "not configured"}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-gold">{i.cost}</div>
              <div className="mt-1 text-xs text-muted">{i.howTo}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === "security" && (
        <Card className="space-y-3 p-5 text-sm">
          <p>Sessions use signed, httpOnly cookies. Data is isolated per user with Postgres Row Level Security. Integration tokens are encrypted (AES-256-GCM). Every approval and permission change is in the Activity Log.</p>
          <Button
            variant="danger"
            onClick={async () => {
              await api("/api/auth/logout?everywhere=1", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Log out of all devices
          </Button>
        </Card>
      )}

      <Modal open={paidWarn} onClose={() => setPaidWarn(false)} title="Paid API usage may occur">
        <p className="text-sm">Enabling this lets the router use providers marked as paid. They can charge your account. Free/local providers are still tried first. You can set a monthly cap.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPaidWarn(false)}>Use Free/Local Mode</Button>
          <Button
            variant="danger"
            onClick={async () => {
              await save({ ai: { allowPaid: true } });
              setPaidWarn(false);
            }}
          >
            Continue
          </Button>
        </div>
      </Modal>
    </div>
  );
}
