import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NoteEditor } from "@/components/resources/note-editor";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New note" };

export default async function NewNotePage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("owner_id", user.id).order("sort_order");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New note" description="Your notes are private, searchable, and the AI tutor can cite them." />
      <Card>
        <CardContent>
          <NoteEditor subjects={subjects ?? []} subjectId={subject ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
