"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createEducationSystem, createProgram, createTemplateSubject, deleteTemplateSubject } from "@/lib/actions/admin";
import { toast } from "sonner";

const select = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";
const LEVELS = ["university", "ca", "acca", "cfa", "mdcat", "ecat", "css", "a_level", "o_level", "college", "professional", "other"];

function useSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>, form: HTMLFormElement, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error((res as { error: string }).error);
      toast.success(msg);
      form.reset();
      router.refresh();
    });
  return { pending, submit };
}

export function CatalogueForms({ systems, programs }: { systems: { id: string; name: string }[]; programs: { id: string; name: string; system: string | null }[] }) {
  const sys = useSubmit();
  const prog = useSubmit();
  const subj = useSubmit();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Education system</CardTitle>
          <CardDescription>e.g. “CA Pakistan (ICAP)”, “Cambridge IGCSE”.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              sys.submit(() => createEducationSystem({ name: String(f.get("name")), country: (f.get("country") as string) || null, category: String(f.get("category")), description: (f.get("description") as string) || null }), e.currentTarget, "Education system added");
            }}
          >
            <div className="space-y-1.5"><Label htmlFor="es-name">Name</Label><Input id="es-name" name="name" required /></div>
            <div className="space-y-1.5"><Label htmlFor="es-country">Country</Label><Input id="es-country" name="country" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="es-cat">Category</Label>
              <select id="es-cat" name="category" className={select}>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="es-desc">Description</Label><Input id="es-desc" name="description" /></div>
            <Button type="submit" disabled={sys.pending}>{sys.pending && <Loader2 className="animate-spin" />} Add system</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Programme / qualification</CardTitle>
          <CardDescription>e.g. “CAF”, “BBA”, “Level I”.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              prog.submit(() => createProgram({ education_system_id: String(f.get("system")), name: String(f.get("name")), levels: String(f.get("levels") ?? "").split(",").map((s) => s.trim()).filter(Boolean), description: (f.get("description") as string) || null }), e.currentTarget, "Programme added");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pr-sys">Education system</Label>
              <select id="pr-sys" name="system" className={select} required>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="pr-name">Name</Label><Input id="pr-name" name="name" required /></div>
            <div className="space-y-1.5"><Label htmlFor="pr-levels">Levels (comma separated)</Label><Input id="pr-levels" name="levels" placeholder="Semester 1, Semester 2" /></div>
            <div className="space-y-1.5"><Label htmlFor="pr-desc">Description</Label><Input id="pr-desc" name="description" /></div>
            <Button type="submit" disabled={prog.pending}>{prog.pending && <Loader2 className="animate-spin" />} Add programme</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Template subject</CardTitle>
          <CardDescription>Students can add it in one click; they get a private, editable copy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              subj.submit(() => createTemplateSubject({ program_id: String(f.get("program")), name: String(f.get("name")), code: (f.get("code") as string) || null, outline: String(f.get("outline")) }), e.currentTarget, "Template subject added");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ts-prog">Programme</Label>
              <select id="ts-prog" name="program" className={select} required>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.system ? `${p.system} — ` : ""}{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div className="space-y-1.5"><Label htmlFor="ts-name">Name</Label><Input id="ts-name" name="name" required /></div>
              <div className="space-y-1.5"><Label htmlFor="ts-code">Code</Label><Input id="ts-code" name="code" /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ts-outline">Outline — one chapter per line</Label>
              <Textarea id="ts-outline" name="outline" required className="min-h-28 font-mono text-xs" placeholder={"IAS 16: Recognition, Depreciation, Revaluation\nIAS 36: Indicators, Recoverable amount, CGU"} />
            </div>
            <Button type="submit" disabled={subj.pending}>{subj.pending && <Loader2 className="animate-spin" />} Add subject</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete template ${name}`}
      disabled={pending}
      onClick={() =>
        confirm(`Delete template "${name}"? Students' existing copies are not affected.`) &&
        start(async () => {
          const res = await deleteTemplateSubject(id);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
