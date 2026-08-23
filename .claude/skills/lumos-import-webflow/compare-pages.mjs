#!/usr/bin/env node
/**
 * Compares a rebuilt page against the published Webflow page it replaces.
 *
 * These two will never match pixel for pixel — a rebuild snaps spacing onto
 * the token scale, so the design moves slightly on purpose. Diffing pixels
 * would report thousands of differences and hide the one that matters.
 *
 * What must match is the *content*: every heading, link, image, list item and
 * form field that was on the old page should be on the new one. That is exact,
 * and it is where migrations actually fail — a collection list bound to the
 * wrong collection renders beautifully and says the wrong thing.
 *
 * Screenshots are captured alongside for a human to compare by eye.
 *
 * Usage
 *   node compare-pages.mjs --live https://old.webflow.io/about \
 *                          --local http://localhost:4321/about [--shots]
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const live = arg("live");
const local = arg("local");
if (!live || !local) {
  console.error("usage: compare-pages.mjs --live <url> --local <url> [--shots]");
  process.exit(1);
}

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

const text = (s) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
   .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
   .replace(/\s+/g, " ").trim();

/** A page reduced to the things that must survive a migration. */
function fingerprint(html) {
  const clean = strip(html);
  const headings = [];
  for (const m of clean.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = text(m[2]);
    if (t) headings.push({ level: +m[1], text: t });
  }

  const links = new Map();
  for (const m of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1].match(/href="([^"]*)"/) ?? [])[1];
    if (!href || href.startsWith("#")) continue;
    /* Origins differ by definition; compare paths. */
    let path = href;
    try { path = new URL(href, "https://x.invalid").pathname; } catch {}
    path = path.replace(/\/$/, "") || "/";
    const label = text(m[2]);
    links.set(`${path}||${label}`, { path, label });
  }

  const images = [];
  for (const m of clean.matchAll(/<img\b([^>]*)>/gi)) {
    const alt = (m[1].match(/alt="([^"]*)"/) ?? [])[1] ?? "";
    const src = (m[1].match(/src="([^"]*)"/) ?? [])[1] ?? "";
    /* Filenames survive a migration; hashes and CDN hosts do not. */
    const base = src.split("/").pop()?.split("?")[0]?.replace(/\.[a-z0-9]+$/i, "") ?? "";
    images.push({ alt, base });
  }

  const fields = [];
  for (const m of clean.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const a = m[2];
    const type = (a.match(/type="([^"]*)"/) ?? [])[1] ?? m[1];
    if (type === "submit" || type === "hidden") continue;
    fields.push((a.match(/name="([^"]*)"/) ?? [])[1] ?? `(unnamed ${type})`);
  }

  const words = text(clean).split(" ").filter(Boolean);

  return { headings, links, images, fields, words: words.length, body: text(clean) };
}

const get = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "lumos-import-webflow" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
};

const [liveHtml, localHtml] = await Promise.all([get(live), get(local)]).catch((e) => {
  console.error(`could not fetch: ${e.message}`);
  process.exit(1);
});

const A = fingerprint(liveHtml);
const B = fingerprint(localHtml);

let problems = 0;
const say = (ok, label, detail) => {
  if (!ok) problems++;
  console.log(`  ${ok ? "ok  " : "MISS"}  ${label.padEnd(22)} ${detail}`);
};

console.log(`live  ${live}\nlocal ${local}\n${"─".repeat(66)}`);

console.log("\nCONTENT PARITY");
say(A.headings.length === B.headings.length, "headings",
    `${A.headings.length} live · ${B.headings.length} local`);
say(A.links.size === B.links.size, "links",
    `${A.links.size} live · ${B.links.size} local`);
say(A.images.length === B.images.length, "images",
    `${A.images.length} live · ${B.images.length} local`);
say(A.fields.length === B.fields.length, "form fields",
    `${A.fields.length} live · ${B.fields.length} local`);

/* Word count drifts with boilerplate, so only a big gap is meaningful. */
const drift = A.words ? Math.abs(A.words - B.words) / A.words : 0;
say(drift < 0.1, "word count",
    `${A.words} live · ${B.words} local (${(drift * 100).toFixed(1)}% apart)`);

/* Counts, not presence: three identical card titles that came back as one
   is a lost card, and a set comparison would call it a match. */
const tally = (list, key) => {
  const m = new Map();
  for (const item of list) {
    const k = key(item);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

const liveHeads = tally(A.headings, (h) => `h${h.level}|${h.text}`);
const localHeads = tally(B.headings, (h) => `h${h.level}|${h.text}`);

const deficits = [];
for (const [k, n] of liveHeads) {
  const have = localHeads.get(k) ?? 0;
  if (have < n) deficits.push({ k, missing: n - have, of: n });
}
if (deficits.length) {
  console.log("\nHEADINGS ON THE LIVE SITE, NOT REBUILT");
  for (const d of deficits) {
    const [level, ...rest] = d.k.split("|");
    const label = rest.join("|");
    console.log(`  ${level}  ${label}${d.of > 1 ? `  (${d.missing} of ${d.of} missing)` : ""}`);
    problems += d.missing;
  }
}

const surplus = [];
for (const [k, n] of localHeads) {
  const had = liveHeads.get(k) ?? 0;
  if (n > had) surplus.push({ k, extra: n - had });
}
if (surplus.length) {
  console.log("\nHEADINGS ON THE REBUILD, NOT LIVE");
  for (const s2 of surplus) {
    const [level, ...rest] = s2.k.split("|");
    console.log(`  ${level}  ${rest.join("|")}${s2.extra > 1 ? `  ×${s2.extra}` : ""}`);
  }
}

const missingLinks = [...A.links.values()].filter(
  (l) => ![...B.links.values()].some((x) => x.path === l.path),
);
if (missingLinks.length) {
  console.log("\nLINKS ON THE LIVE SITE, NOT REBUILT");
  for (const l of missingLinks) console.log(`  ${l.path.padEnd(34)} "${l.label}"`);
  problems += missingLinks.length;
}

const missingAlts = A.images
  .map((i) => i.alt)
  .filter((alt) => alt && !B.images.some((x) => x.alt === alt));
if (missingAlts.length) {
  console.log("\nIMAGE ALT TEXT NOT CARRIED OVER");
  for (const a of missingAlts) console.log(`  "${a}"`);
  problems += missingAlts.length;
}

const missingFields = A.fields.filter((f) => !B.fields.includes(f));
if (missingFields.length) {
  console.log("\nFORM FIELDS MISSING");
  for (const f of missingFields) console.log(`  ${f}`);
  problems += missingFields.length;
}

if (process.argv.includes("--shots")) {
  const CHROME = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
  ].find((p) => existsSync(p));
  if (!CHROME) {
    console.log("\n(no Chrome found — skipping screenshots)");
  } else {
    const slug = new URL(local).pathname.replace(/\//g, "-").replace(/^-|-$/g, "") || "index";
    const dir = join(".lumos-webflow", slug);
    mkdirSync(dir, { recursive: true });
    for (const [label, url] of [["live", live], ["local", local]]) {
      for (const [name, w] of [["desktop", 1440], ["mobile", 390]]) {
        await run(CHROME, [
          "--headless=new", "--disable-gpu", "--hide-scrollbars",
          "--force-device-scale-factor=1", `--window-size=${w},3200`,
          `--screenshot=${join(dir, `${label}--${name}.png`)}`, url,
        ]).catch((e) => console.log(`  screenshot failed for ${url}: ${e.shortMessage ?? e.message}`));
      }
    }
    console.log(`\nScreenshots in ${dir}/ — compare live and local side by side.`);
    console.log("They will not match exactly: spacing snaps to the token scale by design.");
    console.log("Look for missing sections and wrong content, not for moved pixels.");
  }
}

console.log(`\n${"─".repeat(66)}`);
console.log(problems
  ? `${problems} parity problem(s). Content missing from a rebuild is a migration bug, not a style choice.`
  : "Content matches. Compare the screenshots for anything the text cannot show.");
process.exit(problems ? 1 : 0);
