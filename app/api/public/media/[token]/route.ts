import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyMediaToken } from "@/services/content/posts";
import { readFileData, type FileRow } from "@/services/storage";

/**
 * Public, signed, expiring image URLs for platforms that fetch media by URL (Instagram, TikTok).
 * Only images, only via a signed 24h token.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const fileId = await verifyMediaToken(token);
  if (!fileId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = await sql.one<FileRow>("select * from files where id = $1", [fileId]);
  if (!f || !/^image\/(png|jpeg|webp)$/.test(f.mime)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(await readFileData(f)), { headers: { "content-type": f.mime, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
}
