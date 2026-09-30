"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Re-fetches server data while background work (uploads, AI analysis) is in progress.
 * Pauses briefly after any user interaction so a refresh never races a click or
 * navigation, and skips refreshes while the tab is hidden.
 */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  const lastInteraction = useRef(0);

  useEffect(() => {
    if (!active) return;
    const mark = () => (lastInteraction.current = Date.now());
    window.addEventListener("pointerdown", mark, true);
    window.addEventListener("keydown", mark, true);
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction.current < 5000) return;
      router.refresh();
    }, intervalMs);
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", mark, true);
      window.removeEventListener("keydown", mark, true);
    };
  }, [active, intervalMs, router]);
  return null;
}
