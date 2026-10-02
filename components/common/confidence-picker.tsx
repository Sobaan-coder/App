"use client";
import { cn } from "@/lib/utils";

const LABELS = ["", "Lost", "Shaky", "Okay", "Good", "Confident"];

export function ConfidencePicker({
  value,
  onChange,
  size = "sm",
  label = "Confidence",
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  size?: "sm" | "lg";
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${n} — ${LABELS[n]}`}
            title={LABELS[n]}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "flex items-center justify-center rounded-lg border font-medium tabular-nums transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none disabled:opacity-50",
              size === "sm" ? "size-7 text-xs" : "size-12 text-base",
              active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
