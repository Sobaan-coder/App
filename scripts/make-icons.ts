import fs from "node:fs";
import sharp from "sharp";

/** Generates the PNG app icons (iPhone home screen, Android install) and the Windows .ico from public/icon.svg. */
async function main() {
  const svg = fs.readFileSync("public/icon.svg");
  for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]] as const) {
    await sharp(svg, { density: 512 }).resize(size, size).png().toFile(`public/${file}`);
  }
  // maskable: artwork inside the 80% safe zone on a full-bleed background
  const inner = await sharp(svg, { density: 512 }).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#5b3be8" } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile("public/icon-maskable-512.png");
  // Windows .ico (PNG-compressed entries, Vista+) for the desktop / Start-menu shortcuts
  const sizes = [16, 32, 48, 256];
  const pngs = await Promise.all(sizes.map((s) => sharp(svg, { density: 512 }).resize(s, s).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const o = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, o);
    header.writeUInt8(s >= 256 ? 0 : s, o + 1);
    header.writeUInt16LE(1, o + 4); // colour planes
    header.writeUInt16LE(32, o + 6); // bits per pixel
    header.writeUInt32LE(pngs[i].length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync("public/khokhar.ico", Buffer.concat([header, ...pngs]));
  console.log("✓ icons written to public/");
}
main();
