// Rebuilds the terminal artwork baked into create-lumos from lumi.svg. Run from
// the repository root, so that `sharp` and the asset paths resolve:
//
//   node .github/assets/build-ascii.mjs
//
// Braille characters carry eight dots in a two by four grid. A terminal cell is
// about twice as tall as it is wide, which makes those dots square and gives
// four times the pixels of a half block for the same space on screen.
//
// Two renderings are produced. The colour one puts each cell on a dark card,
// since Lumi is white with transparent eyes and would otherwise disappear on a
// light terminal. The plain one is used when colour is off.

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const CELLS = 16;
const RATIO = 3306 / 3483;
const CARD = [30, 30, 30];
const PALETTE = [
  [255, 255, 255],
  [194, 245, 47],
  [30, 30, 30],
];

// Dot bits, indexed [x][y] within the cell.
const DOT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

const nearest = (r, g, b) =>
  PALETTE.reduce(
    (best, c) => {
      const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      return d < best.d ? { c, d } : best;
    },
    { d: Infinity },
  ).c;

// The eyes are holes in the body rather than dark shapes, so they antialias
// away at this size. They are located in a large render, where they survive,
// and mapped back on as fractions of the image.
async function eyeCentres() {
  const BIG = 120;
  const big = Math.round(BIG * RATIO);
  const { data } = await sharp(".github/assets/lumi.svg")
    .resize({ width: BIG, height: big, fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const clear = (x, y) => data[(y * BIG + x) * 4 + 3] <= 128;

  // Flood from the border, so that what stays unvisited is enclosed.
  const outside = new Set();
  const queue = [];
  for (let x = 0; x < BIG; x++) queue.push([x, 0], [x, big - 1]);
  for (let y = 0; y < big; y++) queue.push([0, y], [BIG - 1, y]);
  while (queue.length) {
    const [x, y] = queue.pop();
    const k = y * BIG + x;
    if (x < 0 || y < 0 || x >= BIG || y >= big) continue;
    if (outside.has(k) || !clear(x, y)) continue;
    outside.add(k);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

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
    .map((cells) => [
      cells.reduce((t, c) => t + c[0], 0) / cells.length / BIG,
      cells.reduce((t, c) => t + c[1], 0) / cells.length / big,
    ]);
}

const W = CELLS * 2;
const H = Math.ceil(Math.round(W * RATIO) / 4) * 4;

const { data } = await sharp(".github/assets/lumi.svg")
  .resize({ width: W, height: H, fit: "fill" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const eyes = (await eyeCentres()).map(([u, v]) => [
  Math.round(u * W),
  Math.round(v * H),
]);
const isEye = (x, y) =>
  eyes.some(([ex, ey]) => Math.abs(ex - x) < 1 && Math.abs(ey - y) < 1);
const lit = (x, y) => !isEye(x, y) && data[(y * W + x) * 4 + 3] > 128;

const colour = [];
const plain = [];
for (let cy = 0; cy < H / 4; cy++) {
  let line = "";
  let flat = "";
  let last = "";
  for (let cx = 0; cx < CELLS; cx++) {
    let bits = 0;
    const tally = new Map();
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 4; dy++) {
        const x = cx * 2 + dx;
        const y = cy * 4 + dy;
        if (!lit(x, y)) continue;
        bits |= DOT[dx][dy];
        const i = (y * W + x) * 4;
        const key = nearest(data[i], data[i + 1], data[i + 2]).join(";");
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    // One colour per cell, so the dominant one wins.
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const code = `\x1b[38;2;${top ? top[0] : "255;255;255"}m\x1b[48;2;${CARD.join(";")}m`;
    if (code !== last) {
      line += code;
      last = code;
    }
    const glyph = String.fromCharCode(0x2800 + bits);
    line += glyph;
    flat += glyph;
  }
  colour.push(`${line}\x1b[0m`);
  plain.push(flat.replace(/⠀+$/, ""));
}

const list = (arr) => arr.map((l) => `  ${JSON.stringify(l)},`).join("\n");
const p = "packages/create-lumos/bin/create-lumos.js";
let s = await readFile(p, "utf8");
s = s.replace(
  /const MASCOT = \[[\s\S]*?\n\];\n\nconst MASCOT_PLAIN = \[[\s\S]*?\n\];/,
  `const MASCOT = [\n${list(colour)}\n];\n\nconst MASCOT_PLAIN = [\n${list(plain)}\n];`,
);
s = s.replace(/const CARD_COLS = \d+;/, `const CARD_COLS = ${CELLS};`);
await writeFile(p, s);

console.log("dots:", W, "x", H, "-> cells:", CELLS, "x", H / 4);
console.log("eyes at dot:", eyes);
console.log(plain.join("\n"));
