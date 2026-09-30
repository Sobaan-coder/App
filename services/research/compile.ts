import type { Db } from "@/lib/db";
import { generate } from "@/services/ai/router";
import { detectInjection, wrapUntrusted } from "@/services/ai/safety";
import { extractDates, jaccard, keywords, summarize } from "@/services/ai/offline";

export interface SourceDoc {
  title: string;
  url: string;
  text: string;
  snippet?: string;
  publishedAt?: string;
  error?: string;
}

export interface ResearchReport {
  markdown: string;
  sources: { n: number; title: string; url: string; publishedAt?: string; used: boolean; error?: string }[];
  engine: string;
  warnings: string[];
}

/** Numbers/years stated next to a shared keyword that differ across sources → possible conflict. */
function findConflicts(docs: SourceDoc[], topicWords: string[]): string[] {
  const out: string[] = [];
  for (const kw of topicWords.slice(0, 6)) {
    const claims: { n: number; value: string; sentence: string }[] = [];
    docs.forEach((d, i) => {
      for (const s of summarize(d.text, 40)) {
        if (!s.toLowerCase().includes(kw)) continue;
        const m = s.match(/\b(1[89]\d{2}|20\d{2})\b/);
        if (m && /(founded|born|established|launched|released|started|introduced|created)/i.test(s)) claims.push({ n: i + 1, value: m[1], sentence: s });
      }
    });
    const distinct = [...new Set(claims.map((c) => c.value))];
    if (distinct.length > 1) {
      out.push(`Sources disagree on a date related to "${kw}": ${claims.slice(0, 4).map((c) => `${c.value} [${c.n}]`).join(", ")}. Verify before relying on it.`);
    }
  }
  return out;
}

export async function compileResearch(db: Db, userId: string, topic: string, docs: SourceDoc[]): Promise<ResearchReport> {
  const usable = docs.filter((d) => d.text && d.text.trim().length > 80);
  const warnings: string[] = [];
  for (const d of usable) {
    const flags = detectInjection(d.text);
    if (flags.length) warnings.push(`Source "${d.title}" contains text that looks like instructions to an AI (${flags[0].reason}). It was treated as data only.`);
  }
  // remove near-duplicate sources
  const unique: SourceDoc[] = [];
  for (const d of usable) {
    if (unique.some((u) => jaccard(u.text.slice(0, 3000), d.text.slice(0, 3000)) > 0.8)) {
      warnings.push(`Skipped "${d.title}" — near-duplicate of another source.`);
      continue;
    }
    unique.push(d);
  }
  const sources = docs.map((d, i) => ({ n: i + 1, title: d.title, url: d.url, publishedAt: d.publishedAt, used: unique.includes(d), error: d.error }));
  const num = (d: SourceDoc) => docs.indexOf(d) + 1;

  if (!unique.length) {
    return {
      markdown: `# Research: ${topic}\n\nI could not retrieve readable content from any source, so I can't write a reliable report.\n\n## Attempted sources\n${sources.map((s) => `- [${s.n}] ${s.title} — ${s.url}${s.error ? ` (failed: ${s.error})` : ""}`).join("\n")}`,
      sources,
      engine: "none",
      warnings: [...warnings, "No usable sources."],
    };
  }

  const ai = await generate(db, userId, {
    task: "research_report",
    tier: "reasoning",
    maxTokens: 2200,
    system:
      "Write a structured research report in Markdown using ONLY the provided sources. Cite sources inline as [n]. Sections: Summary, Key findings, Details, Dates & timeline, Conflicting or uncertain information, Open questions. Never invent sources or facts.",
    prompt: `Topic: ${topic}\nToday: ${new Date().toISOString().slice(0, 10)}\n\n${unique
      .map((d) => `Source [${num(d)}] ${d.title} (${d.url})${d.publishedAt ? `, published ${d.publishedAt}` : ""}\n${wrapUntrusted(d.url, d.text, 5000)}`)
      .join("\n\n")}`,
  });

  const topicWords = keywords(topic + " " + unique.map((d) => d.text.slice(0, 2000)).join(" "), 8);
  const conflicts = findConflicts(unique, topicWords);
  const sourceList = sources
    .map((s) => `${s.n}. [${s.title}](${s.url})${s.publishedAt ? ` — ${s.publishedAt}` : ""}${s.used ? "" : s.error ? ` — *not used: ${s.error}*` : " — *not used*"}`)
    .join("\n");

  if (ai) {
    return {
      markdown: `${ai.text.trim()}\n\n## Sources\n${sourceList}\n\n_Automated conflict check:_ ${conflicts.length ? conflicts.join(" ") : "no obvious date conflicts detected."}`,
      sources,
      engine: `${ai.provider}:${ai.model}`,
      warnings,
    };
  }

  // Offline: extractive report with per-source findings.
  const findings = unique
    .map((d) => {
      const pts = summarize(d.text, 3);
      return `### ${d.title} [${num(d)}]\n${pts.map((p) => `- ${p}`).join("\n")}`;
    })
    .join("\n\n");
  const allDates = [...new Set(unique.flatMap((d) => extractDates(d.text)))].slice(0, 12);
  const overview = summarize(unique.map((d) => d.text.slice(0, 4000)).join("\n"), 4);
  const md = `# Research: ${topic}

_Generated ${new Date().toISOString().slice(0, 10)} with the offline engine (extractive, no AI model configured). Quotes below are taken directly from the sources._

## Summary
${overview.map((s) => `- ${s}`).join("\n")}

## Key findings by source
${findings}

## Dates mentioned
${allDates.length ? allDates.map((d) => `- ${d}`).join("\n") : "- No explicit dates found."}

## Conflicting or uncertain information
${conflicts.length ? conflicts.map((c) => `- ${c}`).join("\n") : "- No obvious conflicts detected automatically. Cross-check important facts manually."}
- Search results may not reflect the most recent developments; check publication dates.

## Sources
${sourceList}
`;
  return { markdown: md, sources, engine: "offline (extractive)", warnings };
}
