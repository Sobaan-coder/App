import path from "node:path";
import { z } from "zod";
import { defineTool } from "../types";
import { AppError } from "@/lib/errors";
import { FOLDERS, getFile, readFileData, saveFile, type FileRow } from "@/services/storage";
import { parseDocument, type ParsedTable } from "@/services/documents/parse";
import { analyzeText, writeWithAI } from "@/services/documents/analyze";
import { renderDocument, type TableData } from "@/services/documents/generate";

export const documentProcess = defineTool({
  name: "document_process",
  description: "Extract text from documents, summarise them, find key points and action items, and store the results.",
  category: "documents",
  risk: "low",
  timeoutMs: 300_000,
  input: z.object({ fileIds: z.array(z.string().uuid()).max(20).default([]), fileId: z.string().uuid().optional() }),
  async execute(i, ctx) {
    const ids = [...new Set([...(i.fileId ? [i.fileId] : []), ...i.fileIds])];
    if (!ids.length) return { documents: [], summary: "No documents to process", markdown: "I didn't find any documents to process. Upload a file first (Files → Upload)." };
    const docs = [];
    const warnings: string[] = [];
    for (const id of ids) {
      const f = await getFile(ctx.db, id);
      const parsed = await parseDocument(f.name, await readFileData(f));
      if (parsed.note) warnings.push(`${f.name}: ${parsed.note}`);
      const a = await analyzeText(ctx.db, ctx.userId, f.name, parsed.text);
      if (a.injectionFlags.length) warnings.push(`${f.name} contains text that looks like instructions to an AI (${a.injectionFlags[0].reason}). It was treated as data only.`);
      await ctx.db.query(
        `insert into documents(user_id, file_id, title, text_content, summary, key_points, action_items, word_count, injection_flags, processed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         on conflict (file_id) do update set text_content = excluded.text_content, summary = excluded.summary, key_points = excluded.key_points,
           action_items = excluded.action_items, word_count = excluded.word_count, injection_flags = excluded.injection_flags, processed_at = now()`,
        [
          ctx.userId,
          f.id,
          f.name,
          parsed.text.slice(0, 500_000),
          a.summary,
          JSON.stringify(a.keyPoints),
          JSON.stringify(a.actionItems),
          parsed.text.split(/\s+/).filter(Boolean).length,
          JSON.stringify(a.injectionFlags),
        ],
      );
      docs.push({ fileId: f.id, name: f.name, summary: a.summary, keyPoints: a.keyPoints, actionItems: a.actionItems, dates: a.dates, engine: a.engine, text: parsed.text.slice(0, 8000) });
    }
    const markdown = docs
      .map(
        (d) => `## 📄 ${d.name}\n\n${d.summary}\n\n${d.keyPoints.length ? `**Key points**\n${d.keyPoints.map((k) => `- ${k}`).join("\n")}\n\n` : ""}${
          d.actionItems.length ? `**Action items**\n${d.actionItems.map((k) => `- [ ] ${k}`).join("\n")}\n\n` : ""
        }${d.dates.length ? `**Dates mentioned:** ${d.dates.join(", ")}\n\n` : ""}_Engine: ${d.engine}_`,
      )
      .join("\n\n---\n\n");
    return { documents: docs, summary: `Processed ${docs.length} document(s)`, markdown, warnings };
  },
});

export const documentCreate = defineTool({
  name: "document_create",
  description: "Create a document (PDF, DOCX, XLSX, CSV, TXT or Markdown) from Markdown content.",
  category: "documents",
  risk: "low",
  input: z.object({
    title: z.string().min(1).max(150),
    markdown: z.string().default(""),
    format: z.enum(["md", "txt", "pdf", "docx", "xlsx", "csv"]).default("md"),
    folder: z.enum(FOLDERS).default("reports"),
    tables: z.array(z.object({ name: z.string().optional(), headers: z.array(z.string()), rows: z.array(z.array(z.any())) })).optional(),
  }),
  verify: (o) => ((o as { file?: { id: string } }).file?.id ? null : "No file was created"),
  async execute(i, ctx) {
    const { data, ext } = await renderDocument(i.format, i.title, i.markdown || "_(empty)_", i.tables as TableData[] | undefined);
    const stamp = new Date().toISOString().slice(0, 10);
    const f = await saveFile(ctx.db, ctx.userId, { name: `${i.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)} ${stamp}${ext}`, folder: i.folder, data, projectId: ctx.projectId });
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Created ${f.name}`, markdown: i.markdown };
  },
});

export const textGenerate = defineTool({
  name: "text_generate",
  description: "Write text (reports, emails, notes, answers) with the configured AI model; falls back to a structured template offline.",
  category: "ai",
  risk: "low",
  retryable: true,
  input: z.object({
    instruction: z.string().min(1),
    title: z.string().default("Document"),
    context: z.array(z.object({ label: z.string(), text: z.string() })).default([]),
    fallback: z.string().optional(),
  }),
  async execute(i, ctx) {
    const r = await writeWithAI(ctx.db, ctx.userId, "text_generate", i.instruction, i.context);
    if (r) return { text: r.text, markdown: r.text, engine: `${r.provider}:${r.model}`, summary: `Wrote "${i.title}"` };
    // Offline: assemble a clean document from the provided context (no invented content).
    const md =
      i.fallback ??
      `# ${i.title}\n\n${i.context.length ? i.context.map((c) => `## ${c.label}\n\n${c.text.trim()}`).join("\n\n") : i.instruction}\n\n---\n_Assembled offline from your input. Configure a free local model (Ollama) in Settings for AI-written drafts._`;
    return { text: md, markdown: md, engine: "offline (template)", summary: `Prepared "${i.title}" (offline template)` };
  },
});

function numericStats(t: ParsedTable) {
  return t.headers.map((h, ci) => {
    const nums = t.rows.map((r) => r[ci]).filter((v): v is number => typeof v === "number" && isFinite(v));
    if (nums.length < Math.max(1, t.rows.length * 0.6)) {
      const counts = new Map<string, number>();
      for (const r of t.rows) if (r[ci] !== null && r[ci] !== "") counts.set(String(r[ci]), (counts.get(String(r[ci])) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { column: h, type: "text" as const, distinct: counts.size, top };
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    return { column: h, type: "number" as const, count: nums.length, sum, avg: sum / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
  });
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : Number(n.toFixed(2)).toString());

export const dataAnalyze = defineTool({
  name: "data_analyze",
  description: "Analyse a spreadsheet/CSV: row counts, column statistics and top values.",
  category: "documents",
  risk: "low",
  input: z.object({ fileId: z.string().uuid() }),
  async execute(i, ctx) {
    const f = await getFile(ctx.db, i.fileId);
    const parsed = await parseDocument(f.name, await readFileData(f));
    if (!parsed.tables?.length) throw new AppError(`${f.name} is not a spreadsheet or CSV`);
    const sheets = parsed.tables.map((t) => ({ name: t.name, rows: t.rows.length, columns: t.headers.length, stats: numericStats(t) }));
    const md = sheets
      .map(
        (s) =>
          `### ${s.name} — ${s.rows} rows × ${s.columns} columns\n\n| Column | Summary |\n|---|---|\n${s.stats
            .map((c) =>
              c.type === "number"
                ? `| ${c.column} | sum ${fmt(c.sum)}, avg ${fmt(c.avg)}, min ${fmt(c.min)}, max ${fmt(c.max)} |`
                : `| ${c.column} | ${c.distinct} distinct${c.top.length ? `; top: ${c.top.map(([v, n]) => `${v} (${n})`).join(", ")}` : ""} |`,
            )
            .join("\n")}`,
      )
      .join("\n\n");
    return { sheets, markdown: `## Analysis of ${f.name}\n\n${md}`, summary: `Analysed ${f.name}` };
  },
});

function baseName(n: string) {
  return path.basename(n, path.extname(n)).replace(/\s*\(\d+\)$/, "").replace(/[\s_-]*\d{4}-\d{2}-\d{2}$/, "").toLowerCase();
}

export const spreadsheetCompare = defineTool({
  name: "spreadsheet_compare",
  description: "Compare a spreadsheet with its previous version (same name, older upload) and report what changed.",
  category: "documents",
  risk: "low",
  input: z.object({ fileId: z.string().uuid(), previousFileId: z.string().uuid().optional() }),
  async execute(i, ctx) {
    const cur = await getFile(ctx.db, i.fileId);
    let prev: FileRow | null = i.previousFileId ? await getFile(ctx.db, i.previousFileId) : null;
    if (!prev) {
      const candidates = await ctx.db.query<FileRow>("select * from files where id <> $1 and created_at <= $2 and name ~* '\\.(xlsx|csv)$' order by created_at desc limit 50", [cur.id, cur.created_at]);
      prev = candidates.find((c) => baseName(c.name) === baseName(cur.name)) ?? null;
    }
    const curT = (await parseDocument(cur.name, await readFileData(cur))).tables?.[0];
    if (!curT) throw new AppError(`${cur.name} is not a spreadsheet`);
    if (!prev) {
      const stats = numericStats(curT);
      return {
        changed: null,
        summary: `No previous version of ${cur.name} found`,
        markdown: `I couldn't find an earlier version of **${cur.name}** to compare with (upload the older file with the same name, or pick it explicitly). Current contents: ${curT.rows.length} rows; columns: ${stats.map((s) => s.column).join(", ")}.`,
      };
    }
    const prevT = (await parseDocument(prev.name, await readFileData(prev))).tables?.[0];
    if (!prevT) throw new AppError(`${prev.name} is not a spreadsheet`);
    const key = (r: unknown[]) => String(r[0] ?? "");
    const pm = new Map(prevT.rows.map((r) => [key(r), r]));
    const cm = new Map(curT.rows.map((r) => [key(r), r]));
    const added = [...cm.keys()].filter((k) => !pm.has(k));
    const removed = [...pm.keys()].filter((k) => !cm.has(k));
    const changes: string[] = [];
    for (const [k, r] of cm) {
      const old = pm.get(k);
      if (!old) continue;
      curT.headers.forEach((h, ci) => {
        const pi = prevT.headers.indexOf(h);
        if (pi >= 0 && String(old[pi] ?? "") !== String(r[ci] ?? "")) changes.push(`**${k}** · ${h}: ${old[pi] ?? "∅"} → ${r[ci] ?? "∅"}`);
      });
    }
    const newCols = curT.headers.filter((h) => !prevT.headers.includes(h));
    const goneCols = prevT.headers.filter((h) => !curT.headers.includes(h));
    const md = `## What changed in ${cur.name}\nCompared with **${prev.name}** (${new Date(prev.created_at).toISOString().slice(0, 10)}), matching rows by the first column ("${curT.headers[0]}").

- Rows: ${prevT.rows.length} → ${curT.rows.length}
- Added rows (${added.length}): ${added.slice(0, 20).join(", ") || "none"}
- Removed rows (${removed.length}): ${removed.slice(0, 20).join(", ") || "none"}
${newCols.length ? `- New columns: ${newCols.join(", ")}\n` : ""}${goneCols.length ? `- Removed columns: ${goneCols.join(", ")}\n` : ""}
### Changed values (${changes.length})
${changes.slice(0, 50).map((c) => `- ${c}`).join("\n") || "- none"}${changes.length > 50 ? `\n- … and ${changes.length - 50} more` : ""}`;
    return { changed: { added, removed, changes: changes.length }, markdown: md, summary: `${added.length} added, ${removed.length} removed, ${changes.length} changed` };
  },
});

export const spreadsheetWrite = defineTool({
  name: "spreadsheet_write",
  description: "Create a spreadsheet (XLSX or CSV) from table data.",
  category: "documents",
  risk: "low",
  input: z.object({
    title: z.string().min(1),
    format: z.enum(["xlsx", "csv"]).default("xlsx"),
    tables: z.array(z.object({ name: z.string().optional(), headers: z.array(z.string()), rows: z.array(z.array(z.any())) })).min(1),
  }),
  async execute(i, ctx) {
    const { data, ext } = await renderDocument(i.format, i.title, "", i.tables as TableData[]);
    const f = await saveFile(ctx.db, ctx.userId, { name: `${i.title.slice(0, 80)}${ext}`, folder: "outputs", data, projectId: ctx.projectId });
    return { file: { id: f.id, name: f.name }, files: [{ id: f.id, name: f.name }], summary: `Created ${f.name}` };
  },
});

export const textSummarize = defineTool({
  name: "text_summarize",
  description: "Summarise a piece of text (e.g. a web page) with key points and action items.",
  category: "ai",
  risk: "low",
  input: z.object({ title: z.string().default("Text"), text: z.string().default("") }),
  async execute(i, ctx) {
    const a = await analyzeText(ctx.db, ctx.userId, i.title, i.text);
    const md = `## ${i.title}\n\n${a.summary}${a.keyPoints.length ? `\n\n**Key points**\n${a.keyPoints.map((k) => `- ${k}`).join("\n")}` : ""}${
      a.actionItems.length ? `\n\n**Action items**\n${a.actionItems.map((k) => `- [ ] ${k}`).join("\n")}` : ""
    }\n\n_Engine: ${a.engine}_`;
    return { summary: a.summary.slice(0, 200), markdown: md, warnings: a.injectionFlags.map((f) => `Content contains instruction-like text (${f.reason}); treated as data only.`) };
  },
});

export const documentTools = [documentProcess, documentCreate, textGenerate, textSummarize, dataAnalyze, spreadsheetCompare, spreadsheetWrite];
