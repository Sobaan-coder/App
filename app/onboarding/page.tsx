import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getProfile, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up your Study OS" };

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  if (profile?.onboarding_completed) redirect("/dashboard");

  const [{ data: systems }, { data: programs }, { data: templates }, { data: existing }] = await Promise.all([
    supabase.from("education_systems").select("id, name, country, category").is("owner_id", null).order("name"),
    supabase.from("programs").select("id, name, education_system_id, levels").is("owner_id", null).order("name"),
    supabase.from("subjects").select("id, name, code, program_id").is("owner_id", null).order("name"),
    supabase.from("subjects").select("id, name").eq("owner_id", user.id),
  ]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_55%)]">
      <header className="px-6 py-5">
        <Logo href="/onboarding" />
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-16">
        <OnboardingWizard
          initialName={profile?.full_name ?? user.user_metadata?.full_name ?? ""}
          systems={systems ?? []}
          programs={programs ?? []}
          templates={templates ?? []}
          hasSubjects={(existing ?? []).length > 0}
        />
      </main>
    </div>
  );
}
