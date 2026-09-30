import { load } from "cheerio";
import { safeFetch } from "@/lib/net";
import { extractDates } from "@/services/ai/offline";

export interface PageContent {
  url: string;
  title: string;
  text: string;
  publishedAt?: string;
  dates: string[];
  links: { text: string; href: string }[];
  status: number;
}

/** Fetch a public web page and extract its readable text (lightweight readability). */
export async function readWebPage(url: string, maxChars = 30_000): Promise<PageContent> {
  const { res, body, finalUrl } = await safeFetch(url);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) throw new Error(`Page returned HTTP ${res.status}`);
  if (!/html|text|json|xml/.test(type)) throw new Error(`Unsupported content type: ${type || "unknown"}`);
  const html = body.toString("utf8");
  if (!/html/.test(type)) {
    const text = html.slice(0, maxChars);
    return { url: finalUrl, title: finalUrl, text, dates: extractDates(text), links: [], status: res.status };
  }
  const $ = load(html);
  const title = ($("meta[property='og:title']").attr("content") || $("title").first().text() || finalUrl).trim();
  const publishedAt =
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='date']").attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    undefined;
  $("script,style,noscript,svg,iframe,nav,footer,header,form,aside,[role=navigation],[aria-hidden=true]").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const parts: string[] = [];
  root.find("h1,h2,h3,h4,p,li,td,blockquote,pre").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 1) parts.push(/^h\d$/.test(el.tagName) ? `\n## ${t}` : t);
  });
  const text = (parts.length ? parts.join("\n") : root.text().replace(/\s+/g, " ")).slice(0, maxChars);
  const links: PageContent["links"] = [];
  $("a[href]").each((_, a) => {
    if (links.length >= 50) return;
    try {
      links.push({ text: $(a).text().trim().slice(0, 100), href: new URL($(a).attr("href")!, finalUrl).toString() });
    } catch {
      /* ignore bad hrefs */
    }
  });
  return { url: finalUrl, title, text, publishedAt, dates: extractDates(text), links, status: res.status };
}
