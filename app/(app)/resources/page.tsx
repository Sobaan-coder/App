import type { Metadata } from "next";
import { Suspense } from "react";
import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { AddResourceDialog } from "@/components/resources/add-resource-dialog";
import { ResourceFilters } from "@/components/resources/resource-filters";
import { ResourceCard } from "@/components/resources/resource-card";
import type { ResourceType } from "@/components/resources/resource-icons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Resources" };

const PAGE_SIZE = 24;
type Search = { q?: string; subject?: string; topic?: string; type?: string; from?: string; to?: string; page?: string; upload?: string };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ data: subjects }, { data: topics }] = await Promise.all([
    supabase.from("subjects").select("id, name, code").eq("owner_id", user.id).order("sort_order"),
    supabase.from("topics").select("id, name, subject_id").eq("owner_id", user.id).is("parent_topic_id", null).order("sort_order"),
  ]);

  let q = supabase
    .from("resources")
    .select("id, title, type, processing_status, processing_error, created_at, summary, tags, subject_id, suggested_subject_id", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.subject === "none") q = q.is("subject_id", null);
  else if (sp.subject) q = q.eq("subject_id", sp.subject);
  if (sp.type) q = q.eq("type", sp.type as ResourceType);
  if (sp.from) q = q.gte("created_at", sp.from);
  if (sp.to) q = q.lte("created_at", `${sp.to}T23:59:59`);
  if (sp.q) {
    // Only letters, numbers, spaces and dashes reach the PostgREST filter string.
    const term = sp.q.replace(/[^\p{L}\p{N}\s\-_]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (term) q = q.or(`title.ilike.%${term}%,tags.cs.{"${term.toLowerCase()}"}`);
  }
  if (sp.topic) {
    const { data: linked } = await supabase.from("topic_resource_links").select("resource_id").eq("topic_id", sp.topic);
    q = q.in("id", (linked ?? []).map((l) => l.resource_id).concat("00000000-0000-0000-0000-000000000000"));
  }
  const { data: resources, count } = await q;

  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.code || s.name]));
  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }));
  const processing = (resources ?? []).some((r) => ["uploading", "processing", "analyzing"].includes(r.processing_status));
  const hasFilters = Boolean(sp.q || sp.subject || sp.topic || sp.type || sp.from || sp.to);

  const makeHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "upload") as [string, string][]);
    params.set("page", String(p));
    return `/resources?${params}`;
  };

  return (
    <div>
      <PageHeader
        title="Resources"
        description="Your private library: notes, PDFs, slides, lectures and links — organised by subject and topic."
        actions={<AddResourceDialog subjects={subjectOptions} defaultSubjectId={sp.subject && sp.subject !== "none" ? sp.subject : null} defaultOpen={sp.upload === "1"} />}
      />
      <AutoRefresh active={processing} />
      <Suspense>
        <ResourceFilters subjects={subjectOptions} topics={topics ?? []} />
      </Suspense>
      {!resources?.length ? (
        hasFilters ? (
          <EmptyState icon={FolderOpen} title="No matching resources" description="Try a different filter or search term." />
        ) : (
          <EmptyState
            icon={FolderOpen}
            title="No resources yet."
            description="Upload your first study resource and Study OS will organize it for you."
            action={<AddResourceDialog subjects={subjectOptions} />}
          />
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{count} resource{count === 1 ? "" : "s"}</p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => (
              <ResourceCard
                key={r.id}
                subjects={subjectOptions}
                r={{
                  ...r,
                  subjectName: r.subject_id ? subjectName.get(r.subject_id) ?? null : null,
                  suggestedSubjectName: r.suggested_subject_id ? subjectName.get(r.suggested_subject_id) ?? null : null,
                }}
              />
            ))}
          </ul>
          <Pagination page={page} pageCount={Math.ceil((count ?? 0) / PAGE_SIZE)} makeHref={makeHref} />
        </>
      )}
    </div>
  );
}
