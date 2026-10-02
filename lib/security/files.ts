// Upload validation. Uploaded files are untrusted: we check declared type,
// size AND magic bytes, and never execute or render them as HTML.

export type FileKind = "pdf" | "docx" | "pptx" | "txt" | "image";

export const MIME_BY_KIND: Record<FileKind, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain", "text/markdown"],
  image: ["image/png", "image/jpeg", "image/webp"],
};

export const RESOURCE_KINDS: FileKind[] = ["pdf", "docx", "pptx", "txt", "image"];
export const PAPER_KINDS: FileKind[] = ["pdf", "image"];
export const SYLLABUS_KINDS: FileKind[] = ["pdf", "image", "txt", "docx"];

const EXT_KIND: Record<string, FileKind> = {
  pdf: "pdf", docx: "docx", pptx: "pptx", txt: "txt", md: "txt",
  png: "image", jpg: "image", jpeg: "image", webp: "image",
};

export function kindFromMime(mime: string): FileKind | null {
  for (const [kind, mimes] of Object.entries(MIME_BY_KIND) as [FileKind, string[]][]) {
    if (mimes.includes(mime)) return kind;
  }
  return null;
}

export function kindFromName(name: string): FileKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_KIND[ext] ?? null;
}

export function mimeFor(kind: FileKind, name: string): string {
  if (kind === "image") {
    const ext = name.split(".").pop()?.toLowerCase();
    return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  }
  if (kind === "txt") return name.toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain";
  return MIME_BY_KIND[kind][0];
}

/** Detect the real type from file contents. Returns null if it matches nothing we accept. */
export function sniffKind(bytes: Uint8Array): FileKind | "zip" | null {
  const b = bytes;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf"; // %PDF
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image"; // PNG
  if (starts(0xff, 0xd8, 0xff)) return "image"; // JPEG
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image"; // WEBP
  if (starts(0x50, 0x4b, 0x03, 0x04)) return "zip"; // DOCX/PPTX container
  // Plain text: no NUL bytes in the first 4 KB and mostly printable.
  const sample = b.subarray(0, 4096);
  if (sample.length === 0) return null;
  let printable = 0;
  for (const c of sample) {
    if (c === 0) return null;
    if (c === 9 || c === 10 || c === 13 || c >= 32) printable++;
  }
  return printable / sample.length > 0.95 ? "txt" : null;
}

export type ValidationResult = { ok: true; kind: FileKind; mime: string } | { ok: false; error: string };

export function validateUpload(
  file: { name: string; size: number; type: string },
  allowed: FileKind[],
  maxBytes: number,
): ValidationResult {
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  if (file.size > maxBytes) return { ok: false, error: `Files must be under ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  const kind = kindFromMime(file.type) ?? kindFromName(file.name);
  if (!kind || !allowed.includes(kind)) {
    return { ok: false, error: `Unsupported file type. Upload ${allowed.map((k) => k.toUpperCase()).join(", ")}.` };
  }
  return { ok: true, kind, mime: MIME_BY_KIND[kind].includes(file.type) ? file.type : mimeFor(kind, file.name) };
}

/** Server-side check that stored bytes really are what the record claims. */
export function contentMatchesKind(bytes: Uint8Array, kind: FileKind): boolean {
  const sniffed = sniffKind(bytes);
  if (kind === "docx" || kind === "pptx") return sniffed === "zip";
  return sniffed === kind;
}

/** Safe storage object name: no path traversal, limited charset, keeps extension. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^\.+/, "");
  return (cleaned || "file").slice(-100);
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled";
}
