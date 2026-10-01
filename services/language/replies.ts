import type { Lang } from "./urdu";

/**
 * Short replies the assistant shows and speaks. Urdu phrasing uses passive/neutral forms
 * ("…تیار ہو رہا ہے") so the assistant never assumes a gender.
 */
type Phrase = { en: string; ur: string; roman: string };

const ACK: Record<string, Phrase> = {
  plan_day: { en: "On it — preparing today's plan.", ur: "جی، آپ کے آج کے دن کا پلان تیار ہو رہا ہے۔", roman: "Ji, aap ke aaj ke din ka plan tayyar ho raha hai." },
  plan_tomorrow: { en: "Preparing tomorrow's schedule.", ur: "جی، کل کا شیڈول تیار ہو رہا ہے۔", roman: "Ji, kal ka schedule tayyar ho raha hai." },
  task_create: { en: "Adding that to your tasks.", ur: "جی، یہ کام آپ کی فہرست میں شامل کیا جا رہا ہے۔", roman: "Ji, ye kaam aap ki list mein shamil kiya ja raha hai." },
  task_complete: { en: "Marking it as done.", ur: "جی، اسے مکمل کے طور پر نشان زد کیا جا رہا ہے۔", roman: "Ji, ise mukammal mark kiya ja raha hai." },
  unfinished_tasks: { en: "Looking for unfinished tasks.", ur: "جی، ادھورے کام تلاش کیے جا رہے ہیں۔", roman: "Ji, adhoore kaam dhoonde ja rahe hain." },
  what_next: { en: "Finding the most important next task.", ur: "جی، اگلا سب سے اہم کام دیکھا جا رہا ہے۔", roman: "Ji, agla sab se aham kaam dekha ja raha hai." },
  deadlines: { en: "Checking your deadlines.", ur: "جی، آپ کی ڈیڈ لائنز دیکھی جا رہی ہیں۔", roman: "Ji, aap ki deadlines dekhi ja rahi hain." },
  summarize_documents: { en: "Reading and summarising your documents.", ur: "جی، دستاویزات پڑھ کر خلاصہ بنایا جا رہا ہے۔", roman: "Ji, documents parh kar khulasa banaya ja raha hai." },
  organize_files: { en: "Organising your files — I'll ask before moving many.", ur: "جی، فائلیں ترتیب دی جا رہی ہیں۔ زیادہ فائلیں منتقل کرنے سے پہلے آپ سے پوچھا جائے گا۔", roman: "Ji, files tarteeb di ja rahi hain. Zyada files move karne se pehle aap se poocha jayega." },
  research: { en: "Researching that now.", ur: "جی، اس پر تحقیق شروع ہو گئی ہے۔", roman: "Ji, is par research shuru ho gayi hai." },
  content_create: { en: "Creating the post.", ur: "جی، پوسٹ تیار ہو رہی ہے۔", roman: "Ji, post tayyar ho rahi hai." },
  content_publish: { en: "Creating the post — I'll ask for your approval before publishing.", ur: "جی، پوسٹ تیار ہو رہی ہے۔ شائع کرنے سے پہلے آپ کی منظوری لی جائے گی۔", roman: "Ji, post tayyar ho rahi hai. Publish karne se pehle aap ki manzoori li jayegi." },
  content_plan: { en: "Planning seven days of content.", ur: "جی، سات دن کا کانٹینٹ پلان بن رہا ہے۔", roman: "Ji, saat din ka content plan ban raha hai." },
  image_generate: { en: "Creating the image.", ur: "جی، تصویر بن رہی ہے۔", roman: "Ji, tasveer ban rahi hai." },
  create_automation: { en: "Designing that automation for you to confirm.", ur: "جی، آٹومیشن کا خاکہ تیار ہو رہا ہے، آپ تصدیق کر دیں۔", roman: "Ji, automation ka khaka tayyar ho raha hai, aap confirm kar dein." },
  automation_pause_all: { en: "Pausing all automations.", ur: "جی، تمام آٹومیشنز روکی جا رہی ہیں۔", roman: "Ji, tamam automations rok di ja rahi hain." },
  automation_resume_all: { en: "Resuming automations.", ur: "جی، آٹومیشنز دوبارہ شروع کی جا رہی ہیں۔", roman: "Ji, automations dobara shuru ki ja rahi hain." },
  automation_list: { en: "Here are your automations.", ur: "جی، یہ رہیں آپ کی آٹومیشنز۔", roman: "Ji, ye rahin aap ki automations." },
  memory_save: { en: "Got it, I'll remember that.", ur: "جی، یہ بات یاد رکھ لی گئی ہے۔", roman: "Ji, ye baat yaad rakh li gayi hai." },
  memory_forget: { en: "Forgetting that.", ur: "جی، یہ بات بھلا دی جا رہی ہے۔", roman: "Ji, ye baat bhula di ja rahi hai." },
  memory_recall: { en: "Here's what I remember.", ur: "جی، یہ ہے جو مجھے یاد ہے۔", roman: "Ji, ye hai jo mujhe yaad hai." },
  show_activity: { en: "Here's today's activity.", ur: "جی، یہ رہی آج کی سرگرمی۔", roman: "Ji, ye rahi aaj ki activity." },
  explain_failure: { en: "Let me check what went wrong.", ur: "جی، دیکھا جا رہا ہے کہ کیا غلط ہوا۔", roman: "Ji, dekha ja raha hai ke kya ghalat hua." },
  retry: { en: "Trying again.", ur: "جی، دوبارہ کوشش کی جا رہی ہے۔", roman: "Ji, dobara koshish ki ja rahi hai." },
  weekly_report: { en: "Preparing your weekly report.", ur: "جی، ہفتہ وار رپورٹ تیار ہو رہی ہے۔", roman: "Ji, weekly report tayyar ho rahi hai." },
  end_of_day_review: { en: "Preparing your end-of-day review.", ur: "جی، دن کا جائزہ تیار ہو رہا ہے۔", roman: "Ji, din ka jaiza tayyar ho raha hai." },
};

Object.assign(ACK, {
  pc_open: { en: "Opening it on your PC.", ur: "جی، آپ کے کمپیوٹر پر کھولا جا رہا ہے۔", roman: "Ji, aap ke computer par khola ja raha hai." },
  pc_power: { en: "Okay — power actions like restart or shutdown need your confirmation first.", ur: "جی، ری اسٹارٹ یا بند کرنے سے پہلے آپ کی تصدیق لی جائے گی۔", roman: "Ji, restart ya band karne se pehle aap ki tasdeeq li jayegi." },
});

const DEFAULT_ACK: Phrase = { en: "On it.", ur: "جی، کام شروع ہو گیا ہے۔", roman: "Ji, kaam shuru ho gaya hai." };

export function ackFor(intent: string, lang: Lang): string {
  return (ACK[intent] ?? DEFAULT_ACK)[lang];
}

export function identityReply(name: string, lang: Lang): string {
  return {
    en: `I'm ${name}, your personal assistant. Tell me what you need — in English or Urdu — and I'll handle it, asking before anything sensitive.`,
    ur: `میرا نام ${name} ہے، آپ کا ذاتی معاون۔ اردو یا انگریزی میں بتائیں کہ کیا کرنا ہے، کام ہو جائے گا — حساس کاموں سے پہلے آپ سے اجازت لی جائے گی۔`,
    roman: `Mera naam ${name} hai, aap ka personal assistant. Urdu ya English mein batayen kya karna hai — sensitive kaam se pehle aap se ijazat li jayegi.`,
  }[lang];
}

export function greetingReply(name: string, lang: Lang): string {
  return {
    en: `Hello! ${name} here. What can I do for you?`,
    ur: `وعلیکم السلام! ${name} حاضر ہے۔ بتائیں، کیا کرنا ہے؟`,
    roman: `Walaikum assalam! ${name} hazir hai. Batayen, kya karna hai?`,
  }[lang];
}

/** UI / voice strings. */
export const VOICE_TEXT = {
  listening: { en: "Listening…", ur: "آپ کی بات سنی جا رہی ہے…", roman: "Aap ki baat suni ja rahi hai…" },
  yes: { en: "Yes?", ur: "جی؟", roman: "Ji?" },
  thinking: { en: "Working on it…", ur: "کام ہو رہا ہے…", roman: "Kaam ho raha hai…" },
  done: { en: "Done.", ur: "کام مکمل ہو گیا۔", roman: "Kaam mukammal ho gaya." },
  failed: { en: "Sorry, that didn't work.", ur: "معذرت، یہ کام مکمل نہیں ہو سکا۔", roman: "Maazrat, ye kaam mukammal nahi ho saka." },
  approval: { en: "This needs your approval — please check the Approval Center.", ur: "اس کام کے لیے آپ کی منظوری درکار ہے۔ براہ کرم منظوری دیں۔", roman: "Is kaam ke liye aap ki manzoori chahiye. Meherbani karke approve karein." },
  notUnderstood: { en: "Sorry, I didn't catch that.", ur: "معاف کیجیے، بات سمجھ نہیں آئی۔", roman: "Maaf kijiye, baat samajh nahi aayi." },
  noMic: { en: "Microphone not available.", ur: "مائیکروفون دستیاب نہیں ہے۔", roman: "Microphone available nahi hai." },
} as const;

export type VoiceKey = keyof typeof VOICE_TEXT;
