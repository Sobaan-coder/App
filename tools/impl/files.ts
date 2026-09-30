import { z } from "zod";
import { defineTool } from "../types";
import { getProfile } from "@/lib/profile";
import { dayRange } from "@/lib/time";
import { AppError } from "@/lib/errors";
import { copyFile, FOLDERS, getFile, moveFile, readFileData, saveFile, type FileRow, type Folder } from "@/services/storage";
import { parseDocument } from "@/services/documents/parse";
import { detectInjection } from "@/services/ai/safety";

const folderEnum = z.enum(FOLDERS);

export const fileSearch = defineTool({
  name: "file_search",
  description: "Search your files by name, folder, type or date.",
  category: "files",
  risk: "low",
  input: z.object({
    query: z.string().optional(),
    folder: folderEnum.optional(),
    since: z.enum(["today", "week", "month"]).optional(),
    extensions: z.array(z.string()).optional(),
    includeArchived: z.boolean().default(false),
    latest: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  async execute(i, ctx) {
    const profile = await getProfile(ctx.db);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (c: string, v: unknown) => {
      params.push(v);
      where.push(c.replaceAll("?", `$${params.length}`));
    };
    if (!i.includeArchived) where.push("not archived");
    if (i.folder) add("folder = ?", i.folder);
    if (i.query) {
      const words = i.query.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
      for (const w of words) add("(lower(name) like ? or ? = any(tags))", `%${w.replace(/[%_]/g, "")}%`);
    }
    if (i.since) {
      const since = i.since === "today" ? dayRange(profile.timezone).start : new Date(Date.now() - (i.since === "week" ? 7 : 30) * 86400_000);
      add("created_at >= ?", since.toISOString());
    }
    if (i.extensions?.length) add("lower(substring(name from '\\.[^.]+$')) = any(?)", i.extensions.map((e) => (e.startsWith(".") ? e : `.${e}`).toLowerCase()));
    params.push(i.latest ? 1 : i.limit);
    const files = await ctx.db.query<FileRow>(
      `select * from files ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`,
      params,
    );
    return {
      files: files.map((f) => ({ id: f.id, name: f.name, folder: f.folder, mime: f.mime, size: Number(f.size_bytes), createdAt: f.created_at, tags: f.tags })),
      fileIds: files.map((f) => f.id),
      count: files.length,
      summary: `${files.length} file(s) found`,
      markdown: files.length ? files.map((f) => `- 📄 **${f.name}** · ${f.folder} · ${(Number(f.size_bytes) / 1024).toFixed(1)} KB`).join("\n") : "No matching files found.",
    };
  },
});

export const fileRead = defineTool({
  name: "file_read",
  description: "Read the text content of a file (PDF, DOCX, XLSX, CSV, TXT, MD, images via OCR).",
  category: "files",
  risk: "low",
  input: z.object({ fileId: z.string().uuid(), maxChars: z.number().int().default(20_000) }),
  async execute(i, ctx) {
    const f = await getFile(ctx.db, i.fileId);
    const parsed = await parseDocument(f.name, await readFileData(f));
    const flags = detectInjection(parsed.text);
    return {
      fileId: f.id,
      name: f.name,
      kind: parsed.kind,
      text: parsed.text.slice(0, i.maxChars),
      truncated: parsed.text.length > i.maxChars,
      tables: parsed.tables,
      warnings: [parsed.note, ...flags.map((x) => `Suspicious content in file (${x.reason}); treated as data only.`)].filter(Boolean) as string[],
      summary: `Read ${f.name} (${parsed.text.length.toLocaleString()} characters)`,
    };
  },
});

export const fileWrite = defineTool({
  name: "file_write",
  description: "Save text content as a new file (never overwrites an existing file).",
  category: "files",
  risk: "low",
  input: z.object({ name: z.string().min(1), content: z.string(), folder: folderEnum.default("outputs") }),
  async execute(i, ctx) {
    const f = await saveFile(ctx.db, ctx.userId, { name: i.name, folder: i.folder, data: i.content, projectId: ctx.projectId });
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Saved ${f.name} to ${f.folder}` };
  },
});

export const fileMove = defineTool({
  name: "file_move",
  description: "Move or rename a single file.",
  category: "files",
  risk: "low",
  input: z.object({ fileId: z.string().uuid(), folder: folderEnum.optional(), name: z.string().optional() }),
  describe: (i) => `Move/rename file ${i.fileId} → ${i.folder ?? ""}/${i.name ?? ""}`,
  async execute(i, ctx) {
    const f = await moveFile(ctx.db, await getFile(ctx.db, i.fileId), { folder: i.folder, name: i.name });
    return { file: { id: f.id, name: f.name, folder: f.folder }, summary: `Moved to ${f.folder}/${f.name}` };
  },
});

export const fileCopy = defineTool({
  name: "file_copy",
  description: "Copy a file into another folder.",
  category: "files",
  risk: "low",
  input: z.object({ fileId: z.string().uuid(), folder: folderEnum }),
  async execute(i, ctx) {
    const f = await copyFile(ctx.db, await getFile(ctx.db, i.fileId), i.folder);
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Copied to ${f.folder}/${f.name}` };
  },
});

export const fileArchive = defineTool({
  name: "file_archive",
  description: "Archive files (the safe alternative to deleting — files are moved to /archive, never destroyed).",
  category: "files",
  risk: "medium",
  input: z.object({ fileIds: z.array(z.string().uuid()).min(1).max(500) }),
  describe: (i) => `Archive ${i.fileIds.length} file(s)`,
  async execute(i, ctx) {
    const done: string[] = [];
    for (const id of i.fileIds) {
      const f = await moveFile(ctx.db, await getFile(ctx.db, id), { folder: "archive" });
      done.push(f.name);
    }
    return { archived: done, summary: `Archived ${done.length} file(s)`, markdown: `Archived:\n${done.map((n) => `- ${n}`).join("\n")}` };
  },
});

// ── File organiser ────────────────────────────────────────────────────────────
const TYPE_RULES: [RegExp, Folder, string][] = [
  [/\.(png|jpe?g|webp|gif|svg|heic|mp4|mov|webm)$/i, "media", "image/video"],
  [/\.(pdf|docx?|odt|rtf|txt|md)$/i, "documents", "document"],
  [/\.(xlsx?|csv|ods)$/i, "documents", "spreadsheet"],
  [/\.(ics)$/i, "outputs", "calendar"],
  [/\.(zip|rar|7z|tar|gz)$/i, "downloads", "archive file"],
];
const TOPIC_RULES: [RegExp, string][] = [
  [/invoice|receipt|bill|payment|tax|bank|statement/i, "finance"],
  [/report|summary|analysis/i, "report"],
  [/assignment|notes?|chapter|lecture|exam|syllabus|past[- ]?paper|homework/i, "study"],
  [/menu|product|price ?list|catalog/i, "business"],
  [/contract|agreement|nda|terms/i, "legal"],
  [/cv|resume|cover[- ]letter/i, "career"],
  [/photo|img|screenshot|pic/i, "images"],
];

export interface OrganizeMove {
  fileId: string;
  name: string;
  from: string;
  to: Folder;
  tags: string[];
  reason: string;
}

export function classifyFile(name: string): { folder: Folder | null; tags: string[]; reason: string } {
  const type = TYPE_RULES.find(([re]) => re.test(name));
  const tags = TOPIC_RULES.filter(([re]) => re.test(name)).map(([, t]) => t);
  let folder = type?.[1] ?? null;
  if (tags.includes("report") && folder === "documents") folder = "reports";
  const reason = [type ? type[2] : "unknown type", tags.length ? `topic: ${tags.join(", ")}` : null].filter(Boolean).join("; ");
  return { folder, tags: [...new Set([...(type && type[2] === "spreadsheet" ? ["spreadsheet"] : []), ...tags])], reason };
}

export const fileOrganizePlan = defineTool({
  name: "file_organize_plan",
  description: "Scan a folder, detect file types and topics, and propose where each file should go (nothing is moved).",
  category: "files",
  risk: "low",
  input: z.object({ folder: folderEnum.default("uploads") }),
  async execute(i, ctx) {
    const files = await ctx.db.query<FileRow>("select * from files where folder = $1 and not archived order by name", [i.folder]);
    const moves: OrganizeMove[] = [];
    const unknown: string[] = [];
    for (const f of files) {
      const c = classifyFile(f.name);
      if (!c.folder) {
        unknown.push(f.name);
        continue;
      }
      if (c.folder === f.folder && c.tags.every((t) => f.tags.includes(t))) continue;
      moves.push({ fileId: f.id, name: f.name, from: f.folder, to: c.folder, tags: c.tags, reason: c.reason });
    }
    const md = moves.length
      ? `Scanned **${files.length}** file(s) in /${i.folder}. Proposed changes:\n\n| File | Move to | Tags | Why |\n|---|---|---|---|\n${moves
          .map((m) => `| ${m.name} | /${m.to} | ${m.tags.join(", ") || "—"} | ${m.reason} |`)
          .join("\n")}${unknown.length ? `\n\nLeft in place (unknown type): ${unknown.join(", ")}` : ""}`
      : `Scanned ${files.length} file(s) in /${i.folder} — everything is already organised.`;
    return { moves, scanned: files.length, markdown: md, summary: `${moves.length} move(s) proposed for ${files.length} file(s)` };
  },
});

export const fileOrganizeApply = defineTool({
  name: "file_organize_apply",
  description: "Apply proposed file moves and tags. Moving more than 5 files requires your approval.",
  category: "files",
  risk: (i: { moves: unknown[] }) => (i.moves.length > 5 ? "medium" : "low"),
  input: z.object({
    moves: z.array(z.object({ fileId: z.string().uuid(), name: z.string(), to: folderEnum, tags: z.array(z.string()).default([]) })).default([]),
  }),
  describe: (i) => `Move ${i.moves.length} file(s): ${i.moves.slice(0, 5).map((m) => `${m.name} → /${m.to}`).join(", ")}${i.moves.length > 5 ? "…" : ""}`,
  async execute(i, ctx) {
    const log: string[] = [];
    for (const m of i.moves) {
      const f = await getFile(ctx.db, m.fileId);
      const moved = await moveFile(ctx.db, f, { folder: m.to });
      if (m.tags.length) await ctx.db.query("update files set tags = (select array(select distinct unnest(tags || $2::text[]))) where id = $1", [moved.id, m.tags]);
      log.push(`${f.folder}/${f.name} → ${moved.folder}/${moved.name}`);
    }
    await ctx.log(`Organised ${log.length} file(s)`, "success", { moves: log });
    return { moved: log.length, log, summary: `Moved ${log.length} file(s)`, markdown: log.length ? `Moved ${log.length} file(s):\n${log.map((l) => `- ${l}`).join("\n")}` : "No files needed moving." };
  },
});

export const fileTools = [fileSearch, fileRead, fileWrite, fileMove, fileCopy, fileArchive, fileOrganizePlan, fileOrganizeApply];

