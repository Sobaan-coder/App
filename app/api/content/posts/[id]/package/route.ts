import { route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { buildContentPackage } from "@/services/content/posts";

/** DOWNLOAD CONTENT PACKAGE (zip). Always available, even with no platform APIs. */
export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  const pkg = await withUser(user.id, (db) => buildContentPackage(db, params.id));
  return new Response(new Uint8Array(pkg.data), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${pkg.name.replace(/"/g, "")}"`, "cache-control": "no-store" },
  });
});
