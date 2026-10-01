import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { notFound } from "@/lib/errors";
import { connectMetaPage, type MetaPage } from "@/integrations/oauth";

/** "Select page" after Meta OAuth when you manage several Pages. */
export const POST = route({ rateLimit: 20 }, async ({ req, user }) => {
  const { pageId } = await body(req, z.object({ pageId: z.string().min(1) }));
  return withUser(user.id, async (db) => {
    const row = await db.one<{ credentials_encrypted: string }>("select credentials_encrypted from integrations where provider = 'meta'");
    const page = decryptJson<{ pages: MetaPage[] }>(row?.credentials_encrypted)?.pages.find((p) => p.id === pageId);
    if (!page) throw notFound("Page");
    await connectMetaPage(db, user.id, page);
    return { ok: true, page: page.name, instagram: Boolean(page.instagram_business_account) };
  });
});
