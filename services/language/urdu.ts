/**
 * Urdu (اردو script) and Roman Urdu understanding for commands.
 *
 * Offline layer (always on, $0): detects the language and rewrites common command patterns into
 * the English commands the planner understands — times, days, recurrence, platforms and ~40 command
 * phrasings. Task titles, memory text and research topics keep your original Urdu wording.
 * Anything outside this vocabulary is translated by the AI model when one is configured.
 */

export type Lang = "en" | "ur" | "roman";

const URDU_CHARS = /[؀-ۿ]/g;
const LATIN_CHARS = /[a-z]/gi;

const ROMAN_MARKERS = new Set(
  "mujhe mujhy mera meri mere hamara karo kardo kar krna karna karen karein kariye banao bana bnao do dena dijiye kal aaj parson hai hain tha ka ki ke ko se aur ya yaad batao bata kya kyun kyon kab kahan har bhi nahi nahin tum tumhara tumhe ap aap apna wala wali din kaam kam sab saare saray chahiye zara jaldi abhi phir dobara mein main par pe baje subah shaam sham raat roz rozana hafta hafte mahine jumma peer mangal budh jumeraat itwar khulasa tarteeb dikhao dekho sunao likho bhejo laga lagao shuru band rok ruko kholo khol kholen chalao chala".split(
    " ",
  ),
);

const ROMAN_VERBS = new Set("kholo kholen chalao karo kardo karein kariye banao dikhao batao sunao bhejo lagao".split(" "));

export function detectLanguage(text: string): Lang {
  const ur = (text.match(URDU_CHARS) ?? []).length;
  const lat = (text.match(LATIN_CHARS) ?? []).length;
  if (ur > 0 && ur >= lat * 0.5) return "ur";
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return "en";
  const hits = words.filter((w) => ROMAN_MARKERS.has(w)).length;
  // Short commands like "youtube kholo" / "pc lock karo": one unmistakable Urdu verb is enough.
  if (words.length <= 4 && words.some((w) => ROMAN_VERBS.has(w))) return "roman";
  return hits >= 2 && hits / words.length >= 0.25 ? "roman" : "en";
}

// ── helpers ────────────────────────────────────────────────────────────────────
const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function preprocess(text: string, lang: Lang): string {
  let t = text
    .replace(/[۰-۹]/g, (d) => String(URDU_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/۔/g, ".")
    .replace(/،/g, ",")
    .replace(/؟/g, "?")
    .replace(/\s+/g, " ")
    .trim();
  if (lang === "roman") t = t.toLowerCase();
  return t;
}

/** Word boundary that also works for Urdu script (JS \b is ASCII-only). */
const B = "(?<=^|[\\s,.?!:;])";
const E = "(?=$|[\\s,.?!:;])";
const w = (alts: string) => new RegExp(`${B}(?:${alts})${E}`, "giu");

const DAYS: [string, string, string][] = [
  ["Monday", "پیر|سوموار", "peer|pir|somwar|monday"],
  ["Tuesday", "منگل", "mangal|tuesday"],
  ["Wednesday", "بدھ", "budh|budhwar|wednesday"],
  ["Thursday", "جمعرات", "jumeraat|jumerat|jumairat|thursday"],
  ["Friday", "جمعہ|جمعے", "jumma|juma|jummah|friday"],
  ["Saturday", "ہفتہ|ہفتے کے دن", "hafta|saturday"],
  ["Sunday", "اتوار", "itwar|itwaar|sunday"],
];

const PLATFORMS: [string, string][] = [
  ["Instagram", "انسٹاگرام|انسٹا|انسٹا گرام|insta"],
  ["Facebook", "فیس بک|فیسبک|fb"],
  ["TikTok", "ٹک ٹاک|ٹِک ٹاک|tiktok|tik tok"],
  ["YouTube", "یوٹیوب|یو ٹیوب|youtube"],
  ["Snapchat", "اسنیپ چیٹ|سنیپ چیٹ|snapchat|snap"],
];

function clockToEn(h: number, min: number, part: string | undefined): string {
  let ampm: "am" | "pm";
  if (part && /صبح|subah|subha|fajr/.test(part)) ampm = "am";
  else if (part && /(دوپہر|سہ پہر|شام|رات|dopahar|dopehar|shaam|sham|raat|rat)/.test(part)) ampm = h === 12 ? "pm" : "pm";
  else ampm = h >= 7 && h <= 11 ? "am" : "pm";
  return `at ${h}${min ? `:${String(min).padStart(2, "0")}` : ""} ${ampm}`;
}

/** Translate time / date / recurrence expressions to English and remove them from the text. */
export function extractTimes(input: string): { en: string[]; rest: string } {
  let t = ` ${input} `;
  const en: string[] = [];
  const take = (re: RegExp, fn: (m: RegExpExecArray) => string) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(t))) {
      en.push(fn(m));
      t = t.slice(0, m.index) + " " + t.slice(m.index + m[0].length);
      re.lastIndex = 0;
    }
  };

  // recurrence
  take(w("ہر (\\d+) گھنٹے|har (\\d+) ghant[ae]y?"), (m) => `every ${m[1] ?? m[2]} hours`);
  take(w("ہر (?:روز|دن)|روزانہ|har (?:roz|din)|rozana|roz"), () => "every day");
  take(w("ہر صبح|har subah|har subha"), () => "every morning");
  take(w("ہر شام|har shaam|har sham"), () => "every evening");
  take(w("ہر رات|har raat"), () => "every night");
  take(w("ہر ہفتے|ہر ہفتہ|hafta war|ہفتہ وار|har hafte|har haftay|weekly"), () => "every week");
  take(w("ہر مہینے|ہر ماہ|ماہانہ|har mahine|har maheene|monthly"), () => "every month");
  for (const [en_, ur, ro] of DAYS) take(w(`ہر (?:${ur})|har (?:${ro})`), () => `every ${en_}`);
  // clock times: "صبح 8 بجے", "شام 5:30 بجے", "8 baje", "raat 9 baje"
  take(/(صبح|دوپہر|سہ پہر|شام|رات|subah|subha|dopahar|dopehar|shaam|sham|raat|rat)?\s*(?:کے|ke)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:بجے|بجکر|baje|bajay|bje)/giu, (m) =>
    clockToEn(Number(m[2]), Number(m[3] ?? 0), m[1]),
  );
  // relative days
  take(w("پرسوں|parson|parso"), () => "in 2 days");
  take(w("اگلے ہفتے|agle hafte|aglay haftay|next week"), () => "next week");
  take(w("کل|kal"), () => "tomorrow");
  take(w("آج|aaj|aj"), () => "today");
  for (const [en_, ur, ro] of DAYS) take(w(`(?:اس |اگلے )?(?:${ur})(?: کو| تک)?|(?:is |agle )?(?:${ro})(?: ko| tak)?`), () => `on ${en_}`);
  // bare part of day
  take(w("صبح|subah|subha"), () => "in the morning");
  take(w("شام|shaam|sham"), () => "in the evening");
  return { en, rest: t.replace(/\s+/g, " ").trim() };
}

function platformsIn(text: string): string[] {
  return PLATFORMS.filter(([, re]) => new RegExp(re, "iu").test(text)).map(([p]) => p);
}

const FILLER = w(
  "مجھے|مجھ کو|میرے لیے|میرا|میری|میرے|پلیز|براہ کرم|ذرا|زرا|کہ|یہ|وہ|بھی|تو|ہے|ہیں|کو|کا|کی|کے|سے|میں|اور|please|plz|zara|mujhe|mujh ko|mere liye|ke|ki|ka|ko|se|hai|hain|bhi|to|ye|yeh|keh",
);

/** Clean leftover Urdu so it reads as a title: drop particles, turn "کرنے" into "کرنا". */
function cleanTitle(s: string): string {
  return s
    .replace(/(\S+)نے(?=\s|$)/gu, "$1نا")
    .replace(/\b(kar|bhej|likh|le|de|dekh|parh|padh|bana|ja|aa|mil|khareed|kharid|sun|bol|pooch|puch|bhar|samjha|chala|kha|pi|rakh|bata|nikal|bech|bula|saja)ne\b/g, "$1na")
    .replace(FILLER, " ")
    .replace(/[,.?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Normalized {
  lang: Lang;
  /** English command for the planner. */
  english: string;
  /** How it was produced. */
  method: "unchanged" | "rules" | "gloss" | "ai";
  /** True when the rules recognised a whole command (no AI needed). */
  confident: boolean;
}

type Rule = { re: RegExp; to: (m: RegExpExecArray, text: string) => string };

/** Whole-command patterns (Urdu script + Roman Urdu). Order matters: specific before general. */
const RULES: Rule[] = [
  // control this PC
  { re: /(شٹ ?ڈاؤن|shut ?down).*(منسوخ|روک|cancel|rok)|(منسوخ|cancel).*(شٹ ?ڈاؤن|shutdown)/iu, to: () => "Cancel the shutdown" },
  { re: /(کمپیوٹر|پی ?سی|لیپ ?ٹاپ|سسٹم|computer|pc|laptop|system).*(لاک|lock)/iu, to: () => "Lock my PC" },
  { re: /(کمپیوٹر|پی ?سی|لیپ ?ٹاپ|سسٹم|computer|pc|laptop|system).*(ری ?سٹارٹ|ری ?اسٹارٹ|restart)/iu, to: () => "Restart my PC" },
  { re: /(کمپیوٹر|پی ?سی|لیپ ?ٹاپ|سسٹم|computer|pc|laptop|system).*(بند|شٹ ?ڈاؤن|band|shut ?down|off)/iu, to: () => "Shut down my PC" },
  { re: /(کمپیوٹر|پی ?سی|لیپ ?ٹاپ|computer|pc|laptop).*(سلا|سو جا|sleep|sula)/iu, to: () => "Put my PC to sleep" },
  { re: /^(.+?)\s*(?:کو\s*)?(کھولو|کھول دو|کھولیں|اوپن کرو|اوپن کریں|چلاؤ|چلا دو|kholo|khol do|kholen|open karo|open kar do|chalao|chala do|lagao|laga do)\s*$/iu, to: (m) => `Open ${cleanTitle(m[1]).replace(/\s+(ko|کو)$/i, "")}` },
  // identity & greetings
  { re: /(تمہارا|آپ کا|تیرا|tumhara|aap ka|apka|tera) (نام|naam) (کیا|kya)|(تم|آپ) کون ہو|(tum|aap|ap) (kon|kaun) (ho|hain)/iu, to: () => "What is your name?" },
  { re: /^(السلام علیکم|اسلام علیکم|سلام|assalam ?o? ?alaikum|aoa|salam)\b/iu, to: () => "Hello" },
  // automation control
  { re: /(سب|تمام|ساری|sab|saari|tamam).*(آٹومیشن|automation).*(روک|بند|rok|band|pause)/iu, to: () => "Pause all automations" },
  { re: /(سب|تمام|ساری|sab|saari|tamam).*(آٹومیشن|automation).*(شروع|چالو|دوبارہ|shuru|chalu|resume)/iu, to: () => "Resume all automations" },
  { re: /(آٹومیشن|automation).*(دکھاؤ|دکھائیں|کون سی|dikhao|dikhaen|kaun si|list)/iu, to: () => "Show my active automations" },
  { re: /(کیوں|kyun|kyon|kiyun).*(فیل|ناکام|fail|nakam)/iu, to: () => "Why did this automation fail?" },
  { re: /^(دوبارہ|پھر سے|dobara|phir se|phirse)\s*(کوشش|try|koshish)?\s*(کرو|کریں|karo|karein|kar do)?\s*$/iu, to: () => "Retry it" },
  // memory
  { re: /^(یاد رکھو|یاد رکھیں|یاد رکھنا|yaad rakho|yaad rakhna|yad rakho)\s*(کہ|ke|keh|k)?\s*(.+)$/iu, to: (m) => `Remember that ${m[3]}` },
  { re: /^(.+?)\s*(یاد رکھو|یاد رکھیں|یاد رکھنا|yaad rakho|yaad rakhna)$/iu, to: (m) => `Remember that ${m[1]}` },
  { re: /^(.+?)\s*(بھول جاؤ|بھول جائیں|bhool jao|bhul jao)$/iu, to: (m) => `Forget ${cleanTitle(m[1])}` },
  { re: /(تمہیں|آپ کو|tumhe|tumhein|aapko|ap ko) (کیا|kya) (یاد|yaad) (ہے|hai)/iu, to: () => "What do you remember?" },
  // activity
  { re: /(آج|aaj) (کیا|کیا کیا|kya|kya kya) (کیا|ہوا|kiya|hua)/iu, to: () => "Show me today's activity" },
  // content
  { re: /(سات|7|ہفتے|ہفتہ|hafte|haftay|saat|week).*(دن)?.*(کانٹینٹ|مواد|پوسٹس|content|posts)/iu, to: () => "Create 7 days of content" },
  {
    re: /(پوسٹ|پوسٹس|مواد|کانٹینٹ|کیپشن|post|content|caption).*(شائع|پبلش|لگا|اپلوڈ|publish|laga|upload|post kar)/iu,
    to: (m, t) => `Create a post for ${productHint(t)} and publish it${platformsIn(t).length ? ` to ${platformsIn(t).join(", ")}` : ""}`,
  },
  {
    re: /(پوسٹ|مواد|کانٹینٹ|کیپشن|post|content|caption).*(بناؤ|بنائیں|بنا دو|تیار|لکھو|banao|bana do|bnao|tayyar|tayar|likho)|(بناؤ|banao|bana do).*(پوسٹ|post)/iu,
    to: (_, t) => `Create a post for ${productHint(t)}${platformsIn(t).length ? ` for ${platformsIn(t).join(", ")}` : ""}`,
  },
  { re: /(تصویر|امیج|image|tasveer|picture|photo).*(بناؤ|بنائیں|بنا دو|banao|bana do)/iu, to: (_, t) => `Create an image of ${productHint(t)}` },
  // tasks & planning
  { re: /(کل|kal).*(شیڈول|پلان|منصوبہ|schedule|plan)/iu, to: () => "Prepare tomorrow's schedule" },
  { re: /(دن|din|day).*(پلان|منصوبہ|plan|schedule|شیڈول).*(بناؤ|بنائیں|کرو|کریں|بنا دو|banao|karo|bana do|kar do|kardo)|(آج|aaj) (کا|ka) (پلان|plan|شیڈول|schedule)/iu, to: () => "Plan my day" },
  { re: /(ادھورے|ادھورا|باقی|نامکمل|بقایا|adhoore|adhura|adhoora|baqi|baki|pending|reh gaye).*(کام|ٹاسک|kaam|kam|tasks?)/iu, to: () => "Find unfinished tasks" },
  { re: /(اب|آگے|اگلا|ab|agay|aage|agla).*(کیا|کون سا|kya|konsa|kaun sa).*(کروں|کام|karun|karoon|kaam)|(اگلا کام|agla kaam)/iu, to: () => "What should I work on next?" },
  { re: /(ڈیڈ ?لائن|آخری تاریخ|deadline)/iu, to: () => "Check my project deadlines" },
  { re: /(دن|din).*(جائزہ|ریویو|review|jaiza)/iu, to: () => "End of day review" },
  { re: /(ہفتہ وار|ہفتے کی|weekly|hafta ?war|hafte ki).*(رپورٹ|report)/iu, to: () => "Prepare a weekly report" },
  // documents & files
  { re: /(فائلیں|فائلز|فائل|files?|downloads?|ڈاؤن ?لوڈز?).*(ترتیب|منظم|سیٹ|سنبھال|arrange|tarteeb|organi[sz]e|set|saaf)/iu, to: (_, t) => (/ڈاؤن|download/iu.test(t) ? "Organize my downloads" : "Organize my files") },
  { re: /(خلاصہ|سمری|khulasa|khulasah|summary|summari[sz]e)/iu, to: (_, t) => (/(آج|aaj)/iu.test(t) ? "Summarize the documents I added today" : /(پی ڈی ایف|pdf)/iu.test(t) ? "Summarize this PDF" : "Summarize the latest document") },
  { re: /(اسپریڈ ?شیٹ|ایکسل|شیٹ|spreadsheet|excel|sheet).*(کیا بدلا|تبدیل|فرق|badla|farq|changed)/iu, to: () => "Read this spreadsheet and tell me what changed" },
  // research
  { re: /^(.+?)\s*(کے بارے میں|پر|کے متعلق|ke bare mein|ke baare me|ke bare me|par|pe|pr)?\s*(تحقیق|ریسرچ|research|tehqeeq)\s*(کرو|کریں|کر دو|کرکے|karo|kar do|kardo|karein|kar ke)?(.*)$/iu, to: (m) => `Research ${cleanTitle(m[1])}${/(رپورٹ|report)/iu.test(m[5] ?? "") ? " and create a report" : ""}` },
  { re: /^(تحقیق|ریسرچ|research)\s*(کرو|کریں|karo|kar do)\s*(.+)$/iu, to: (m) => `Research ${cleanTitle(m[3])}` },
  // project
  { re: /(نیا|naya) (پراجیکٹ|پروجیکٹ|project)\s*(بناؤ|بنائیں|banao|bana do)?\s*(.*)$/iu, to: (m) => `Create a project called ${cleanTitle(m[4] || "New project")}` },
];

const REMIND_RE = /(یاد (?:دلا(?:نا|ؤ|ئیں|ئیے| دینا| دیں| دو)?|کروا(?:نا|ئیں| دینا)?)|yaa?d (?:dila(?:na|o|ein|en|iye| dena| do|dena)?|karwa(?:na| dena)?))/iu;
const TASK_RE = /(کام|ٹاسک|kaam|task)\s*(شامل|ایڈ|لکھ|add|likh|daal|dal)\s*(کرو|کریں|کر دو|لو|karo|kar do|kardo|lo|do)/iu;
const NOTIFY_RE = /(مجھے )?(بتاؤ|بتائیں|بتا دو|اطلاع دو|مطلع کرو|نوٹیفائی کرو|batao|bata do|bataen|notify karo|inform karo)/iu;

function productHint(t: string): string {
  const latin = (t.match(/[A-Za-z][A-Za-z0-9' ]{2,}/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => !/^(post|content|caption|banao|bana|do|karo|instagram|facebook|tiktok|youtube|snapchat|insta|fb|publish|laga|upload|aur|ke|ki|ka|liye|lye|for|create|image|tasveer|picture)$/i.test(s));
  const cleaned = latin.map((s) => s.replace(/\b(post|content|caption|banao|bana do|karo|publish|ke liye|ki|ka|ke|aur|ko|par|pe|pr|instagram|facebook|tiktok|youtube|snapchat|insta|fb|laga do|kar do|do)\b/gi, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (cleaned.length) return cleaned.join(" ");
  if (/(پیزا|pizza)/iu.test(t)) return "pizza";
  if (/(برگر|burger)/iu.test(t)) return "burger";
  if (/(آج|aaj)/iu.test(t)) return "today's content";
  return "today's content";
}

/** Rule-based normalisation. Returns confident=false when only a word-level gloss was possible. */
export function normalizeOffline(text: string): Normalized {
  const lang = detectLanguage(text);
  if (lang === "en") return { lang, english: text, method: "unchanged", confident: true };
  const t = preprocess(text, lang);

  // Recurring automation: "ہر صبح 8 بجے میرا دن پلان کرو اور مجھے بتاؤ"
  const times = extractTimes(t);
  const recurring = times.en.some((x) => x.startsWith("every "));

  // Reminders / tasks
  if (REMIND_RE.test(t) || TASK_RE.test(t)) {
    const rest = times.rest.replace(REMIND_RE, " ").replace(TASK_RE, " ");
    const title = cleanTitle(rest);
    return { lang, english: `Remind me ${times.en.join(" ")} to ${title || text}`.replace(/\s+/g, " "), method: "rules", confident: Boolean(title) };
  }

  for (const r of RULES) {
    const m = r.re.exec(recurring ? times.rest : t);
    if (!m) continue;
    let english = r.to(m, recurring ? times.rest : t);
    if (recurring && !/^(Remember|Forget|What|Hello|Pause|Resume|Show|Why|Retry)/.test(english)) {
      const notify = NOTIFY_RE.test(t) ? " and notify me" : "";
      english = `${times.en.filter((x) => !x.startsWith("on ")).join(" ")}, ${english.charAt(0).toLowerCase()}${english.slice(1)}${notify}`;
    } else if (times.en.length && /^(Create a post|Research|Create a project|Create an image)/.test(english) === false && !/(today|tomorrow)/i.test(english)) {
      english = `${english} ${times.en.join(" ")}`;
    }
    return { lang, english: english.replace(/\s+/g, " ").trim(), method: "rules", confident: true };
  }

  // Fallback: word-level gloss so keyword-based intents can still fire.
  let g = ` ${times.rest} `;
  for (const [re, en] of GLOSS) g = g.replace(re, ` ${en} `);
  for (const [p, re] of PLATFORMS) g = g.replace(new RegExp(re, "giu"), p);
  const english = `${g.replace(/\s+/g, " ").trim()} ${times.en.join(" ")}`.trim();
  return { lang, english, method: "gloss", confident: false };
}

const GLOSS: [RegExp, string][] = [
  [w("کام|kaam"), "task"],
  [w("رپورٹ|report"), "report"],
  [w("بناؤ|بنائیں|بنا دو|banao|bana do"), "create"],
  [w("دکھاؤ|دکھائیں|dikhao|dikhaen"), "show"],
  [w("بھیجو|بھیجیں|bhejo|bhej do"), "send"],
  [w("ای میل|email"), "email"],
  [w("فائل|فائلیں|file|files"), "files"],
  [w("دستاویز|دستاویزات|document|documents"), "documents"],
  [w("پلان|plan"), "plan"],
  [w("تحقیق|research"), "research"],
  [w("یاد دلاؤ|remind"), "remind me"],
  [w("بتاؤ|batao"), "tell me"],
  [w("کیا|kya"), "what"],
];
