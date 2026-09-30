import { env } from "@/lib/env";
import type { ImageProvider } from "../types";

/** Local Stable Diffusion via the AUTOMATIC1111-compatible API (A1111, Forge, SD.Next). Free & private. */
export const localSdProvider: ImageProvider = {
  id: "local_sd",
  label: "Local Stable Diffusion",
  cost: "free",
  local: true,
  configured: () => Boolean(env().LOCAL_SD_URL),
  async generate(req) {
    const base = env().LOCAL_SD_URL!.replace(/\/+$/, "");
    // keep generation fast on consumer GPUs: longest side 1024, multiples of 64
    const scale = Math.min(1, 1024 / Math.max(req.spec.width, req.spec.height));
    const w = Math.round((req.spec.width * scale) / 64) * 64;
    const h = Math.round((req.spec.height * scale) / 64) * 64;
    const res = await fetch(`${base}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: req.spec.prompt, negative_prompt: req.spec.negativePrompt, width: w, height: h, steps: 28, cfg_scale: 6.5, sampler_name: "DPM++ 2M" }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error(`Local SD HTTP ${res.status} (is it running with --api?)`);
    const data = (await res.json()) as { images?: string[] };
    if (!data.images?.[0]) throw new Error("Local SD returned no image");
    return { data: Buffer.from(data.images[0], "base64"), mime: "image/png", provider: "local_sd" };
  },
};
