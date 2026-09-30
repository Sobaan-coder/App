import "server-only";
import { assertPublicUrl, parseHttpUrl, youtubeId } from "@/lib/security/url";

const MAX_BYTES = 2 * 1024 * 1024;

/** Fetch a public web page as plain text. SSRF-guarded, size- and time-limited, never executes content. */
export async function fetchWebText(input: string): Promise<{ title: string | null; text: string }> {
  let url = parseHttpUrl(input);
  if (!url) throw new Error("Invalid URL");
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "StudyOS/1.0 (+resource indexer)", accept: "text/html,text/plain;q=0.9" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = parseHttpUrl(new URL(res.headers.get("location")!, url).toString());
      if (!url) throw new Error("Invalid redirect");
      continue;
    }
    if (!res.ok) throw new Error(`Page returned ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/.test(type)) throw new Error("Only web pages can be indexed");
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const raw = new TextDecoder().decode(Buffer.concat(chunks));
    return type.includes("text/plain") ? { title: null, text: raw } : htmlToText(raw);
  }
  throw new Error("Too many redirects");
}

export function htmlToText(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { title: title ? decodeEntities(title) : null, text: body };
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Title/channel for a YouTube video via the public oEmbed endpoint. */
export async function youtubeMeta(input: string): Promise<{ title: string; author: string | null } | null> {
  if (!youtubeId(input)) return null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(input)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: string; author_name?: string };
    return json.title ? { title: json.title.slice(0, 300), author: json.author_name ?? null } : null;
  } catch {
    return null;
  }
}
