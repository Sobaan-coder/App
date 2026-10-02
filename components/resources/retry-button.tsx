"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RetryButton({ endpoint, label = "Try again" }: { endpoint: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(endpoint, { method: "POST" });
        setBusy(false);
        if (!res.ok) return void toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't retry.");
        toast.success("Processing restarted");
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {label}
    </Button>
  );
}
