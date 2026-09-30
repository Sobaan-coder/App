import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Errors" };
export const dynamic = "force-dynamic";

export default async function AdminErrors() {
  const { data } = await createAdminClient().from("error_logs").select("id, source, message, created_at, user_id").order("created_at", { ascending: false }).limit(200);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Message</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data ?? []).map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap text-xs">{formatDateTime(e.created_at)}</TableCell>
            <TableCell className="text-xs font-medium">{e.source}</TableCell>
            <TableCell className="max-w-xl text-xs break-words text-muted-foreground">{e.message}</TableCell>
          </TableRow>
        ))}
        {!data?.length && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">No errors logged.</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
