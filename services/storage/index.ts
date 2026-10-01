import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { Db } from "@/lib/db";

export const FOLDERS = [
  "uploads",
  "documents",
  "reports",
  "outputs",
  "projects",
  "tasks",
  "templates",
  "media",
  "downloads",
  "logs",
  "archive",
] as const;
export type Folder = (typeof FOLDERS)[number];

export interface FileRow {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  folder: string;
  storage_path: string;
  mime: string;
  size_bytes: string | number;
  sha256: string | null;
  tags: string[];
  source: string;
  archived: boolean;
  created_at: string;
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".html": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".zip": "application/zip",
  ".ics": "text/calendar",
};

export function mimeFor(name: string): string {
  return MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

export function isFolder(v: string): v is Folder {
  return (FOLDERS as readonly string[]).includes(v);
}

/** Strip path components and unsafe characters from a user-supplied filename. */
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).normalize("NFKC");
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 180);
}

function root(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env().STORAGE_DIR);
}

/** Absolute path for a storage-relative path, refusing anything that escapes the storage root. */
export function absolutePath(storagePath: string): string {
  const r = root();
  const abs = path.resolve(/* turbopackIgnore: true */ r, storagePath);
  if (abs !== r && !abs.startsWith(r + path.sep)) throw new AppError("Invalid file path", 400, "bad_path");
  return abs;
}

async function uniqueRelPath(userId: string, folder: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? name : `${stem} (${i})${ext}`;
    const rel = path.join("users", userId, folder, candidate);
    try {
      await fs.access(absolutePath(rel));
    } catch {
      return rel;
    }
  }
  throw new AppError("Could not allocate a file name");
}

export interface SaveFileInput {
  name: string;
  folder: Folder;
  data: Buffer | string;
  mime?: string;
  source?: "upload" | "generated" | "browser";
  projectId?: string | null;
  tags?: string[];
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function saveFile(db: Db, userId: string, input: SaveFileInput): Promise<FileRow> {
  const buf = typeof input.data === "string" ? Buffer.from(input.data, "utf8") : input.data;
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("File is larger than 25 MB");
  const name = safeFileName(input.name);
  const rel = await uniqueRelPath(userId, input.folder, name);
  const abs = absolutePath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  const row = await db.one<FileRow>(
    `insert into files(user_id, project_id, name, folder, storage_path, mime, size_bytes, sha256, tags, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [
      userId,
      input.projectId ?? null,
      path.basename(rel),
      input.folder,
      rel,
      input.mime ?? mimeFor(name),
      buf.length,
      sha256(buf),
      input.tags ?? [],
      input.source ?? "generated",
    ],
  );
  return row!;
}

export async function readFileData(file: Pick<FileRow, "storage_path">): Promise<Buffer> {
  return fs.readFile(absolutePath(file.storage_path));
}

export async function getFile(db: Db, id: string): Promise<FileRow> {
  const f = await db.one<FileRow>("select * from files where id = $1", [id]);
  if (!f) throw new AppError("File not found", 404, "not_found");
  return f;
}

/** Move and/or rename a file on disk and in the DB. Never overwrites: picks a unique name. */
export async function moveFile(db: Db, file: FileRow, opts: { folder?: Folder; name?: string }): Promise<FileRow> {
  const folder = opts.folder ?? (file.folder as Folder);
  const name = safeFileName(opts.name ?? file.name);
  if (folder === file.folder && name === file.name) return file;
  const rel = await uniqueRelPath(file.user_id, folder, name);
  const abs = absolutePath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.rename(absolutePath(file.storage_path), abs);
  const row = await db.one<FileRow>(
    "update files set folder=$2, name=$3, storage_path=$4, archived = ($2 = 'archive') where id=$1 returning *",
    [file.id, folder, path.basename(rel), rel],
  );
  return row!;
}

export async function copyFile(db: Db, file: FileRow, folder: Folder): Promise<FileRow> {
  const data = await readFileData(file);
  return saveFile(db, file.user_id, {
    name: file.name,
    folder,
    data,
    mime: file.mime,
    source: file.source as "upload",
    projectId: file.project_id,
    tags: file.tags,
  });
}

export async function storageWritable(): Promise<boolean> {
  try {
    await fs.mkdir(root(), { recursive: true });
    const probe = path.join(root(), ".probe");
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}
