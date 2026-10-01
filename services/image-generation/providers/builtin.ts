import type { ImageProvider, ImageRequest } from "../types";

/**
 * Built-in branded graphic renderer (SVG → PNG with sharp). 100% local and free, always works.
 * It is honest about what it is: a clean branded promo card, not a photograph.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    return kept;
  }
  return lines;
}

function validHex(c: string | undefined, fallback: string) {
  return c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

export function renderBrandCardSvg(req: ImageRequest): string {
  const { spec, brand, product } = req;
  const W = spec.width;
  const H = spec.height;
  const c1 = validHex(brand.colors[0], "#1f1147");
  const c2 = validHex(brand.colors[1], "#7c3aed");
  const accent = validHex(brand.colors[2], "#f5b041");
  const title = product?.name ?? brand.name;
  const titleLines = wrap(title.toUpperCase(), W > 1000 && H > 1500 ? 14 : 16, 3);
  // shrink the headline so the longest line always fits (bold sans ≈ 0.78em per uppercase glyph)
  const longest = Math.max(...titleLines.map((l) => l.length), 1);
  const fs = Math.round(Math.min(W / 11, (W * 0.82) / (longest * 0.78)));
  const cy = H * 0.52;
  const offer = product?.special_offer?.trim();
  const price =
    product?.price !== null && product?.price !== undefined && product.price !== "" && product.available !== false
      ? `${req.currency ?? ""} ${Number(product.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`.trim()
      : "";
  const pattern = Array.from({ length: 14 }, (_, i) => {
    const x = (i * 197) % W;
    const y = (i * 311) % H;
    return `<circle cx="${x}" cy="${y}" r="${40 + ((i * 37) % 90)}" fill="${accent}" opacity="0.05"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity="0.55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${pattern}
  <circle cx="${W / 2}" cy="${cy}" r="${W * 0.42}" fill="url(#glow)"/>
  <circle cx="${W / 2}" cy="${cy}" r="${W * 0.3}" fill="none" stroke="${accent}" stroke-width="${W * 0.006}" opacity="0.8"/>
  <circle cx="${W / 2}" cy="${cy}" r="${W * 0.27}" fill="#ffffff" opacity="0.06"/>
  <text x="${W / 2}" y="${H * 0.1}" font-family="DejaVu Serif, Georgia, serif" font-size="${Math.round(W / 26)}" letter-spacing="6" fill="${accent}" text-anchor="middle">${esc((brand.legal_name || brand.name).toUpperCase())}</text>
  ${brand.tagline ? `<text x="${W / 2}" y="${H * 0.1 + W / 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${Math.round(W / 40)}" letter-spacing="4" fill="#ffffff" opacity="0.8" text-anchor="middle">${esc(brand.tagline.toUpperCase())}</text>` : ""}
  ${titleLines
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${cy - ((titleLines.length - 1) * fs * 1.1) / 2 + i * fs * 1.1 + fs * 0.35}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${fs}" fill="#ffffff" text-anchor="middle">${esc(l)}</text>`,
    )
    .join("\n  ")}
  ${
    offer
      ? `<rect x="${W * 0.14}" y="${H * 0.76}" width="${W * 0.72}" height="${W * 0.12}" rx="${W * 0.06}" fill="${accent}"/>
  <text x="${W / 2}" y="${H * 0.76 + W * 0.078}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${Math.round(W / 22)}" fill="${c1}" text-anchor="middle">${esc(offer.slice(0, 32).toUpperCase())}</text>`
      : ""
  }
  ${price ? `<text x="${W / 2}" y="${H * (offer ? 0.9 : 0.8)}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${Math.round(W / 16)}" fill="${accent}" text-anchor="middle">${esc(price)}</text>` : ""}
  <text x="${W / 2}" y="${H * 0.95}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${Math.round(W / 45)}" fill="#ffffff" opacity="0.7" text-anchor="middle">${esc(brand.name)}</text>
</svg>`;
}

export const builtinProvider: ImageProvider = {
  id: "builtin",
  label: "Built-in brand card renderer",
  cost: "free",
  local: true,
  configured: () => true,
  async generate(req: ImageRequest) {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(renderBrandCardSvg(req))).png().toBuffer();
    return { data: png, mime: "image/png", provider: "builtin" };
  },
};
