import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogueBrowser } from "@/components/subjects/catalogue-browser";
import { SyllabusEditor } from "@/components/subjects/syllabus-editor";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Add subject" };

export default async function NewSubjectPage() {
  const { supabase, user } = await requireUser();
  const [{ data: systems }, { data: programs }, { data: templates }, { data: mine }] = await Promise.all([
    supabase.from("education_systems").select("id, name, country, category").is("owner_id", null).order("name"),
    supabase.from("programs").select("id, name, education_system_id").is("owner_id", null).order("name"),
    supabase.from("subjects").select("id, name, code, program_id, chapters(count)").is("owner_id", null).order("name"),
    supabase.from("subjects").select("template_id").eq("owner_id", user.id).not("template_id", "is", null),
  ]);
  const added = new Set((mine ?? []).map((m) => m.template_id));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add a subject" description="Start from the catalogue or build it yourself. You can always edit topics later." />
      <Tabs defaultValue="catalogue">
        <TabsList>
          <TabsTrigger value="catalogue">From catalogue</TabsTrigger>
          <TabsTrigger value="manual">Create manually</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogue">
          <CatalogueBrowser
            systems={systems ?? []}
            programs={programs ?? []}
            templates={(templates ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              code: t.code,
              program_id: t.program_id,
              chapters: (t.chapters as unknown as { count: number }[])[0]?.count ?? 0,
              added: added.has(t.id),
            }))}
          />
        </TabsContent>
        <TabsContent value="manual">
          <SyllabusEditor initial={[]} aiGenerated={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
