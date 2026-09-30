"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/common/file-dropzone";
import { createClient } from "@/lib/supabase/client";
import { RESOURCE_KINDS, validateUpload } from "@/lib/security/files";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-client";

type Item = { file: File; state: "queued" | "uploading" | "processing" | "done" | "error"; error?: string; id?: string };

/**
 * Upload pipeline: (1) create record → (2) upload bytes to the student's private
 * storage folder → (3) server verifies + queues processing. The UI never waits for AI.
 */
export function ResourceUploader({
  subjects,
  defaultSubjectId,
  onUploaded,
  compact = false,
}: {
  subjects: { id: string; name: string }[];
  defaultSubjectId?: string | null;
  onUploaded?: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const busy = items.some((i) => i.state === "uploading" || i.state === "queued");

  async function uploadAll() {
    const queue: Item[] = files.map((file) => {
      const v = validateUpload(file, RESOURCE_KINDS, MAX_UPLOAD_BYTES);
      return v.ok ? { file, state: "queued" } : { file, state: "error", error: v.error };
    });
    setItems(queue);
    setFiles([]);
    const supabase = createClient();
    const ids: string[] = [];

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].state === "error") continue;
      const update = (patch: Partial<Item>) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
      update({ state: "uploading" });
      try {
        const f = queue[i].file;
        const res = await fetch("/api/resources", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file_name: f.name, mime_type: f.type, size: f.size, subject_id: subjectId || null }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const { error } = await supabase.storage.from("student-resources").upload(json.path, f, { contentType: json.mime });
        if (error) throw new Error("Upload failed. Try again.");
        const proc = await fetch(`/api/resources/${json.id}/process`, { method: "POST" });
        if (!proc.ok) throw new Error((await proc.json()).error);
        ids.push(json.id);
        update({ state: "processing", id: json.id });
      } catch (e) {
        update({ state: "error", error: (e as Error).message || "Upload failed. Try again." });
      }
    }
    if (ids.length) onUploaded?.(ids);
  }

  return (
    <div className="space-y-4">
      {subjects.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="upload-subject">Subject</Label>
          <select id="upload-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">Let Study OS suggest it</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <FileDropzone multiple accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp" files={files} onFiles={setFiles} hint={compact ? "PDF, DOCX, PPTX, TXT, images · 25 MB each" : "PDF, DOCX, PPTX, TXT or images · up to 25 MB each · scanned pages are OCR'd"} />
      {items.length > 0 && (
        <ul className="space-y-1.5" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
              {it.state === "error" ? (
                <XCircle className="size-4 shrink-0 text-destructive" />
              ) : it.state === "processing" || it.state === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
              <span className={it.state === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {it.state === "error" ? it.error : it.state === "processing" ? "Uploaded — analysing in background" : it.state === "uploading" ? "Uploading…" : "Waiting"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={uploadAll} disabled={busy || files.length === 0}>
        {busy && <Loader2 className="animate-spin" />} Upload {files.length > 1 ? `${files.length} files` : ""}
      </Button>
    </div>
  );
}
