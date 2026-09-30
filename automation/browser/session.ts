import type { Browser, BrowserContext, Page } from "playwright";
import { env } from "@/lib/env";
import { assertPublicUrl, USER_AGENT } from "@/lib/net";

/**
 * Shared headless Chromium. One browser per process, a fresh isolated context per task,
 * closed automatically after 2 minutes idle.
 */
const g = globalThis as unknown as { __ccBrowser?: Promise<Browser>; __ccBrowserIdle?: NodeJS.Timeout };

async function browser(): Promise<Browser> {
  if (!g.__ccBrowser) {
    const { chromium } = await import("playwright");
    const executablePath = env().PLAYWRIGHT_CHROMIUM_PATH;
    g.__ccBrowser = chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] }).catch((err) => {
      g.__ccBrowser = undefined;
      throw new Error(`Could not start the browser (${(err as Error).message.split("\n")[0]}). Run: npx playwright install chromium`);
    });
  }
  return g.__ccBrowser;
}

function scheduleIdleClose() {
  if (g.__ccBrowserIdle) clearTimeout(g.__ccBrowserIdle);
  g.__ccBrowserIdle = setTimeout(async () => {
    const b = g.__ccBrowser;
    g.__ccBrowser = undefined;
    await (await b)?.close().catch(() => {});
  }, 120_000);
  g.__ccBrowserIdle.unref?.();
}

export class CaptchaDetected extends Error {
  constructor(url: string) {
    super(`A CAPTCHA / human-verification check appeared on ${url}. I will not bypass it — please complete that step yourself.`);
    this.name = "CaptchaDetected";
  }
}

/** Heuristic CAPTCHA / bot-wall detection. We stop instead of trying to get around it. */
export async function detectCaptcha(page: Page): Promise<boolean> {
  const frames = page.frames().map((f) => f.url());
  if (frames.some((u) => /recaptcha|hcaptcha|challenges\.cloudflare|turnstile|arkoselabs|funcaptcha/i.test(u))) return true;
  const text = (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")).slice(0, 5000);
  return /verify (that )?you are (a )?human|are you a robot|complete the security check|unusual traffic from your computer|press (and|&) hold/i.test(text);
}

/** Run `fn` with a fresh page. Every navigation/request is checked against private networks. */
export async function withPage<T>(fn: (page: Page, ctx: BrowserContext) => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  const b = await browser();
  const context = await b.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 900 }, acceptDownloads: true, javaScriptEnabled: true });
  context.setDefaultTimeout(opts.timeoutMs ?? 30_000);
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (req.isNavigationRequest()) {
      try {
        await assertPublicUrl(req.url());
      } catch {
        return route.abort("blockedbyclient");
      }
    }
    return route.continue();
  });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await context.close().catch(() => {});
    scheduleIdleClose();
  }
}

export async function browserAvailable(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await withPage(async (p) => p.setContent("<p>ok</p>"));
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
