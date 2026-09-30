import type { Db } from "./db";

export interface Profile {
  user_id: string;
  display_name: string;
  timezone: string;
  language: string;
  work_start: string;
  work_end: string;
  onboarding_completed: boolean;
}

export async function getProfile(db: Db): Promise<Profile> {
  const p = await db.one<Profile>(
    "select user_id, display_name, timezone, language, to_char(work_start,'HH24:MI') as work_start, to_char(work_end,'HH24:MI') as work_end, onboarding_completed from profiles limit 1",
  );
  return (
    p ?? {
      user_id: "",
      display_name: "",
      timezone: process.env.DEFAULT_TIMEZONE || "UTC",
      language: "en",
      work_start: "09:00",
      work_end: "17:00",
      onboarding_completed: false,
    }
  );
}
