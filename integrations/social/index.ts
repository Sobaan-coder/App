import type { Platform } from "@/services/content/types";
import { facebookAdapter, instagramAdapter } from "./meta";
import { snapchatAdapter } from "./snapchat";
import { tiktokAdapter } from "./tiktok";
import type { SocialAdapter } from "./types";
import { youtubeAdapter } from "./youtube";

export const SOCIAL_ADAPTERS: Record<Platform, SocialAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  snapchat: snapchatAdapter,
};

export function socialCapabilities() {
  return Object.values(SOCIAL_ADAPTERS).map((a) => ({
    platform: a.platform,
    label: a.label,
    automation: a.automation,
    note: a.honestNote,
    credentials: a.requiredCredentials,
    analytics: Boolean(a.fetchMetrics),
  }));
}
