import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BarChart3, BookOpenCheck, Brain, CalendarRange, Check, FileQuestion, FileText, Flame, FolderOpen,
  GraduationCap, Layers, MessageSquare, Repeat, Search, ShieldCheck, Sparkles, Target, Upload,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Study OS — Your entire academic life. One operating system.",
};

const FRAGMENTS = ["WhatsApp groups", "Google Drive", "PDFs", "YouTube", "Handwritten notes", "LMS portal", "Past papers", "Academy notes", "Deadlines"];

const STEPS = [
  { icon: Upload, title: "Upload your syllabus", body: "PDF, photo or pasted text. AI turns it into subjects, chapters and topics — you review before it's saved." },
  { icon: FolderOpen, title: "Drop in your material", body: "Notes, slides, scans, lecture links. Study OS reads them and links each one to the right topics." },
  { icon: FileQuestion, title: "Add past papers", body: "Every question is detected and mapped to your syllabus, with a confidence score you can correct." },
  { icon: CalendarRange, title: "Get your plan", body: "“I have 3 days before FAR” → a realistic schedule built from your syllabus, papers and weak topics." },
];

const SYSTEMS = ["University", "CA", "ACCA", "CFA", "MDCAT", "ECAT", "CSS", "A-Level", "O-Level", "College", "Professional certifications"];

const FAQ = [
  { q: "Is my data private?", a: "Yes. Every syllabus, file, note, past paper, plan and AI conversation is isolated to your account with database row-level security and private file storage. Admins cannot open your documents." },
  { q: "Does the AI make things up?", a: "The tutor answers from your own uploaded material first and cites the file and page. When something isn't in your materials it says so, and anything from general knowledge is labelled as such. It never invents past-paper questions or page numbers." },
  { q: "Will it tell me what's coming in my exam?", a: "No — nobody can. It shows what has historically appeared in the papers you uploaded, so you can prioritise sensibly." },
  { q: "Which exams does it support?", a: "Any. Study OS isn't hardcoded to one system: university courses, CA, ACCA, CFA, MDCAT, ECAT, CSS, A/O-Levels and professional certifications all work — upload your syllabus and go." },
  { q: "Can I use it on my phone?", a: "Yes. It's fully responsive and installable as an app on Android and iOS. AI features need an internet connection." },
];

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-lg text-muted-foreground text-pretty">{body}</p>}
    </div>
  );
}

function Feature({ icon: Icon, eyebrow, title, body, bullets, visual, reverse }: { icon: typeof Brain; eyebrow: string; title: string; body: string; bullets: string[]; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : undefined}>
        <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
          <Icon className="size-4" /> {eyebrow}
        </div>
        <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h3>
        <p className="mt-3 text-muted-foreground">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>{visual}</div>
    </div>
  );
}

function MockCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-card p-5 shadow-[0_20px_60px_-24px_rgba(40,30,120,0.35)] ${className}`}>{children}</div>;
}

export default async function LandingPage() {
  const user = await getUser();
  const cta = user ? "/dashboard" : "/signup";

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Site" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={cta}>{user ? "Open Study OS" : "Get started"}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--accent),transparent)]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <Sparkles className="size-3.5 text-primary" /> AI study planner · past-paper mapper · personal tutor
            </p>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-7xl">STUDY OS</h1>
            <p className="mx-auto mt-4 max-w-2xl text-2xl font-medium tracking-tight text-balance sm:text-3xl">Your entire academic life. One operating system.</p>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              Upload your syllabus, organize your materials, analyze past papers and let AI build your study plan.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={cta}>
                  Build My Study OS <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">See How It Works</a>
              </Button>
            </div>

            {/* Product preview */}
            <div className="mx-auto mt-16 max-w-5xl text-left">
              <div className="rounded-3xl border bg-card/80 p-3 shadow-[0_40px_120px_-40px_rgba(40,30,120,0.45)] backdrop-blur">
                <div className="grid gap-3 rounded-2xl bg-background p-4 sm:grid-cols-3 sm:p-6">
                  <div className="space-y-3 sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Wednesday</p>
                    <p className="text-xl font-semibold">Good morning, Ayesha</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[["Today's target", "2h 30m"], ["Progress", "42%"], ["FAR exam", "3 days"]].map(([k, v]) => (
                        <div key={k} className="rounded-xl border bg-card p-3">
                          <p className="text-[11px] text-muted-foreground">{k}</p>
                          <p className={`mt-1 text-lg font-semibold ${k === "FAR exam" ? "text-destructive" : ""}`}>{v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border bg-card p-3">
                      <p className="text-sm font-medium">Today&apos;s tasks</p>
                      {["IAS 16 revision", "Past Paper 2024 Q3", "Watch lecture", "Practice 10 questions"].map((t, i) => (
                        <p key={t} className="mt-2 flex items-center gap-2 text-sm">
                          <span className={`flex size-4 items-center justify-center rounded border ${i === 0 ? "border-primary bg-primary text-primary-foreground" : ""}`}>{i === 0 && <Check className="size-3" />}</span>
                          <span className={i === 0 ? "text-muted-foreground line-through" : ""}>{t}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-card p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Flame className="size-3.5 text-destructive" /> Weak topics
                      </p>
                      {[["Depreciation", 72], ["Revaluation", 64], ["Impairment", 58]].map(([t, v]) => (
                        <div key={t as string} className="mt-2.5">
                          <p className="text-xs">{t}</p>
                          <div className="mt-1 h-1.5 rounded-full bg-muted">
                            <div className="h-full rounded-full bg-destructive/70" style={{ width: `${v}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-accent/60 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Sparkles className="size-3.5 text-primary" /> Recommendation
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">You have 3 days before FAR. Based on your syllabus, past papers and progress, prioritise these 5 topics.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="border-y bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="The problem" title="Your studies are scattered across nine places" body="Students juggle group chats, drives, PDFs, videos, notebooks, portals and loose past papers — and still don't know what to study next." />
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
              {FRAGMENTS.map((f) => (
                <span key={f} className="rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
                  {f}
                </span>
              ))}
            </div>
            <p className="mt-8 text-center text-lg font-medium">
              Study OS brings it all into one intelligent workspace that understands <span className="text-primary">your</span> syllabus.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="How Study OS works" title="From syllabus to a personal plan in minutes" />
            <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border bg-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <s.icon className="size-5" />
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 space-y-28 border-t bg-muted/20 py-24">
          <div className="mx-auto max-w-6xl space-y-28 px-4 sm:px-6">
            <Feature
              icon={BookOpenCheck}
              eyebrow="Syllabus intelligence"
              title="Your syllabus, organised automatically"
              body="Upload the official outline and Study OS extracts subjects, chapters, topics, subtopics, learning objectives and weightages."
              bullets={["Works with PDFs, photos and pasted text", "Confidence flags on anything the AI isn't sure about", "Review and edit everything before saving"]}
              visual={
                <MockCard>
                  <p className="text-xs font-medium text-muted-foreground">FAR</p>
                  {[["IAS 16", ["Recognition", "Initial Measurement", "Depreciation", "Revaluation", "Derecognition"]], ["IAS 36", ["Impairment Indicators", "Recoverable Amount", "CGU"]], ["IAS 38", ["Recognition", "Measurement", "Research vs Development"]]].map(([ch, ts]) => (
                    <div key={ch as string} className="mt-3">
                      <p className="text-sm font-semibold">{ch}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(ts as string[]).map((t) => (
                          <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="mt-4 rounded-lg bg-accent/70 px-3 py-2 text-xs text-accent-foreground">AI generated — review before saving.</p>
                </MockCard>
              }
            />
            <Feature
              reverse
              icon={CalendarRange}
              eyebrow="AI study planner"
              title="“I have 3 days before my FAR exam. What should I study?”"
              body="The planner weighs your exam date, syllabus, past-paper frequency, confidence, weak topics, available material and daily time — then builds a realistic schedule."
              bullets={["Adapts when you finish early, skip, or score poorly", "Never overloads a day — lower priorities are dropped first", "Start a focused session straight from the plan"]}
              visual={
                <MockCard>
                  <p className="text-sm font-semibold">DAY 1</p>
                  {[["09:00–10:00", "IAS 16 concepts"], ["10:15–11:15", "IAS 16 numerical practice"], ["12:00–12:45", "Past paper questions"], ["18:00–18:30", "Active recall"]].map(([t, s]) => (
                    <div key={t} className="mt-2 flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{t}</span>
                      {s}
                    </div>
                  ))}
                </MockCard>
              }
            />
            <Feature
              icon={FileQuestion}
              eyebrow="Past paper mapper"
              title="Every past-paper question, mapped to your syllabus"
              body="Upload a paper — even a phone photo. Study OS detects each question, its marks and year, and maps it to your topics with a confidence score."
              bullets={["OCR for scanned papers", "Low-confidence mappings flagged for a quick check", "Topic frequency, year trends and marks distribution"]}
              visual={
                <MockCard>
                  <p className="text-xs text-muted-foreground">Question 3(b) · 12 marks</p>
                  <p className="mt-1 text-sm">&ldquo;Calculate depreciation using the revaluation model…&rdquo;</p>
                  <p className="mt-3 text-xs text-muted-foreground">Mapped to</p>
                  <p className="mt-1 text-sm font-medium">FAR → IAS 16 → Revaluation → Depreciation</p>
                  <p className="mt-1 inline-flex rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">Confidence 94%</p>
                  <div className="mt-4 grid grid-cols-5 gap-1.5 text-center text-xs">
                    {[["2021", 1], ["2022", 1], ["2023", 0], ["2024", 1], ["2025", 1]].map(([y, v]) => (
                      <div key={y as string} className={`rounded-md py-1.5 ${v ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {y}
                        <br />
                        {v ? "✓" : "✗"}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Historically appeared in 4 of 5 uploaded papers.</p>
                </MockCard>
              }
            />
            <Feature
              reverse
              icon={Brain}
              eyebrow="Personal knowledge base"
              title="An AI tutor that reads your notes first"
              body="Ask anything. Answers come from your own PDFs, notes and past papers — with citations to the file and page — and say clearly when something isn't in your materials."
              bullets={["Explain simply, exam mode, step-by-step, find my mistake…", "Quizzes and flashcards from any topic or document", "Never fabricates citations or past-paper questions"]}
              visual={
                <MockCard>
                  <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">Explain IAS 38 development costs</p>
                  <div className="mt-3 rounded-2xl rounded-tl-md border p-3 text-sm">
                    <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-xs text-success">
                      <Check className="size-3" /> Grounded in your materials
                    </p>
                    <p>According to your FAR Notes, development costs are capitalised only when all six criteria are met…</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
                      <FileText className="size-3" /> FAR Notes.pdf — Page 14
                    </p>
                  </div>
                </MockCard>
              }
            />
          </div>
        </section>

        {/* Progress + exam prep */}
        <section className="py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="Progress & exam preparation" title="Know exactly where you stand" body="Transparent analytics — no vanity numbers." />
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {[
                { icon: Target, title: "Exam readiness", body: "A score built from syllabus coverage, confidence, practice accuracy, past-paper performance and revision — with every factor shown. It's an estimate, never a guarantee." },
                { icon: Repeat, title: "Spaced revision", body: "Topics and flashcards return just before you'd forget them. Rate Easy, Good, Hard or Again and the schedule adapts." },
                { icon: BarChart3, title: "Weak-topic radar", body: "Weakness combines your confidence, status and quiz results so you always know what to fix next." },
                { icon: Layers, title: "Quizzes & flashcards", body: "Generated from your syllabus, notes and past papers at easy, medium, hard or exam level." },
                { icon: Search, title: "Search everything", body: "One search across subjects, topics, notes, PDFs, past papers, questions, tasks, flashcards and conversations." },
                { icon: MessageSquare, title: "Command bar", body: "Type “Quiz me on depreciation” or “Give me today's revision” and Study OS takes you there." },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border bg-card p-6">
                  <f.icon className="size-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Supported systems */}
        <section className="border-y bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="Supported education systems" title="Built for every kind of student" body="Not hardcoded to one exam. Education system → programme → subjects → topics, for whatever you're studying." />
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
              {SYSTEMS.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
                  <GraduationCap className="size-4 text-primary" /> {s}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="Pricing" title="Simple pricing, coming with launch" body="Study OS is free while in early access. Paid plans for heavier AI use will be announced before they apply — nobody will be charged without opting in." />
            <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
              <div className="rounded-2xl border bg-card p-8">
                <p className="font-semibold">Early access</p>
                <p className="mt-2 text-4xl font-semibold">Free</p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {["All features", "Syllabus import & past-paper mapping", "AI tutor, planner, quizzes & flashcards", "Fair-use AI limits"].map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="size-4 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-8 w-full">
                  <Link href={cta}>Build My Study OS</Link>
                </Button>
              </div>
              <div className="rounded-2xl border border-dashed bg-card/50 p-8">
                <p className="font-semibold">Pro & institutions</p>
                <p className="mt-2 text-4xl font-semibold text-muted-foreground">Soon</p>
                <p className="mt-6 text-sm text-muted-foreground">Higher AI limits for heavy exam seasons, and plans for academies and universities to share curated syllabi with their students.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t bg-muted/20 py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading eyebrow="FAQ" title="Questions students ask" />
            <div className="mt-10 space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group rounded-2xl border bg-card p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
            <div className="mt-16 rounded-3xl bg-primary p-10 text-center text-primary-foreground">
              <h2 className="text-2xl font-semibold sm:text-3xl">Stop juggling. Start studying.</h2>
              <p className="mt-2 opacity-90">Set up your Study OS in a few minutes.</p>
              <Button asChild size="lg" variant="secondary" className="mt-6">
                <Link href={cta}>
                  Build My Study OS <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-muted-foreground">Your entire academic life. One operating system.</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-4" /> Private by design
            </span>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Study OS</p>
        </div>
      </footer>
    </div>
  );
}
