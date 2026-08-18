// Rebuilds the terminal artwork baked into create-lumos from lumi.svg. Run from
// the repository root, so that `sharp` and the asset paths resolve:
//
//   node .github/assets/build-ascii.mjs
//
// Two renderings are produced. The colour one draws Lumi on a dark card, since
// the mascot is white with transparent eyes and would otherwise disappear on a
// light terminal. The plain one is a silhouette, used when colour is off.

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const COLS = 30;
const PAD_X = 2;
const PAD_Y = 1;
const CARD = [30, 30, 30];
const PALETTE = [
  [255, 255, 255],
  [194, 245, 47],
  [30, 30, 30],
];

const nearest = (r, g, b) =>
  PALETTE.reduce(
    (best, c) => {
      const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      return d < best.d ? { c, d } : best;
    },
    { d: Infinity },
  ).c;

const rows = Math.round(COLS * (3306 / 3483));
const height = rows % 2 ? rows + 1 : rows;

const { data } = await sharp(".github/assets/lumi.svg")
  .resize({ width: COLS, height, fit: "fill" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const at = (x, y) => {
  const i = (y * COLS + x) * 4;
  return data[i + 3] > 128 ? nearest(data[i], data[i + 1], data[i + 2]) : null;
};

// Colour: one half block per cell, foreground for the upper pixel and
// background for the lower one. Codes are emitted only when they change.
const colour = [];
const width = COLS + PAD_X * 2;
for (let y = -PAD_Y * 2; y < height + PAD_Y * 2; y += 2) {
  let line = "";
  let last = "";
  for (let x = -PAD_X; x < COLS + PAD_X; x++) {
    const inside = x >= 0 && x < COLS && y >= 0 && y < height;
    const top = inside ? (at(x, y) ?? CARD) : CARD;
    const bottom = inside ? (at(x, y + 1) ?? CARD) : CARD;
    const code = `\x1b[38;2;${top.join(";")}m\x1b[48;2;${bottom.join(";")}m`;
    if (code !== last) {
      line += code;
      last = code;
    }
    line += "▀";
  }
  colour.push(`${line}\x1b[0m`);
}

// Plain: alpha only, so the shape still reads without colour.
const plain = [];
for (let y = 0; y < height; y += 2) {
  let line = "";
  for (let x = 0; x < COLS; x++) {
    const t = at(x, y), b = at(x, y + 1);
    line += t && b ? "█" : t ? "▀" : b ? "▄" : " ";
  }
  plain.push(" ".repeat(PAD_X) + line.replace(/\s+$/, ""));
}

const list = (arr) => arr.map((l) => `  ${JSON.stringify(l)},`).join("\n");
const p = "packages/create-lumos/bin/create-lumos.js";
let s = await readFile(p, "utf8");
s = s.replace(
  /const MARK = \[[\s\S]*?\n\];/,
  `const MASCOT = [\n${list(colour)}\n];\n\nconst MASCOT_PLAIN = [\n${list(plain)}\n];`,
);
await writeFile(p, s);

console.log("card:", width, "cols x", colour.length, "rows");
console.log("bytes:", colour.join("").length + plain.join("").length);
console.log(plain.join("\n"));
