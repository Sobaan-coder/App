"use client";
import { useId, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileDropzone({
  accept,
  files,
  onFiles,
  hint,
  multiple = false,
}: {
  accept: string;
  files: File[];
  onFiles: (files: File[]) => void;
  hint: string;
  multiple?: boolean;
}) {
  const id = useId();
  const [drag, setDrag] = useState(false);
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const dropped = Array.from(e.dataTransfer.files);
          onFiles(multiple ? [...files, ...dropped] : dropped.slice(0, 1));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-accent/40 focus-within:ring-[3px] focus-within:ring-ring/40",
          drag && "border-primary bg-accent/60",
        )}
      >
        <UploadCloud className="size-8 text-primary" aria-hidden="true" />
        <span className="mt-3 text-sm font-medium">Drop {multiple ? "files" : "a file"} here or tap to browse</span>
        <span className="mt-1 text-xs text-muted-foreground">{hint}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            onFiles(multiple ? [...files, ...picked] : picked.slice(0, 1));
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => onFiles(files.filter((_, j) => j !== i))} className="rounded-md p-1 hover:bg-muted" aria-label={`Remove ${f.name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
