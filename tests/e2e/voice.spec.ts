import { expect, test, type Page } from "@playwright/test";

/**
 * There is no real microphone in CI, so we install a fake SpeechRecognition that delivers
 * transcripts on demand (window.__say), exactly like Chrome's implementation would.
 */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    type Rec = { continuous: boolean; onresult?: (e: unknown) => void; onend?: () => void; onstart?: () => void };
    const w = window as unknown as Record<string, unknown>;
    let active: Rec | null = null;
    class FakeRecognition {
      lang = "ur-PK";
      continuous = false;
      interimResults = true;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      start() {
        active = this as unknown as Rec;
        (w.__recognizers as unknown[]).push({ lang: this.lang, continuous: this.continuous });
      }
      stop() {
        if (active === (this as unknown as Rec)) active = null;
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this.stop();
      }
    }
    w.__recognizers = [];
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition;
    w.__say = (text: string) => {
      const r = active;
      if (!r) return false;
      r.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
      if (!r.continuous) {
        active = null;
        setTimeout(() => r.onend?.(), 0);
      }
      return true;
    };
    // speech synthesis: finish instantly
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (u: SpeechSynthesisUtterance) => setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 10);
    }
  });
}

const say = (page: Page, text: string) => page.waitForFunction((t) => (window as unknown as { __say: (s: string) => boolean }).__say(t), text);

test("voice: tap the mic and speak Urdu → understood, answered in Urdu, executed", async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`voice${Date.now()}@test.local`);
  await page.getByLabel("Password").fill("Voice-pass-1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("I'll explore myself").click();
  await expect(page.getByText("KHOKHAR", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Speak a command" }).click();
  await say(page, "میرا دن پلان کرو");
  await expect(page.getByText("میرا دن پلان کرو", { exact: true })).toBeVisible();
  await expect(page.getByText("Understood as: Plan my day")).toBeVisible();
  await expect(page.getByText(/آپ کے آج کے دن کا پلان تیار ہو رہا ہے/)).toBeVisible();
  await expect(page.getByText("کام مکمل ہو گیا۔")).toBeVisible({ timeout: 30_000 });

  // hands-free: say the name, then the command
  await page.getByRole("button", { name: /Listen for “KHOKHAR”/ }).click();
  await expect(page.getByText(/Listening for “KHOKHAR”/).first()).toBeVisible();
  await say(page, "KHOKHAR what should I work on next");
  await expect(page.getByText("“what should I work on next”")).toBeVisible();
  await expect(page.getByText(/Finding the most important next task/)).toBeVisible();

  // Roman Urdu name question
  await say(page, "کھوکھر تمہارا نام کیا ہے");
  await expect(page.getByText(/میرا نام KHOKHAR ہے/)).toBeVisible({ timeout: 30_000 });
});

test("typed Urdu command on the home page", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`typed${Date.now()}@test.local`);
  await page.getByLabel("Password").fill("Typed-pass-1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("I'll explore myself").click();
  const box = page.getByRole("textbox", { name: "What do you want me to do?" });
  await box.fill("مجھے کل شام 5 بجے رپورٹ مکمل کرنے کی یاد دلانا");
  await box.press("Enter");
  await expect(page.getByText(/یہ کام آپ کی فہرست میں شامل کیا جا رہا ہے/)).toBeVisible();
  await expect(page.getByText("Task created:")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("رپورٹ مکمل کرنا").first()).toBeVisible();
});

test("Windows autostart URL: login keeps ?wake=1, hands-free is on, PC commands are understood", async ({ page, browser }) => {
  const email = `wake${Date.now()}@test.local`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Wake-pass-1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("I'll explore myself").click();

  // what the KHOKHAR window opens at sign-in, in a fresh (logged-out) browser profile
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await fakeSpeech(p);
  await p.goto("/?wake=1");
  await expect(p).toHaveURL(/\/login\?next=%2F%3Fwake%3D1/);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill("Wake-pass-1234");
  await p.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(p.getByText(/Listening for “KHOKHAR”/).first()).toBeVisible();

  await say(p, "khokhar youtube kholo");
  await expect(p.getByText("“youtube kholo”")).toBeVisible();
  // the test server isn't Windows, so the PC tool explains instead of opening YouTube
  await expect(p.getByText(/runs on your Windows PC/).first()).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});
