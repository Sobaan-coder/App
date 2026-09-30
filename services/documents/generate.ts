/**
 * Document generation: Markdown in → PDF / DOCX / XLSX / CSV / TXT / MD out. All local, all free.
 */
import Papa from "papaparse";

export type DocFormat = "md" | "txt" | "pdf" | "docx" | "xlsx" | "csv";

export interface TableData {
  name?: string;
  headers: string[];
  rows: (string | number | null)[][];
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "li"; text: string; ordered: boolean }
  | { type: "hr" };

/** Tiny markdown → blocks parser (headings, paragraphs, bullet/numbered lists, rules). */
export function mdBlocks(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ type: "h", level: h[1].length, text: h[2] });
    } else if (li) {
      flush();
      out.push({ type: "li", text: li[1], ordered: false });
    } else if (ol) {
      flush();
      out.push({ type: "li", text: ol[1], ordered: true });
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      out.push({ type: "hr" });
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

export const stripInline = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

export function mdToText(md: string): string {
  return mdBlocks(md)
    .map((b) =>
      b.type === "h" ? `${stripInline(b.text).toUpperCase()}\n` : b.type === "li" ? `  • ${stripInline(b.text)}` : b.type === "hr" ? "—".repeat(20) : `${stripInline(b.text)}\n`,
    )
    .join("\n");
}

// pdf-lib's standard fonts are WinAnsi only: replace unsupported characters.
function winAnsi(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export async function mdToPdf(title: string, md: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(title));
  doc.setCreator("My AI Command Center");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28,
    H = 841.89,
    M = 56;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const wrap = (text: string, f: typeof font, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
    }
    return lines;
  };
  const draw = (text: string, opts: { size: number; f: typeof font; indent?: number; gap?: number; color?: [number, number, number] }) => {
    const lines = wrap(winAnsi(text), opts.f, opts.size, W - 2 * M - (opts.indent ?? 0));
    for (const l of lines) {
      if (y < M + opts.size) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      page.drawText(l, { x: M + (opts.indent ?? 0), y, size: opts.size, font: opts.f, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
      y -= opts.size * 1.4;
    }
    y -= opts.gap ?? 4;
  };

  draw(title, { size: 20, f: bold, gap: 6, color: [0.3, 0.15, 0.6] });
  draw(`Generated ${new Date().toLocaleString("en-GB")}`, { size: 9, f: font, gap: 14, color: [0.45, 0.45, 0.5] });
  let n = 0;
  for (const b of mdBlocks(md)) {
    if (b.type === "h") {
      n = 0;
      y -= 6;
      draw(stripInline(b.text), { size: b.level <= 1 ? 16 : b.level === 2 ? 13.5 : 12, f: bold, gap: 4 });
    } else if (b.type === "li") {
      n = b.ordered ? n + 1 : 0;
      draw(`${b.ordered ? `${n}.` : "-"} ${stripInline(b.text)}`, { size: 10.5, f: font, indent: 12, gap: 1 });
    } else if (b.type === "hr") {
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
      y -= 12;
    } else draw(stripInline(b.text), { size: 10.5, f: font, gap: 6 });
  }
  return Buffer.from(await doc.save());
}

export async function mdToDocx(title: string, md: string): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  const runs = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
      part.startsWith("**") ? new TextRun({ text: stripInline(part), bold: true }) : new TextRun(stripInline(part)),
    );
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  for (const b of mdBlocks(md)) {
    if (b.type === "h") children.push(new Paragraph({ children: runs(b.text), heading: levels[Math.min(3, b.level - 1)] }));
    else if (b.type === "li")
      children.push(new Paragraph({ children: runs(b.text), ...(b.ordered ? { numbering: undefined, bullet: { level: 0 } } : { bullet: { level: 0 } }) }));
    else if (b.type === "hr") children.push(new Paragraph({ text: "" }));
    else children.push(new Paragraph({ children: runs(b.text), spacing: { after: 120 } }));
  }
  const doc = new Document({ creator: "My AI Command Center", title, sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function tablesToXlsx(tables: TableData[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "My AI Command Center";
  tables.forEach((t, i) => {
    const ws = wb.addWorksheet((t.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, "").slice(0, 31) || `Sheet${i + 1}`);
    ws.addRow(t.headers);
    ws.getRow(1).font = { bold: true };
    for (const r of t.rows) ws.addRow(r);
    ws.columns.forEach((c) => (c.width = 18));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function tableToCsv(t: TableData): string {
  return Papa.unparse({ fields: t.headers, data: t.rows });
}

/** Extract the first markdown table in `md` (for "create an Excel report" style requests). */
export function mdTables(md: string): TableData[] {
  const out: TableData[] = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const headers = cells(lines[i]);
      const rows: (string | number | null)[][] = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        rows.push(cells(lines[j]).map((c) => (c !== "" && !isNaN(Number(c.replace(/,/g, ""))) ? Number(c.replace(/,/g, "")) : c)));
        j++;
      }
      out.push({ name: `Table ${out.length + 1}`, headers, rows });
      i = j;
    }
  }
  return out;
}

export async function renderDocument(format: DocFormat, title: string, markdown: string, tables?: TableData[]): Promise<{ data: Buffer; ext: string }> {
  switch (format) {
    case "pdf":
      return { data: await mdToPdf(title, markdown), ext: ".pdf" };
    case "docx":
      return { data: await mdToDocx(title, markdown), ext: ".docx" };
    case "xlsx": {
      const t = tables?.length ? tables : mdTables(markdown);
      const data = t.length ? t : [{ name: "Report", headers: ["Line"], rows: mdToText(markdown).split("\n").filter(Boolean).map((l) => [l]) }];
      return { data: await tablesToXlsx(data), ext: ".xlsx" };
    }
    case "csv": {
      const t = tables?.[0] ?? mdTables(markdown)[0] ?? { headers: ["Line"], rows: mdToText(markdown).split("\n").filter(Boolean).map((l) => [l]) };
      return { data: Buffer.from(tableToCsv(t), "utf8"), ext: ".csv" };
    }
    case "txt":
      return { data: Buffer.from(`${title}\n\n${mdToText(markdown)}`, "utf8"), ext: ".txt" };
    default:
      return { data: Buffer.from(`# ${title}\n\n${markdown}\n`, "utf8"), ext: ".md" };
  }
}
