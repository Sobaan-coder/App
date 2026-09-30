import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RetryJobButton } from "@/components/admin/retry-job-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Jobs" };
export const dynamic = "force-dynamic";

const VARIANT = { queued: "muted", running: "warning", succeeded: "success", failed: "destructive" } as const;

export default async function AdminJobs({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  let q = createAdminClient().from("processing_jobs").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status as "failed");
  const { data } = await q;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kind</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Attempts</TableHead>
          <TableHead>Error</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data ?? []).map((j) => (
          <TableRow key={j.id}>
            <TableCell className="font-medium">{j.kind}</TableCell>
            <TableCell>
              <Badge variant={VARIANT[j.status]}>{j.status}</Badge>
            </TableCell>
            <TableCell className="text-xs">{formatDateTime(j.created_at)}</TableCell>
            <TableCell className="text-right tabular-nums">{j.attempts}</TableCell>
            <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={j.error ?? ""}>{j.error ?? "—"}</TableCell>
            <TableCell>{j.status === "failed" && <RetryJobButton id={j.id} />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
