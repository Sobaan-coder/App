import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <defs>
        <linearGradient id="so-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.6 0.2 285)" />
          <stop offset="1" stopColor="oklch(0.5 0.21 265)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#so-g)" />
      <path d="M9 11.5 16 8l7 3.5-7 3.5-7-3.5Z" fill="white" opacity=".95" />
      <path d="M9 16.2 16 19.7l7-3.5M9 20.7 16 24.2l7-3.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)} aria-label="Study OS home">
      <LogoMark />
      <span>Study OS</span>
    </Link>
  );
}
