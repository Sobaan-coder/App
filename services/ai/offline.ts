/**
 * Deterministic "offline engine": extractive NLP used when no AI model is configured.
 * Everything here is real computation (no fake AI output) and costs $0.
 */

const STOP = new Set(
  "a an the and or but if then else when at by for with about against between into through during before after above below to from up down in out on off over under again further once here there all any both each few more most other some such no nor not only own same so than too very can will just don should now is are was were be been being have has had having do does did doing i me my we our you your he him his she her it its they them their what which who whom this that these those am of as until while also may might must shall would could get got said says one two".split(
    " ",
  ),
);

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 600);
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) ?? []).filter((w) => !STOP.has(w));
}

export function keywords(text: string, n = 10): string[] {
  const freq = new Map<string, number>();
  for (const w of words(text)) if (w.length > 3 && !/^\d+$/.test(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/** Frequency-based extractive summary: top-scoring sentences, in original order. */
export function summarize(text: string, maxSentences = 5): string[] {
  const sents = sentences(text);
  if (sents.length <= maxSentences) return sents;
  const freq = new Map<string, number>();
  for (const w of words(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = sents.map((s, i) => {
    const ws = words(s);
    const score = ws.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0) / Math.max(4, ws.length);
    const positionBoost = i < 3 ? 1.2 : 1;
    return { s, i, score: score * positionBoost };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

const ACTION_RE =
  /\b(must|should|need(s)? to|required to|have to|deadline|due|submit|complete|prepare|send|review|schedule|follow up|todo|action item|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|\d))/i;

export function actionItems(text: string, max = 8): string[] {
  const out: string[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim());
  for (const l of lines) {
    if (/^[-*•]\s*\[ \]/.test(l) || /^(todo|action)[:\-]/i.test(l)) out.push(l.replace(/^[-*•]\s*(\[ \]\s*)?/, ""));
  }
  for (const s of sentences(text)) {
    if (out.length >= max) break;
    if (ACTION_RE.test(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, max);
}

/** Dates mentioned in text (ISO, "12 March 2025", "March 12, 2025", "2024"). */
export function extractDates(text: string, max = 10): string[] {
  const re =
    /\b(\d{4}-\d{2}-\d{2}|\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4})\b/g;
  return [...new Set(text.match(re) ?? [])].slice(0, max);
}

export function jaccard(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

/** Small seeded PRNG so offline templates vary but are reproducible in tests. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}
