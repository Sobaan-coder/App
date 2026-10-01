import { env } from "@/lib/env";
import { oauthConfigured } from "./oauth";
import { smtpConfigured } from "@/services/notifications";

/**
 * Integration catalog. Each integration lives in its own module under /integrations and is
 * isolated behind a small interface. Add new ones here (e.g. Notion, Slack, GitHub) later.
 */
export interface IntegrationInfo {
  id: string;
  name: string;
  category: "ai" | "notifications" | "social" | "research" | "storage" | "planned";
  cost: string;
  configured: boolean;
  howTo: string;
}

export function integrationCatalog(): IntegrationInfo[] {
  const e = env();
  return [
    { id: "ollama", name: "Ollama (local AI)", category: "ai", cost: "Free · local", configured: Boolean(e.OLLAMA_BASE_URL && e.OLLAMA_MODEL), howTo: "Install Ollama, `ollama pull llama3.2`, set OLLAMA_MODEL." },
    { id: "openai_compat", name: "OpenAI-compatible API", category: "ai", cost: e.OPENAI_COMPAT_IS_PAID ? "PAID DEPENDENCY" : "Free tier (Groq / OpenRouter / Gemini)", configured: Boolean(e.OPENAI_COMPAT_BASE_URL), howTo: "Set OPENAI_COMPAT_BASE_URL, _API_KEY, _MODEL." },
    { id: "gemini_image", name: "Gemini image generation", category: "ai", cost: "Free tier where available (use a key without billing)", configured: Boolean(e.GEMINI_API_KEY), howTo: "Get a key at aistudio.google.com, set GEMINI_API_KEY." },
    { id: "local_sd", name: "Local Stable Diffusion", category: "ai", cost: "Free · local (needs a GPU)", configured: Boolean(e.LOCAL_SD_URL), howTo: "Run AUTOMATIC1111/Forge with --api, set LOCAL_SD_URL." },
    { id: "telegram", name: "Telegram", category: "notifications", cost: "Free (official Bot API)", configured: Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID), howTo: "Create a bot with @BotFather, set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID." },
    { id: "email", name: "Email (SMTP)", category: "notifications", cost: "Free with your own mailbox", configured: smtpConfigured(), howTo: "Set SMTP_HOST/PORT/USER/PASSWORD/FROM (e.g. Gmail app password)." },
    { id: "whatsapp", name: "WhatsApp", category: "planned", cost: "Official Cloud API only (Meta pricing applies)", configured: false, howTo: "Planned — only via the official WhatsApp Business Cloud API. No unofficial methods." },
    { id: "meta", name: "Facebook Pages + Instagram", category: "social", cost: "Free (official Graph API)", configured: oauthConfigured("meta"), howTo: "Create a Meta app, set META_APP_ID/SECRET, connect in Content → Accounts." },
    { id: "youtube", name: "YouTube", category: "social", cost: "Free (Data API quota)", configured: oauthConfigured("youtube"), howTo: "Create a Google OAuth client, set YOUTUBE_CLIENT_ID/SECRET." },
    { id: "tiktok", name: "TikTok", category: "social", cost: "Free (Content Posting API; audit needed for public posts)", configured: oauthConfigured("tiktok"), howTo: "Create a TikTok developer app, set TIKTOK_CLIENT_KEY/SECRET." },
    { id: "snapchat", name: "Snapchat", category: "social", cost: "Manual only", configured: true, howTo: "No public organic posting API — content packages are prepared for manual posting." },
    { id: "searxng", name: "SearXNG search", category: "research", cost: "Free · self-hosted", configured: Boolean(e.SEARXNG_URL), howTo: "Run SearXNG (docker), enable JSON format, set SEARXNG_URL." },
    { id: "brave", name: "Brave Search API", category: "research", cost: "Free plan (monthly quota)", configured: Boolean(e.BRAVE_API_KEY), howTo: "Get a key at brave.com/search/api, set BRAVE_API_KEY." },
    { id: "wikipedia", name: "Wikipedia", category: "research", cost: "Free · no key", configured: true, howTo: "Always on." },
    { id: "google", name: "Google Calendar / Drive", category: "planned", cost: "Free API", configured: false, howTo: "Planned. Calendar events are exported as .ics files today." },
    { id: "notion", name: "Notion", category: "planned", cost: "Free API", configured: false, howTo: "Planned." },
    { id: "slack", name: "Slack", category: "planned", cost: "Free API", configured: false, howTo: "Planned." },
    { id: "github", name: "GitHub", category: "planned", cost: "Free API", configured: false, howTo: "Planned." },
  ];
}
