"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Bot } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Input, Label } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/signup", { body: mode === "login" ? { email, password } : { email, password, name, timezone } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#8b6dff] to-[#4b2fd1] text-white shadow-lg">
            <Bot className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-bold tracking-wide">MY AI COMMAND CENTER</h1>
          <p className="mt-1 text-sm text-muted">{mode === "login" ? "Welcome back. Your digital employee is ready." : "Create your account. The first account becomes the admin."}</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-panel p-5 shadow-card">
          {mode === "signup" && (
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <div>
            <Label hint={mode === "signup" ? "(10+ characters, mixed)" : undefined}>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
          {error && <div className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</div>}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          {mode === "login" ? (
            <>
              First time here? <Link href="/signup" className="text-accent">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link href="/login" className="text-accent">Sign in</Link>
            </>
          )}
        </p>
        <p className="mt-6 text-center text-[11px] text-muted/80">$0-first · runs locally · your data stays yours</p>
      </div>
    </div>
  );
}
