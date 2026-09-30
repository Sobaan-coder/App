import { env } from "@/lib/env";
import { safeFetch, USER_AGENT } from "@/lib/net";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

export interface SearchOutcome {
  results: SearchResult[];
  providersTried: { provider: string; ok: boolean; detail?: string }[];
}

async function searxng(q: string, n: number): Promise<SearchResult[]> {
  const base = env().SEARXNG_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}/search?q=${encodeURIComponent(q)}&format=json`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status} (enable the json format in settings.yml)`);
  const data = (await res.json()) as { results?: { title: string; url: string; content?: string; publishedDate?: string }[] };
  return (data.results ?? []).slice(0, n).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "", source: "searxng", publishedAt: r.publishedDate }));
}

async function brave(q: string, n: number): Promise<SearchResult[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`, {
    headers: { accept: "application/json", "x-subscription-token": env().BRAVE_API_KEY! },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 429) throw new Error("Brave free quota reached (HTTP 429)");
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data = (await res.json()) as { web?: { results?: { title: string; url: string; description?: string; age?: string }[] } };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: (r.description ?? "").replace(/<[^>]+>/g, ""),
    source: "brave",
    publishedAt: r.age,
  }));
}

/** Wikipedia search API — free, no key, works everywhere. Great for background facts. */
async function wikipedia(q: string, n: number): Promise<SearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${n}&srsearch=${encodeURIComponent(q)}&origin=*`;
  const { res, body } = await safeFetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = JSON.parse(body.toString("utf8")) as { query?: { search?: { title: string; snippet: string; timestamp: string }[] } };
  return (data.query?.search ?? []).map((r) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    snippet: r.snippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    source: "wikipedia",
    publishedAt: r.timestamp?.slice(0, 10),
  }));
}

/** Search with every configured free provider, merge and de-duplicate by URL. */
export async function webSearch(q: string, n = 5): Promise<SearchOutcome> {
  const e = env();
  const providers: [string, (q: string, n: number) => Promise<SearchResult[]>][] = [];
  if (e.SEARXNG_URL) providers.push(["searxng", searxng]);
  if (e.BRAVE_API_KEY) providers.push(["brave", brave]);
  providers.push(["wikipedia", wikipedia]);

  const tried: SearchOutcome["providersTried"] = [];
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const [name, fn] of providers) {
    try {
      const r = await fn(q, n);
      tried.push({ provider: name, ok: true, detail: `${r.length} results` });
      for (const x of r) {
        const key = x.url.replace(/[#?].*$/, "").replace(/\/$/, "");
        if (!seen.has(key)) {
          seen.add(key);
          results.push(x);
        }
      }
    } catch (err) {
      tried.push({ provider: name, ok: false, detail: (err as Error).message });
    }
    if (results.length >= n * 2) break;
  }
  return { results: results.slice(0, Math.max(n, 1) * 2), providersTried: tried };
}
