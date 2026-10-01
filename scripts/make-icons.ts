import fs from "node:fs";
import sharp from "sharp";

/** Generates the PNG app icons (iPhone home screen, Android install) from public/icon.svg. */
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
  console.log("✓ icons written to public/");
}
main();
