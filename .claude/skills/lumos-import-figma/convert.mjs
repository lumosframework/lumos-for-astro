#!/usr/bin/env node
/**
 * Turns measurements taken off a Figma frame into Lumos tokens.
 *
 * Figma cannot express three things this system relies on, so every value
 * arrives in a form that has to be converted back:
 *
 *   rem          Figma is px-only. Divide by 16.
 *   line-height  Figma has no unitless or % variables. Divide the line
 *                height by the font size.
 *   letter-      Figma is px or %, this system is em. px divided by the font
 *   spacing      size, or % divided by 100 — both give em.
 *   color-mix    Figma has no mixing, so designers restate the same hex at
 *                a lower opacity. Alpha becomes the mix percentage.
 *
 * A desktop frame is measured at 1440px, which is --viewport-max, so a value
 * read off that frame is the token's MAX. The min is derived from the ratio
 * of whichever existing token is closest in size, and reported as a guess.
 *
 * Reports only. Placing tokens in the right section of base.css is a judgement
 * call about what a value means, so it stays with whoever is reading the design.
 *
 * Usage
 *   node convert.mjs --json design.json [--css path/to/base.css]
 *   node convert.mjs --px 30
 *   node convert.mjs --lh 50/42
 *   node convert.mjs --color "#FFFFFF@60"
 */

import { readFileSync } from "node:fs";

/* Moves independently of the framework: a skill fix does not need a release,
   and a release does not invalidate the skill. */
const SKILL_VERSION = "1.0.0";
/* A pin, not a mirror: the release this skill was last checked against.
   Deriving it from package.json would make it always equal to the running
   version, and the mismatch note would never fire. */
const TESTED_AGAINST = "0.0.3";

const ROOT_PX = 16;
const SNAP_PX = 2; // ±2px counts as drift, not a decision
const SNAP_LH = 0.05;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const cssPath = flag("css") ?? "src/styles/base.css";

/* ---------- read what the system already has ---------- */

function readTokens(css) {
  const num = (re) => {
    const out = {};
    for (const m of css.matchAll(re)) out[m[1]] = Number(m[2]);
    return out;
  };
  const mins = num(/--([a-z0-9-]+)-min:\s*([\d.]+)/g);
  const maxes = num(/--([a-z0-9-]+)-max:\s*([\d.]+)/g);

  const scale = {};
  for (const name of Object.keys(maxes)) {
    if (mins[name] === undefined) continue;
    if (name.startsWith("viewport")) continue;
    scale[name] = { min: mins[name], max: maxes[name] };
  }

  const lineHeights = {};
  for (const m of css.matchAll(/--line-height-([a-z]+):\s*([\d.]+)/g)) {
    lineHeights[`--line-height-${m[1]}`] = Number(m[2]);
  }

  const letterSpacing = {};
  for (const m of css.matchAll(/--letter-spacing-([a-z]+):\s*(-?[\d.]+)em/g)) {
    letterSpacing[`--letter-spacing-${m[1]}`] = Number(m[2]);
  }

  const radii = {};
  for (const m of css.matchAll(/--radius-([a-z]+):\s*([\d.]+)rem/g)) {
    radii[`--radius-${m[1]}`] = Number(m[2]);
  }

  const weights = {};
  for (const m of css.matchAll(/--primary-(regular|medium|bold):\s*(\d+)/g)) {
    weights[`--primary-${m[1]}`] = Number(m[2]);
  }

  const swatches = {};
  for (const m of css.matchAll(/--([a-z]+-\d+|brand-text):\s*(#[0-9a-fA-F]{3,8})/g)) {
    swatches[`--${m[1]}`] = m[2].toLowerCase();
  }

  /* Swatches that some theme uses as --text. A muted version of one of these
     is nearly always currentcolor in this system, not a fixed colour. */
  const textSwatches = new Set();
  for (const m of css.matchAll(/--text:\s*var\((--[a-z0-9-]+)\)/g)) textSwatches.add(m[1]);

  return { scale, lineHeights, letterSpacing, radii, weights, swatches, textSwatches };
}

/* ---------- conversions ---------- */

const toRem = (px) => +(px / ROOT_PX).toFixed(4);
const unitless = (lhPx, sizePx) => +(lhPx / sizePx).toFixed(3);

/* On a tie, prefer the general scale over layout-specific tokens: 30px should
   land on --space-5, not --site-gutter, even though both are 32 at desktop. */
const rank = (name) =>
  name.startsWith("space") ? 0 : name.startsWith("section-space") ? 1 : 2;

function nearest(px, scale, kindFilter) {
  let best = null;
  for (const [name, v] of Object.entries(scale)) {
    if (kindFilter && !kindFilter(name)) continue;
    const delta = Math.abs(v.max - px);
    const better =
      !best || delta < best.delta || (delta === best.delta && rank(name) < rank(best.name));
    if (better) best = { name, delta, ...v };
  }
  return best;
}

const isSpace = (n) => n.startsWith("space") || n.startsWith("section-space") || n.startsWith("site-");
const isType = (n) => /^(display|h[1-6]|text-(large|main|small))$/.test(n);

/** Mobile end of a new token, borrowed from whichever token is closest in size. */
function deriveMin(maxPx, scale, kindFilter) {
  const ref = nearest(maxPx, scale, kindFilter);
  if (!ref) return { min: maxPx, ref: null, ratio: 1 };
  const ratio = ref.min / ref.max;
  return { min: Math.round(maxPx * ratio), ref: ref.name, ratio: +ratio.toFixed(3) };
}

function nearestValue(value, table) {
  let best = null;
  for (const [name, v] of Object.entries(table)) {
    const delta = Math.abs(v - value);
    if (!best || delta < best.delta) best = { name, value: v, delta };
  }
  return best;
}

/* Figma names weights, CSS numbers them. */
const WEIGHT_NAMES = {
  thin: 100, extralight: 200, ultralight: 200, light: 300, regular: 400,
  normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
  bold: 700, extrabold: 800, black: 900, heavy: 900,
};

function nearestLineHeight(value, lineHeights) {
  let best = null;
  for (const [name, v] of Object.entries(lineHeights)) {
    const delta = Math.abs(v - value);
    if (!best || delta < best.delta) best = { name, value: v, delta };
  }
  return best;
}

const hexToRgb = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

function nearestSwatch(hex, swatches) {
  const [r, g, b] = hexToRgb(hex);
  let best = null;
  for (const [name, value] of Object.entries(swatches)) {
    const [r2, g2, b2] = hexToRgb(value);
    const d = Math.hypot(r - r2, g - g2, b - b2);
    if (!best || d < best.d) best = { name, value, d: +d.toFixed(1) };
  }
  return best;
}

/* WCAG 2.1 relative luminance and contrast. Flagged, never blocking: a
   decorative label may fail on purpose, and that is the designer's call. */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** Alpha is opacity over a background, so flatten before measuring. */
const composite = (fg, bg, alpha) => fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);

function contrastRatio(fgHex, bgHex, alpha = 1) {
  const bg = hexToRgb(bgHex);
  const fg = composite(hexToRgb(fgHex), bg, alpha);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}

/** 24px, or 18.66px when bold, is "large text" and gets the lower bar. */
const contrastFloor = (sizePx, bold) =>
  sizePx >= 24 || (bold && sizePx >= 18.66) ? 3 : 4.5;

/** Alpha in Figma is a stand-in for a mix, so restate it as one. */
function toColorMix(hex, alphaPct, swatches) {
  const match = nearestSwatch(hex, swatches);
  const base = match && match.d === 0 ? `var(${match.name})` : hex.toLowerCase();
  if (alphaPct >= 100) return { css: base, match };
  return { css: `color-mix(in lab, ${base} ${alphaPct}%, transparent)`, match };
}

/** The exact clamp shape base.css uses, so a generated token matches by hand. */
const fluid = (n) =>
  `clamp(var(--${n}-min) / 16 * 1rem, ((var(--${n}-min) - ((var(--${n}-max) - var(--${n}-min)) / (var(--viewport-max) - var(--viewport-min)) * var(--viewport-min))) / 16 * 1rem + ((var(--${n}-max) - var(--${n}-min)) / (var(--viewport-max) - var(--viewport-min))) * 100vw), var(--${n}-max) / 16 * 1rem)`;

/* ---------- one-off lookups ---------- */

const css = readFileSync(cssPath, "utf8");
const tokens = readTokens(css);

if (flag("px") !== undefined) {
  const px = Number(flag("px"));
  const near = nearest(px, tokens.scale, isSpace);
  console.log(`${px}px = ${toRem(px)}rem`);
  if (near) {
    const verdict = near.delta <= SNAP_PX ? `SNAP to --${near.name}` : `no token within ${SNAP_PX}px`;
    console.log(`nearest: --${near.name} (${near.min}→${near.max}), off by ${near.delta}px — ${verdict}`);
  }
  process.exit(0);
}

if (flag("lh")) {
  const [lh, size] = flag("lh").split("/").map(Number);
  const value = unitless(lh, size);
  const near = nearestLineHeight(value, tokens.lineHeights);
  console.log(`${lh}px / ${size}px = ${value}`);
  if (near) {
    const verdict = near.delta <= SNAP_LH ? `SNAP to ${near.name}` : "no token close enough";
    console.log(`nearest: ${near.name} (${near.value}), off by ${near.delta.toFixed(3)} — ${verdict}`);
  }
  process.exit(0);
}

if (flag("ls")) {
  /* --ls 2/64 (px over size) or --ls 3% */
  const raw = flag("ls");
  const em = raw.endsWith("%")
    ? +(Number(raw.slice(0, -1)) / 100).toFixed(4)
    : (() => { const [px, size] = raw.split("/").map(Number); return +(px / size).toFixed(4); })();
  const near = nearestValue(em, tokens.letterSpacing);
  console.log(`${raw} = ${em}em`);
  if (near) {
    const verdict = near.delta <= 0.005 ? `SNAP to ${near.name}` : "no token close enough";
    console.log(`nearest: ${near.name} (${near.value}em), off by ${near.delta.toFixed(4)} — ${verdict}`);
  }
  process.exit(0);
}

if (flag("color")) {
  const [hex, pct] = flag("color").split("@");
  const alpha = pct === undefined ? 100 : Number(pct);
  const { css: out, match } = toColorMix(hex, alpha, tokens.swatches);
  console.log(out);
  if (match) console.log(`nearest swatch: ${match.name} (${match.value}), distance ${match.d}`);
  process.exit(0);
}

/* ---------- batch: the shape Claude fills in from the Figma file ---------- */

const jsonPath = flag("json");
if (!jsonPath) {
  console.error("need --json <file>, or one of --px / --lh / --color");
  process.exit(1);
}

const design = JSON.parse(readFileSync(jsonPath, "utf8"));

const KNOWN = ["space", "type", "color", "letter", "radius", "weight"];
const unknown = Object.keys(design).filter((k) => !KNOWN.includes(k));
if (unknown.length) {
  console.error(`unknown key(s): ${unknown.join(", ")}. Expected any of: ${KNOWN.join(", ")}`);
  process.exit(1);
}
if (!KNOWN.some((k) => (design[k] ?? []).length)) {
  console.error("nothing to convert — every list is empty or missing.");
  process.exit(1);
}
const rows = [];
const additions = [];
const questions = [];
const contrastRows = [];

for (const item of design.space ?? []) {
  const near = nearest(item.px, tokens.scale, isSpace);
  if (near && near.delta === 0) {
    rows.push([item.name, `${item.px}px`, `--${near.name}`, "exact"]);
  } else if (near && near.delta <= SNAP_PX) {
    rows.push([item.name, `${item.px}px`, `--${near.name}`, `snapped, off by ${near.delta}px`]);
  } else {
    const { min, ref, ratio } = deriveMin(item.px, tokens.scale, isSpace);
    const name = item.token ?? `space-${item.name}`;
    additions.push({ name, min, max: item.px, fluid: true });
    rows.push([item.name, `${item.px}px`, `--${name}`, `NEW — min ${min} guessed from --${ref} (${ratio})`]);
    questions.push(`--${name}: ${item.px}px is ${near ? `${near.delta}px off --${near.name}` : "unmatched"}. New token, or consolidate?`);
  }
}

for (const item of design.type ?? []) {
  const near = nearest(item.sizePx, tokens.scale, isType);
  const lh = item.lineHeightPx ? unitless(item.lineHeightPx, item.sizePx) : null;
  const lhNear = lh ? nearestLineHeight(lh, tokens.lineHeights) : null;
  const sizeNote =
    near && near.delta === 0 ? "exact"
    : near && near.delta <= SNAP_PX ? `snapped, off by ${near.delta}px`
    : "NEW";
  const sizeToken = sizeNote === "NEW" ? `--${item.token ?? item.name}` : `--${near.name}`;
  rows.push([item.name, `${item.sizePx}px`, sizeToken, sizeNote]);
  if (lh) {
    const note =
      lhNear && lhNear.delta <= SNAP_LH
        ? `snapped to ${lhNear.name}`
        : `NEW — no line-height token within ${SNAP_LH}`;
    rows.push([`${item.name} line-height`, `${item.lineHeightPx}/${item.sizePx}`, String(lh), note]);
    if (!lhNear || lhNear.delta > SNAP_LH) {
      questions.push(`${item.name} line-height ${lh} has no token. Add one, or use ${lhNear?.name}?`);
    }
  }
  if (sizeNote === "NEW") {
    const { min, ref, ratio } = deriveMin(item.sizePx, tokens.scale, isType);
    additions.push({ name: item.token ?? item.name, min, max: item.sizePx, fluid: true });
    rows[rows.length - (item.lineHeightPx ? 2 : 1)][3] =
      `NEW — min ${min} guessed from --${ref} (${ratio})`;
    questions.push(`${item.name} at ${item.sizePx}px is unmatched (min ${min} guessed from --${ref}, ratio ${ratio}). New size, or consolidate?`);
  }
}

for (const item of design.color ?? []) {
  const alpha = item.alpha === undefined ? 100 : Math.round(item.alpha * 100);
  const { css: value, match } = toColorMix(item.hex, alpha, tokens.swatches);
  const note =
    match && match.d === 0
      ? alpha < 100 ? "opacity restated as a mix" : "exact swatch"
      : `NEW — nearest ${match?.name} is ${match?.d} away`;
  const asText =
    match && match.d === 0 && alpha < 100 && tokens.textSwatches.has(match.name);
  rows.push([
    item.name,
    `${item.hex}${alpha < 100 ? ` @${alpha}%` : ""}`,
    asText ? `color-mix(in lab, currentcolor ${alpha}%, transparent)` : value,
    asText ? "muted text — currentcolor, so it follows the theme" : note,
  ]);
  if (item.on) {
    const ratio = contrastRatio(item.hex, item.on, item.alpha ?? 1);
    const floor = contrastFloor(item.sizePx ?? 16, item.bold);
    contrastRows.push([
      item.name,
      `${item.hex}${alpha < 100 ? ` @${alpha}%` : ""} on ${item.on}`,
      `${ratio}:1`,
      ratio >= floor ? `passes (needs ${floor})` : `FAILS — needs ${floor}:1`,
    ]);
  }

  if (!match || match.d !== 0) {
    additions.push({ name: item.token ?? item.name, value, fluid: false });
    questions.push(`${item.name} ${item.hex} matches no swatch (nearest ${match?.name}). New color, or use the existing one?`);
  }
}

for (const item of design.letter ?? []) {
  const em = item.pct !== undefined
    ? +(item.pct / 100).toFixed(4)
    : +(item.px / item.sizePx).toFixed(4);
  const near = nearestValue(em, tokens.letterSpacing);
  const from = item.pct !== undefined ? `${item.pct}%` : `${item.px}/${item.sizePx}`;
  if (near && near.delta <= 0.005) {
    rows.push([item.name, from, `${em}em`, `snapped to ${near.name}`]);
  } else {
    const name = item.token ?? `letter-spacing-${item.name}`;
    additions.push({ name, value: `${em}em`, fluid: false });
    rows.push([item.name, from, `${em}em`, `NEW — nearest ${near?.name} is ${near?.delta.toFixed(4)} away`]);
    questions.push(`${item.name} letter-spacing ${em}em has no token. Add one, or use ${near?.name}?`);
  }
}

for (const item of design.radius ?? []) {
  const rem = toRem(item.px);
  const near = nearestValue(rem, tokens.radii);
  const offPx = near ? Math.abs(near.value * ROOT_PX - item.px) : Infinity;
  if (near && offPx <= SNAP_PX) {
    rows.push([item.name, `${item.px}px`, near.name, offPx === 0 ? "exact" : `snapped, off by ${offPx}px`]);
  } else {
    const name = item.token ?? `radius-${item.name}`;
    additions.push({ name, value: `${rem}rem`, fluid: false });
    rows.push([item.name, `${item.px}px`, `--${name}`, `NEW — nearest ${near?.name} is ${offPx}px away`]);
    questions.push(`${item.name} radius ${item.px}px has no token. Add one, or use ${near?.name}?`);
  }
}

for (const item of design.weight ?? []) {
  const num = typeof item.value === "number"
    ? item.value
    : WEIGHT_NAMES[String(item.value).toLowerCase().replace(/[^a-z]/g, "")];
  if (!num) {
    rows.push([item.name, String(item.value), "?", "UNKNOWN weight name"]);
    questions.push(`${item.name}: could not read the weight "${item.value}".`);
    continue;
  }
  const near = nearestValue(num, tokens.weights);
  if (near && near.delta === 0) {
    rows.push([item.name, String(item.value), near.name, `exact (${num})`]);
  } else {
    rows.push([item.name, String(item.value), String(num), `NEW — nearest ${near?.name} is ${near?.value}`]);
    questions.push(`${item.name} is weight ${num}; the system has ${Object.values(tokens.weights).join(", ")}. Add it, or use ${near?.name}?`);
  }
}

/* ---------- report ---------- */

let lumosVersion = "unknown";
try {
  lumosVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
} catch {}
console.log(`lumos-import-figma ${SKILL_VERSION}  ·  Lumos ${lumosVersion}`);
const feature = (v) => v.split(".").slice(0, 2).join(".");
if (lumosVersion !== "unknown" && feature(lumosVersion) !== feature(TESTED_AGAINST)) {
  console.log(`  note: written against Lumos ${TESTED_AGAINST}; check base.css still matches (patch releases are fine).`);
}
console.log("");

const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => String(r[i]).length), 4));
const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join("  ");
console.log(line(["FROM", "FIGMA", "LUMOS", "NOTE"]));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(line(r));

if (contrastRows.length) {
  const cw = [0, 1, 2, 3].map((i) => Math.max(...contrastRows.map((r) => String(r[i]).length), 4));
  console.log("\nCONTRAST (flagged, not blocking):");
  for (const r of contrastRows) {
    console.log("  " + r.map((c, i) => String(c).padEnd(cw[i])).join("  "));
  }
}

if (questions.length) {
  console.log("\nASK BEFORE WRITING:");
  for (const q of questions) console.log(`  - ${q}`);
}

/* ---------- handoff ---------- */

if (additions.length) {
  console.log("\nTO PLACE BY HAND (section matters — put each beside its own kind):");
  for (const a of additions) {
    if (a.fluid) {
      console.log(`  --${a.name}-min: ${a.min};`);
      console.log(`  --${a.name}-max: ${a.max};`);
      console.log(`  --${a.name}: ${fluid(a.name)};`);
    } else {
      console.log(`  --${a.name}: ${a.value};`);
    }
  }
}
