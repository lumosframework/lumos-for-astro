#!/usr/bin/env node
/**
 * Proves an upgrade changed nothing visible.
 *
 * Capture every route before the upgrade, capture them again after, and
 * compare. A framework upgrade should move markup and tokens around without
 * moving a single pixel; anything that does move is either a fix worth
 * knowing about or a regression worth stopping for.
 *
 * Captures with headless Chrome and compares with sharp — both already
 * present in an Astro project on a Mac, so the check adds no dependencies.
 *
 * Usage
 *   node visual-check.mjs capture before        # dev server must be running
 *   ... upgrade ...
 *   node visual-check.mjs capture after
 *   node visual-check.mjs compare
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { promises as fs } from "node:fs";

const run = promisify(execFile);

const OUT = ".lumos-upgrade";
const BASE = process.env.LUMOS_BASE ?? "http://localhost:4321";
const WIDTHS = [
  { name: "desktop", w: 1440, h: 3200 },
  { name: "mobile", w: 390, h: 3200 },
];
/* Antialiasing and font rasterisation wobble by a channel or two between
   runs. Anything under this is noise, not a change. */
const CHANNEL_TOLERANCE = 8;
/* Below this share of changed pixels a page is called unchanged. */
const PIXEL_THRESHOLD = 0.001; // 0.1%

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => existsSync(p));

/** Every static route the site builds, so nothing is spot-checked by memory. */
function routes(dir = "src/pages", prefix = "") {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routes(full, `${prefix}/${entry}`));
      continue;
    }
    if (!entry.endsWith(".astro")) continue;
    if (entry.startsWith("[") || entry.includes("[")) continue; // dynamic
    if (entry === "404.astro") continue;
    const name = entry.replace(/\.astro$/, "");
    found.push(name === "index" ? `${prefix}/` : `${prefix}/${name}`);
  }
  return found;
}

const slug = (route) => (route === "/" ? "index" : route.replace(/^\//, "").replace(/\//g, "-"));

async function capture(label) {
  if (!CHROME) {
    console.error("No Chrome/Chromium/Edge found. Install one, or capture by hand.");
    process.exit(1);
  }
  const dir = join(OUT, label);
  mkdirSync(dir, { recursive: true });

  const list = routes();
  console.log(`capturing ${list.length} route(s) × ${WIDTHS.length} width(s) from ${BASE}`);

  for (const route of list) {
    for (const { name, w, h } of WIDTHS) {
      const file = join(dir, `${slug(route)}--${name}.png`);
      await run(CHROME, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${w},${h}`,
        `--screenshot=${file}`,
        `${BASE}${route}`,
      ]).catch((e) => {
        console.error(`  ${route} @${name}: capture failed — ${e.shortMessage ?? e.message}`);
      });
      console.log(`  ${route} @${name} -> ${relative(process.cwd(), file)}`);
    }
  }
}

async function compare() {
  const { default: sharp } = await import("sharp");
  const beforeDir = join(OUT, "before");
  const afterDir = join(OUT, "after");
  if (!existsSync(beforeDir) || !existsSync(afterDir)) {
    console.error(`need both ${beforeDir} and ${afterDir} — capture before and after first.`);
    process.exit(1);
  }
  mkdirSync(join(OUT, "diff"), { recursive: true });

  const files = readdirSync(beforeDir).filter((f) => f.endsWith(".png"));
  const rows = [];
  let worst = 0;

  for (const file of files) {
    const a = join(beforeDir, file);
    const b = join(afterDir, file);
    if (!existsSync(b)) {
      rows.push([file, "—", "MISSING AFTER — route gone?"]);
      worst = 1;
      continue;
    }

    /* Force both to RGBA. A screenshot saved as RGB and another as RGBA
       decode to different strides, and indexing one buffer with the other's
       stride misreads every pixel — which reads as a total rewrite of the
       page rather than the two-pixel nudge it actually was. */
    const [ia, ib] = await Promise.all([
      sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);

    if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) {
      rows.push([
        file,
        "size",
        `CHANGED — ${ia.info.width}×${ia.info.height} became ${ib.info.width}×${ib.info.height}`,
      ]);
      worst = 1;
      continue;
    }

    const { width, height } = ia.info;
    const channels = 4;
    const pa = ia.data;
    const pb = ib.data;
    const total = width * height;
    let changed = 0;
    /* Mark every differing pixel red on a dimmed copy, so a human can see
       where rather than just how much. */
    const diff = Buffer.alloc(total * 3);

    for (let i = 0, p = 0; i < total; i++, p += channels) {
      let delta = 0;
      for (let c = 0; c < 3; c++) {
        delta = Math.max(delta, Math.abs(pa[p + c] - pb[p + c]));
      }
      const o = i * 3;
      if (delta > CHANNEL_TOLERANCE) {
        changed++;
        diff[o] = 255;
        diff[o + 1] = 0;
        diff[o + 2] = 0;
      } else {
        const grey = Math.round(pa[p] * 0.2 + 200 * 0.8);
        diff[o] = diff[o + 1] = diff[o + 2] = grey;
      }
    }

    const share = changed / total;
    if (share > PIXEL_THRESHOLD) {
      await sharp(diff, { raw: { width, height, channels: 3 } })
        .png()
        .toFile(join(OUT, "diff", file));
      rows.push([file, `${(share * 100).toFixed(3)}%`, `CHANGED — see ${OUT}/diff/${file}`]);
      worst = Math.max(worst, share);
    } else {
      rows.push([file, `${(share * 100).toFixed(3)}%`, "unchanged"]);
    }
  }

  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => String(r[i]).length), 4));
  console.log(rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ")).join("\n"));

  const changed = rows.filter((r) => String(r[2]).startsWith("CHANGED") || String(r[2]).startsWith("MISSING"));
  console.log(
    changed.length
      ? `\n${changed.length} of ${rows.length} view(s) changed. An upgrade should not move pixels — explain each one before committing.`
      : `\nAll ${rows.length} view(s) identical within tolerance.`,
  );
  process.exit(changed.length ? 1 : 0);
}

const [cmd, label] = process.argv.slice(2);
if (cmd === "capture") await capture(label ?? "before");
else if (cmd === "compare") await compare();
else {
  console.error("usage: visual-check.mjs capture <before|after> | compare");
  process.exit(1);
}
