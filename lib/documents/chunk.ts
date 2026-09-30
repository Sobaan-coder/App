// Page-aware chunking. Chunks keep the page they start on so the tutor can
// cite "FAR Notes.pdf — Page 14".

export type Page = { page: number; text: string };
export type Chunk = { index: number; pageNumber: number | null; content: string; tokenEstimate: number };

export function normaliseText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

/** Split long text on paragraph → sentence → word boundaries into pieces ≤ maxChars. */
function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let buf = "";
  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };
  for (const para of paragraphs) {
    if (para.length > maxChars) {
      flush();
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (s.length > maxChars) {
          flush();
          for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars));
        } else if ((buf + " " + s).length > maxChars) {
          flush();
          buf = s;
        } else buf = buf ? `${buf} ${s}` : s;
      }
      flush();
    } else if ((buf + "\n\n" + para).length > maxChars) {
      flush();
      buf = para;
    } else buf = buf ? `${buf}\n\n${para}` : para;
  }
  flush();
  return out;
}

export function chunkPages(pages: Page[], opts: { maxChars?: number; overlapChars?: number; minChars?: number } = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 3200;
  const overlap = opts.overlapChars ?? 300;
  const minChars = opts.minChars ?? 40;
  const chunks: Chunk[] = [];
  let carry = "";
  // Very short pieces (a heading, a one-line page) are merged into the next chunk, never dropped.
  let pending: { text: string; page: number } | null = null;

  for (const { page, text } of pages) {
    const clean = normaliseText(text);
    if (!clean) continue;
    for (const piece of splitText(clean, maxChars - overlap)) {
      if (piece.length < minChars) {
        pending = pending ? { text: `${pending.text}\n${piece}`, page: pending.page } : { text: piece, page };
        continue;
      }
      const body = pending ? `${pending.text}\n\n${piece}` : piece;
      const content = (carry ? carry + " … " : "") + body;
      chunks.push({ index: chunks.length, pageNumber: pending?.page ?? page, content, tokenEstimate: estimateTokens(content) });
      pending = null;
      carry = overlap > 0 ? piece.slice(-overlap).replace(/^\S*\s/, "") : "";
    }
  }
  if (pending) {
    chunks.push({ index: chunks.length, pageNumber: pending.page, content: pending.text, tokenEstimate: estimateTokens(pending.text) });
  }
  return chunks;
}

/** A bounded, representative sample of a document for one-off analysis (cost control). */
export function sampleForAnalysis(chunks: Chunk[], maxChars = 24000): string {
  if (chunks.length === 0) return "";
  const total = chunks.reduce((a, c) => a + c.content.length, 0);
  if (total <= maxChars) return chunks.map((c) => `[p.${c.pageNumber ?? "?"}] ${c.content}`).join("\n\n");
  // Take evenly spaced chunks across the document.
  const per = Math.max(1, Math.floor(maxChars / 1600));
  const step = chunks.length / per;
  const picked: Chunk[] = [];
  for (let i = 0; i < per && Math.floor(i * step) < chunks.length; i++) picked.push(chunks[Math.floor(i * step)]);
  return picked.map((c) => `[p.${c.pageNumber ?? "?"}] ${c.content.slice(0, 1600)}`).join("\n\n");
}
