import { query, route, pageParams } from "@/lib/api";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/activity";
import { FOLDERS, isFolder, MAX_UPLOAD_BYTES, saveFile } from "@/services/storage";
import { fireEvent } from "@/automations/service";

export const GET = route({}, async ({ req, user }) => {
  const { limit, offset } = pageParams(req, 100);
  const folder = query(req, "folder");
  const q = query(req, "q");
  const projectId = query(req, "projectId");
  const archived = query(req, "archived") === "1";
  const files = await withUser(user.id, (db) =>
    db.query(
      `select f.id, f.name, f.folder, f.mime, f.size_bytes, f.tags, f.source, f.archived, f.created_at, f.project_id, d.summary is not null as processed
       from files f left join documents d on d.file_id = f.id
       where ($1::text is null or f.folder = $1) and ($2::text is null or f.name ilike $2 or $3 = any(f.tags)) and ($4::uuid is null or f.project_id = $4) and f.archived = $5
       order by f.created_at desc limit $6 offset $7`,
      [folder ?? null, q ? `%${q.replace(/[%_]/g, "")}%` : null, q?.toLowerCase() ?? null, projectId ?? null, archived || folder === "archive", limit, offset],
    ),
  );
  return { files, folders: FOLDERS };
});

/** Multipart upload. Fires "file added" automations (e.g. Document Processor). */
export const POST = route({ rateLimit: 60 }, async ({ req, user }) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES * 1.1) throw new AppError("File is larger than 25 MB", 413);
  const form = await req.formData();
  const folderRaw = String(form.get("folder") ?? "uploads");
  const folder = isFolder(folderRaw) && folderRaw !== "archive" ? folderRaw : "uploads";
  const projectId = form.get("projectId") ? String(form.get("projectId")) : null;
  const files = form.getAll("file").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  if (!files.length) throw new AppError("No file received");
  const saved = [];
  for (const f of files.slice(0, 20)) {
    const data = Buffer.from(await f.arrayBuffer());
    const row = await withUser(user.id, async (db) => {
      const r = await saveFile(db, user.id, { name: f.name, folder, data, mime: f.type || undefined, source: "upload", projectId });
      await logActivity(db, { userId: user.id, category: "files", action: "file.uploaded", status: "success", message: `Uploaded ${r.name} to /${folder}` });
      return r;
    });
    saved.push({ id: row.id, name: row.name, folder: row.folder, size: Number(row.size_bytes) });
  }
  const runIds: string[] = [];
  for (const s of saved) runIds.push(...(await fireEvent(user.id, "file_added", { fileId: s.id, fileName: s.name, folder: s.folder })));
  return { files: saved, triggeredRuns: runIds };
});
