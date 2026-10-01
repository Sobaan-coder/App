/**
 * Wake-word matching ("KHOKHAR, plan my day" / "کھوکھر میرا دن پلان کرو").
 * Pure and dependency-free so it runs in the browser (live microphone) and on the server
 * (typed commands that start with the assistant's name).
 */

const URDU_RE = /[؀-ۿ]/;

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Normalise for comparison: lowercase, strip punctuation/diacritics, unify Urdu letter variants. */
export function normalizeSpoken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "") // Arabic/Urdu diacritics (zer, zabar, pesh…)
    .replace(/[̀-ͯ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/ه(?=\s|$)/g, "ہ")
    .replace(/[،۔؟!?.,;:"'“”‘’()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** All spellings we accept for the assistant's name (Latin variants are generated automatically). */
export function nameVariants(name: string, extra: string[] = []): string[] {
  const base = normalizeSpoken(name);
  const v = new Set<string>([base, ...extra.map(normalizeSpoken).filter(Boolean)]);
  if (!URDU_RE.test(base)) {
    v.add(base.replace(/aa/g, "a"));
    v.add(base.replace(/th/g, "t"));
    v.add(base.replace(/aa/g, "a").replace(/th/g, "t"));
    v.add(base.replace(/ee/g, "i"));
    v.add(base.replace(/i$/, "ee"));
    v.add(base.replace(/kh/g, "k"));
    v.add(base.replace(/([kgtdbpc])h/g, "$1"));
  }
  return [...v].filter((x) => x.length >= 2);
}

export interface WakeMatch {
  matched: boolean;
  /** Whatever was said after the name ("" if only the name was said). */
  command: string;
}

const PREFIX = new Set(["hey", "hi", "ok", "okay", "hello", "ae", "ay", "sun", "suno", "سنو", "اے", "ہیلو", "او"]);

/**
 * Find the assistant's name near the start of an utterance (within the first 3 words, so the
 * name mentioned mid-sentence in normal conversation doesn't trigger it). Fuzzy: 1 typo allowed
 * for names of 5+ letters.
 */
export function matchWakeWord(transcript: string, variants: string[]): WakeMatch {
  const words = normalizeSpoken(transcript).split(" ").filter(Boolean);
  const vs = variants.map(normalizeSpoken);
  for (let i = 0; i < Math.min(words.length, 3); i++) {
    if (i > 0 && !PREFIX.has(words[i - 1])) break;
    for (const v of vs) {
      const parts = v.split(" ");
      const candidate = words.slice(i, i + parts.length).join(" ");
      const tolerance = v.replace(/\s/g, "").length >= 5 ? 1 : 0;
      if (candidate === v || levenshtein(candidate, v) <= tolerance) {
        // keep the original (un-normalised) wording of the rest of the command
        const original = transcript.trim().split(/\s+/);
        const rest = original.slice(i + parts.length).join(" ").replace(/^[,،:\-\s]+/, "");
        return { matched: true, command: rest };
      }
    }
  }
  return { matched: false, command: "" };
}

/** Remove a leading "KHOKHAR," from a typed command. */
export function stripWakeWord(text: string, variants: string[]): string {
  const m = matchWakeWord(text, variants);
  return m.matched && m.command ? m.command : text;
}
