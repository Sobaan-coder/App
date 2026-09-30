import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getProfile, requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const profile = await getProfile();
  if (!profile?.onboarding_completed) redirect("/onboarding");

  return (
    <AppShell
      user={{
        name: profile.full_name || user.email?.split("@")[0] || "Student",
        email: user.email ?? "",
        isAdmin: profile.is_admin,
      }}
    >
      {children}
    </AppShell>
  );
}
