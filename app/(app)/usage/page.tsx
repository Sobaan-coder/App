"use client";
import { Gauge } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { Badge, Card, CardHeader, Dot, Empty, PageHeader } from "@/components/ui";

interface Usage {
  totals: { requests: number; prompt_tokens: number; completion_tokens: number; cost: number; paid_requests: number; failures: number };
  byModel: { provider: string; model: string; kind: string; requests: number; prompt_tokens: number; completion_tokens: number; cost: number; is_paid: boolean; last_used: string }[];
  daily: { day: string; requests: number; cost: number }[];
  recent: { created_at: string; provider: string; model: string; kind: string; task: string; prompt_tokens: number | null; completion_tokens: number | null; estimated_cost_usd: string; is_paid: boolean; success: boolean; error: string | null }[];
  providers: { id: string; label: string; isLocal: boolean; isPaid: boolean; model?: string; ok: boolean; detail?: string; skippedReason?: string }[];
  imageProviders: { id: string; label: string; cost: string; local: boolean; configured: boolean }[];
  freeMode: boolean;
  budget: number;
}

export default function UsagePage() {
  const { data } = useApi<Usage>("/api/usage", 15_000);
  const cost = data?.totals.cost ?? 0;
  const max = Math.max(1, ...(data?.daily.map((d) => d.requests) ?? [1]));
  return (
    <div className="space-y-4">
      <PageHeader title="AI Usage & Cost" icon={<Gauge className="h-6 w-6" />} subtitle="Every model call is logged. Paid providers are never used unless you enable them in Settings." />
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-5 sm:col-span-2">
          <div className="text-xs text-muted">Cost this month</div>
          <div className={`mt-1 text-4xl font-bold tabular-nums ${cost === 0 ? "text-ok" : "text-warn"}`}>COST = ${cost.toFixed(cost < 1 ? 4 : 2)}</div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {data?.freeMode ? <Badge tone="ok">FREE MODE — paid APIs disabled</Badge> : <Badge tone="warn">Paid API usage may occur</Badge>}
            {!data?.freeMode && data?.budget ? <span className="text-muted">Monthly cap ${data.budget}</span> : null}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted">Requests (month)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{data?.totals.requests ?? "–"}</div>
          <div className="text-[11px] text-muted">{data?.totals.failures ?? 0} failed · {data?.totals.paid_requests ?? 0} paid</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted">Tokens (month, where reported)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{((data?.totals.prompt_tokens ?? 0) + (data?.totals.completion_tokens ?? 0)).toLocaleString()}</div>
          <div className="text-[11px] text-muted">in {data?.totals.prompt_tokens?.toLocaleString() ?? 0} · out {data?.totals.completion_tokens?.toLocaleString() ?? 0}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Text model router" subtitle="Order: local → free API → paid (only if enabled). With none available, the free offline engine is used." />
          <div className="divide-y divide-line">
            {data?.providers.length === 0 && <Empty title="No AI providers configured">The offline engine handles everything at $0. Add Ollama for AI-written text.</Empty>}
            {data?.providers.map((p) => (
              <div key={p.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <span className="mt-1.5">
                  <Dot tone={p.ok && !p.skippedReason ? "ok" : p.skippedReason ? "warn" : "bad"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {p.label} {p.model && <span className="text-muted">· {p.model}</span>}
                  </div>
                  <div className="text-xs text-muted">{p.skippedReason ?? p.detail ?? "Ready"}</div>
                </div>
                {p.isPaid ? <Badge tone="warn">PAID DEPENDENCY</Badge> : <Badge tone="ok">{p.isLocal ? "local · free" : "free tier"}</Badge>}
              </div>
            ))}
            <div className="flex items-start gap-3 px-5 py-3 text-sm">
              <span className="mt-1.5">
                <Dot tone="ok" />
              </span>
              <div className="flex-1">
                <div className="font-medium">Offline engine</div>
                <div className="text-xs text-muted">Rule-based planning, extractive summaries, template writing. Always available.</div>
              </div>
              <Badge tone="ok">$0</Badge>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Image generation router" />
          <div className="divide-y divide-line">
            {data?.imageProviders.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Dot tone={p.configured ? "ok" : "muted"} />
                <span className="flex-1">{p.label}</span>
                <Badge tone={p.configured ? "ok" : "neutral"}>{p.configured ? "configured" : "not configured"}</Badge>
                <Badge>{p.cost}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Requests per day (30 days)" />
        <div className="flex h-32 items-end gap-1 px-5 pb-5">
          {!data?.daily.length && <div className="w-full text-center text-xs text-muted">No usage yet.</div>}
          {data?.daily.map((d) => (
            <div key={d.day} className="group relative flex-1">
              <div className="rounded-t bg-accent/70 transition group-hover:bg-accent" style={{ height: `${(d.requests / max) * 110}px` }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-bg group-hover:block">
                {d.day}: {d.requests}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Recent calls" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-panel-2 text-left text-muted">
              <tr>
                {["Date", "Provider", "Model", "Kind", "Task", "Tokens", "Est. cost", ""].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.recent.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2">{r.provider}</td>
                  <td className="px-4 py-2">{r.model}</td>
                  <td className="px-4 py-2">{r.kind}</td>
                  <td className="px-4 py-2">{r.task}</td>
                  <td className="px-4 py-2 tabular-nums">{r.prompt_tokens != null ? `${r.prompt_tokens}/${r.completion_tokens ?? 0}` : "n/a"}</td>
                  <td className="px-4 py-2 tabular-nums">${Number(r.estimated_cost_usd).toFixed(4)}</td>
                  <td className="px-4 py-2">{r.success ? <Badge tone="ok">ok</Badge> : <Badge tone="bad" className="max-w-48 truncate">{r.error ?? "failed"}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
