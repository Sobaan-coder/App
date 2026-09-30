// Generates PWA icons from the Study OS logo mark. Run: npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const mark = (padding: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5bf0"/><stop offset="1" stop-color="#3f4fd8"/></linearGradient></defs>
  <rect width="512" height="512" rx="${padding ? 0 : 144}" fill="url(#g)"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - padding * 2) / 512})">
    <path d="M144 184 256 128l112 56-112 56-112-56Z" fill="#fff" opacity=".95"/>
    <path d="M144 259 256 315l112-56M144 331 256 387l112-56" fill="none" stroke="#fff" stroke-width="29" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const jobs = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  { file: "maskable-512.png", size: 512, padding: 80 },
  { file: "apple-touch-icon.png", size: 180, padding: 40 },
];
for (const j of jobs) await sharp(Buffer.from(mark(j.padding))).resize(j.size, j.size).png().toFile(`public/icons/${j.file}`);
await sharp(Buffer.from(mark(0))).resize(32, 32).png().toFile("public/favicon.png");
console.log("icons generated");
