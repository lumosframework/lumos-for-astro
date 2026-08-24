#!/usr/bin/env node
/**
 * Ports a Webflow site's variables onto this framework's tokens.
 *
 * This is what makes an import look identical rather than merely similar. Both
 * systems are the same design system under different naming — `--swatch--light-200`
 * here is `--light-200` there, `--_spacing---space--8` is `--space-8` — and the
 * fluid formulas have the same shape. Port the values and the Lumos components
 * render the original design without a single hand-written style.
 *
 * Compares the two and reports four things: what already matches, what differs
 * and by how much, what the site has that this framework does not, and what
 * this framework has that the site never set.
 *
 * Usage
 *   node map-variables.mjs <site.webflow.css> [base.css]
 */

import { readFileSync } from "node:fs";

const asSed = process.argv.includes("--sed");
const webflowCss = process.argv[2];
const baseCss =
  process.argv[3] && !process.argv[3].startsWith("--")
    ? process.argv[3]
    : "src/styles/base.css";
if (!webflowCss) {
  console.error("usage: map-variables.mjs <site.webflow.css> [base.css]");
  process.exit(1);
}

/** Every custom property declared at the top level of :root. */
function readVars(text, { everywhere = false } = {}) {
  const out = new Map();
  /* This framework declares theme colours in .theme-* blocks rather than
     :root, so reading only the first block loses half the tokens. */
  const root = text.match(/:root\s*\{([\s\S]*?)\n\}/);
  const body = everywhere || !root ? text : root[1];
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
  return out;
}

/* Lumos for Webflow groups its variables; this framework flattens them.
   Longest prefix first, so `typography-font-size` beats `typography-font`. */
const GROUPS = [
  ["_typography---font-size--", ""],
  ["_typography---line-height--", "line-height-"],
  ["_typography---letter-spacing--", "letter-spacing-"],
  ["_typography---font--", ""],
  ["_spacing---section-space--", "section-space-"],
  ["_spacing---space--", "space-"],
  ["_theme---", ""],
  ["swatch--", ""],
  ["site--", "site-"],
  ["radius--", "radius-"],
  ["max-width--", "max-width-"],
  ["border-width--", "border-width"],
  ["nav--", "nav-"],
];

/* Same token, different word. */
const ALIASES = {
  "--section-space-main": "--section-space-medium",
  "--section-space-page-top": "--section-space-nav-overlap",
  "--border-width-main": "--border-width",
  "--border-widthmain": "--border-width",
  "--radius-round-full": "--radius-round",
};

/** Webflow name to the name this framework would use, or null if unclear. */
function toLumos(name) {
  const bare = name.replace(/^--/, "");
  for (const [prefix, replacement] of GROUPS) {
    if (bare.startsWith(prefix)) {
      const rest = bare.slice(prefix.length).replace(/--/g, "-");
      const joined = `${replacement}${rest}`.replace(/-$/, "");
      return ALIASES[`--${joined}`] ?? `--${joined}`;
    }
  }
  return null;
}

/** A value may point at other variables; those need renaming too, or the line
    cannot be pasted into base.css. */
function rewriteRefs(value) {
  return value.replace(/var\((--[\w-]+)\)/g, (whole, ref) => {
    const mapped = toLumos(ref);
    return mapped ? `var(${mapped})` : whole;
  });
}

/** Values are written differently but can still mean the same length. */
function normalise(value) {
  const v = value.replace(/\s+/g, " ").trim();
  /* `2.5 * 1rem` and `2.5rem` are the same number; so are `.5` and `0.5`. */
  return v
    .replace(/([\d.]+)\s*\*\s*1rem/g, "$1rem")
    .replace(/(^|[^\d])\.(\d)/g, "$10.$2")
    .replace(/\s*([(),])\s*/g, "$1");
}

/** A fluid token is its two endpoints; compare those, not the formula. */
function endpoints(value) {
  const clamp = /clamp\(\s*([\d.]+)rem[\s\S]*?,\s*([\d.]+)rem\s*\)\s*$/.exec(normalise(value));
  return clamp ? [Number(clamp[1]), Number(clamp[2])] : null;
}

const wf = readVars(readFileSync(webflowCss, "utf8"));
const lumos = readVars(readFileSync(baseCss, "utf8"), { everywhere: true });

/* This framework states fluid endpoints as separate -min/-max in px. */
const lumosEndpoints = (name) => {
  const min = lumos.get(`${name}-min`);
  const max = lumos.get(`${name}-max`);
  return min && max ? [Number(min) / 16, Number(max) / 16] : null;
};

const same = [];
const differs = [];
const unmapped = [];
const onlyHere = [];

for (const [name, value] of wf) {
  const target = toLumos(name);
  if (!target) {
    unmapped.push([name, value]);
    continue;
  }
  if (!lumos.has(target) && !lumos.has(`${target}-min`)) {
    onlyHere.push([name, target, value]);
    continue;
  }
  const wfEnds = endpoints(value);
  const ourEnds = lumosEndpoints(target);
  if (wfEnds && ourEnds) {
    const equal = Math.abs(wfEnds[0] - ourEnds[0]) < 0.001 && Math.abs(wfEnds[1] - ourEnds[1]) < 0.001;
    (equal ? same : differs).push({
      target,
      theirs: `${wfEnds[0]}–${wfEnds[1]}rem`,
      ours: `${ourEnds[0]}–${ourEnds[1]}rem`,
      write: `${target}-min: ${wfEnds[0] * 16};  ${target}-max: ${wfEnds[1] * 16};`,
    });
    continue;
  }
  const theirs = normalise(rewriteRefs(value));
  const ours = normalise(lumos.get(target) ?? "");
  /* A reference to another variable resolves differently in each system;
     compare the tail, which is the token being pointed at. */
  /* Both point at the same swatch through different group names:
     var(--swatch--light-200) and var(--light-200) are one token. */
  const tail = (v) => {
    const ref = /^var\(--(.+?)\)$/.exec(v);
    return ref ? ref[1].split("--").pop() : v;
  };
  (tail(theirs) === tail(ours) ? same : differs).push({
    target,
    theirs,
    ours,
    write: `${target}: ${theirs};`,
  });
}

/* The site's own CSS refers to these variables thousands of times. Porting the
   values into base.css without renaming the references leaves every rule
   pointing at a variable that no longer exists. */
if (asSed) {
  const pairs = [];
  for (const name of wf.keys()) {
    const target = toLumos(name);
    if (target && target !== name) pairs.push([name, target]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length); // longest first, so prefixes do not truncate
  console.log("#!/bin/sh");
  console.log("# Renames Webflow variable references to this framework's names.");
  console.log("# Run over the CSS carried across in pass 1, then rebuild and diff.");
  console.log('# usage: sh rename-variables.sh src/components/**/*.astro src/styles/*.css');
  console.log('for f in "$@"; do');
  for (const [from, to] of pairs) {
    const esc = (v) => v.replace(/[-]/g, "\\-");
    console.log(`  sed -i '' 's/${esc(from)}\\b/${to}/g' "$f"`);
  }
  console.log("done");
  console.log(`# ${pairs.length} rename(s)`);
  process.exit(0);
}

const rule = "─".repeat(72);
console.log(`${wf.size} variables in the Webflow site · ${lumos.size} in ${baseCss}\n${rule}`);
console.log(`\n${same.length} already identical — nothing to do for those.`);

if (differs.length) {
  console.log(`\nDIFFERENT — port these or the rebuild will not match (${differs.length})`);
  for (const d of differs) {
    console.log(`  ${d.target}`);
    console.log(`      site:  ${String(d.theirs).slice(0, 60)}`);
    console.log(`      here:  ${String(d.ours).slice(0, 60)}`);
  }
  console.log("\n  Written out:");
  for (const d of differs) console.log(`    ${d.write}`);
}

if (onlyHere.length) {
  console.log(`\nONLY IN THE SITE — no token here yet (${onlyHere.length})`);
  for (const [name, target, value] of onlyHere.slice(0, 20)) {
    console.log(`  ${name}  →  ${target}: ${value.slice(0, 46)}`);
  }
  if (onlyHere.length > 20) console.log(`  … and ${onlyHere.length - 20} more`);
}

if (unmapped.length) {
  console.log(`\nUNRECOGNISED NAMING — read these by hand (${unmapped.length})`);
  for (const [name, value] of unmapped.slice(0, 12)) {
    console.log(`  ${name}: ${value.slice(0, 50)}`);
  }
  if (unmapped.length > 12) console.log(`  … and ${unmapped.length - 12} more`);
}

console.log(`\n${rule}`);
console.log("Port the DIFFERENT list into base.css and the components render the");
console.log("site's own design. Anything still off afterwards is a real difference,");
console.log("not a token.");
