import { env } from "@/lib/env";
import { ProviderUnavailable, type ImageProvider } from "../types";

/**
 * Gemini image generation through the official Gemini API.
 * Free access depends on your key/project. With a key from a project WITHOUT billing, Google
 * cannot charge you: quota errors are reported honestly and the router falls back.
 */
export const geminiProvider: ImageProvider = {
  id: "gemini",
  label: "Gemini API",
  cost: "free-tier",
  local: false,
  configured: () => Boolean(env().GEMINI_API_KEY),
  async generate(req) {
    const e = env();
    const model = e.GEMINI_IMAGE_MODEL;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": e.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: req.spec.prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: req.spec.aspectRatio } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      if (res.status === 429)
        throw new ProviderUnavailable(`Gemini API free access is unavailable for this operation (HTTP 429 — quota exhausted or model "${model}" has no free-tier quota for your key).`);
      if (res.status === 403 || res.status === 401) throw new ProviderUnavailable(`Gemini API rejected the key (HTTP ${res.status}). Check GEMINI_API_KEY.`);
      if (res.status === 400 && /location|region|country/i.test(body)) throw new ProviderUnavailable("Gemini image generation is not available in your region.");
      if (res.status === 404) throw new ProviderUnavailable(`Gemini model "${model}" not found for this key. Set GEMINI_IMAGE_MODEL.`);
      throw new Error(`Gemini HTTP ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; text?: string }[] }; finishReason?: string }[] };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData?.data);
    if (!img?.inlineData) {
      const reason = data.candidates?.[0]?.finishReason ?? parts.find((p) => p.text)?.text?.slice(0, 200) ?? "no image returned";
      throw new Error(`Gemini returned no image (${reason})`);
    }
    return { data: Buffer.from(img.inlineData.data, "base64"), mime: img.inlineData.mimeType || "image/png", provider: "gemini", model };
  },
};
