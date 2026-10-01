"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** Browser-side fetch wrapper: JSON in/out, readable errors, redirect to login on 401. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

/** Fetch + optional polling. `interval` 0 = no polling. Pauses while the tab is hidden. */
export function useApi<T>(url: string | null, interval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const d = await api<T>(u);
      if (urlRef.current === u) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    void load();
    if (!interval) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, interval);
    return () => clearInterval(t);
  }, [url, interval, load]);

  return { data, error, loading, reload: load, setData };
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const f = (n: number, u: string) => `${Math.round(n)}${u}`;
  if (s < 0) {
    const a = -s;
    if (a < 3600) return `in ${f(a / 60, "m")}`;
    if (a < 86400) return `in ${f(a / 3600, "h")}`;
    return `in ${f(a / 86400, "d")}`;
  }
  if (s < 45) return "just now";
  if (s < 3600) return `${f(s / 60, "m")} ago`;
  if (s < 86400) return `${f(s / 3600, "h")} ago`;
  if (s < 86400 * 30) return `${f(s / 86400, "d")} ago`;
  return new Date(iso).toLocaleDateString();
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(iso));
}

export function bytes(n: number | string) {
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}
