import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Study OS stores, why, who can see it, and how to export or delete it.",
};

const UPDATED = "30 September 2026";

export default function PrivacyPage() {
  const email = publicEnv.supportEmail;
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}. Applies to the Study OS website and Android app.</p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          <section>
            <h2>The short version</h2>
            <ul>
              <li>Your study material is private. Other students can&apos;t see it, and administrators see only counts (for example, how many subjects you have), not your content.</li>
              <li>We don&apos;t sell your data, show ads, or use advertising or analytics trackers.</li>
              <li>Some features send your text to an AI provider to generate results (see below).</li>
              <li>You can export everything or delete your account at any time from Settings.</li>
            </ul>
          </section>

          <section>
            <h2>What we store</h2>
            <ul>
              <li><strong>Account:</strong> email address, name and a securely hashed password. If you sign in with Google, we receive your name and email from Google.</li>
              <li><strong>Profile:</strong> the answers you give during onboarding, such as education level, country, time zone, exam dates and study preferences.</li>
              <li><strong>Your study content:</strong> syllabuses, subjects and topics, notes, uploaded documents and past papers, links you add, study plans, sessions, tasks, quiz results, flashcards and AI tutor conversations.</li>
              <li><strong>Technical logs:</strong> for each AI request, the feature used, model and size (token counts), but not its content; and error messages that help us fix problems.</li>
            </ul>
          </section>

          <section>
            <h2>How it&apos;s used</h2>
            <p>Only to provide Study OS to you: organising your syllabus, planning, revision, progress tracking and answering your questions. When you use an AI feature (syllabus import, document analysis, past-paper mapping, planner, quizzes, flashcards, tutor), the relevant text from your material is sent to the AI provider configured by this service to produce the result. The provider processes it under its own terms, which may allow it to keep requests for a limited time.</p>
          </section>

          <section>
            <h2>Where it&apos;s stored and who can see it</h2>
            <p>Data is stored with our database and file-storage provider (Supabase) and served by our hosting provider. Database rules make each record accessible only to the account that owns it. Files are kept in private storage and opened through short-lived links. Administrators can see account lists and aggregate counts to run the service, but not your documents, notes or conversations.</p>
          </section>

          <section>
            <h2>Cookies</h2>
            <p>We use only the cookies needed to keep you signed in. There are no advertising or analytics cookies.</p>
          </section>

          <section>
            <h2>Your choices</h2>
            <ul>
              <li><strong>Export:</strong> Settings → Export my data gives you a copy of everything as a JSON file.</li>
              <li><strong>Delete:</strong> Settings → Delete account permanently removes your account, study content and uploaded files. AI usage and error logs are kept without any link to you.</li>
              <li><strong>Correct:</strong> you can edit your profile and content at any time.</li>
            </ul>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              {email ? (
                <>
                  Questions or requests: <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${email}`}>{email}</a>.
                </>
              ) : (
                "Questions or requests: contact the operator of this Study OS site."
              )}{" "}
              We&apos;ll update this page if our practices change.
            </p>
          </section>
        </div>

        <p className="mt-12 text-sm">
          <Link href="/" className="text-primary underline-offset-4 hover:underline">← Back to Study OS</Link>
        </p>
      </main>
    </div>
  );
}
