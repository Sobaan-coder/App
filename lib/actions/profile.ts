"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

const Profile = z.object({
  full_name: z.string().trim().min(1).max(120),
  education_level: z.enum(["university", "ca", "acca", "cfa", "mdcat", "ecat", "css", "a_level", "o_level", "college", "professional", "other"]).nullable(),
  country: z.string().trim().max(80).nullable(),
  current_level: z.string().trim().max(80).nullable(),
  daily_study_minutes: z.number().int().min(15).max(960),
  study_days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one study day").max(7),
  timezone: z.string().max(60),
});

export async function updateProfile(input: z.input<typeof Profile>) {
  const parsed = Profile.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid profile" };
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false as const, error: "Unknown timezone" };
  }
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ ...parsed.data, study_days: [...new Set(parsed.data.study_days)].sort() }).eq("id", user.id);
  if (error) return { ok: false as const, error: "Couldn't save your settings." };
  revalidatePath("/", "layout");
  return { ok: true as const };
}
