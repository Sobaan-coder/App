"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

export async function setPlanSessionStatus(id: string, status: "planned" | "done" | "skipped") {
  if (!z.guid().safeParse(id).success) return { ok: false as const, error: "Invalid session" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("study_plan_sessions")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("study_plan_id")
    .single();
  if (error) return { ok: false as const, error: "Couldn't update the session." };
  for (const p of ["/dashboard", "/study", "/planner", `/planner/${data.study_plan_id}`, "/calendar"]) revalidatePath(p);
  return { ok: true as const, planId: data.study_plan_id };
}
