"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { BarChart3, Check, CheckCircle2, Download, ExternalLink, ImagePlus, Pencil, RefreshCw, Send, TriangleAlert, X, XCircle, CalendarClock } from "lucide-react";
import { api, fmtDate, useApi } from "@/lib/client";
import { PLATFORM_LABEL, PostStatus, Thumb } from "@/components/post-bits";
import { Badge, Button, Card, CardHeader, Input, Label, Modal, StatusBadge, Textarea, cx, useToast } from "@/components/ui";

interface Caption {
  platform: string;
  title: string;
  caption: string;
  hashtags: string[];
  extra: { videoConcept?: string[]; tags?: string[] };
}
interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}
interface Data {
  post: {
    id: string;
    title: string;
    idea: string;
    status: string;
    platforms: string[];
    scheduled_at: string | null;
    brand_name: string | null;
    product_name: string | null;
    product_price: string | null;
    currency: string | null;
    content_category: string;
    image_prompt: { prompt?: string; negativePrompt?: string; template?: string; concept?: string; width?: number; height?: number; attempts?: { provider: string; ok: boolean; skipped?: boolean; message: string }[]; manual?: { url: string; steps: string[] } } | null;
    quality_report: { passed: boolean; checks: Check[]; questions: string[] } | null;
  };
  captions: Caption[];
  images: { id: string; file_id: string; provider: string; created_at: string }[];
  jobs: { platform: string; status: string; url: string | null; error: string | null; error_hint: string | null; attempts: number; published_at: string | null }[];
  analytics: { platform: string; available: boolean; reach: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; note: string | null; fetched_at: string }[];
  pendingApproval: { id: string } | null;
  capabilities: { platform: string; automation: string; note: string; account: { status: string; account_name: string } | null }[];
}

const CHECK_ICON = { pass: <CheckCircle2 className="h-4 w-4 text-ok" />, warn: <TriangleAlert className="h-4 w-4 text-warn" />, fail: <XCircle className="h-4 w-4 text-bad" /> };

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, reload } = useApi<Data>(`/api/content/posts/${id}`, 6000);
  const [editing, setEditing] = useState(false);
  const [caps, setCaps] = useState<Caption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [tab, setTab] = useState("instagram");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !editing) {
      setCaps(data.captions);
      if (!selected.length) setSelected(data.post.platforms);
      if (!data.captions.find((c) => c.platform === tab) && data.captions[0]) setTab(data.captions[0].platform);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editing]);

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  const { post } = data;
  const q = post.quality_report;
  const failing = q?.checks.filter((c) => c.status === "fail") ?? [];
  const image = data.images[0];
  const published = post.status === "published";

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const r = await api<{ runId?: string }>(`/api/content/posts/${id}/actions`, { body: { action, ...extra } });
      if (action === "approve_publish") toast("Approved — publishing to the selected platforms…", "ok");
      if (action === "regenerate" && r.runId) toast("Regenerating image & captions…", "info");
      if (action === "reject") toast("Rejected. Nothing was published.");
      reload();
      return r;
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const saveEdits = async () => {
    setBusy("save");
    try {
      await api(`/api/content/posts/${id}`, { method: "PATCH", body: { captions: caps.map((c) => ({ platform: c.platform, title: c.title, caption: c.caption, hashtags: c.hashtags })), platforms: selected } });
      setEditing(false);
      toast("Saved — quality checks re-run", "ok");
      reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const cap = caps.find((c) => c.platform === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/content" className="text-xs text-muted hover:text-ink">
          ← Content
        </Link>
        <PostStatus status={post.status} />
        {post.scheduled_at && <Badge tone="gold">Scheduled {fmtDate(post.scheduled_at)}</Badge>}
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{post.status === "approval" || post.status === "draft" ? "CONTENT READY" : post.title}</h1>
        <p className="text-sm text-muted">
          {post.title} · {post.brand_name} {post.product_name ? `· ${post.product_name}` : ""} · {post.content_category}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <Thumb fileId={image?.file_id ?? null} className="aspect-[4/5] w-full" />
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Image · {image?.provider ?? "none"}</span>
                {image && (
                  <a href={`/api/files/${image.file_id}`} className="text-accent">
                    Download
                  </a>
                )}
              </div>
              {!published && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" loading={busy === "regenerate_image"} onClick={() => act("regenerate_image")}>
                    <RefreshCw className="h-3.5 w-3.5" /> New image
                  </Button>
                  <Button size="sm" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" /> Replace image
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const form = new FormData();
                      form.append("file", f);
                      try {
                        await api(`/api/content/posts/${id}/image`, { form });
                        toast("Image replaced", "ok");
                        reload();
                      } catch (err) {
                        toast((err as Error).message, "bad");
                      }
                    }}
                  />
                </div>
              )}
              {post.image_prompt?.attempts?.filter((a) => !a.ok && !a.skipped).map((a) => (
                <div key={a.provider} className="rounded-lg bg-warn/10 p-2 text-[11px] text-warn">
                  {a.message}
                </div>
              ))}
            </div>
          </Card>
          {post.image_prompt?.prompt && (
            <Card>
              <CardHeader title="Image prompt" subtitle={`${post.image_prompt.template ?? ""} · ${post.image_prompt.width}×${post.image_prompt.height}`} />
              <div className="space-y-2 px-4 pb-4">
                <pre className="max-h-48 overflow-auto rounded-xl bg-panel-2 p-3 text-[11px] whitespace-pre-wrap scrollbar-thin">{post.image_prompt.prompt}</pre>
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(post.image_prompt!.prompt!);
                    toast("Prompt copied", "ok");
                  }}
                >
                  Copy prompt
                </Button>
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Manual Gemini workflow (free)</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    {(post.image_prompt.manual?.steps ?? []).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <a href="https://gemini.google.com" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent">
                    Open Gemini <ExternalLink className="h-3 w-3" />
                  </a>
                </details>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Captions"
              subtitle="Optimised separately for each platform."
              action={
                !published &&
                (editing ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" loading={busy === "save"} onClick={saveEdits}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> EDIT
                  </Button>
                ))
              }
            />
            <div className="flex gap-1 overflow-x-auto px-4 scrollbar-thin">
              {caps.map((c) => (
                <button key={c.platform} onClick={() => setTab(c.platform)} className={cx("shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium", tab === c.platform ? "bg-accent text-accent-ink" : "text-muted hover:bg-panel-2")}>
                  {PLATFORM_LABEL[c.platform]}
                </button>
              ))}
            </div>
            {cap && (
              <div className="space-y-3 p-4">
                {(cap.platform === "youtube" || editing) && (
                  <div>
                    <Label>{cap.platform === "youtube" ? "Title" : "Title (internal)"}</Label>
                    {editing ? <Input value={cap.title} onChange={(e) => setCaps(caps.map((c) => (c.platform === tab ? { ...c, title: e.target.value } : c)))} /> : <div className="text-sm font-medium">{cap.title}</div>}
                  </div>
                )}
                <div>
                  <Label hint={`${cap.caption.length} chars`}>{cap.platform === "youtube" ? "Description" : "Caption"}</Label>
                  {editing ? (
                    <Textarea rows={8} value={cap.caption} onChange={(e) => setCaps(caps.map((c) => (c.platform === tab ? { ...c, caption: e.target.value } : c)))} />
                  ) : (
                    <div className="rounded-xl bg-panel-2 p-3 text-sm whitespace-pre-wrap">{cap.caption}</div>
                  )}
                </div>
                <div>
                  <Label>Hashtags</Label>
                  {editing ? (
                    <Input value={cap.hashtags.join(" ")} onChange={(e) => setCaps(caps.map((c) => (c.platform === tab ? { ...c, hashtags: e.target.value.split(/\s+/).filter(Boolean) } : c)))} />
                  ) : (
                    <div className="text-sm text-accent">{cap.hashtags.join(" ")}</div>
                  )}
                </div>
                {cap.extra?.videoConcept && (
                  <div>
                    <Label>Video concept</Label>
                    <ul className="list-disc pl-5 text-xs text-muted">
                      {cap.extra.videoConcept.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          {q && (
            <Card>
              <CardHeader title={`Quality control — ${q.passed ? "passed" : "needs attention"}`} action={<Button size="sm" variant="ghost" loading={busy === "recheck"} onClick={() => act("recheck")}>Re-check</Button>} />
              <div className="space-y-1.5 px-4 pb-4">
                {q.checks.map((c) => (
                  <div key={c.name} className="flex gap-2 text-sm">
                    <span className="mt-0.5">{CHECK_ICON[c.status]}</span>
                    <span>
                      <b>{c.name}:</b> <span className="text-muted">{c.message}</span>
                    </span>
                  </div>
                ))}
                {q.questions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm">
                    <div className="mb-1 font-semibold text-warn">Questions for you</div>
                    <ul className="list-disc pl-5 text-muted">
                      {q.questions.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                    <Link href="/content/brands" className="mt-2 inline-block text-xs text-accent">
                      Update product info →
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Platforms" subtitle="Publishing only goes to the platforms you tick. Others get a manual package." />
            <div className="divide-y divide-line">
              {data.capabilities
                .filter((c) => post.platforms.includes(c.platform) || editing)
                .map((c) => {
                  const job = data.jobs.find((j) => j.platform === c.platform);
                  return (
                    <label key={c.platform} className="flex items-start gap-3 px-5 py-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={published}
                        checked={selected.includes(c.platform)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, c.platform] : selected.filter((x) => x !== c.platform))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {PLATFORM_LABEL[c.platform]}
                          {c.automation === "manual_only" ? <Badge tone="gold">manual</Badge> : c.account?.status === "connected" ? <Badge tone="ok">connected: {c.account.account_name}</Badge> : <Badge>not connected → manual package</Badge>}
                          {job && <StatusBadge status={job.status} />}
                        </div>
                        {job?.url && (
                          <a href={job.url} target="_blank" rel="noreferrer" className="text-xs text-accent">
                            View post
                          </a>
                        )}
                        {job?.status === "failed" && (
                          <div className="mt-1 text-xs text-bad">
                            Error: {job.error} {job.error_hint && <div className="text-muted">Recommended action: {job.error_hint}</div>} <div className="text-muted">Attempts: {job.attempts}</div>
                          </div>
                        )}
                        {job?.status === "manual_required" && <div className="mt-1 text-xs text-muted">{job.error_hint}</div>}
                      </div>
                    </label>
                  );
                })}
            </div>
          </Card>

          {!published && post.status !== "rejected" && (
            <Card className="sticky bottom-20 z-10 border-accent/30 p-4 lg:bottom-4">
              <div className="mb-3 text-sm font-semibold">{failing.length ? "Fix the failed checks before publishing." : "Content is ready. Publish?"}</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="success" loading={busy === "approve_publish"} disabled={!!failing.length || !selected.length} onClick={() => act("approve_publish", { platforms: selected })}>
                  <Send className="h-4 w-4" /> APPROVE & PUBLISH
                </Button>
                <Button onClick={() => setScheduleOpen(true)} disabled={!!failing.length}>
                  <CalendarClock className="h-4 w-4" /> Approve & schedule
                </Button>
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> EDIT
                </Button>
                <Button loading={busy === "regenerate"} onClick={() => act("regenerate")}>
                  <RefreshCw className="h-4 w-4" /> REGENERATE
                </Button>
                <Button variant="danger" loading={busy === "reject"} onClick={() => act("reject")}>
                  <X className="h-4 w-4" /> REJECT
                </Button>
                <a href={`/api/content/posts/${id}/package`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-4 text-sm hover:bg-panel-2">
                  <Download className="h-4 w-4" /> DOWNLOAD CONTENT PACKAGE
                </a>
              </div>
            </Card>
          )}
          {(published || post.status === "failed") && (
            <Card className="p-4">
              <div className="flex flex-wrap gap-2">
                <a href={`/api/content/posts/${id}/package`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-4 text-sm hover:bg-panel-2">
                  <Download className="h-4 w-4" /> Download content package
                </a>
                {post.status === "failed" && (
                  <Button variant="primary" onClick={() => act("approve_publish", { platforms: data.jobs.filter((j) => j.status === "failed").map((j) => j.platform) })}>
                    <Check className="h-4 w-4" /> Retry failed platforms
                  </Button>
                )}
                {published && (
                  <Button loading={busy === "fetch_analytics"} onClick={() => act("fetch_analytics")}>
                    <BarChart3 className="h-4 w-4" /> Refresh analytics
                  </Button>
                )}
              </div>
              {data.analytics.length > 0 && (
                <div className="mt-3 space-y-1 text-xs">
                  {data.analytics.slice(0, 5).map((a, i) => (
                    <div key={i}>
                      <b>{PLATFORM_LABEL[a.platform]}</b>:{" "}
                      {a.available ? `reach ${a.reach ?? "n/a"} · views ${a.views ?? "n/a"} · likes ${a.likes ?? "n/a"} · comments ${a.comments ?? "n/a"} · shares ${a.shares ?? "n/a"}` : <span className="text-muted">Data unavailable. {a.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Approve & schedule">
        <Label>Publish at</Label>
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <div className="mt-2 text-xs text-muted">Platforms: {selected.map((p) => PLATFORM_LABEL[p]).join(", ")}. The worker publishes at that time; your click counts as the approval.</div>
        <Button
          variant="primary"
          className="mt-4 w-full"
          disabled={!when}
          onClick={async () => {
            await act("schedule", { scheduledAt: new Date(when).toISOString(), platforms: selected });
            setScheduleOpen(false);
          }}
        >
          Schedule
        </Button>
      </Modal>
    </div>
  );
}
