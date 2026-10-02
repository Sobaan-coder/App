"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Plus, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/common/file-dropzone";
import { createClient } from "@/lib/supabase/client";
import { PAPER_KINDS, validateUpload } from "@/lib/security/files";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-client";

type Row = { name: string; state: "uploading" | "queued" | "error"; error?: string; id?: string };

export function PaperUploadDialog({ subjects, defaultSubjectId, defaultOpen = false }: { subjects: { id: string; name: string }[]; defaultSubjectId?: string | null; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [files, setFiles] = useState<File[]>([]);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? subjects[0]?.id ?? "");
  const [year, setYear] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const busy = rows.some((r) => r.state === "uploading");

  async function upload() {
    const supabase = createClient();
    setRows(files.map((f) => ({ name: f.name, state: "uploading" })));
    const pending = [...files];
    setFiles([]);
    for (let i = 0; i < pending.length; i++) {
      const f = pending[i];
      const set = (patch: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
      try {
        const v = validateUpload(f, PAPER_KINDS, MAX_UPLOAD_BYTES);
        if (!v.ok) throw new Error(v.error);
        const res = await fetch("/api/past-papers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file_name: f.name, mime_type: f.type, size: f.size, subject_id: subjectId, year: pending.length === 1 && year ? Number(year) : null }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const { error } = await supabase.storage.from("past-papers").upload(json.path, f, { contentType: json.mime });
        if (error) throw new Error("Upload failed. Try again.");
        const proc = await fetch(`/api/past-papers/${json.id}/process`, { method: "POST" });
        if (!proc.ok) throw new Error((await proc.json()).error);
        set({ state: "queued", id: json.id });
      } catch (e) {
        set({ state: "error", error: (e as Error).message || "Upload failed. Try again." });
      }
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Upload past paper
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload past papers</DialogTitle>
          <DialogDescription>PDFs, scans or phone photos. Study OS reads every question and maps it to your syllabus topics.</DialogDescription>
        </DialogHeader>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a subject with its syllabus first so questions can be mapped to topics.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div className="space-y-1.5">
                <Label htmlFor="pp-subject">Subject</Label>
                <select id="pp-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" required>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-year">Year</Label>
                <Input id="pp-year" type="number" inputMode="numeric" min={1950} max={2100} value={year} onChange={(e) => setYear(e.target.value)} placeholder="Auto" disabled={files.length > 1} />
              </div>
            </div>
            <FileDropzone multiple accept=".pdf,.png,.jpg,.jpeg,.webp" files={files} onFiles={setFiles} hint="PDF or images · up to 25 MB each" />
            {rows.length > 0 && (
              <ul className="space-y-1.5" aria-live="polite">
                {rows.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    {r.state === "error" ? <XCircle className="size-4 text-destructive" /> : r.state === "queued" ? <CheckCircle2 className="size-4 text-success" /> : <Loader2 className="size-4 animate-spin" />}
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className={r.state === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                      {r.state === "error" ? r.error : r.state === "queued" ? "Analysing in background" : "Uploading…"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              {rows.some((r) => r.state === "queued") && (
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Done
                </Button>
              )}
              <Button onClick={upload} disabled={busy || !files.length || !subjectId}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />} Upload & analyse
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
