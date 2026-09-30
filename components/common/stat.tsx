import { cn } from "@/lib/utils";

export function Stat({ label, value, hint, className, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
