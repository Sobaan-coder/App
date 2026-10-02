import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const admin = createAdminClient();
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: profiles }, { data: auth }, { data: subjects }, { data: resources }, { data: usage }] = await Promise.all([
    admin.from("profiles").select("id, full_name, education_level, country, created_at, onboarding_completed, is_admin").order("created_at", { ascending: false }).limit(200),
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("subjects").select("owner_id").not("owner_id", "is", null).limit(100000),
    admin.from("resources").select("user_id, size_bytes").limit(100000),
    admin.from("ai_usage").select("user_id").gte("created_at", month).limit(100000),
  ]);
  const email = new Map((auth?.users ?? []).map((u) => [u.id, u]));
  const count = <T,>(rows: T[] | null, key: (r: T) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const subjectsBy = count(subjects, (r) => r.owner_id);
  const resourcesBy = count(resources, (r) => r.user_id);
  const aiBy = count(usage, (r) => r.user_id);
  const storageBy = new Map<string, number>();
  for (const r of resources ?? []) storageBy.set(r.user_id, (storageBy.get(r.user_id) ?? 0) + Number(r.size_bytes ?? 0));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Subjects</TableHead>
          <TableHead className="text-right">Resources</TableHead>
          <TableHead className="text-right">Storage</TableHead>
          <TableHead className="text-right">AI (30d)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(profiles ?? []).map((p) => {
          const u = email.get(p.id);
          return (
            <TableRow key={p.id}>
              <TableCell>
                <span className="block font-medium">{p.full_name ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  {u?.email} {!u?.email_confirmed_at && <Badge variant="warning">unverified</Badge>} {p.is_admin && <Badge>admin</Badge>}
                </span>
              </TableCell>
              <TableCell className="uppercase text-xs">{p.education_level ?? "—"}</TableCell>
              <TableCell className="text-xs">{formatDate(p.created_at)}</TableCell>
              <TableCell className="text-right tabular-nums">{subjectsBy.get(p.id) ?? 0}</TableCell>
              <TableCell className="text-right tabular-nums">{resourcesBy.get(p.id) ?? 0}</TableCell>
              <TableCell className="text-right tabular-nums">{((storageBy.get(p.id) ?? 0) / 1024 / 1024).toFixed(1)} MB</TableCell>
              <TableCell className="text-right tabular-nums">{aiBy.get(p.id) ?? 0}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
