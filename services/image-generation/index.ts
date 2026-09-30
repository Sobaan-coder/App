import { sql, type Db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { saveFile } from "@/services/storage";
import { builtinProvider } from "./providers/builtin";
import { geminiProvider } from "./providers/gemini";
import { localSdProvider } from "./providers/local-sd";
import { pollinationsProvider } from "./providers/pollinations";
import { ProviderUnavailable, type ImageProvider, type ImageProviderId, type ImageRequest } from "./types";

/**
 * IMAGE GENERATION ROUTER
 *   Gemini (free access, if your key allows) → Local Stable Diffusion → Pollinations (opt-in)
 *   → Built-in brand card (always) … plus a manual Gemini workflow package every time.
 * Never buys credits, never bypasses quotas.
 */
export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageProvider> = {
  gemini: geminiProvider,
  local_sd: localSdProvider,
  pollinations: pollinationsProvider,
  builtin: builtinProvider,
};

export interface ImageAttempt {
  provider: ImageProviderId;
  ok: boolean;
  skipped?: boolean;
  message: string;
}

export interface ImageResult {
  fileId: string;
  fileName: string;
  provider: ImageProviderId;
  attempts: ImageAttempt[];
  manualWorkflow: { url: string; steps: string[]; prompt: string };
}

export const MANUAL_GEMINI_STEPS = [
  "Open https://gemini.google.com (free with a Google account) and start a new chat.",
  "Paste the prompt from image-prompt.txt and ask it to generate the image.",
  "Download the image it creates.",
  "In the Content Studio post, click “Replace image” and upload it.",
];

export async function generateImage(db: Db, userId: string, req: ImageRequest, opts: { postId?: string; only?: ImageProviderId } = {}): Promise<ImageResult> {
  const settings = await getSettings(db);
  const order: ImageProviderId[] = opts.only ? [opts.only] : [...settings.imageGen.order.filter((p) => p !== "builtin"), "builtin"];
  const attempts: ImageAttempt[] = [];
  for (const id of order) {
    const p = IMAGE_PROVIDERS[id];
    if (!p) continue;
    if (id === "pollinations" && !settings.imageGen.pollinationsEnabled && !p.configured()) {
      attempts.push({ provider: id, ok: false, skipped: true, message: "Disabled (enable in Settings — sends prompt to a third party)" });
      continue;
    }
    if (id !== "pollinations" && !p.configured()) {
      attempts.push({ provider: id, ok: false, skipped: true, message: "Not configured" });
      continue;
    }
    const started = Date.now();
    try {
      const img = await p.generate(req);
      const ext = img.mime.includes("jpeg") ? ".jpg" : img.mime.includes("webp") ? ".webp" : ".png";
      const file = await saveFile(db, userId, {
        name: `${(req.product?.name ?? req.brand.name).replace(/[^\w -]/g, "").slice(0, 40)} ${req.spec.template} ${new Date().toISOString().slice(0, 10)}${ext}`,
        folder: "media",
        data: img.data,
        mime: img.mime,
        tags: ["generated", "content", id],
      });
      attempts.push({ provider: id, ok: true, message: `Generated with ${p.label}` });
      await sql
        .query("insert into ai_usage(user_id, provider, model, kind, task, is_paid, success, latency_ms) values ($1,$2,$3,'image','image_generate',false,true,$4)", [
          userId,
          id,
          img.model ?? id,
          Date.now() - started,
        ])
        .catch(() => {});
      await db.query(
        `insert into generated_images(user_id, post_id, file_id, provider, prompt, negative_prompt, spec, width, height, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'generated')`,
        [userId, opts.postId ?? null, file.id, id, req.spec.prompt, req.spec.negativePrompt, JSON.stringify({ ...req.spec, attempts }), req.spec.width, req.spec.height],
      );
      return { fileId: file.id, fileName: file.name, provider: id, attempts, manualWorkflow: { url: "https://gemini.google.com", steps: MANUAL_GEMINI_STEPS, prompt: req.spec.prompt } };
    } catch (err) {
      const msg = err instanceof ProviderUnavailable ? err.message : `${p.label} failed: ${(err as Error).message}`;
      attempts.push({ provider: id, ok: false, message: msg });
      await sql
        .query("insert into ai_usage(user_id, provider, model, kind, task, is_paid, success, latency_ms, error) values ($1,$2,$3,'image','image_generate',false,false,$4,$5)", [
          userId,
          id,
          id,
          Date.now() - started,
          msg.slice(0, 500),
        ])
        .catch(() => {});
    }
  }
  throw new Error(`No image provider succeeded: ${attempts.map((a) => `${a.provider}: ${a.message}`).join("; ")}`);
}

export function imageProviderStatus() {
  return Object.values(IMAGE_PROVIDERS).map((p) => ({ id: p.id, label: p.label, cost: p.cost, local: p.local, configured: p.configured() }));
}
