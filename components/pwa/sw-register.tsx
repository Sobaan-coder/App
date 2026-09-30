"use client";
import { useEffect } from "react";

/** Registers the offline-shell service worker in production builds. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // Register after the page has fully loaded and gone idle so installation never
    // competes with hydration or the first navigations.
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    const schedule = () => ("requestIdleCallback" in window ? window.requestIdleCallback(register, { timeout: 10_000 }) : setTimeout(register, 3000));
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
  }, []);
  return null;
}
