import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Readiness } from "@/lib/analytics/readiness";
import { cn } from "@/lib/utils";

function tone(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-[oklch(0.6_0.14_70)]";
  return "text-destructive";
}

export function ReadinessCard({ readiness, title = "Exam readiness", compact = false }: { readiness: Readiness; title?: string; compact?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>How it&apos;s calculated — every factor is shown.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-end gap-3">
          <span className={cn("text-4xl font-semibold tabular-nums tracking-tight", tone(readiness.score))}>{readiness.score === null ? "—" : `${readiness.score}%`}</span>
          <span className="pb-1.5 text-sm text-muted-foreground">{readiness.score === null ? "Not enough data yet" : "estimated preparation"}</span>
        </div>
        <ul className="space-y-3.5">
          {readiness.factors.map((f) => (
            <li key={f.key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {f.value === null ? "no data" : `${f.value}%`} <span className="text-xs">· weight {Math.round(f.weight * 100)}%</span>
                </span>
              </div>
              <Progress value={f.value ?? 0} className={cn("mt-1.5 h-1.5", f.value === null && "opacity-40")} aria-label={`${f.label} ${f.value ?? 0}%`} />
              {!compact && <p className="mt-1 text-xs text-muted-foreground">{f.explanation}</p>}
            </li>
          ))}
        </ul>
        <p className="flex gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {readiness.note}
        </p>
      </CardContent>
    </Card>
  );
}
