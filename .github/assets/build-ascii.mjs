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

const COLS = 16;
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

// At small sizes the eyes — which are holes in the body rather than dark
// shapes — antialias away entirely. They are located in a large render, where
// they still exist, and mapped back onto the grid.
async function eyes() {
  const BIG = 120;
  const big = Math.round(BIG * (3306 / 3483));
  const { data: hi } = await sharp(".github/assets/lumi.svg")
    .resize({ width: BIG, height: big, fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const clear = (x, y) => hi[(y * BIG + x) * 4 + 3] <= 128;

  // Flood from the border to find the background, so what remains is enclosed.
  const outside = new Set();
  const queue = [];
  for (let x = 0; x < BIG; x++) queue.push([x, 0], [x, big - 1]);
  for (let y = 0; y < big; y++) queue.push([0, y], [BIG - 1, y]);
  while (queue.length) {
    const [x, y] = queue.pop();
    const k = y * BIG + x;
    if (
      x < 0 ||
      y < 0 ||
      x >= BIG ||
      y >= big ||
      outside.has(k) ||
      !clear(x, y)
    )
      continue;
    outside.add(k);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Group the enclosed gaps, then keep the two biggest: the eyes.
  const seen = new Set();
  const holes = [];
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < BIG; x++) {
      const k = y * BIG + x;
      if (!clear(x, y) || outside.has(k) || seen.has(k)) continue;
      const cells = [];
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const ck = cy * BIG + cx;
        if (cx < 0 || cy < 0 || cx >= BIG || cy >= big) continue;
        if (!clear(cx, cy) || outside.has(ck) || seen.has(ck)) continue;
        seen.add(ck);
        cells.push([cx, cy]);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      holes.push(cells);
    }
  }

  return holes
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .map((cells) => {
      const cx = cells.reduce((t, c) => t + c[0], 0) / cells.length;
      const cy = cells.reduce((t, c) => t + c[1], 0) / cells.length;
      return [Math.round((cx / BIG) * COLS), Math.round((cy / big) * height)];
    });
}

const EYES = await eyes();
const isEye = (x, y) => EYES.some(([ex, ey]) => ex === x && ey === y);

const at = (x, y) => {
  if (isEye(x, y)) return null;
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
    const t = at(x, y),
      b = at(x, y + 1);
    line += t && b ? "█" : t ? "▀" : b ? "▄" : " ";
  }
  plain.push(" ".repeat(PAD_X) + line.replace(/\s+$/, ""));
}

const list = (arr) => arr.map((l) => `  ${JSON.stringify(l)},`).join("\n");
const p = "packages/create-lumos/bin/create-lumos.js";
let s = await readFile(p, "utf8");
s = s.replace(
  /const MASCOT = \[[\s\S]*?\n\];\n\nconst MASCOT_PLAIN = \[[\s\S]*?\n\];/,
  `const MASCOT = [\n${list(colour)}\n];\n\nconst MASCOT_PLAIN = [\n${list(plain)}\n];`,
);
s = s.replace(/const CARD_COLS = \d+;/, `const CARD_COLS = ${width};`);
await writeFile(p, s);

console.log("eyes at:", EYES);
console.log("card:", width, "cols x", colour.length, "rows");
console.log("bytes:", colour.join("").length + plain.join("").length);
console.log(plain.join("\n"));
