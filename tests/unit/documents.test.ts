import { describe, expect, it } from "vitest";
import { chunkPages, sampleForAnalysis } from "@/lib/documents/chunk";
import { contentMatchesKind, safeFileName, sniffKind, validateUpload } from "@/lib/security/files";
import { classifyLink, isPrivateAddress, parseHttpUrl, youtubeId } from "@/lib/security/url";

describe("chunking", () => {
  it("keeps page numbers and respects the size limit", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about depreciation and revaluation.`).join(" ");
    const chunks = chunkPages([{ page: 1, text: "Short intro paragraph about IAS 16." }, { page: 2, text: long + "\n\n" + long }], { maxChars: 800, overlapChars: 100 });
    // The one-line page 1 is merged into the first chunk (and keeps its page), not dropped.
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].content).toContain("Short intro paragraph");
    expect(chunks.slice(1).every((c) => c.pageNumber === 2)).toBe(true);
    expect(chunks.every((c) => c.content.length <= 900)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("skips empty pages and samples long documents within budget", () => {
    const pages = Array.from({ length: 50 }, (_, i) => ({ page: i + 1, text: i % 7 === 0 ? "   " : "Content ".repeat(300) }));
    const chunks = chunkPages(pages);
    expect(chunks.some((c) => c.pageNumber === 1)).toBe(false);
    const sample = sampleForAnalysis(chunks, 10000);
    expect(sample.length).toBeLessThan(12000);
    expect(sample).toContain("[p.");
  });
});

describe("upload validation", () => {
  const MB = 1024 * 1024;
  it("accepts allowed types and rejects the rest", () => {
    expect(validateUpload({ name: "notes.pdf", size: MB, type: "application/pdf" }, ["pdf"], 25 * MB)).toMatchObject({ ok: true, kind: "pdf" });
    expect(validateUpload({ name: "virus.exe", size: MB, type: "application/x-msdownload" }, ["pdf"], 25 * MB).ok).toBe(false);
    expect(validateUpload({ name: "big.pdf", size: 30 * MB, type: "application/pdf" }, ["pdf"], 25 * MB).ok).toBe(false);
    expect(validateUpload({ name: "slides.pptx", size: MB, type: "" }, ["pptx"], 25 * MB)).toMatchObject({ ok: true, kind: "pptx" });
  });

  it("checks magic bytes, not just the extension", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 ...");
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(sniffKind(pdf)).toBe("pdf");
    expect(contentMatchesKind(pdf, "pdf")).toBe(true);
    expect(contentMatchesKind(html, "pdf")).toBe(false);
    expect(contentMatchesKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]), "docx")).toBe(true);
    expect(sniffKind(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it("sanitises file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("FAR Notes (final).pdf")).toBe("FAR-Notes-final.pdf");
  });
});

describe("url guards", () => {
  it("only allows public http(s) URLs", () => {
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("https://user:pass@example.com")).toBeNull();
    expect(parseHttpUrl("https://example.com/a")?.hostname).toBe("example.com");
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "172.20.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("recognises YouTube and Drive links", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=5")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/abcdefg")).toBe("abcdefg");
    expect(classifyLink("https://drive.google.com/file/d/x")).toBe("drive");
    expect(classifyLink("https://ifrs.org")).toBe("web");
  });
});
