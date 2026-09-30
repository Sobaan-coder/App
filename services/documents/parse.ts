import path from "node:path";
import Papa from "papaparse";

export interface ParsedTable {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
}

export interface ParsedDocument {
  kind: "pdf" | "docx" | "spreadsheet" | "csv" | "text" | "image" | "unsupported";
  text: string;
  tables?: ParsedTable[];
  pages?: number;
  note?: string;
}

const TEXT_EXT = new Set([".txt", ".md", ".json", ".html", ".htm", ".xml", ".log", ".ics"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

function cellValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if ("text" in o) return String(o.text);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("");
  }
  return String(v);
}

export function tablesToText(tables: ParsedTable[], maxRows = 200): string {
  return tables
    .map((t) => {
      const rows = t.rows.slice(0, maxRows).map((r) => r.map((c) => (c === null ? "" : String(c))).join(" | "));
      return `## ${t.name}\n${t.headers.join(" | ")}\n${rows.join("\n")}${t.rows.length > maxRows ? `\n… ${t.rows.length - maxRows} more rows` : ""}`;
    })
    .join("\n\n");
}

export async function parseSpreadsheet(buf: Buffer): Promise<ParsedTable[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const tables: ParsedTable[] = [];
  wb.eachSheet((ws) => {
    const all: (string | number | boolean | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map(cellValue);
      all.push(values);
    });
    const [head, ...rows] = all;
    tables.push({ name: ws.name, headers: (head ?? []).map((h) => String(h ?? "")), rows });
  });
  return tables;
}

export function parseCsv(text: string, name = "CSV"): ParsedTable {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true, dynamicTyping: false });
  const [head, ...rows] = res.data;
  return {
    name,
    headers: (head ?? []).map(String),
    rows: rows.map((r) => r.map((c) => (c !== "" && !isNaN(Number(c)) ? Number(c) : c))),
  };
}

async function ocr(buf: Buffer): Promise<ParsedDocument> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(buf);
    await worker.terminate();
    return { kind: "image", text: data.text ?? "", note: "Text extracted with OCR (tesseract.js)" };
  } catch (err) {
    return {
      kind: "image",
      text: "",
      note: `OCR unavailable (${(err as Error).message}). tesseract.js downloads language data on first use — check internet access.`,
    };
  }
}

/** Extract text (and tables) from a file buffer based on its extension. */
export async function parseDocument(name: string, buf: Buffer, opts: { ocr?: boolean } = {}): Promise<ParsedDocument> {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const t = Array.isArray(text) ? text.join("\n") : text;
    return {
      kind: "pdf",
      text: t,
      pages: totalPages,
      note: t.trim().length < 20 ? "This PDF has little or no text layer (maybe scanned). OCR of PDFs is not supported yet — export pages as images and upload them for OCR." : undefined,
    };
  }
  if (ext === ".docx") {
    const mammoth = (await import("mammoth")).default;
    const r = await mammoth.extractRawText({ buffer: buf });
    return { kind: "docx", text: r.value };
  }
  if (ext === ".xlsx") {
    const tables = await parseSpreadsheet(buf);
    return { kind: "spreadsheet", text: tablesToText(tables), tables };
  }
  if (ext === ".csv") {
    const t = parseCsv(buf.toString("utf8"), path.basename(name));
    return { kind: "csv", text: tablesToText([t]), tables: [t] };
  }
  if (TEXT_EXT.has(ext)) {
    let text = buf.toString("utf8");
    if (ext === ".html" || ext === ".htm") {
      const { load } = await import("cheerio");
      const $ = load(text);
      $("script,style,noscript").remove();
      text = $("body").text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ");
    }
    return { kind: "text", text };
  }
  if (IMAGE_EXT.has(ext)) {
    if (opts.ocr === false) return { kind: "image", text: "", note: "Image (OCR not requested)" };
    return ocr(buf);
  }
  return { kind: "unsupported", text: "", note: `File type ${ext || "(none)"} is not supported for text extraction` };
}
