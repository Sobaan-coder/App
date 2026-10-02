"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addTemplateSubject } from "@/lib/actions/syllabus";
import { toast } from "sonner";

type System = { id: string; name: string; country: string | null; category: string };
type Program = { id: string; name: string; education_system_id: string | null };
type Template = { id: string; name: string; code: string | null; program_id: string | null; chapters: number; added: boolean };

export function CatalogueBrowser({ systems, programs, templates }: { systems: System[]; programs: Program[]; templates: Template[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [exam, setExam] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const groups = useMemo(() => {
    const term = q.toLowerCase();
    return systems
      .map((s) => ({
        system: s,
        programs: programs
          .filter((p) => p.education_system_id === s.id)
          .map((p) => ({ program: p, subjects: templates.filter((t) => t.program_id === p.id && (!term || `${t.name} ${t.code} ${p.name} ${s.name}`.toLowerCase().includes(term))) }))
          .filter((p) => p.subjects.length > 0),
      }))
      .filter((g) => g.programs.length > 0);
  }, [q, systems, programs, templates]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subjects, e.g. FAR, Biology, Economics" className="pl-9" aria-label="Search catalogue" />
      </div>
      {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches. Create the subject manually or import your syllabus.</p>}
      {groups.map(({ system, programs }) => (
        <section key={system.id} className="space-y-3">
          <h2 className="text-sm font-semibold">
            {system.name} {system.country && <span className="font-normal text-muted-foreground">· {system.country}</span>}
          </h2>
          {programs.map(({ program, subjects }) => (
            <div key={program.id} className="rounded-2xl border bg-card">
              <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{program.name}</p>
              <ul className="divide-y">
                {subjects.map((t) => (
                  <li key={t.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {t.name} {t.code && <Badge variant="secondary">{t.code}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.chapters} chapters with topics</p>
                    </div>
                    {t.added ? (
                      <Badge variant="success">
                        <Check /> Added
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          aria-label={`Exam date for ${t.name} (optional)`}
                          value={exam[t.id] ?? ""}
                          onChange={(e) => setExam((x) => ({ ...x, [t.id]: e.target.value }))}
                          className="h-9 w-40"
                        />
                        <Button
                          size="sm"
                          disabled={busy === t.id}
                          onClick={() => {
                            setBusy(t.id);
                            start(async () => {
                              const res = await addTemplateSubject(t.id, exam[t.id] || null);
                              setBusy(null);
                              if (!res.ok) return void toast.error(res.error);
                              toast.success(`${t.name} added`);
                              router.push(`/subjects/${res.subjectId}`);
                            });
                          }}
                        >
                          {busy === t.id ? <Loader2 className="animate-spin" /> : <Plus />} Add
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
