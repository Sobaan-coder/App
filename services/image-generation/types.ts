import type { ImagePromptSpec } from "@/services/content/prompt-engine";

export type ImageProviderId = "gemini" | "local_sd" | "pollinations" | "builtin";

export interface ImageRequest {
  spec: ImagePromptSpec;
  brand: { name: string; tagline: string; colors: string[]; legal_name?: string };
  product?: { name: string; price?: string | number | null; special_offer?: string; available?: boolean } | null;
  currency?: string;
}

export interface GeneratedImage {
  data: Buffer;
  mime: string;
  provider: ImageProviderId;
  model?: string;
}

export interface ImageProvider {
  id: ImageProviderId;
  label: string;
  cost: "free" | "free-tier" | "free-public";
  local: boolean;
  configured(): boolean;
  generate(req: ImageRequest): Promise<GeneratedImage>;
}

/** Thrown when a provider is honest-to-goodness not usable for free (quota, billing, region). */
export class ProviderUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailable";
  }
}
