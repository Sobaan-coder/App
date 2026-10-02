"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Loader2, Moon, Sparkles, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateProfile } from "@/lib/actions/profile";
import { loadDemoWorkspace } from "@/lib/actions/onboarding";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Profile = {
  full_name: string;
  education_level: string | null;
  country: string | null;
  current_level: string | null;
  daily_study_minutes: number;
  study_days: number[];
  timezone: string;
};

const LEVELS = [
  ["university", "University"], ["ca", "CA"], ["acca", "ACCA"], ["cfa", "CFA"], ["mdcat", "MDCAT"], ["ecat", "ECAT"], ["css", "CSS"],
  ["a_level", "A-Level"], ["o_level", "O-Level"], ["college", "College"], ["professional", "Professional certification"], ["other", "Other"],
] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const select = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile & study preferences</CardTitle>
        <CardDescription>Used by the planner, dashboard targets and the AI tutor&apos;s context.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await updateProfile({ ...p, education_level: (p.education_level || null) as never, country: p.country || null, current_level: p.current_level || null });
              if (!res.ok) return void toast.error(res.error);
              toast.success("Settings saved");
              router.refresh();
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-name">Name</Label>
              <Input id="st-name" value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-email">Email</Label>
              <Input id="st-email" value={email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-level">Education level</Label>
              <select id="st-level" value={p.education_level ?? ""} onChange={(e) => setP({ ...p, education_level: e.target.value || null })} className={select}>
                <option value="">Not set</option>
                {LEVELS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-current">Semester / level</Label>
              <Input id="st-current" value={p.current_level ?? ""} onChange={(e) => setP({ ...p, current_level: e.target.value })} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-country">Country</Label>
              <Input id="st-country" value={p.country ?? ""} onChange={(e) => setP({ ...p, country: e.target.value })} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-tz">Timezone</Label>
              <Input id="st-tz" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })} list="tz-list" />
              <datalist id="tz-list">
                {["Asia/Karachi", "Asia/Dubai", "Europe/London", "Asia/Kolkata", "America/New_York", "UTC"].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-minutes">Daily study time (minutes)</Label>
              <Input id="st-minutes" type="number" min={15} max={960} value={p.daily_study_minutes} onChange={(e) => setP({ ...p, daily_study_minutes: Number(e.target.value) })} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Study days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = p.study_days.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setP({ ...p, study_days: on ? p.study_days.filter((x) => x !== i) : [...p.study_days, i] })} className={cn("rounded-lg border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AppearanceCard() {
  const set = (dark: boolean) => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="outline" onClick={() => set(false)}>
          <Sun /> Light
        </Button>
        <Button variant="outline" onClick={() => set(true)}>
          <Moon /> Dark
        </Button>
      </CardContent>
    </Card>
  );
}

export function DataCard({ hasDemo }: { hasDemo: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>Your academic data is private to your account. Export it any time.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href="/api/account/export">
            <Download /> Export my data (JSON)
          </a>
        </Button>
        {!hasDemo && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await loadDemoWorkspace();
                if (!res.ok) return void toast.error(res.error);
                toast.success("CA Pakistan demo workspace added");
                router.push("/dashboard");
              })
            }
          >
            <Sparkles /> Add CA Pakistan demo workspace
          </Button>
        )}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" className="text-destructive">
              <Trash2 /> Delete account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>This permanently deletes your subjects, files, past papers, plans, progress and AI conversations. It can&apos;t be undone.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="del-confirm">Type DELETE to confirm</Label>
              <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={confirm !== "DELETE" || pending}
                onClick={() =>
                  start(async () => {
                    const res = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
                    if (!res.ok) return void toast.error((await res.json()).error);
                    window.location.href = "/";
                  })
                }
              >
                {pending && <Loader2 className="animate-spin" />} Delete everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
