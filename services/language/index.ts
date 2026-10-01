import type { Db } from "@/lib/db";
import { aiAvailable, generate } from "@/services/ai/router";
import { normalizeOffline, type Lang, type Normalized } from "./urdu";

export type { Lang } from "./urdu";
export { detectLanguage } from "./urdu";

/**
 * Turn a command in English, Urdu or Roman Urdu into an English command for the planner.
 * 1. Offline rules (always). 2. If the rules weren't confident and an AI model is available,
 *    translate with the model (local Ollama first — still $0).
 */
export async function normalizeCommand(db: Db, userId: string, text: string): Promise<Normalized> {
  const offline = normalizeOffline(text);
  if (offline.lang === "en" || offline.confident) return offline;
  if (!(await aiAvailable(db))) return offline;
  const r = await generate(db, userId, {
    task: "translate_command",
    tier: "fast",
    temperature: 0,
    maxTokens: 200,
    system:
      "You translate a user's instruction for a personal assistant from Urdu or Roman Urdu into one short, natural English command. Keep names, product names, numbers, dates and times. If the instruction contains the text of a task, note, reminder or topic, keep that part in the user's original words inside the English sentence. Output only the English command.",
    prompt: text,
  });
  const english = r?.text.trim().split("\n")[0]?.replace(/^["']|["']$/g, "");
  return english ? { lang: offline.lang, english, method: "ai", confident: true } : offline;
}

/** Instruction suffix so free-form AI answers come back in the user's language. */
export function replyLanguageInstruction(lang: Lang): string {
  if (lang === "ur") return "\n\nReply in Urdu, written in Urdu (Nastaliq/Arabic) script.";
  if (lang === "roman") return "\n\nReply in Roman Urdu (Urdu written with English letters), the way it is typed in Pakistan.";
  return "";
}
