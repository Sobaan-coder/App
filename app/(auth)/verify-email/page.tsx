"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function VerifyEmail() {
  const email = useSearchParams().get("email") ?? "";
  const [sending, setSending] = useState(false);
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MailCheck className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <span className="font-medium text-foreground">{email || "your email"}</span>. Open it on this device to finish setting up.
        </p>
      </div>
      {email && (
        <Button
          variant="outline"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            const { error } = await createClient().auth.resend({
              type: "signup",
              email,
              options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
            });
            setSending(false);
            if (error) toast.error("Couldn't resend right now. Please wait a minute.");
            else toast.success("Verification email sent again.");
          }}
        >
          Resend email
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Wrong address? <Link href="/signup" className="font-medium text-primary hover:underline">Sign up again</Link>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
