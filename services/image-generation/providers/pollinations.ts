import { env } from "@/lib/env";
import type { ImageProvider } from "../types";

/** Pollinations.ai — free public image API, no key. Opt-in: your prompt is sent to a third party. */
export const pollinationsProvider: ImageProvider = {
  id: "pollinations",
  label: "Pollinations.ai (free public API)",
  cost: "free-public",
  local: false,
  configured: () => env().POLLINATIONS_ENABLED,
  async generate(req) {
    const prompt = `${req.spec.prompt.split("\n").slice(0, 10).join(" ")}`.slice(0, 1500);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${req.spec.width}&height=${req.spec.height}&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error("Pollinations did not return an image");
    return { data: Buffer.from(await res.arrayBuffer()), mime: type, provider: "pollinations" };
  },
};
