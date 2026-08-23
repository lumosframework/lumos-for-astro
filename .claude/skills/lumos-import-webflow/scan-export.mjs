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
  componentMarkers: {},
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
  report.pages.push({ page, route, pageId, bytes: html.length });

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
      name: attr("data-name") ?? attr("name"),
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

  /* Component instances sometimes carry a name and variant, sometimes not.
     Collect every data-wf-* rather than guessing at attribute names. */
  for (const m of html.matchAll(/(data-wf-[a-z-]+)="([^"]*)"/g)) {
    const key = m[1];
    if (key === "data-wf-site" || key === "data-wf-page") continue; // IDs, above
    (report.componentMarkers[key] ??= {});
    report.componentMarkers[key][m[2]] = (report.componentMarkers[key][m[2]] ?? 0) + 1;
  }

  for (const cls of classesOf(html)) {
    for (const [widget, target] of Object.entries(WIDGETS)) {
      if (cls === widget || cls.startsWith(widget + "-")) {
        (report.widgets[widget] ??= { pages: new Set(), target });
        report.widgets[widget].pages.add(page);
      }
    }
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

console.log("\nCOMPONENT MARKERS — present on some instances, not all");
if (!Object.keys(report.componentMarkers).length) {
  console.log("  none — every component identity must come from the MCP");
}
for (const [attr, values] of Object.entries(report.componentMarkers)) {
  console.log(`  ${attr}`);
  for (const [value, count] of Object.entries(values)) {
    console.log(`    ${value.padEnd(34)} ×${count}`);
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
