import "server-only";
import type { FileKind } from "@/lib/security/files";
import type { Page } from "./chunk";

export type Extraction = { pages: Page[]; pageCount: number; charCount: number };

/** Extract text per page/slide. Returns few characters for scanned PDFs → caller runs OCR. */
export async function extractText(kind: FileKind, bytes: Uint8Array): Promise<Extraction> {
  let pages: Page[] = [];
  switch (kind) {
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await pdfText(pdf, { mergePages: false });
      pages = (text as string[]).map((t, i) => ({ page: i + 1, text: t }));
      break;
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      // DOCX has no fixed pages; approximate "pages" of ~3000 characters for citations.
      const parts = value.split(/\n{2,}/);
      let buf = "";
      for (const p of parts) {
        if ((buf + p).length > 3000 && buf) {
          pages.push({ page: pages.length + 1, text: buf });
          buf = "";
        }
        buf += p + "\n\n";
      }
      if (buf.trim()) pages.push({ page: pages.length + 1, text: buf });
      break;
    }
    case "pptx": {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(bytes);
      const slides = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
      for (const name of slides) {
        const xml = await zip.file(name)!.async("string");
        const text = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g), (m) => decodeXml(m[1])).join(" ");
        pages.push({ page: pages.length + 1, text });
      }
      break;
    }
    case "txt": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const parts = text.split(/\n{2,}/);
      let buf = "";
      for (const p of parts) {
        if ((buf + p).length > 3000 && buf) {
          pages.push({ page: pages.length + 1, text: buf });
          buf = "";
        }
        buf += p + "\n\n";
      }
      if (buf.trim()) pages.push({ page: pages.length + 1, text: buf });
      break;
    }
    case "image":
      pages = []; // images always go through OCR
      break;
  }
  const charCount = pages.reduce((a, p) => a + p.text.trim().length, 0);
  return { pages, pageCount: pages.length, charCount };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** True when a PDF looks scanned (little extractable text per page). */
export function looksScanned(ex: Extraction) {
  return ex.pageCount === 0 || ex.charCount / Math.max(ex.pageCount, 1) < 80;
}
