import { z } from "zod";
import { defineTool } from "../types";
import { sha256 } from "@/lib/crypto";
import { webSearch, type SearchResult } from "@/services/research/search";
import { readWebPage } from "@/services/research/page";
import { compileResearch, type SourceDoc } from "@/services/research/compile";
import { saveFile } from "@/services/storage";
import * as agents from "@/automation/browser/agents";
import { assertPublicUrl } from "@/lib/net";
import { detectInjection } from "@/services/ai/safety";

export const webSearchTool = defineTool({
  name: "web_search",
  description: "Search the web with free providers (SearXNG, Brave free tier, Wikipedia).",
  category: "research",
  risk: "low",
  retryable: true,
  input: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(10).default(5) }),
  async execute(i) {
    const out = await webSearch(i.query, i.limit);
    const failed = out.providersTried.filter((p) => !p.ok);
    return {
      results: out.results,
      providers: out.providersTried,
      warnings: failed.map((f) => `${f.provider}: ${f.detail}`),
      summary: `${out.results.length} results via ${out.providersTried.filter((p) => p.ok).map((p) => p.provider).join(", ") || "no provider"}`,
      markdown: out.results.length ? out.results.map((r, n) => `${n + 1}. [${r.title}](${r.url}) — ${r.snippet.slice(0, 160)}`).join("\n") : "No results found.",
    };
  },
  verify: (o) =>
    o.results.length
      ? null
      : `No search results. ${o.providers.map((p) => `${p.provider}: ${p.ok ? "nothing matched" : p.detail}`).join("; ")}. Tip: add a free SearXNG instance (SEARXNG_URL) or a Brave free-tier key.`,
});

export const webpageRead = defineTool({
  name: "webpage_read",
  description: "Read the text of one public web page.",
  category: "research",
  risk: "low",
  retryable: true,
  input: z.object({ url: z.string().url(), useBrowser: z.boolean().default(false) }),
  async execute(i) {
    const page = i.useBrowser ? await agents.readPage(i.url) : await readWebPage(i.url);
    const flags = detectInjection(page.text);
    return {
      url: page.url,
      title: page.title,
      text: page.text.slice(0, 20_000),
      warnings: flags.map((f) => `Page contains instruction-like text (${f.reason}); treated as data only.`),
      summary: `Read "${page.title}"`,
    };
  },
});

/** Read several search results in parallel (max 3 at a time), keeping per-source errors. */
export const pagesRead = defineTool({
  name: "pages_read",
  description: "Open the top search results and extract their text (sources that fail are reported, not hidden).",
  category: "research",
  risk: "low",
  timeoutMs: 180_000,
  input: z.object({ results: z.array(z.any()).default([]), limit: z.number().int().min(1).max(10).default(5) }),
  async execute(i, ctx) {
    const list = (i.results as SearchResult[]).slice(0, i.limit);
    const docs: SourceDoc[] = [];
    const queue = [...list.entries()];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [idx, r] = next;
        try {
          let page: { title: string; text: string; url: string; publishedAt?: string };
          try {
            page = await readWebPage(r.url, 15_000);
          } catch (err) {
            if (!ctx.settings.research.useBrowserForJsPages) throw err;
            page = await agents.readPage(r.url);
          }
          docs[idx] = { title: page.title || r.title, url: page.url, text: page.text.length > 200 ? page.text : `${r.snippet}\n${page.text}`, publishedAt: page.publishedAt ?? r.publishedAt, snippet: r.snippet };
        } catch (err) {
          docs[idx] = { title: r.title, url: r.url, text: r.snippet ?? "", publishedAt: r.publishedAt, error: (err as Error).message };
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const ok = docs.filter((d) => d && !d.error).length;
    return { pages: docs.filter(Boolean), summary: `Read ${ok}/${list.length} sources`, warnings: docs.filter((d) => d?.error).map((d) => `${d.url}: ${d.error}`) };
  },
});

export const researchCompile = defineTool({
  name: "research_compile",
  description: "Compare sources, remove duplicates, identify dates and conflicts, and write a cited report.",
  category: "research",
  risk: "low",
  timeoutMs: 240_000,
  input: z.object({ topic: z.string().min(2), pages: z.array(z.any()).default([]) }),
  async execute(i, ctx) {
    const r = await compileResearch(ctx.db, ctx.userId, i.topic, i.pages as SourceDoc[]);
    return { markdown: r.markdown, sources: r.sources, engine: r.engine, warnings: r.warnings, summary: `Report on "${i.topic}" (${r.sources.filter((s) => s.used).length} sources, ${r.engine})` };
  },
});

export const websiteCheck = defineTool({
  name: "website_check",
  description: "Check a website for changes since the last check (optionally only a CSS selector).",
  category: "research",
  risk: "low",
  retryable: true,
  input: z.object({ url: z.string().url(), selector: z.string().optional() }),
  async execute(i, ctx) {
    let text: string;
    if (i.selector) {
      const r = await agents.extract(i.url, { target: i.selector });
      text = (r.data.target ?? []).join("\n");
    } else {
      text = (await readWebPage(i.url)).text;
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    const hash = sha256(normalized);
    const prev = await ctx.db.one<{ last_hash: string | null; last_excerpt: string | null }>("select last_hash, last_excerpt from web_monitors where url = $1", [i.url]);
    const changed = Boolean(prev?.last_hash && prev.last_hash !== hash);
    await ctx.db.query(
      `insert into web_monitors(user_id, url, selector, last_hash, last_excerpt, last_checked_at, last_changed_at)
       values ($1,$2,$3,$4,$5, now(), null)
       on conflict (user_id, url) do update set selector = excluded.selector, last_hash = excluded.last_hash, last_excerpt = excluded.last_excerpt,
         last_checked_at = now(), last_changed_at = case when web_monitors.last_hash is distinct from excluded.last_hash then now() else web_monitors.last_changed_at end`,
      [ctx.userId, i.url, i.selector ?? null, hash, normalized.slice(0, 500)],
    );
    const status = !prev ? "first check — baseline saved" : changed ? "CHANGED since last check" : "no change";
    return {
      changed,
      firstCheck: !prev,
      excerpt: normalized.slice(0, 300),
      previousExcerpt: prev?.last_excerpt ?? null,
      summary: `${i.url}: ${status}`,
      markdown: `**${i.url}** — ${status}${changed ? `\n\nBefore: _${prev?.last_excerpt?.slice(0, 200)}…_\n\nNow: _${normalized.slice(0, 200)}…_` : ""}`,
    };
  },
});

// ── Browser tools (Playwright) ────────────────────────────────────────────────
export const browserOpen = defineTool({
  name: "browser_open",
  description: "Open a page in a real headless browser (for JavaScript-heavy sites) and read it.",
  category: "browser",
  risk: "low",
  timeoutMs: 60_000,
  input: z.object({ url: z.string().url() }),
  async execute(i) {
    const r = await agents.readPage(i.url);
    return { url: r.url, title: r.title, text: r.text.slice(0, 20_000), summary: `Opened "${r.title}"`, markdown: `**${r.title}** (${r.url})\n\n${r.text.slice(0, 1500)}${r.text.length > 1500 ? "…" : ""}` };
  },
});

export const browserScreenshot = defineTool({
  name: "browser_screenshot",
  description: "Take a screenshot of a web page and save it to Media.",
  category: "browser",
  risk: "low",
  timeoutMs: 60_000,
  input: z.object({ url: z.string().url(), fullPage: z.boolean().default(false) }),
  async execute(i, ctx) {
    const r = await agents.screenshot(i.url, i.fullPage);
    const host = new URL(r.url).hostname;
    const f = await saveFile(ctx.db, ctx.userId, { name: `screenshot ${host} ${new Date().toISOString().slice(0, 16).replace(":", "-")}.png`, folder: "media", data: r.png, source: "browser" });
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Screenshot of ${host} saved`, markdown: `📸 Saved screenshot of **${r.title}** as \`${f.name}\`` };
  },
});

export const browserExtract = defineTool({
  name: "browser_extract",
  description: "Extract specific information from a page using CSS selectors.",
  category: "browser",
  risk: "low",
  timeoutMs: 60_000,
  input: z.object({ url: z.string().url(), selectors: z.record(z.string(), z.string()) }),
  async execute(i) {
    const r = await agents.extract(i.url, i.selectors);
    return { data: r.data, summary: `Extracted ${Object.keys(r.data).length} field(s)`, markdown: Object.entries(r.data).map(([k, v]) => `**${k}**: ${v.join("; ") || "—"}`).join("\n") };
  },
});

export const browserInteract = defineTool({
  name: "browser_interact",
  description: "Click, type, fill forms or press keys on a page. Requires approval.",
  category: "browser",
  risk: "medium",
  timeoutMs: 90_000,
  input: z.object({
    url: z.string().url(),
    actions: z.array(z.object({ type: z.enum(["click", "fill", "select", "press", "wait"]), selector: z.string().optional(), value: z.string().optional(), ms: z.number().optional() })).min(1).max(25),
  }),
  describe: (i) => `On ${i.url}: ${i.actions.map((a) => `${a.type} ${a.selector ?? ""}${a.value ? ` "${a.type === "fill" ? a.value.slice(0, 30) : a.value}"` : ""}`).join(" → ")}`,
  async execute(i, ctx) {
    const r = await agents.interact(i.url, i.actions);
    const f = await saveFile(ctx.db, ctx.userId, { name: `after-actions ${new URL(r.url).hostname}.png`, folder: "media", data: r.png, source: "browser" });
    return { url: r.url, title: r.title, text: r.text, log: r.log, files: [{ id: f.id, name: f.name }], summary: `Performed ${r.log.length} action(s) on ${r.title}` };
  },
});

export const browserDownload = defineTool({
  name: "browser_download",
  description: "Download a file from a URL (or by clicking a download link) into Downloads.",
  category: "browser",
  risk: (i: { selector?: string }) => (i.selector ? "medium" : "low"),
  timeoutMs: 120_000,
  input: z.object({ url: z.string().url(), selector: z.string().optional() }),
  async execute(i, ctx) {
    await assertPublicUrl(i.url);
    const r = await agents.download(i.url, i.selector);
    const f = await saveFile(ctx.db, ctx.userId, { name: r.name, folder: "downloads", data: r.data, source: "browser" });
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Downloaded ${f.name}` };
  },
});

export const researchTools = [webSearchTool, webpageRead, pagesRead, researchCompile, websiteCheck, browserOpen, browserScreenshot, browserExtract, browserInteract, browserDownload];
