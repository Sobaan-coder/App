import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUserForApi } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/storage";

/** Permanently delete the signed-in student's account, files and data. Requires typing DELETE. */
export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const body = z.object({ confirm: z.literal("DELETE") }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  const { user, supabase } = auth;
  const admin = createAdminClient();
  // Remove stored files in the student's folders, then the auth user (cascades to all rows).
  for (const bucket of Object.values(BUCKETS)) {
    const paths: string[] = [];
    const walk = async (prefix: string) => {
      const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      for (const item of data ?? []) {
        const full = `${prefix}/${item.name}`;
        if (item.id) paths.push(full);
        else await walk(full);
      }
    };
    await walk(user.id);
    for (let i = 0; i < paths.length; i += 100) await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Couldn't delete your account. Try again." }, { status: 500 });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
