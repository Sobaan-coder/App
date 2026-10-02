"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SyllabusEditor, draftFromExtraction } from "./syllabus-editor";
import { createClient } from "@/lib/supabase/client";
import type { SyllabusExtraction } from "@/lib/syllabus/schema";
import type { Json } from "@/types/database";

type Imp = { id: string; status: string; error: string | null; result: Json | null; program_id: string | null; saved: boolean };

const STAGES: Record<string, { label: string; pct: number }> = {
  uploading: { label: "Uploading", pct: 10 },
  processing: { label: "Reading your document", pct: 35 },
  analyzing: { label: "Organising subjects, chapters and topics", pct: 70 },
  ready: { label: "Ready", pct: 100 },
};

export function ImportReview({ initial }: { initial: Imp }) {
  const [imp, setImp] = useState(initial);

  useEffect(() => {
    if (imp.status === "ready" || imp.status === "failed") return;
    const supabase = createClient();
    const t = setInterval(async () => {
      const { data } = await supabase.from("syllabus_imports").select("id, status, error, result, program_id, saved").eq("id", imp.id).single();
      if (data) setImp(data);
    }, 2500);
    return () => clearInterval(t);
  }, [imp.id, imp.status]);

  if (imp.status === "failed") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          <XCircle className="size-10 text-destructive" />
          <h2 className="mt-3 font-semibold">We couldn&apos;t analyse this document yet.</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{imp.error ?? "Please try again, or create your syllabus manually."}</p>
          <div className="mt-5 flex gap-2">
            <Button asChild>
              <Link href="/subjects/import">
                <RotateCcw /> Try again
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/subjects/new">Create manually</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (imp.status !== "ready" || !imp.result) {
    const stage = STAGES[imp.status] ?? STAGES.processing;
    return (
      <Card>
        <CardContent className="py-10" aria-live="polite">
          <div className="mx-auto max-w-md text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <h2 className="mt-4 font-semibold">{stage.label}…</h2>
            <p className="mt-1 text-sm text-muted-foreground">This usually takes under a minute. You can leave this page — the import keeps running.</p>
            <Progress value={stage.pct} className="mt-5" aria-label="Import progress" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const extraction = imp.result as unknown as SyllabusExtraction;
  if (imp.saved) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <h2 className="mt-3 font-semibold">This syllabus has been saved.</h2>
          <Button asChild className="mt-5">
            <Link href="/subjects">Go to subjects</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (extraction.subjects.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <h2 className="font-semibold">No syllabus structure found</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{extraction.uncertainties[0] ?? "This document doesn't look like a syllabus."}</p>
          <Button asChild className="mt-5">
            <Link href="/subjects/import">Upload a different file</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <SyllabusEditor initial={draftFromExtraction(extraction)} aiGenerated uncertainties={extraction.uncertainties} importId={imp.id} programId={imp.program_id} />;
}
