"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data while background work (uploads, AI analysis) is in progress. */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
