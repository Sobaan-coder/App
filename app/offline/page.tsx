import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <WifiOff className="mt-6 size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Study OS needs a connection to load your workspace. AI features, uploads and document processing only work online. Reconnect and try again.
      </p>
    </div>
  );
}
