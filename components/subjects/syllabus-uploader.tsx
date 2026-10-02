"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp, Loader2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileDropzone } from "@/components/common/file-dropzone";
import { uploadToStorage } from "@/lib/upload-client";
import { SYLLABUS_KINDS } from "@/lib/security/files";

export function SyllabusUploader({ programs, defaultProgramId, onDone }: { programs: { id: string; name: string; system: string | null }[]; defaultProgramId?: string | null; onDone?: (id: string) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [stage, setStage] = useState<"idle" | "uploading" | "starting">("idle");
  const [error, setError] = useState<string | null>(null);

  async function start(mode: "file" | "text") {
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "file") {
        if (!file) return setError("Choose a file first.");
        setStage("uploading");
        const up = await uploadToStorage("student-resources", "syllabus", file, SYLLABUS_KINDS);
        body = { storage_path: up.path };
      } else {
        body = { text };
      }
      setStage("starting");
      const res = await fetch("/api/syllabus/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, program_id: programId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (onDone) onDone(json.id);
      else router.push(`/subjects/import/${json.id}`);
    } catch (e) {
      setError((e as Error).message || "Upload failed. Try again.");
      setStage("idle");
    }
  }

  const busy = stage !== "idle";
  return (
    <div className="space-y-4">
      {programs.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="program">Programme (optional)</Label>
          <select id="program" value={programId} onChange={(e) => setProgramId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">Not specified</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.system ? `${p.system} — ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="file">
        <TabsList>
          <TabsTrigger value="file">
            <FileUp /> Upload file
          </TabsTrigger>
          <TabsTrigger value="text">
            <Type /> Paste text
          </TabsTrigger>
        </TabsList>
        <TabsContent value="file" className="space-y-4">
          <FileDropzone
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.md"
            files={file ? [file] : []}
            onFiles={(f) => setFile(f[0] ?? null)}
            hint="PDF, photo of the syllabus, DOCX or TXT · up to 25 MB"
          />
          <Button onClick={() => start("file")} disabled={busy || !file} className="w-full sm:w-auto">
            {busy && <Loader2 className="animate-spin" />}
            {stage === "uploading" ? "Uploading…" : stage === "starting" ? "Starting analysis…" : "Organise my syllabus"}
          </Button>
        </TabsContent>
        <TabsContent value="text" className="space-y-4">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your course outline or syllabus here…" className="min-h-48" aria-label="Syllabus text" />
          <Button onClick={() => start("text")} disabled={busy || text.trim().length < 40} className="w-full sm:w-auto">
            {busy && <Loader2 className="animate-spin" />} Organise my syllabus
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
