"use client";
import { useRef, useState } from "react";
import { Archive, FileText, FolderOpen, Pencil, Sparkles, Upload } from "lucide-react";
import { api, bytes, fmtDate, useApi } from "@/lib/client";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, cx, useToast } from "@/components/ui";

interface F {
  id: string;
  name: string;
  folder: string;
  mime: string;
  size_bytes: number;
  tags: string[];
  source: string;
  created_at: string;
  processed: boolean;
}

export default function FilesPage() {
  const toast = useToast();
  const [folder, setFolder] = useState("");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<F | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const files = useApi<{ files: F[]; folders: string[] }>(`/api/files?limit=200${folder ? `&folder=${folder}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, 15_000);
  const meta = useApi<{ document: { summary: string; key_points: string[]; action_items: string[]; word_count: number } | null }>(view ? `/api/files/${view.id}?meta=1` : null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    const form = new FormData();
    for (const f of Array.from(list)) form.append("file", f);
    form.append("folder", folder && folder !== "archive" ? folder : "uploads");
    try {
      const r = await api<{ files: unknown[]; triggeredRuns: string[] }>("/api/files", { form });
      toast(`Uploaded ${r.files.length} file(s)${r.triggeredRuns.length ? ` · ${r.triggeredRuns.length} automation(s) started` : ""}`, "ok");
      files.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setUploading(false);
    }
  };
  const patch = async (id: string, body: unknown) => {
    try {
      await api(`/api/files/${id}`, { method: "PATCH", body });
      files.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <div>
      <PageHeader
        title="Files"
        icon={<FileText className="h-6 w-6" />}
        subtitle="Upload, search, read, summarise, rename, move, tag and archive. Files are never deleted automatically."
        actions={
          <Button variant="primary" loading={uploading} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        }
      />
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        className={cx("mb-4 rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted transition", drag ? "border-accent bg-accent-soft/40" : "border-line")}
      >
        Drop PDFs, Word, Excel, CSV, text or images here (max 25 MB each). Uploading a PDF can trigger the Document Processor automation.
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search by name or tag…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={folder} onChange={(e) => setFolder(e.target.value)} className="sm:max-w-48">
          <option value="">All folders</option>
          {files.data?.folders.map((f) => (
            <option key={f} value={f}>
              /{f}
            </option>
          ))}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {files.data && !files.data.files.length && <Empty title="No files" icon={<FolderOpen className="h-5 w-5" />} />}
        <div className="divide-y divide-line">
          {files.data?.files.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setView(f)}>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-panel-2 text-[10px] font-bold uppercase text-muted">{f.name.split(".").pop()?.slice(0, 4)}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="flex flex-wrap gap-x-2 text-[11px] text-muted">
                    <span>/{f.folder}</span>
                    <span>{bytes(f.size_bytes)}</span>
                    <span>{fmtDate(f.created_at)}</span>
                    {f.processed && <span className="text-ok">summarised</span>}
                    {f.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </div>
              </button>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await api<{ runId: string }>(`/api/files/${f.id}/process`, { method: "POST" });
                    window.location.href = `/runs/${r.runId}`;
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Summarise
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const name = prompt("Rename to:", f.name);
                    if (name && name !== f.name) void patch(f.id, { name });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Select className="h-8 w-28 text-xs" value="" onChange={(e) => e.target.value && patch(f.id, { folder: e.target.value })} aria-label="Move to folder">
                  <option value="">Move…</option>
                  {files.data?.folders
                    .filter((x) => x !== f.folder)
                    .map((x) => (
                      <option key={x} value={x}>
                        /{x}
                      </option>
                    ))}
                </Select>
                {f.folder !== "archive" && (
                  <Button size="sm" variant="ghost" onClick={() => patch(f.id, { archived: true })} title="Archive">
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ""} wide>
        {view && (
          <div className="space-y-4">
            {/^image\/(png|jpeg|webp|gif)/.test(view.mime) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${view.id}?inline=1`} alt={view.name} className="max-h-96 rounded-xl border border-line" />
            )}
            <div className="flex flex-wrap gap-2">
              <a href={`/api/files/${view.id}`} className="rounded-xl border border-line px-3 py-2 text-sm hover:border-accent">
                Download
              </a>
              {view.mime === "application/pdf" && (
                <a href={`/api/files/${view.id}?inline=1`} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-3 py-2 text-sm hover:border-accent">
                  Open PDF
                </a>
              )}
              <Input
                placeholder="Tags (comma separated)"
                defaultValue={view.tags.join(", ")}
                className="max-w-xs"
                onBlur={(e) => patch(view.id, { tags: e.target.value.split(/[,\s]+/).filter(Boolean) })}
              />
            </div>
            {meta.data?.document ? (
              <div className="rounded-2xl bg-panel-2 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  Summary <Badge>{meta.data.document.word_count} words</Badge>
                </div>
                <Markdown>
                  {`${meta.data.document.summary}\n\n${meta.data.document.key_points.length ? `**Key points**\n${meta.data.document.key_points.map((k) => `- ${k}`).join("\n")}\n\n` : ""}${
                    meta.data.document.action_items.length ? `**Action items**\n${meta.data.document.action_items.map((k) => `- [ ] ${k}`).join("\n")}` : ""
                  }`}
                </Markdown>
              </div>
            ) : (
              <p className="text-sm text-muted">Not summarised yet — use “Summarise”.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
