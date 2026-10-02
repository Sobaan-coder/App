import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ImportReview } from "@/components/subjects/import-review";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Review syllabus" };

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: imp } = await supabase.from("syllabus_imports").select("id, status, error, result, program_id, saved").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!imp) notFound();
  return (
    <div>
      <PageHeader title="Review your syllabus" description="Check the structure, fix anything the AI got wrong, then save." />
      <ImportReview initial={imp} />
    </div>
  );
}
