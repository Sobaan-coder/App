import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CatalogueForms, DeleteTemplateButton } from "@/components/admin/catalogue-forms";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Catalogue" };
export const dynamic = "force-dynamic";

export default async function AdminCatalogue() {
  const admin = createAdminClient();
  const [{ data: systems }, { data: programs }, { data: templates }, { data: clones }] = await Promise.all([
    admin.from("education_systems").select("id, name, country, category").is("owner_id", null).order("name"),
    admin.from("programs").select("id, name, education_system, education_system_id").is("owner_id", null).order("name"),
    admin.from("subjects").select("id, name, code, program_id, chapters(count)").is("owner_id", null).order("name"),
    admin.from("subjects").select("template_id").not("template_id", "is", null).limit(100000),
  ]);
  const uses = new Map<string, number>();
  for (const c of clones ?? []) uses.set(c.template_id!, (uses.get(c.template_id!) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <CatalogueForms systems={(systems ?? []).map((s) => ({ id: s.id, name: s.name }))} programs={(programs ?? []).map((p) => ({ id: p.id, name: p.name, system: p.education_system }))} />
      <div className="space-y-4">
        {(systems ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {s.name} <span className="font-normal text-muted-foreground">· {s.country} · {s.category}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(programs ?? []).filter((p) => p.education_system_id === s.id).map((p) => (
                <div key={p.id}>
                  <p className="text-sm font-medium">{p.name}</p>
                  <ul className="mt-1 space-y-1">
                    {(templates ?? []).filter((t) => t.program_id === p.id).map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                        {t.name} {t.code && <Badge variant="secondary">{t.code}</Badge>}
                        <span className="text-xs">{(t.chapters as unknown as { count: number }[])[0]?.count ?? 0} chapters · {uses.get(t.id) ?? 0} students</span>
                        <DeleteTemplateButton id={t.id} name={t.name} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
