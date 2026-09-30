import type { SocialAdapter } from "./types";

/**
 * Snapchat: Snap does not offer a public API for posting organic Stories/Spotlight from
 * third-party apps (the Public Profile API is limited to approved partners). We never automate
 * the app/website. The post is prepared as a manual package instead.
 */
export const snapchatAdapter: SocialAdapter = {
  platform: "snapchat",
  label: "Snapchat",
  automation: "manual_only",
  honestNote: "No public API for organic posting is available to regular developers, so posts are prepared for manual upload (image + short caption).",
  requiredCredentials: [],
  async publish() {
    return { status: "manual_required", reason: "Snapchat has no public organic-posting API. Download the package and post from the Snapchat app." };
  },
};
