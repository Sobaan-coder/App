import { describe, expect, it } from "vitest";
import { matchWakeWord, nameVariants, stripWakeWord } from "@/lib/wake";
import { detectLanguage, normalizeOffline, extractTimes } from "@/services/language/urdu";
import { ackFor, identityReply } from "@/services/language/replies";
import { detectIntent } from "@/agents/intent";
import { parseAutomationText } from "@/workflows/nl-automation";

const names = nameVariants("KHOKHAR", ["کھوکھر", "Kokar"]);

describe("wake word", () => {
  it.each([
    ["KHOKHAR plan my day", "plan my day"],
    ["hey KHOKHAR, what should I work on next", "what should I work on next"],
    ["Khokar research electric bikes", "research electric bikes"],
    ["kokhar open my tasks", "open my tasks"],
    ["Khokhar, kal ka schedule banao", "kal ka schedule banao"],
    ["کھوکھر میرا دن پلان کرو", "میرا دن پلان کرو"],
    ["سنو کھوکھر، کل کا شیڈول بناؤ", "کل کا شیڈول بناؤ"],
    ["KHOKHAR", ""],
  ])("%s", (t, cmd) => {
    const m = matchWakeWord(t, names);
    expect(m.matched).toBe(true);
    expect(m.command).toBe(cmd);
  });
  it("ignores the name mid-sentence and unrelated speech", () => {
    expect(matchWakeWord("I met mr khokhar at the market yesterday", names).matched).toBe(false);
    expect(matchWakeWord("what's the weather", names).matched).toBe(false);
  });
  it("works with any custom name", () => {
    const v = nameVariants("Noor", ["نور"]);
    expect(matchWakeWord("Noor plan my day", v).command).toBe("plan my day");
    expect(matchWakeWord("نور کام دکھاؤ", v).command).toBe("کام دکھاؤ");
  });
  it("strips a typed name prefix", () => expect(stripWakeWord("KHOKHAR, plan my day", names)).toBe("plan my day"));
});

describe("language detection", () => {
  it.each([
    ["میرا دن پلان کرو", "ur"],
    ["Crown Crust Pizza کی پوسٹ بناؤ", "ur"],
    ["mera din plan karo", "roman"],
    ["kal mujhe yaad dilana", "roman"],
    ["Plan my day", "en"],
    ["Create a post for Zinger Burger", "en"],
  ])("%s → %s", (t, l) => expect(detectLanguage(t)).toBe(l));
});

describe("Urdu & Roman Urdu commands → planner", () => {
  it.each([
    ["میرا دن پلان کرو", "plan_day"],
    ["کل کا شیڈول بناؤ", "plan_tomorrow"],
    ["میرے ادھورے کام دکھاؤ", "unfinished_tasks"],
    ["اب میں کیا کروں؟", "what_next"],
    ["میری فائلیں ترتیب دو", "organize_files"],
    ["آج کی دستاویزات کا خلاصہ بناؤ", "summarize_documents"],
    ["مصنوعی ذہانت کے بارے میں تحقیق کرو", "research"],
    ["یاد رکھو کہ میرا پسندیدہ رنگ سنہرا ہے", "memory_save"],
    ["تمہارا نام کیا ہے؟", "identity"],
    ["سب آٹومیشن روک دو", "automation_pause_all"],
    ["سات دن کا کانٹینٹ پلان بناؤ", "content_plan"],
    ["Crown Crust Pizza کی پوسٹ بنا کر انسٹاگرام اور فیس بک پر لگا دو", "content_publish"],
    ["ہر صبح 8 بجے میرا دن پلان کرو اور مجھے بتاؤ", "create_automation"],
    ["مجھے کل شام 5 بجے رپورٹ مکمل کرنے کی یاد دلانا", "task_create"],
    ["mera din plan karo", "plan_day"],
    ["mere adhoore kaam dikhao", "unfinished_tasks"],
    ["kal subah 9 baje mujhe doctor ko call karne ki yaad dilana", "task_create"],
    ["har roz shaam 6 baje content post karo", "create_automation"],
    ["Zinger Burger ki post banao instagram ke liye", "content_create"],
    ["files tarteeb do", "organize_files"],
    ["tumhara naam kya hai", "identity"],
    ["aaj kya kiya", "show_activity"],
  ])("%s → %s", (text, intent) => expect(detectIntent(normalizeOffline(text).english).intent).toBe(intent));

  it("keeps the task title in Urdu and converts the time", () => {
    const n = normalizeOffline("مجھے کل شام 5 بجے رپورٹ مکمل کرنے کی یاد دلانا");
    expect(n.english).toContain("at 5 pm");
    expect(n.english).toContain("tomorrow");
    expect(n.english).toContain("رپورٹ مکمل کرنا");
  });
  it("Roman Urdu reminder keeps the title words", () => expect(normalizeOffline("kal subah 9 baje mujhe doctor ko call karne ki yaad dilana").english).toMatch(/at 9 am tomorrow to doctor call karna/));
  it("recurring Urdu reminders become recurring tasks", () => expect(normalizeOffline("ہر جمعہ کو انوائس بھیجنے کی یاد دلانا").english).toMatch(/every Friday/));
  it("Urdu automation becomes a scheduled workflow", () => {
    const d = parseAutomationText(normalizeOffline("ہر صبح 8 بجے میرا دن پلان کرو اور مجھے بتاؤ").english)!;
    expect(d.trigger).toMatchObject({ type: "schedule", cron: "0 8 * * *" });
    expect(d.steps.at(-1)?.tool).toBe("notification_send");
  });
  it("platform names in Urdu", () => expect(normalizeOffline("Zinger Burger کی پوسٹ بنا کر یوٹیوب اور ٹک ٹاک پر لگا دو").english).toMatch(/TikTok.*YouTube|YouTube.*TikTok/));
  it("Urdu digits", () => expect(normalizeOffline("کل ۵ بجے دوائی لینے کی یاد دلانا").english).toContain("at 5 pm"));
  it("time extraction", () => expect(extractTimes("کل شام 6 بجے").en).toEqual(["at 6 pm", "tomorrow"]));
  it("English is untouched", () => expect(normalizeOffline("Plan my day")).toMatchObject({ method: "unchanged", english: "Plan my day" }));
});

describe("replies", () => {
  it("replies in the user's language", () => {
    expect(ackFor("plan_day", "ur")).toMatch(/[؀-ۿ]/);
    expect(ackFor("plan_day", "roman")).toMatch(/^Ji,/);
    expect(ackFor("plan_day", "en")).toMatch(/plan/);
    expect(identityReply("KHOKHAR", "ur")).toContain("KHOKHAR");
  });
});
