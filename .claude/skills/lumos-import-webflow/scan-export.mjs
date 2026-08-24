#!/usr/bin/env node
/**
 * Inventories a Webflow code export.
 *
 * The export is the only complete record of what every page contained, but
 * it has been flattened: CMS bindings and component bindings are gone. What
 * survives is evidence — a `w-dyn-list` proves a collection list stood there
 * without saying which collection, a `data-w-id` proves an interaction was
 * attached without saying what it did.
 *
 * This gathers the evidence so the Webflow MCP can be asked precise questions
 * instead of being trawled. It reports what it found and what it cannot know.
 *
 * Usage: node scan-export.mjs <export-dir> [--json]
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

const root = process.argv[2];
const asJson = process.argv.includes("--json");
if (!root) {
  console.error("usage: scan-export.mjs <export-dir> [--json]");
  process.exit(1);
}

/* Webflow's widgets map onto components this framework already has. The
   markup is unmistakable, so the mapping is worth making automatically. */
const WIDGETS = {
  "w-slider": "Interactive/Slider.astro",
  "w-tabs": "Interactive/Tabs.astro",
  "w-dropdown": "Interactive/Dropdown.astro",
  "w-nav": "Global/Nav.astro",
  "w-form": "Form/Form.astro",
  "w-richtext": "Typography/RichText.astro",
  "w-lightbox": "— no equivalent; needs building or dropping",
  "w-commerce": "— Ecommerce: no equivalent, scope before migrating",
  "w-checkout": "— Ecommerce: no equivalent, scope before migrating",
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === ".html") out.push(full);
  }
  return out;
}

/** Top-level children of <body>, each with the markup it contains. */
function topLevelBlocks(html, depthLimit = 2) {
  const body = html.split(/<body[^>]*>/i)[1]?.split(/<\/body>/i)[0] ?? "";
  const blocks = [];
  const tag = /<(\/?)([a-z][\w-]*)([^>]*)>/gi;
  const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "path", "circle", "use"]);
  let depth = 0;
  let start = -1;
  let name = "";
  let m;
  while ((m = tag.exec(body))) {
    const [whole, closing, el, attrs] = m;
    if (VOID.has(el.toLowerCase()) || attrs.endsWith("/")) continue;
    if (!closing) {
      if (depth === 0) {
        start = m.index;
        name = `${el}${(attrs.match(/class="([^"]{0,40})"/) ?? [])[1] ? `.${attrs.match(/class="([^"]{0,40})"/)[1].split(/\s+/)[0]}` : ""}`;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0 && start !== -1) {
        blocks.push({ name, html: body.slice(start, m.index + whole.length) });
        start = -1;
      }
    }
  }
  /* A Webflow page is usually one wrapper holding everything. The parts worth
     naming — nav, main, footer — are its children, so step inside it. */
  const total = blocks.reduce((n, b) => n + b.html.length, 0);
  const dominant = blocks.find((b) => b.html.length > total * 0.8 && b.html.length > 4000);
  if (dominant && depthLimit > 0) {
    const inner = dominant.html.replace(/^<[^>]+>/, "").replace(/<\/[a-z]+>\s*$/i, "");
    return [
      { name: `${dominant.name} (wrapper)`, html: dominant.html, wrapper: true },
      ...topLevelBlocks(`<body>${inner}</body>`, depthLimit - 1),
    ];
  }
  return blocks;
}

const files = walk(root);
if (!files.length) {
  console.error(`no .html files under ${root} — is that the unzipped export?`);
  process.exit(1);
}

const report = {
  siteId: null,
  pages: [],
  dynamicLists: [],
  forms: [],
  interactions: [],
  widgets: {},
  components: {},
  variantInstances: {},
  componentMarkers: {},
  lumosClasses: {},
  lumosAttrs: {},
  libraries: {},
  chrome: {},
  breakpoints: {},
  embeds: [],
  externalScripts: {},
};

const classesOf = (html) => {
  const found = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c.startsWith("w-")) found.add(c);
  }
  return found;
};

for (const file of files) {
  const html = readFileSync(file, "utf8");
  const page = relative(root, file);
  const route = "/" + page.replace(/index\.html$/, "").replace(/\.html$/, "");

  /* The export carries the site and page IDs the MCP addresses things by.
     They are the join between a flattened page and its live definition —
     no guessing at which site or page is which. */
  const siteId = (html.match(/data-wf-site="([^"]*)"/) ?? [])[1];
  const pageId = (html.match(/data-wf-page="([^"]*)"/) ?? [])[1];
  if (siteId) report.siteId = siteId;
  /* Webflow exports a collection template as detail_<collection>.html. It is
     one dynamic route, not one page, and its rendered item is a sample. */
  const template = /(^|\/)detail_([a-z0-9-]+)\.html$/.exec(page);
  report.pages.push({
    page,
    route: template ? `/${template[2]}/[slug]` : route,
    pageId,
    template: template ? template[2] : null,
    bytes: html.length,
  });

  /* A collection list. The export keeps the rendered items but not the
     binding, so the collection and its filter/sort have to come from the MCP. */
  const lists = [...html.matchAll(/class="[^"]*\bw-dyn-list\b[^"]*"/g)];
  if (lists.length) {
    const items = (html.match(/\bw-dyn-item\b/g) ?? []).length;
    const empty = /\bw-dyn-empty\b/.test(html);
    report.dynamicLists.push({
      page,
      lists: lists.length,
      renderedItems: items,
      hasEmptyState: empty,
      unknown: "which collection, and how it was filtered or sorted",
    });
  }

  /* Forms keep their fields but lose their action — Webflow handled submission. */
  for (const form of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    const attrs = form[1];
    const attr = (n) => (attrs.match(new RegExp(`${n}="([^"]*)"`)) ?? [])[1];
    const fields = [];
    for (const input of form[2].matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const a = input[2];
      const get = (n) => (a.match(new RegExp(`${n}="([^"]*)"`)) ?? [])[1];
      const type = get("type") ?? input[1];
      if (type === "submit") continue;
      fields.push({
        tag: input[1],
        type,
        name: get("name") ?? get("data-name"),
        required: /\brequired\b/.test(a),
      });
    }
    report.forms.push({
      page,
      name: attr("data-name") ?? attr("name") ?? "(unnamed)",
      method: attr("method") ?? "get",
      action: attr("action") ?? null,
      fields,
      unknown: "where submissions should go now",
    });
  }

  /* IX2 tags every animated element with data-w-id; the timeline itself is
     compiled into webflow.js and is not readable here. */
  const ix = (html.match(/data-w-id="/g) ?? []).length;
  if (ix) report.interactions.push({ page, animatedElements: ix });

  /* Webflow writes a component property as `data-wf--<component>--<prop>`,
     so the component's name and the property's name survive in the attribute
     name itself, with the chosen value alongside. This is the component
     inventory the export was supposed to have lost. */
  for (const m of html.matchAll(/data-wf--([a-z0-9-]+)--([a-z0-9-]+)="([^"]*)"/g)) {
    const [, component, prop, value] = m;
    const c = (report.components[component] ??= { props: {}, instances: 0 });
    c.instances++;
    const values = (c.props[prop] ??= {});
    values[value] = (values[value] ?? 0) + 1;
  }

  /* A variant also lands as a class carrying its id. Useful as a count of how
     many instances are non-default, even without the id resolving to a name. */
  const variantClasses = (html.match(/\bw-variant-[0-9a-f-]{8,}/g) ?? []).length;
  if (variantClasses) {
    report.variantInstances[page] = variantClasses;
  }

  /* Anything else data-wf-* is form and page plumbing, not component identity. */
  for (const m of html.matchAll(/(data-wf-[a-z-]+)="([^"]*)"/g)) {
    const key = m[1];
    if (/^data-wf-(site|page|page-id|element-id|user-form-type)$/.test(key)) continue;
    if (key.startsWith("data-wf--")) continue;
    (report.componentMarkers[key] ??= {});
    report.componentMarkers[key][m[2]] = (report.componentMarkers[key][m[2]] ?? 0) + 1;
  }

  /* A site built with Lumos for Webflow carries its own class and attribute
     vocabulary, and that maps far more directly onto this framework than a
     hand-built Webflow site does. */
  for (const m of html.matchAll(/\b(u-[a-z0-9-]+)/g)) {
    report.lumosClasses[m[1]] = (report.lumosClasses[m[1]] ?? 0) + 1;
  }
  for (const m of html.matchAll(/\b(data-(?:xsmall|small|medium|large)-columns|data-trigger|data-button|data-hide-from|data-code-move|data-number)="?/g)) {
    report.lumosAttrs[m[1]] = (report.lumosAttrs[m[1]] ?? 0) + 1;
  }

  /* Libraries the site depends on. Webflow serves these as .txt from its CDN,
     so a plain extension check misses them. */
  for (const lib of ["swiper", "gsap", "threejs", "three.min", "lenis", "splide", "barba", "lottie", "jquery"]) {
    if (new RegExp(lib, "i").test(html)) {
      (report.libraries[lib] ??= new Set()).add(page);
    }
  }

  for (const cls of classesOf(html)) {
    for (const [widget, target] of Object.entries(WIDGETS)) {
      if (cls === widget || cls.startsWith(widget + "-")) {
        (report.widgets[widget] ??= { pages: new Set(), target });
        report.widgets[widget].pages.add(page);
      }
    }
  }

  /* Webflow has no layout, so every exported page repeats the nav, the footer
     and anything else site-wide. Identical blocks across most pages are the
     layout, not page content. */
  for (const block of topLevelBlocks(html)) {
    const body = block.html.replace(/\s+/g, " ").trim();
    const entry = (report.chrome[block.name] ??= {
      name: block.name, pages: new Set(), bytes: 0, variants: new Set(),
    });
    entry.pages.add(page);
    entry.bytes = Math.max(entry.bytes, body.length);
    entry.variants.add(body);
  }

  /* Where the design actually reflows. Webflow writes max-width queries that
     shrink downward; this framework writes min-width ones that build upward. */
  for (const m of html.matchAll(/@media[^{]*?\(\s*(?:width\s*<|max-width:)\s*([\d.]+)(em|rem|px)\s*\)/g)) {
    const rem = m[2] === "px" ? Number(m[1]) / 16 : Number(m[1]);
    report.breakpoints[rem] = (report.breakpoints[rem] ?? 0) + 1;
  }

  const embeds = (html.match(/\bw-embed\b/g) ?? []).length;
  if (embeds) report.embeds.push({ page, embeds });

  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const src = m[1];
    if (src.startsWith("js/") || src.startsWith("./js/")) continue;
    report.externalScripts[src] = (report.externalScripts[src] ?? 0) + 1;
  }
}

for (const w of Object.values(report.widgets)) w.pages = [...w.pages];

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const line = "─".repeat(64);
console.log(`${report.pages.length} page(s) in ${root}`);
console.log(report.siteId
  ? `Webflow site ID: ${report.siteId}  — use this for every MCP call`
  : "No site ID found in the export; ask the MCP with list_sites instead.");
console.log(line);

console.log("\nPAGES — page IDs address get_page_metadata");
for (const p of report.pages) {
  console.log(`  ${p.route.padEnd(24)} ${p.page.padEnd(24)} ${p.pageId ?? "(no id)"}`);
}

console.log("\nWIDGETS — Webflow markup with a Lumos equivalent");
if (!Object.keys(report.widgets).length) console.log("  none");
for (const [name, { pages, target }] of Object.entries(report.widgets)) {
  console.log(`  ${name.padEnd(14)} ${String(pages.length).padStart(3)} page(s)  →  ${target}`);
}

console.log("\nCOLLECTION LISTS — bindings stripped, ask the MCP which collection");
if (!report.dynamicLists.length) console.log("  none");
for (const d of report.dynamicLists) {
  console.log(`  ${d.page.padEnd(28)} ${d.lists} list(s), ${d.renderedItems} rendered item(s)${d.hasEmptyState ? ", has empty state" : ""}`);
}

console.log("\nFORMS — fields survive, submission does not");
if (!report.forms.length) console.log("  none");
for (const f of report.forms) {
  console.log(`  ${f.page.padEnd(28)} "${f.name}" ${f.method.toUpperCase()} — ${f.fields.length} field(s): ${f.fields.map((x) => x.name + (x.required ? "*" : "")).join(", ")}`);
}

console.log("\nINTERACTIONS — element tagged, timeline compiled away");
if (!report.interactions.length) console.log("  none");
for (const i of report.interactions) {
  console.log(`  ${i.page.padEnd(28)} ${i.animatedElements} animated element(s)`);
}

const breaks = Object.entries(report.breakpoints)
  .map(([rem, n]) => [Number(rem), n])
  .sort((a, b) => a[0] - b[0]);
if (breaks.length) {
  console.log("\nBREAKPOINTS — where the original reflows");
  console.log("  Webflow writes these as max-width, shrinking down. Inverted to the");
  console.log("  min-width form this framework uses, the design breaks at:");
  for (const [rem, n] of breaks) {
    console.log(`    @media (width >= ${rem}rem)   ${String(rem * 16).padStart(5)}px   (${n} rule(s))`);
  }
  console.log("  The framework ships 30rem / 48rem / 64rem. To reflow where the");
  console.log("  original did, change those literals — they are not tokens, so they");
  console.log("  live in the components themselves.");
}

const pageCount = report.pages.length;
const chrome = Object.values(report.chrome)
  .filter((c) => c.pages.size >= Math.max(2, pageCount * 0.5) && c.bytes > 200)
  .sort((a, b) => b.bytes - a.bytes);
if (chrome.length) {
  console.log("\nSITE CHROME — on nearly every page, so it belongs in the layout");
  console.log("  BLOCK".padEnd(32) + "PAGES   SIZE      VERSIONS");
  for (const c of chrome) {
    const identical = c.variants.size === 1;
    console.log(
      `  ${c.name.padEnd(28)} ${String(c.pages.size).padStart(3)}/${pageCount}  ` +
        `${(c.bytes / 1024).toFixed(1).padStart(6)} KB  ` +
        (identical ? "identical" : `${c.variants.size} — differs per page`),
    );
  }
  console.log("\n  Identical blocks are Nav, Footer or layout furniture: import each");
  console.log("  ONCE into BaseLayout, Global/Nav or Global/Footer. A block that");
  console.log("  differs per page is usually a wrapper — keep the wrapper in the");
  console.log("  layout and let its changing child be the page's <slot />.");
}

const templates = report.pages.filter((p) => p.template);
if (templates.length) {
  console.log("\nCOLLECTION TEMPLATES — one dynamic route each, not one page");
  for (const t of templates) {
    console.log(`  ${t.page.padEnd(42)} → ${t.route}`);
  }
}

console.log("\nCOMPONENTS — name, property and value, from data-wf--<name>--<prop>");
const comps = Object.entries(report.components).sort((a, b) => b[1].instances - a[1].instances);
if (!comps.length) {
  console.log("  none — component identity has to come from the MCP");
}
for (const [name, c] of comps) {
  console.log(`  ${name}  (${c.instances} instance(s))`);
  for (const [prop, values] of Object.entries(c.props)) {
    const shown = Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${v || "(empty)"} ×${n}`)
      .join(", ");
    console.log(`      ${prop}: ${shown}`);
  }
}
const variantTotal = Object.values(report.variantInstances).reduce((a, b) => a + b, 0);
if (variantTotal) {
  console.log(`  plus ${variantTotal} w-variant-* class(es) across ${Object.keys(report.variantInstances).length} page(s) —`);
  console.log("  a variant id with no name; resolve it with list_components if it matters");
}

const lumos = Object.entries(report.lumosClasses).sort((a, b) => b[1] - a[1]);
if (lumos.length) {
  console.log("\nBUILT WITH LUMOS FOR WEBFLOW — its classes map onto this framework");
  console.log(`  ${lumos.length} u-* classes, ${lumos.reduce((a, [, n]) => a + n, 0)} uses. Most common:`);
  for (const [cls, n] of lumos.slice(0, 8)) console.log(`      ${cls.padEnd(26)} ×${n}`);
  const attrs = Object.entries(report.lumosAttrs).sort((a, b) => b[1] - a[1]);
  if (attrs.length) {
    console.log("  attribute APIs, which usually become props here:");
    for (const [a, n] of attrs) console.log(`      ${a.padEnd(26)} ×${n}`);
  }
}

const libs = Object.entries(report.libraries);
if (libs.length) {
  console.log("\nLIBRARIES — behaviour that does not come across on its own");
  for (const [lib, pages] of libs.sort((a, b) => b[1].size - a[1].size)) {
    console.log(`  ${lib.padEnd(12)} on ${String(pages.size).padStart(3)} page(s)`);
  }
}

if (Object.keys(report.componentMarkers).length) {
  console.log("\nOTHER data-wf-* MARKERS");
  for (const [attr, values] of Object.entries(report.componentMarkers)) {
    console.log(`  ${attr}: ${Object.keys(values).length} distinct value(s)`);
  }
}

if (report.embeds.length) {
  console.log("\nEMBEDS — custom code, read each one");
  for (const e of report.embeds) console.log(`  ${e.page.padEnd(28)} ${e.embeds} embed(s)`);
}

if (Object.keys(report.externalScripts).length) {
  console.log("\nTHIRD-PARTY SCRIPTS — decide which still belong");
  for (const [src, n] of Object.entries(report.externalScripts)) {
    console.log(`  ${String(n).padStart(3)}×  ${src}`);
  }
}

console.log(`\n${line}\nEvery "unknown" above is a question for the Webflow MCP or the user.`);
