import type { Page } from "playwright";
import { assertPublicUrl } from "@/lib/net";
import { CaptchaDetected, detectCaptcha, withPage } from "./session";

/**
 * Reusable browser agents. Read-only agents are low risk; agents that click, type or submit
 * are medium risk and require approval (enforced by the tool layer).
 */

async function open(page: Page, url: string) {
  await assertPublicUrl(url);
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  if (await detectCaptcha(page)) throw new CaptchaDetected(url);
  return res?.status() ?? 0;
}

export async function readPage(url: string) {
  return withPage(async (page) => {
    const status = await open(page, url);
    const title = await page.title();
    const text = (await page.locator("body").innerText()).replace(/\n{3,}/g, "\n\n").slice(0, 30_000);
    return { url: page.url(), status, title, text };
  });
}

export async function screenshot(url: string, fullPage = false) {
  return withPage(async (page) => {
    await open(page, url);
    const png = await page.screenshot({ fullPage, type: "png" });
    return { url: page.url(), title: await page.title(), png };
  });
}

/** Extract text for CSS selectors (e.g. {"price": ".price", "headline": "h1"}). */
export async function extract(url: string, selectors: Record<string, string>) {
  return withPage(async (page) => {
    await open(page, url);
    const data: Record<string, string[]> = {};
    for (const [name, sel] of Object.entries(selectors)) {
      data[name] = (await page.locator(sel).allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 50);
    }
    return { url: page.url(), title: await page.title(), data };
  });
}

export interface BrowserAction {
  type: "click" | "fill" | "select" | "press" | "wait";
  selector?: string;
  value?: string;
  ms?: number;
}

/** Perform a short scripted interaction then return the resulting page text + screenshot. */
export async function interact(url: string, actions: BrowserAction[]) {
  return withPage(async (page) => {
    await open(page, url);
    const log: string[] = [];
    for (const a of actions.slice(0, 25)) {
      if (a.type === "click" && a.selector) await page.click(a.selector);
      else if (a.type === "fill" && a.selector) await page.fill(a.selector, a.value ?? "");
      else if (a.type === "select" && a.selector) await page.selectOption(a.selector, a.value ?? "");
      else if (a.type === "press") await page.keyboard.press(a.value ?? "Enter");
      else if (a.type === "wait") await page.waitForTimeout(Math.min(a.ms ?? 1000, 10_000));
      log.push(`${a.type} ${a.selector ?? a.value ?? ""}`.trim());
      if (await detectCaptcha(page)) throw new CaptchaDetected(page.url());
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const text = (await page.locator("body").innerText()).slice(0, 10_000);
    const png = await page.screenshot({ type: "png" });
    return { url: page.url(), title: await page.title(), text, png, log };
  });
}

/** Click a link/button that triggers a download and return the file. */
export async function download(url: string, selector?: string) {
  return withPage(async (page) => {
    if (!selector) {
      await assertPublicUrl(url);
      const res = await page.request.get(url, { maxRedirects: 3 });
      if (!res.ok()) throw new Error(`Download failed: HTTP ${res.status()}`);
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "download");
      return { name, data: Buffer.from(await res.body()) };
    }
    await open(page, url);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return { name: dl.suggestedFilename(), data: Buffer.concat(chunks) };
  });
}
