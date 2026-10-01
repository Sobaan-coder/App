import { z } from "zod";
import { body, query, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/errors";
import { FOLDERS, getFile, moveFile, readFileData } from "@/services/storage";

// Types that are safe to show inline in the browser. Everything else downloads (prevents stored XSS via HTML/SVG uploads).
const INLINE_SAFE = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain|video\/mp4)$/;

export const GET = route<{ id: string }>({}, async ({ req, user, params }) => {
  const { file, data, doc } = await withUser(user.id, async (db) => {
    const file = await getFile(db, params.id);
    if (query(req, "meta")) {
      const doc = await db.one("select summary, key_points, action_items, word_count, processed_at, injection_flags from documents where file_id = $1", [file.id]);
      return { file, data: null, doc };
    }
    return { file, data: await readFileData(file), doc: null };
  });
  if (!data) return { file, document: doc };
  const inline = query(req, "inline") === "1" && INLINE_SAFE.test(file.mime);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": inline ? file.mime : file.mime.startsWith("text/") || /svg|html|xml|javascript/.test(file.mime) ? "application/octet-stream" : file.mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, max-age=300",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
});

/** Rename / move / tag / archive (files are never deleted automatically). */
export const PATCH = route<{ id: string }>({ rateLimit: 120 }, async ({ req, user, params }) => {
  const p = await body(req, z.object({ name: z.string().min(1).max(180).optional(), folder: z.enum(FOLDERS).optional(), tags: z.array(z.string().max(30)).max(30).optional(), projectId: z.string().uuid().nullable().optional(), archived: z.boolean().optional() }));
  return withUser(user.id, async (db) => {
    let file = await getFile(db, params.id);
    const folder = p.archived === true ? "archive" : p.archived === false && file.folder === "archive" ? "uploads" : p.folder;
    if (p.name || folder) file = await moveFile(db, file, { name: p.name, folder });
    if (p.tags) await db.query("update files set tags = $2 where id = $1", [file.id, p.tags.map((t) => t.toLowerCase())]);
    if (p.projectId !== undefined) await db.query("update files set project_id = $2 where id = $1", [file.id, p.projectId]);
    await logActivity(db, { userId: user.id, category: "files", action: "file.updated", message: `Updated ${file.name}${folder ? ` (/${folder})` : ""}` });
    return { file: await getFile(db, file.id) };
  });
});

export const DELETE = route<{ id: string }>({}, async () => {
  throw new AppError("Files are never deleted by the app. Archive the file instead (PATCH archived=true).", 405);
});
