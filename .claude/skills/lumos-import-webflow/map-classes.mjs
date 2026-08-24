#!/usr/bin/env node
/**
 * Maps a Webflow site's utility classes onto this framework's.
 *
 * Lumos for Webflow prefixes its utilities `u-`; this framework does not.
 * Most of the vocabulary is otherwise identical, so the import is a rename
 * rather than a rewrite — keep the markup, change the class.
 *
 * Sorts every u-* class into: renames cleanly, belongs to a component (use the
 * component, not the class), or has no equivalent and needs a decision.
 *
 * Usage
 *   node map-classes.mjs <export-dir> [src]
 *   node map-classes.mjs <export-dir> --sed     # a rename script for the HTML
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const exportDir = process.argv[2];
const srcDir = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "src";
const asSed = process.argv.includes("--sed");
if (!exportDir) {
  console.error("usage: map-classes.mjs <export-dir> [src] [--sed]");
  process.exit(1);
}

function walk(dir, exts, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

/* What the site uses. */
const used = new Map();
for (const file of walk(exportDir, [".html"])) {
  /* Class attributes only. Counting every u- in the file also counts the
     stylesheet that defines them, and picks up fragments from attribute
     selectors like [class*="u-text-style-"], which is not a class at all. */
  const html = readFileSync(file, "utf8").replace(/<style[\s\S]*?<\/style>/g, "");
  for (const attr of html.matchAll(/class="([^"]*)"/g)) {
    for (const cls of attr[1].split(/\s+/)) {
      if (!cls.startsWith("u-")) continue;
      const name = cls.slice(2);
      if (!name) continue;
      used.set(name, (used.get(name) ?? 0) + 1);
    }
  }
}

/* What this framework defines — every class in every stylesheet and every
   component's <style>, wherever it sits in a selector. */
const defined = new Set();
const owner = new Map();
const componentNames = new Map();
for (const file of walk(srcDir, [".css", ".astro"])) {
  const text = readFileSync(file, "utf8");
  const isAstro = extname(file) === ".astro";
  const styles = isAstro
    ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")
    : text;

  /* Defined anywhere in a stylesheet — a utility this framework has. */
  for (const m of styles.matchAll(/\.([a-z][\w-]*)/g)) defined.add(m[1]);

  if (!isAstro) continue;

  /* Rendered by a component: a class literal in its template, not merely
     referenced in its styles. That is what makes the component the owner. */
  const template = text.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
  const literals = new Set();
  const roots = new Set();
  for (const m of template.matchAll(/class="([^"{]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => literals.add(c));
  }
  let first = true;
  for (const m of template.matchAll(/class:list=\{\[([\s\S]*?)\]\}/g)) {
    const quoted = [...m[1].matchAll(/"([a-z][\w-]*)"/g)].map((q) => q[1]);
    quoted.forEach((c) => literals.add(c));
    /* Identity means the first class on the component's own root element —
       the first class:list in the file. A utility listed first on some nested
       label belongs to nobody. */
    if (first && quoted.length) roots.add(quoted[0]);
    first = false;
  }
  literals.forEach((c) => defined.add(c));

  const name = file.split("/").pop().replace(".astro", "");
  componentNames.set(name.toLowerCase(), file.replace(`${srcDir}/components/`, ""));
  for (const c of roots) {
    const exact = name.toLowerCase() === c.replace(/-/g, "").toLowerCase();
    const held = owner.get(c);
    if (!held || (exact && !held.exact)) {
      owner.set(c, { file: file.replace(`${srcDir}/components/`, ""), exact });
    }
  }
}

/* Classes whose answer is a component or a technique, not another class.
   Each of these was confirmed against the framework rather than guessed. */
const KNOWN = {
  "content-wrapper": "Wrapper/ContentWrapper",
  "layout-column": "Wrapper/ContentWrapper, with the matching variant",
  "section-spacer": "Wrapper/Section — paddingTop / paddingBottom",
  "svg": "Media/Icon",
  "rich-text": "Typography/RichText",
  "embed-css": "drop the wrapper; keep only its child <style>",
  "embed-js": "drop the wrapper; keep only its child <script>",
  "hide-if-empty": "render nothing instead — a slot check or the render prop",
};
const known = [];

const renames = [];
const components = [];
const orphans = [];
for (const [name, count] of [...used].sort((a, b) => b[1] - a[1])) {
  const hit = KNOWN[name] ?? KNOWN[name.replace(/-\d+$/, "")];
  if (hit) known.push([name, count, hit]);
  else if (!defined.has(name)) orphans.push([name, count]);
  else if (owner.has(name)) components.push([name, count, owner.get(name).file]);
  else renames.push([name, count]);
}

/* A run of classes sharing a first segment that names a component is that
   component's internals — eyebrow-wrapper, eyebrow-marker and eyebrow-text are
   the Eyebrow component, not three utilities to keep. */
/* Where the two systems name the same thing differently. */
const FAMILY_ALIAS = { image: "img", layout: "contentwrapper", richtext: "richtext" };

const families = new Map();
for (const [name, count] of orphans) {
  const head = name.split("-")[0];
  const target =
    componentNames.get(head) ??
    componentNames.get(head.replace(/s$/, "")) ??
    componentNames.get(FAMILY_ALIAS[head] ?? "");
  if (!target) continue;
  const f = families.get(head) ?? { target, classes: [], uses: 0 };
  f.classes.push(name);
  f.uses += count;
  families.set(head, f);
}
for (const [head, f] of families) {
  if (f.classes.length < 2) { families.delete(head); continue; }
  for (const c of f.classes) {
    const i = orphans.findIndex(([n]) => n === c);
    if (i !== -1) orphans.splice(i, 1);
  }
}

if (asSed) {
  console.log("#!/bin/sh");
  console.log("# Renames Lumos for Webflow utilities to this framework's names.");
  console.log("# Run over the imported markup, then review: classes listed as");
  console.log("# component-owned are deliberately left alone.");
  console.log('# usage: sh rename-classes.sh "src/pages/**/*.astro"');
  console.log('for f in "$@"; do');
  for (const [name] of renames) {
    console.log(`  sed -i '' 's/\\bu-${name}\\b/${name}/g' "$f"`);
  }
  console.log("done");
  process.exit(0);
}

const rule = "─".repeat(70);
const total = [...used.values()].reduce((a, b) => a + b, 0);
console.log(`${used.size} u-* classes, ${total} uses\n${rule}`);

console.log(`\nRENAME — same class, no prefix (${renames.length})`);
for (const [name, count] of renames.slice(0, 12)) {
  console.log(`  u-${name.padEnd(28)} → .${name.padEnd(28)} ×${count}`);
}
if (renames.length > 12) console.log(`  … and ${renames.length - 12} more`);
console.log("  Run again with --sed for a script that applies these.");

console.log(`\nUSE THE COMPONENT — the class exists, but a component owns it (${components.length})`);
for (const [name, count, file] of components.slice(0, 12)) {
  console.log(`  u-${name.padEnd(26)} ×${String(count).padEnd(6)} ${file}`);
}
if (components.length > 12) console.log(`  … and ${components.length - 12} more`);

if (known.length) {
  console.log(`\nNOT A CLASS HERE — a component or a technique answers it (${known.length})`);
  for (const [name, count, answer] of known) {
    console.log(`  u-${name.padEnd(22)} ×${String(count).padEnd(6)} ${answer}`);
  }
}

if (families.size) {
  console.log(`\nCOMPONENT INTERNALS — a family of classes that is one component (${families.size})`);
  for (const [head, f] of families) {
    console.log(`  ${head}-*  ×${f.uses}  →  ${f.target}`);
    console.log(`      ${f.classes.map((c) => `u-${c}`).join(", ")}`);
  }
  console.log("  Swap the markup for the component, then style the component to match.");
}

console.log(`\nNO EQUIVALENT — the site's own, keep them (${orphans.length})`);
for (const [name, count] of orphans.slice(0, 16)) {
  console.log(`  u-${name.padEnd(28)} ×${count}`);
}
if (orphans.length > 16) console.log(`  … and ${orphans.length - 16} more`);

console.log(`\n${rule}`);
console.log("Rename what renames, swap the component where one owns the class, and");
console.log("keep the rest — they are the site's own and their CSS already came across.");
