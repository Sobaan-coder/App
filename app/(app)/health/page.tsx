"use client";
import { HeartPulse, RefreshCw } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { Button, Card, StatusBadge, PageHeader, Skeleton } from "@/components/ui";

interface Health {
  components: { name: string; status: "online" | "warning" | "offline"; detail: string }[];
  jobs: { queued: number; failed: number };
  checkedAt: string;
}

export default function HealthPage() {
  const { data, reload, loading } = useApi<Health>("/api/health", 30_000);
  return (
    <div>
      <PageHeader
        title="System Health"
        icon={<HeartPulse className="h-6 w-6" />}
        subtitle={data ? `Checked ${fmtDate(data.checkedAt, { timeStyle: "medium" })} · ${data.jobs.queued} jobs queued · ${data.jobs.failed} failed jobs (24h)` : "Checking…"}
        actions={
          <Button onClick={reload} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Re-check
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!data && [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28" />)}
        {data?.components.map((c) => (
          <Card key={c.name} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{c.name}</span>
              <StatusBadge status={c.status} label={c.status.toUpperCase()} />
            </div>
            <p className="mt-2 text-xs break-words text-muted">{c.detail}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
