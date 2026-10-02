"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Rocket, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { SyllabusUploader } from "@/components/subjects/syllabus-uploader";
import { ResourceUploader } from "@/components/resources/resource-uploader";
import { finishOnboarding, loadDemoWorkspace, saveOnboarding } from "@/lib/actions/onboarding";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type System = { id: string; name: string; country: string | null; category: string };
type Program = { id: string; name: string; education_system_id: string | null; levels: string[] };
type Template = { id: string; name: string; code: string | null; program_id: string | null };

const LEVELS = [
  { value: "university", label: "University" },
  { value: "ca", label: "CA" },
  { value: "acca", label: "ACCA" },
  { value: "cfa", label: "CFA" },
  { value: "mdcat", label: "MDCAT" },
  { value: "ecat", label: "ECAT" },
  { value: "css", label: "CSS" },
  { value: "a_level", label: "A-Level" },
  { value: "o_level", label: "O-Level" },
  { value: "other", label: "Other" },
] as const;
type Level = (typeof LEVELS)[number]["value"];

const TIME = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 240, label: "4+ hours" },
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STEP_TITLES = [
  "What should we call you?",
  "What are you studying for?",
  "Which programme or qualification?",
  "Which semester or level are you at?",
  "Which subjects are you taking?",
  "When are your exams?",
  "How much time can you study each day?",
  "Which days do you usually study?",
  "Upload your syllabus",
  "Upload existing study material",
];

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
      )}
    >
      {selected && <Check className="size-4" />}
      {children}
    </button>
  );
}

export function OnboardingWizard({ initialName, systems, programs, templates, hasSubjects }: { initialName: string; systems: System[]; programs: Program[]; templates: Template[]; hasSubjects: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  const [name, setName] = useState(initialName);
  const [level, setLevel] = useState<Level | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [customProgram, setCustomProgram] = useState("");
  const [currentLevel, setCurrentLevel] = useState("");
  const [chosenTemplates, setChosenTemplates] = useState<string[]>([]);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState("");
  const [examDates, setExamDates] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState(120);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [saved, setSaved] = useState<{ ids: string[] } | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const programOptions = useMemo(() => {
    const systemIds = new Set(systems.filter((s) => s.category === level || (level === "other" && false)).map((s) => s.id));
    return programs.filter((p) => !level || level === "other" || (p.education_system_id && systemIds.has(p.education_system_id)));
  }, [level, systems, programs]);
  const program = programs.find((p) => p.id === programId);
  const templateOptions = templates.filter((t) => programId && t.program_id === programId);
  const subjectList = [
    ...chosenTemplates.map((id) => ({ key: id, name: templates.find((t) => t.id === id)?.name ?? "" })),
    ...customSubjects.map((n) => ({ key: `custom:${n}`, name: n })),
  ];

  const canNext = [
    name.trim().length > 0,
    level !== null,
    true, // programme optional
    true, // level optional
    true, // subjects optional (a syllabus upload can create them)
    true,
    minutes > 0,
    days.length > 0,
    true,
    true,
  ][step];

  function next() {
    if (step === 7) {
      // Save profile, programme and subjects before the upload steps.
      start(async () => {
        const res = await saveOnboarding({
          full_name: name,
          education_level: level ?? "other",
          program_id: programId,
          custom_program: programId ? null : customProgram || null,
          current_level: currentLevel || null,
          template_subjects: chosenTemplates.map((id) => ({ id, exam_date: examDates[id] || null })),
          custom_subjects: customSubjects.map((n) => ({ name: n, exam_date: examDates[`custom:${n}`] || null })),
          daily_study_minutes: minutes,
          study_days: days,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (!res.ok) return void toast.error(res.error);
        setSaved({ ids: res.subjectIds });
        setStep(8);
      });
      return;
    }
    setStep((s) => Math.min(s + 1, 10));
  }

  function finish() {
    start(async () => {
      await finishOnboarding();
      router.push(importId ? `/subjects/import/${importId}` : "/dashboard");
      router.refresh();
    });
  }

  if (step === 10) {
    return (
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
            <Rocket className="size-8" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Your Study OS is ready.</h1>
          <p className="mt-2 max-w-md text-muted-foreground">
            {importId
              ? "Your syllabus is being organised — you'll review it next. After that, upload a past paper and generate your first study plan."
              : "Next: upload a past paper so Study OS can map questions to your topics, then generate your first study plan."}
            {uploadedCount > 0 && ` ${uploadedCount} resource${uploadedCount === 1 ? " is" : "s are"} being analysed in the background.`}
          </p>
          <Button size="lg" className="mt-8" onClick={finish} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {importId ? "Review my syllabus" : "Go to my dashboard"} <ArrowRight />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-2 space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Step {step + 1} of 10
          </span>
          {step < 8 && !hasSubjects && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-primary hover:underline"
              onClick={() =>
                start(async () => {
                  const res = await loadDemoWorkspace();
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Demo workspace loaded");
                  router.push("/dashboard");
                  router.refresh();
                })
              }
            >
              <Sparkles className="size-3.5" /> Explore with CA Pakistan demo data instead
            </button>
          )}
        </div>
        <Progress value={((step + 1) / 10) * 100} aria-label="Onboarding progress" />
      </div>

      <Card>
        <CardContent className="space-y-6 py-2">
          <h1 className="text-2xl font-semibold tracking-tight">{STEP_TITLES[step]}</h1>

          {step === 0 && (
            <div className="space-y-2">
              <Label htmlFor="ob-name">Your name</Label>
              <Input id="ob-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ayesha Khan" onKeyDown={(e) => e.key === "Enter" && canNext && next()} />
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Education level">
              {LEVELS.map((l) => (
                <Chip
                  key={l.value}
                  selected={level === l.value}
                  onClick={() => {
                    setLevel(l.value);
                    setProgramId(null);
                    setChosenTemplates([]);
                  }}
                >
                  {l.label}
                </Chip>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {programOptions.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Programme">
                  {programOptions.map((p) => {
                    const sys = systems.find((s) => s.id === p.education_system_id);
                    return (
                      <Chip
                        key={p.id}
                        selected={programId === p.id}
                        onClick={() => {
                          setProgramId(programId === p.id ? null : p.id);
                          setCustomProgram("");
                          setChosenTemplates([]);
                        }}
                      >
                        {p.name}
                        {sys && <span className="font-normal opacity-70">· {sys.name}</span>}
                      </Chip>
                    );
                  })}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ob-program">{programOptions.length ? "Not listed? Type it" : "Programme / qualification"}</Label>
                <Input
                  id="ob-program"
                  value={customProgram}
                  onChange={(e) => {
                    setCustomProgram(e.target.value);
                    if (e.target.value) setProgramId(null);
                  }}
                  placeholder="e.g. BBA (Hons), FSc Pre-Medical, CFA Level II"
                  maxLength={120}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {program && program.levels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {program.levels.map((l) => (
                    <Chip key={l} selected={currentLevel === l} onClick={() => setCurrentLevel(currentLevel === l ? "" : l)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ob-level">Semester, level or attempt</Label>
                <Input id="ob-level" value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)} placeholder="e.g. Semester 3, CAF, First attempt" maxLength={80} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              {templateOptions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">From the {program?.name} catalogue — chapters and topics included:</p>
                  <div className="flex flex-wrap gap-2">
                    {templateOptions.map((t) => (
                      <Chip key={t.id} selected={chosenTemplates.includes(t.id)} onClick={() => setChosenTemplates((c) => (c.includes(t.id) ? c.filter((x) => x !== t.id) : [...c, t.id]))}>
                        {t.name} {t.code && <span className="font-normal opacity-70">({t.code})</span>}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ob-subject">Add your own subjects</Label>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = newSubject.trim();
                    if (n && !customSubjects.includes(n)) setCustomSubjects((c) => [...c, n]);
                    setNewSubject("");
                  }}
                >
                  <Input id="ob-subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Cost & Management Accounting" maxLength={160} />
                  <Button type="submit" variant="outline" disabled={!newSubject.trim()}>
                    <Plus /> Add
                  </Button>
                </form>
                {customSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customSubjects.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                        {s}
                        <button type="button" aria-label={`Remove ${s}`} onClick={() => setCustomSubjects((c) => c.filter((x) => x !== s))}>
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Tip: you can also skip this and upload your syllabus in step 9 — Study OS will create the subjects for you.</p>
            </div>
          )}

          {step === 5 &&
            (subjectList.length ? (
              <ul className="space-y-3">
                {subjectList.map((s) => (
                  <li key={s.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Label htmlFor={`exam-${s.key}`} className="font-medium">
                      {s.name}
                    </Label>
                    <Input id={`exam-${s.key}`} type="date" value={examDates[s.key] ?? ""} onChange={(e) => setExamDates((d) => ({ ...d, [s.key]: e.target.value }))} className="sm:w-48" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No subjects yet — you can set exam dates after uploading your syllabus.</p>
            ))}

          {step === 6 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Daily study time">
              {TIME.map((t) => (
                <Chip key={t.minutes} selected={minutes === t.minutes} onClick={() => setMinutes(t.minutes)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          )}

          {step === 7 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Study days">
              {DAYS.map((d, i) => (
                <Chip key={d} selected={days.includes(i)} onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}>
                  {d}
                </Chip>
              ))}
            </div>
          )}

          {step === 8 &&
            (importId ? (
              <p className="flex items-center gap-2 rounded-xl bg-success/10 p-4 text-sm">
                <Check className="size-4 text-success" /> Got it — AI is organising your syllabus. You&apos;ll review it before anything is saved.
              </p>
            ) : (
              <SyllabusUploader programs={[]} defaultProgramId={programId} onDone={(id) => setImportId(id)} />
            ))}

          {step === 9 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Notes, PDFs, slides or photos of handwritten notes. Study OS links them to your topics automatically.</p>
              <ResourceUploader
                compact
                subjects={subjectList.map((s, i) => ({ id: saved?.ids[i] ?? "", name: s.name })).filter((s) => s.id)}
                onUploaded={(ids) => setUploadedCount((c) => c + ids.length)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || step === 8 || pending}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex gap-2">
          {step >= 8 && (
            <Button variant="ghost" onClick={() => setStep((s) => s + 1)} disabled={pending}>
              Skip
            </Button>
          )}
          <Button onClick={next} disabled={!canNext || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {step === 9 ? "Finish" : "Continue"} <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
