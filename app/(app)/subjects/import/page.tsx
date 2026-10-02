import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyllabusUploader } from "@/components/subjects/syllabus-uploader";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Import syllabus" };

export default async function ImportSyllabusPage() {
  const { supabase, user } = await requireUser();
  const [{ data: programs }, { data: mine }] = await Promise.all([
    supabase.from("programs").select("id, name, education_system").order("education_system").order("name"),
    supabase.from("student_programs").select("program_id").eq("user_id", user.id).eq("is_primary", true).maybeSingle(),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Import your syllabus" description="Upload a PDF, a photo or paste text. AI organises it into subjects, chapters and topics — you review everything before it's saved." />
      <Card>
        <CardContent>
          <SyllabusUploader programs={(programs ?? []).map((p) => ({ id: p.id, name: p.name, system: p.education_system }))} defaultProgramId={mine?.program_id} />
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Prefer to type it yourself?</CardTitle>
          <CardDescription>Create subjects, chapters and topics manually, or start from the catalogue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/subjects/new">
              <PenLine /> Create manually
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
