import { z } from "zod";
import { body, route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { AppError } from "@/lib/errors";
import { isValidTimezone } from "@/lib/time";

export const GET = route({}, async ({ user }) => {
  const profile = await withUser(user.id, (db) => getProfile(db));
  return { user, profile };
});

export const PATCH = route({ rateLimit: 30 }, async ({ req, user }) => {
  const p = await body(
    req,
    z.object({
      name: z.string().min(1).max(80).optional(),
      timezone: z.string().max(60).optional(),
      workStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      workEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      language: z.string().max(10).optional(),
      onboardingCompleted: z.boolean().optional(),
    }),
  );
  if (p.timezone && !isValidTimezone(p.timezone)) throw new AppError("Unknown timezone");
  return withUser(user.id, async (db) => {
    if (p.name) await db.query("update users set name = $2 where id = $1", [user.id, p.name]);
    await db.query(
      `update profiles set display_name = coalesce($2, display_name), timezone = coalesce($3, timezone), work_start = coalesce($4::time, work_start),
         work_end = coalesce($5::time, work_end), language = coalesce($6, language), onboarding_completed = coalesce($7, onboarding_completed)
       where user_id = $1`,
      [user.id, p.name ?? null, p.timezone ?? null, p.workStart ?? null, p.workEnd ?? null, p.language ?? null, p.onboardingCompleted ?? null],
    );
    return { profile: await getProfile(db) };
  });
});
