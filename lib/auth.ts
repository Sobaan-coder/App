import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/** The verified current user, or null. Cached per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** For pages/actions that require a session. Identity always comes from the verified JWT. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  return { user, supabase };
}

export const getProfile = cache(async (): Promise<Tables<"profiles"> | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});

export async function requireAdmin() {
  const ctx = await requireUser();
  const profile = await getProfile();
  if (!profile?.is_admin) redirect("/dashboard");
  return ctx;
}
