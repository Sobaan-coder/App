import { z } from "zod";
import type { Db } from "@/lib/db";
import { generateJson, generate } from "@/services/ai/router";
import { detectInjection, wrapUntrusted, type InjectionFlag } from "@/services/ai/safety";
import { actionItems, extractDates, keywords, summarize } from "@/services/ai/offline";

export interface TextAnalysis {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  dates: string[];
  keywords: string[];
  injectionFlags: InjectionFlag[];
  engine: string;
}

const aiSchema = z.object({
  summary: z.string().min(1),
  key_points: z.array(z.string()).default([]),
  action_items: z.array(z.string()).default([]),
});

/** Summarise + key points + action items. AI when available, extractive otherwise. */
export async function analyzeText(db: Db, userId: string, title: string, text: string): Promise<TextAnalysis> {
  const injectionFlags = detectInjection(text);
  const base = { dates: extractDates(text), keywords: keywords(text, 8), injectionFlags };
  if (text.trim().length < 30) {
    return { ...base, summary: text.trim() || "(No readable text found.)", keyPoints: [], actionItems: [], engine: "offline" };
  }
  const ai = await generateJson(
    db,
    userId,
    {
      task: "document_summary",
      tier: "extraction",
      system:
        'Summarise the document. Respond with JSON: {"summary": string (3-5 sentences), "key_points": string[] (max 7), "action_items": string[] (concrete tasks mentioned, max 8, empty if none)}.',
      prompt: `Document title: ${title}\n\n${wrapUntrusted(title, text, 14_000)}`,
    },
    (v) => {
      const p = aiSchema.safeParse(v);
      return p.success ? p.data : null;
    },
  );
  if (ai) {
    return {
      ...base,
      summary: ai.value.summary,
      keyPoints: ai.value.key_points.slice(0, 7),
      actionItems: ai.value.action_items.slice(0, 8),
      engine: `${ai.provider}:${ai.model}`,
    };
  }
  const sents = summarize(text, 7);
  return {
    ...base,
    summary: sents.slice(0, 3).join(" "),
    keyPoints: sents.slice(3),
    actionItems: actionItems(text),
    engine: "offline (extractive)",
  };
}

/** Free-form answer/writing with AI, or null if no model is available. */
export async function writeWithAI(db: Db, userId: string, task: string, instruction: string, context?: { label: string; text: string }[]) {
  const ctx = (context ?? []).map((c) => wrapUntrusted(c.label, c.text, 8000)).join("\n\n");
  return generate(db, userId, { task, tier: "reasoning", prompt: `${instruction}${ctx ? `\n\nReference material:\n${ctx}` : ""}`, maxTokens: 1800 });
}
