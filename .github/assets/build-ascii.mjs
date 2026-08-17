import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const size = 22, threshold = 40;
const { data } = await sharp(".github/assets/logo.svg", { density: 600 })
  .resize({ width: size, height: size, fit: "fill" })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const on = (x, y) => y < size && data[(y * size + x) * 4 + 3] > threshold;

const lines = [];
for (let y = 0; y < size; y += 2) {
  let line = "";
  for (let x = 0; x < size; x++) {
    const t = on(x, y), b = on(x, y + 1);
    line += t && b ? "█" : t ? "▀" : b ? "▄" : " ";
  }
  lines.push(line.replace(/\s+$/, ""));
}

const literal = lines.map((l) => `  ${JSON.stringify(l)},`).join("\n");
const p = "packages/create-lumos/bin/create-lumos.js";
let s = await readFile(p, "utf8");

const marker = "const ESC =";
s = s.replace(
  marker,
  `// The Lumos mark, downsampled from logo.svg onto half-block characters.
// Rebuild with .github/assets/build-ascii.mjs if the mark changes.
const MARK = [
${literal}
];

${marker}`,
);
await writeFile(p, s);
console.log(lines.join("\n"));
console.log("\nwidest row:", Math.max(...lines.map((l) => l.length)), "cols,", lines.length, "rows");
