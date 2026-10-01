"use client";
import clsx from "clsx";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cx = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 shadow-sm",
  secondary: "bg-panel border border-line text-ink hover:bg-panel-2",
  ghost: "text-muted hover:text-ink hover:bg-panel-2",
  danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/15",
  success: "bg-ok text-white hover:brightness-110 shadow-sm",
};

export function Button({ variant = "secondary", size = "md", loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-12 px-5 text-sm" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: Variant; size?: "sm" | "md"; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition whitespace-nowrap", size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm", VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-2xl border border-line bg-panel shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, subtitle }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon && <span className="text-muted">{icon}</span>}
          {title}
        </div>
        {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

const TONES = {
  neutral: "bg-panel-2 text-muted border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  gold: "bg-gold/10 text-gold border-gold/25",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  queued: "neutral",
  running: "accent",
  waiting: "gold",
  approval_required: "warn",
  waiting_approval: "warn",
  completed: "ok",
  failed: "bad",
  cancelled: "neutral",
  skipped: "neutral",
  pending: "warn",
  approved: "ok",
  rejected: "bad",
  expired: "neutral",
  todo: "neutral",
  in_progress: "accent",
  idea: "neutral",
  draft: "neutral",
  approval: "warn",
  scheduled: "gold",
  published: "ok",
  manual_required: "gold",
  publishing: "accent",
  connected: "ok",
  manual: "neutral",
  error: "bad",
  online: "ok",
  warning: "warn",
  offline: "bad",
  low: "ok",
  medium: "warn",
  high: "bad",
  urgent: "bad",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? (status === "approval_required" ? "APPROVAL REQUIRED" : status.replace(/_/g, " "));
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-soft-pulse" />}
      {text}
    </Badge>
  );
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "muted" }) {
  return <span className={cx("inline-block h-2 w-2 rounded-full", tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-muted")} />;
}

const field = "w-full rounded-xl border border-line bg-panel px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field, "h-10", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(field, "py-2", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(field, "h-10 pr-8", props.className)} />;
}
export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-muted">
      {children}
      {hint && <span className="ml-1 font-normal opacity-80">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm disabled:opacity-50">
      <span className={cx("relative h-5 w-9 rounded-full transition", checked ? "bg-accent" : "bg-line")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin text-muted", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded-lg", className)} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 rounded-2xl bg-panel-2 p-3 text-muted">{icon}</div>}
      <div className="text-sm font-semibold">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
          {icon && <span className="text-accent">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cx("max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl scrollbar-thin", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-5 py-3 backdrop-blur">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 scrollbar-thin">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cx("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition", value === i.value ? "bg-accent text-accent-ink" : "text-muted hover:bg-panel-2 hover:text-ink")}
        >
          {i.label}
          {i.count !== undefined && i.count > 0 && <span className={cx("rounded-full px-1.5 text-[10px]", value === i.value ? "bg-white/20" : "bg-panel-2")}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── toasts ──
interface Toast {
  id: number;
  text: string;
  tone: "ok" | "bad" | "info";
}
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur", t.tone === "ok" ? "border-ok/30 bg-panel text-ok" : t.tone === "bad" ? "border-bad/30 bg-panel text-bad" : "border-line bg-panel text-ink")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
