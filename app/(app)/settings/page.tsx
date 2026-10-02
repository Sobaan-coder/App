import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppearanceCard, DataCard, ProfileForm } from "@/components/settings/settings-forms";
import { getProfile, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const profile = (await getProfile())!;
  const [{ data: program }, { count: demo }] = await Promise.all([
    supabase.from("student_programs").select("level, programs(name, education_system)").eq("user_id", user.id).eq("is_primary", true).maybeSingle(),
    supabase.from("subjects").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("template_id", "00000000-0000-4000-c000-000000000001"),
  ]);
  const prog = program?.programs as { name: string; education_system: string | null } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <ProfileForm
        email={user.email ?? ""}
        profile={{
          full_name: profile.full_name ?? "",
          education_level: profile.education_level,
          country: profile.country,
          current_level: profile.current_level,
          daily_study_minutes: profile.daily_study_minutes,
          study_days: profile.study_days,
          timezone: profile.timezone,
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>Programme</CardTitle>
          <CardDescription>{prog ? `${[prog.education_system, prog.name].filter(Boolean).join(" → ")}${program?.level ? ` · ${program.level}` : ""}` : "No programme selected."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/subjects/new">Add subjects from catalogue</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/subjects/import">Import a syllabus</Link>
          </Button>
        </CardContent>
      </Card>
      <AppearanceCard />
      <DataCard hasDemo={(demo ?? 0) > 0} />
    </div>
  );
}
