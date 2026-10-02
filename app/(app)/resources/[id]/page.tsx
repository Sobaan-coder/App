import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Download, ExternalLink, Layers, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { NoteEditor } from "@/components/resources/note-editor";
import { RetryButton } from "@/components/resources/retry-button";
import { SuggestionReview } from "@/components/resources/suggestion-review";
import { RESOURCE_TYPE_META, STATUS_META } from "@/components/resources/resource-icons";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { youtubeId } from "@/lib/security/url";
import { BUCKETS, signedUrl } from "@/lib/storage";
import type { DocumentAnalysis } from "@/lib/ai/document-analyzer";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("resources").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Resource" };
}

const PROCESSING_STEPS = ["uploading", "processing", "analyzing", "ready"] as const;

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: r } = await supabase.from("resources").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!r) notFound();

  const [{ data: subjects }, { data: topics }, { data: links }, { data: chunks, count: chunkCount }] = await Promise.all([
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
    supabase.from("topics").select("id, name, subject_id, chapters(name)").eq("owner_id", user.id).is("parent_topic_id", null).order("sort_order"),
    supabase.from("topic_resource_links").select("topic_id, confidence, confirmed").eq("resource_id", id),
    supabase.from("resource_chunks").select("page_number, content", { count: "exact" }).eq("resource_id", id).order("chunk_index").limit(6),
  ]);

  const url = r.storage_path ? await signedUrl(supabase, BUCKETS.resources, r.storage_path, 600) : null;
  const meta = RESOURCE_TYPE_META[r.type];
  const status = STATUS_META[r.processing_status];
  const busy = ["uploading", "processing", "analyzing"].includes(r.processing_status);
  const analysis = (r.ai_analysis ?? null) as (Partial<DocumentAnalysis> & { ocr?: boolean }) | null;
  const yt = r.type === "youtube" && r.url ? youtubeId(r.url) : null;

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} intervalMs={3000} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Link href="/resources" className="text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
            Resources
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <meta.icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 break-words">{r.title}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {meta.label} · added {formatDateTime(r.created_at)}
            {r.page_count ? ` · ${r.page_count} page${r.page_count === 1 ? "" : "s"}` : ""}
            {r.size_bytes ? ` · ${(r.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.processing_status === "ready" && (
            <>
              <Button asChild>
                <Link href={`/tutor?resource=${r.id}`}>
                  <Sparkles /> Ask about this
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/flashcards?resource=${r.id}`}>
                  <Layers /> Make flashcards
                </Link>
              </Button>
            </>
          )}
          {url && (
            <Button asChild variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer" download>
                <Download /> Download
              </a>
            </Button>
          )}
          {r.url && (
            <Button asChild variant="outline">
              <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink /> Open link
              </a>
            </Button>
          )}
        </div>
      </div>

      {busy && (
        <Alert variant="info">
          <Loader2 className="animate-spin" />
          <AlertTitle>{status.label}…</AlertTitle>
          <AlertDescription>
            <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {PROCESSING_STEPS.map((s) => {
                const idx = PROCESSING_STEPS.indexOf(s);
                const cur = PROCESSING_STEPS.indexOf(r.processing_status as (typeof PROCESSING_STEPS)[number]);
                return (
                  <li key={s} className={idx <= cur ? "font-medium" : "opacity-50"}>
                    {idx + 1}. {STATUS_META[s].label}
                  </li>
                );
              })}
            </ol>
            <p>You can keep studying — this page updates automatically.</p>
          </AlertDescription>
        </Alert>
      )}
      {r.processing_status === "failed" && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t analyze this document yet.</AlertTitle>
          <AlertDescription>
            <p>{r.processing_error ?? "Something went wrong while processing."}</p>
            <div className="mt-2">
              <RetryButton endpoint={`/api/resources/${r.id}/process`} />
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          {r.type === "note" ? (
            <Card>
              <CardContent>
                <NoteEditor id={r.id} initialTitle={r.title} initialContent={r.content ?? ""} subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.name }))} subjectId={r.subject_id} />
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden py-0">
              {r.type === "pdf" && url ? (
                <iframe src={url} title={`Preview of ${r.title}`} className="h-[75dvh] w-full border-0 bg-muted" />
              ) : r.type === "image" && url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={r.title} className="max-h-[75dvh] w-full object-contain bg-muted" />
              ) : yt ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`}
                    title={r.title}
                    className="size-full border-0"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <CardContent className="py-5">
                  <p className="mb-3 text-sm font-medium">Extracted text{chunkCount ? ` (${chunkCount} sections)` : ""}</p>
                  {chunks?.length ? (
                    <div className="space-y-4">
                      {chunks.map((c, i) => (
                        <div key={i} className="rounded-xl bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                          {c.page_number && <span className="mb-1 block text-xs font-medium text-muted-foreground">Page {c.page_number}</span>}
                          {c.content.slice(0, 1500)}
                          {c.content.length > 1500 && "…"}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {r.type === "drive" ? "Google Drive files are private to Google, so Study OS keeps the link without reading it." : busy ? "Text will appear here once processing finishes." : "No text could be extracted."}
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {analysis && (analysis.definitions?.length || analysis.formulas?.length || analysis.questions?.length) ? (
            <Card>
              <CardHeader>
                <CardTitle>What&apos;s inside</CardTitle>
                <CardDescription>Detected by AI from your document{analysis.ocr ? " (text recognised from a scan)" : ""}. Page numbers refer to the original.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                {!!analysis.definitions?.length && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Definitions</h3>
                    <dl className="space-y-2">
                      {analysis.definitions.map((d, i) => (
                        <div key={i}>
                          <dt className="font-medium">
                            {d.term} {d.page && <span className="text-xs font-normal text-muted-foreground">p.{d.page}</span>}
                          </dt>
                          <dd className="text-muted-foreground">{d.definition}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {!!analysis.formulas?.length && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formulas</h3>
                    <ul className="space-y-1.5">
                      {analysis.formulas.map((f, i) => (
                        <li key={i}>
                          <span className="font-medium">{f.name}:</span> <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{f.expression}</code>
                          {f.page && <span className="ml-1 text-xs text-muted-foreground">p.{f.page}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!!analysis.examples?.length && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Worked examples</h3>
                    <ul className="list-disc space-y-1 pl-5">
                      {analysis.examples.map((e, i) => (
                        <li key={i}>
                          {e.title} {e.page && <span className="text-xs text-muted-foreground">p.{e.page}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!!analysis.questions?.length && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions found</h3>
                    <ul className="space-y-1.5">
                      {analysis.questions.map((q, i) => (
                        <li key={i} className="rounded-lg bg-muted/50 p-2">
                          {q.text} {q.page && <span className="text-xs text-muted-foreground">p.{q.page}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          {r.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>AI generated</CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed">{r.summary}</CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Organisation</CardTitle>
              <CardDescription>Which subject and syllabus topics this belongs to.</CardDescription>
            </CardHeader>
            <CardContent>
              <SuggestionReview
                resourceId={r.id}
                subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }))}
                topics={(topics ?? []).map((t) => ({ id: t.id, name: t.name, subject_id: t.subject_id, chapter: (t.chapters as { name: string } | null)?.name ?? "" }))}
                initialSubjectId={r.subject_id}
                suggestedSubjectId={r.suggested_subject_id}
                links={(links ?? []).map((l) => ({ topic_id: l.topic_id, confidence: l.confidence !== null ? Number(l.confidence) : null, confirmed: l.confirmed }))}
              />
            </CardContent>
          </Card>
          {r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <Badge key={t} variant="muted">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
          {r.processing_status === "ready" && (
            <p className="text-xs text-muted-foreground">
              Indexed into {chunkCount ?? 0} searchable sections{analysis?.ocr ? " using text recognition" : ""}.{" "}
              {r.storage_path && <RetryButton endpoint={`/api/resources/${r.id}/process`} label="Re-process" />}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
