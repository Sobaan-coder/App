import type { Metadata } from "next";
import { Stat } from "@/components/common/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart } from "@/components/charts/bar-chart";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const admin = createAdminClient();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const [users, newUsers, subjects, resources, storage, usage, jobs, failedDocs, failedPapers, errors] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", week),
    admin.from("subjects").select("id", { count: "exact", head: true }).not("owner_id", "is", null),
    admin.from("resources").select("id", { count: "exact", head: true }),
    admin.from("resources").select("size_bytes").not("size_bytes", "is", null).limit(100000),
    admin.from("ai_usage").select("feature, model, input_tokens, output_tokens, success, created_at").gte("created_at", week).limit(100000),
    admin.from("processing_jobs").select("status"),
    admin.from("resources").select("id", { count: "exact", head: true }).eq("processing_status", "failed"),
    admin.from("past_papers").select("id", { count: "exact", head: true }).eq("processing_status", "failed"),
    admin.from("error_logs").select("id", { count: "exact", head: true }).gte("created_at", day),
  ]);
  const bytes = (storage.data ?? []).reduce((a, r) => a + Number(r.size_bytes ?? 0), 0);
  const byFeature = new Map<string, { calls: number; tokens: number; failed: number }>();
  for (const u of usage.data ?? []) {
    const f = byFeature.get(u.feature) ?? { calls: 0, tokens: 0, failed: 0 };
    f.calls++;
    f.tokens += u.input_tokens + u.output_tokens;
    if (!u.success) f.failed++;
    byFeature.set(u.feature, f);
  }
  const jobCounts = new Map<string, number>();
  for (const j of jobs.data ?? []) jobCounts.set(j.status, (jobCounts.get(j.status) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={users.count ?? 0} hint={`${newUsers.count ?? 0} new this week`} />
        <Stat label="Student subjects" value={subjects.count ?? 0} hint={`${resources.count ?? 0} resources`} />
        <Stat label="Storage used" value={`${(bytes / 1024 / 1024).toFixed(1)} MB`} />
        <Stat label="Failed documents" value={(failedDocs.count ?? 0) + (failedPapers.count ?? 0)} hint={`${errors.count ?? 0} errors in 24h`} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>AI usage — last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart horizontal caption="AI requests by feature, last 7 days" valueLabel="Requests" data={[...byFeature.entries()].map(([k, v]) => ({ label: k, value: v.calls, hint: `${v.tokens.toLocaleString()} tokens · ${v.failed} failed` }))} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...byFeature.entries()].map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell>{k}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.calls}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.failed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Processing jobs</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {["queued", "running", "succeeded", "failed"].map((s) => (
              <Stat key={s} label={s} value={jobCounts.get(s) ?? 0} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
