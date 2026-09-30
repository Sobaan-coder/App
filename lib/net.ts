import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "./errors";

/** Private / loopback / link-local ranges — blocked to prevent SSRF against your own network. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

/** Validate that a URL is http(s) and resolves to a public address. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(`Not a valid URL: ${raw}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new AppError("Only http(s) URLs are allowed");
  if (process.env.ALLOW_PRIVATE_URLS === "true") return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new AppError(`Could not resolve ${host}`);
  if (addrs.some(isPrivateIp)) throw new AppError("Access to private/internal network addresses is blocked");
  return url;
}

export const USER_AGENT = "Mozilla/5.0 (compatible; AICommandCenter/0.1; +personal automation)";

/** fetch() with SSRF check, timeout, size cap and manual redirect validation. */
export async function safeFetch(raw: string, init: RequestInit & { timeoutMs?: number; maxBytes?: number } = {}): Promise<{ res: Response; body: Buffer; finalUrl: string }> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    const max = init.maxBytes ?? 5 * 1024 * 1024;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > max) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return { res, body: Buffer.concat(chunks), finalUrl: current };
  }
  throw new AppError("Too many redirects");
}
