#!/usr/bin/env node
/**
 * Splits a Webflow stylesheet into per-component pieces.
 *
 * Webflow publishes one stylesheet for the whole site. A component's rules are
 * in there, scattered — `.hero_wrap`, `.hero_inner`, the same names again
 * inside each media query, plus states and pseudo-elements. Rebuilding a
 * component means gathering all of them and nothing else.
 *
 * Two things this will not do, because both need a person:
 *   - decide what is genuinely global (normalize, base type, shared utilities)
 *   - split a rule whose selector spans two components
 * It reports both rather than guessing.
 *
 * Usage
 *   node split-css.mjs site.webflow.css                 # what components exist
 *   node split-css.mjs site.webflow.css --prefix hero   # that component's CSS
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
const wanted = (() => {
  const i = process.argv.indexOf("--prefix");
  return i === -1 ? null : process.argv[i + 1];
})();

if (!file) {
  console.error("usage: split-css.mjs <css-file> [--prefix name]");
  process.exit(1);
}

const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Flat list of rules, each remembering the at-rule it sat inside. */
function parse(text) {
  const rules = [];
  const stack = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      if (head.startsWith("@")) stack.push(head);
      else stack.push({ selector: head });
      continue;
    }
    if (ch === "}") {
      const top = stack.pop();
      if (top && typeof top === "object") {
        rules.push({
          selector: top.selector,
          body: buf.trim(),
          at: stack.filter((s) => typeof s === "string"),
        });
      }
      buf = "";
      continue;
    }
    buf += ch;
  }
  return rules;
}

const rules = parse(css);

/** Classes a selector touches, and the component prefix each belongs to. */
const classesOf = (selector) =>
  [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);

/* Four kinds of class, and only one of them names a component:
     w-*   Webflow's own widget classes — framework
     u-*   utilities, the convention Lumos for Webflow uses
     is-*  a state or variant of whatever it sits on, not a thing itself
     rest  the component */
const isFramework = (c) => c.startsWith("w-");
const isUtility = (c) => c.startsWith("u-");
const isState = (c) => c.startsWith("is-");
const isComponent = (c) => !isFramework(c) && !isUtility(c) && !isState(c);

/** `hero_wrap` and `hero_inner` are one component; `hero-section` too. */
const prefixOf = (c) => c.split(/[_-]/)[0].toLowerCase();

/* Third-party CSS arrives in the same stylesheet but is not the site's. */
const LIBRARY = new Set(["swiper", "lenis", "gsap", "splide", "lottie", "plyr", "fslightbox"]);

if (!wanted) {
  const groups = new Map();
  const utilities = [];
  let global = 0;
  for (const rule of rules) {
    const all = classesOf(rule.selector);
    if (all.some(isUtility)) {
      /* Names, not selectors: Webflow compiles each variant into its own
         `:where(.w-variant-<id>)` clause, so the selectors are unreadable. */
      all.filter(isUtility).forEach((c) => utilities.push(c));
      continue;
    }
    const classes = all.filter(isComponent);
    if (!classes.length) {
      global++;
      continue;
    }
    const prefixes = new Set(classes.map(prefixOf));
    for (const p of prefixes) {
      const g = groups.get(p) ?? { rules: 0, classes: new Set(), shared: 0 };
      g.rules++;
      classes.filter((c) => prefixOf(c) === p).forEach((c) => g.classes.add(c));
      if (prefixes.size > 1) g.shared++;
      groups.set(p, g);
    }
  }

  const sorted = [...groups.entries()]
    .filter(([name]) => !LIBRARY.has(name))
    .sort((a, b) => b[1].rules - a[1].rules);
  const libs = [...groups.entries()].filter(([name]) => LIBRARY.has(name));
  console.log(`${rules.length} rules · ${sorted.length} component groups · ${global} element-only · ${utilities.length} utility`);
  if (utilities.length) {
    const counts = new Map();
    for (const u of utilities) counts.set(u, (counts.get(u) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`utilities: ${counts.size} distinct — ${top.map(([c, n]) => `${c} ×${n}`).join(", ")}`);
    console.log("  (u-* is Lumos for Webflow's convention — these usually map to a Lumos component or utility, not to CSS worth keeping)");
  }
  console.log("");
  console.log("GROUP".padEnd(22) + "RULES".padStart(6) + "  CLASSES  SHARED SELECTORS");
  for (const [name, g] of sorted) {
    console.log(
      name.padEnd(22) +
        String(g.rules).padStart(6) +
        String(g.classes.size).padStart(9) +
        String(g.shared).padStart(9),
    );
  }
  if (libs.length) {
    console.log("\nLIBRARY CSS — not the site's, do not split into components:");
    for (const [name, g] of libs) console.log(`  ${name.padEnd(20)} ${g.rules} rules`);
  }
  console.log(
    "\nSHARED SELECTORS touch more than one group — those rules cannot move" +
      "\nwholesale into one component. Read them before splitting.",
  );
  console.log("Run again with --prefix <group> to see a component's CSS.");
  process.exit(0);
}

const mine = [];
const shared = [];
for (const rule of rules) {
  const classes = classesOf(rule.selector).filter(isComponent);
  if (!classes.some((c) => prefixOf(c) === wanted.toLowerCase())) continue;
  const others = new Set(classes.map(prefixOf).filter((p) => p !== wanted.toLowerCase()));
  (others.size ? shared : mine).push({ ...rule, others: [...others] });
}

if (!mine.length && !shared.length) {
  console.error(`no rules found for "${wanted}"`);
  process.exit(1);
}

/* Print grouped by at-rule so media queries stay intact. */
const emit = (list) => {
  const byAt = new Map();
  for (const r of list) {
    const key = r.at.join(" ");
    (byAt.get(key) ?? byAt.set(key, []).get(key)).push(r);
  }
  for (const [key, group] of byAt) {
    const indent = key ? "  " : "";
    if (key) console.log(`${key} {`);
    for (const r of group) {
      console.log(`${indent}${r.selector} {`);
      for (const decl of r.body.split(";").map((d) => d.trim()).filter(Boolean)) {
        console.log(`${indent}  ${decl};`);
      }
      console.log(`${indent}}`);
    }
    if (key) console.log("}");
  }
};

console.log(`/* ${wanted}: ${mine.length} rule(s) that belong to it alone */`);
emit(mine);

if (shared.length) {
  console.log(`\n/* ${shared.length} rule(s) also touch: ${[...new Set(shared.flatMap((r) => r.others))].join(", ")}`);
  console.log("   Decide for each: move it, duplicate it, or leave it global. */");
  emit(shared);
}
