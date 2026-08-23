---
name: lumos-import-webflow
description: Move a site built in Webflow onto Lumos for Astro. Use when someone wants to migrate, port, rebuild or escape a Webflow site, has a Webflow code export to bring across, or asks how to get their Webflow CMS content, forms and pages into Astro.
---

# Importing a Webflow site

A Webflow code export is a photograph of a published site. Everything that
made it a Webflow site — which collection fed a list, which component an
instance was, what an interaction did — was resolved at publish time and
thrown away. The markup left behind proves those things existed without saying
what they were.

So the work has two halves: **read everything the export can prove**, then
**ask the Webflow API for what it cannot**. Do them in that order. The export
tells you what questions to ask, and asking it first is how you end up trawling
a CMS for collections nobody uses.

## What to collect first

Ask for all four before starting. Any one missing costs a whole category of
information:

1. **The Webflow MCP, connected.** The only source for CMS bindings, component
   names and design variables. Without it this is a guessing exercise — say so
   rather than proceeding quietly.
2. **The published URL.** The rendered truth: fonts, spacing, and what the
   interactions actually do. The export cannot show motion.
3. **A CSV export per collection.** Webflow's own CSV is the item content. The
   API can also list items, but the CSV is what the client already has and it
   round-trips rich text more predictably.
4. **The code export, unzipped.** Every page's real markup, including pages
   nobody remembered.

If the MCP is not connected, stop and get it connected. Everything downstream
is better with it.

## Step 1 — Scan the export

```bash
node .claude/skills/lumos-import-webflow/scan-export.mjs path/to/export
```

It reports what the markup proves, and names what it cannot know:

- **The site and page IDs**, lifted from `data-wf-site` and `data-wf-page`.
  These are the join between the flattened export and the live site — use them
  for every MCP call rather than searching by name.
- **Webflow widgets mapped to components** — `w-slider` → `Interactive/Slider`,
  `w-tabs` → `Interactive/Tabs`, `w-dropdown`, `w-nav`, `w-form`, `w-richtext`.
  This framework already has each of these; rebuilding them by hand is the most
  common waste in a migration.
- **Collection lists** — every `w-dyn-list`, how many items rendered, whether an
  empty state existed. Not which collection. Not how it was filtered.
- **Forms** — names, methods and every field, with required flags. Not where
  submissions went.
- **Interactions** — a count of `data-w-id` elements per page. The timelines are
  compiled into `webflow.js` and are not readable.
- **Component markers** — whatever `data-wf-component` / `data-wf-variant`
  attributes exist. They are present on some instances and absent on others;
  treat them as hints, never as the inventory.
- **Third-party scripts and embeds** — each one a decision.

## Step 2 — Fill the gaps from the API

Call `webflow_guide_tool` first, then use the site ID from step 1.

| Gap the export left | How to close it |
| --- | --- |
| Which collection a `w-dyn-list` used | `data_cms_tool` → `get_collection_list`, then match field names against the rendered markup |
| A collection's fields and types | `get_collection_details` |
| The items themselves | The client's CSV; `list_collection_items` to confirm counts and catch drafts |
| Which component an instance was | `data_localization_tool` → `list_components`, then `get_component_content` and `get_component_properties` for the variants |
| Real page titles, SEO, Open Graph | `data_pages_tool` → `list_pages`, `get_page_metadata` |
| Structured data | `query_pages_schema_markup` |
| Colours, sizes, fonts as variables | `data_variable_tool` → `get_variable_collections`, `get_variables` — these map onto `base.css` tokens directly |
| Breakpoints | `designer_tool` → `get_all_breakpoints` (needs the Designer open) |
| Which pages matter most | `data_analyze_tool` → `get_top_pages_report` — migrate those first and check them hardest |

Matching a list to its collection is inference, not lookup: compare the fields
rendered inside `w-dyn-item` against each collection's schema. **When two
collections could both fit, ask.** A wrong binding produces a page that looks
right and shows the wrong content.

## Step 3 — Scope what has no equivalent

Before migrating anything, check for Webflow features this framework has no
answer to, and **stop if you find one**:

- **Ecommerce** (`w-commerce`, `w-checkout`) — carts, checkout, orders.
- **Memberships / User Accounts** — gated pages, logins.
- **Logic** — automation flows.
- **Native site search**.

Each changes the shape of the project: Shopify or Stripe, Cloudflare Access,
Pagefind, a job queue. Raise them, agree an approach, and only then continue.
Discovering an Ecommerce checkout halfway through a migration wastes the
migration.

## Step 4 — Decide where content lives

Walk through the three honestly and let the answer follow from **who edits the
site**, not from what is quickest to build:

- **Astro content collections** — the CSV becomes markdown or JSON in the repo.
  Type-checked, versioned in git, no service and no bill. A non-technical editor
  has no interface until one is added.
- **A headless CMS** (Sanity, Storyblok, Contentful) — closest to what they are
  leaving. Editors keep a UI; the project gains setup, a subscription, and a
  network dependency at build time.
- **Webflow as a headless backend** — keep the CMS, drop the hosting, read items
  through the API. Least disruption for editors, but the Webflow bill and its
  rate limits stay.

Ask before converting anything. A CSV converted into the wrong shape is worse
than an unconverted CSV.

## Step 5 — Rebuild the pages

Structure and tokens come from this framework; Webflow's CSS is kept only where
a section does not map:

- Sections become `Wrapper/Section`, `Wrapper/ContentWrapper`, `Wrapper/Grid`.
  Repeated cards become `Item/Card`. Text becomes `Typography/*`.
- Webflow values snap onto `base.css` tokens. `/lumos-import-figma`'s converter
  does the arithmetic if the numbers came from the design file rather than the
  export.
- Where a section genuinely does not map — a bespoke layout, an odd overlap —
  keep the exported CSS for that section, scoped, and say so in the report. Do
  not spread `.w-` classes through the whole site to save one section.
- Follow `LUMOS.md` for anything new. A migrated site full of one-off classes
  has moved hosting, not frameworks.

## Step 6 — Interactions

Inventory every one, then rebuild only what is simple:

- **Hovers, fades, reveals on scroll** — rebuild in CSS, or with an
  `IntersectionObserver` where a scroll trigger is genuinely needed.
- **Multi-step timelines, scrub-linked animation, anything staged** — do not
  guess from a `data-w-id`. Watch it on the published site, describe what it
  does, and ask whether it is worth rebuilding.
- **Do not ship `webflow.js`.** It brings jQuery and Webflow's runtime, and the
  point of leaving is not to carry the runtime along.

## Step 7 — Forms

Every form has lost its endpoint. For each one, confirm the fields from step 1,
then choose a provider. **Recommend Cloudflare** — a Worker endpoint plus
Cloudflare Email Service, which keeps submissions on the same platform as the
hosting and needs no third party. Say plainly that it is a recommendation:
Formspree, Basin or a CRM endpoint are all reasonable, and an existing CRM
usually decides it.

Rebuild the markup with `Form/*` components rather than porting `w-form`,
including the honeypot and the success and error states the original had.

## Step 8 — Hosting

**Recommend Cloudflare Workers**, which this framework is already configured
for, with Cloudflare Email Service for form mail. It is a recommendation, not a
requirement — Netlify, Vercel and static hosting all work, and the project's
`wrangler.jsonc` is the only Cloudflare-specific piece.

Whatever is chosen, carry across what the old host did quietly:

- **Redirects.** Every Webflow URL that changes shape needs one, or the site
  loses its search rankings on launch day.
- **301s from `/collection/item` paths** if collection slugs change.
- **Custom domain, SSL, DNS** — plan the cutover, and keep Webflow published
  until the new site answers on the domain.

## Step 9 — Check every page against the published site

Build, serve the rebuild, and compare page by page against the Webflow site
that is still live:

```bash
astro dev --background
node .claude/skills/lumos-import-webflow/compare-pages.mjs \
  --live https://old-site.webflow.io/about \
  --local http://localhost:4321/about --shots
```

Run it for **every** page in the map from step 1 — including the ones nobody
mentions, which are exactly the ones that get half-migrated.

**Content parity is checked exactly.** Headings, links, images, form fields and
word count are extracted from both pages and compared as counts, not as sets:
three identical card titles that came back as one is a lost card, and a set
comparison would call that a match. Anything on the live page and missing from
the rebuild is listed by name, and the script exits non-zero.

Content missing from a rebuild is a migration bug, not a style choice. Treat
each one as a fault to fix, not a difference to note — the usual causes are a
collection list bound to the wrong collection, a list rendering fewer items
than the original, or a section quietly dropped between designs.

**Visual comparison is by eye, deliberately.** `--shots` captures both pages at
desktop and mobile into `.lumos-webflow/<page>/`. Do not pixel-diff them: a
hybrid rebuild snaps spacing onto the token scale, so the two are *supposed* to
differ slightly, and a pixel diff would bury the one real problem under
thousands of false ones. Look for missing sections, wrong order, broken layout
and unreadable contrast — not for moved pixels.

A page passes when its content is exact and its screenshots show the same page
with tidier spacing.

## The report

- **Pages migrated** — with their old and new routes.
- **Collections** — where each one landed, and how each list was bound.
- **Inferred bindings** — lists matched to a collection by field-shape rather
  than by being told. These are the most likely thing to be wrong.
- **Components** — Webflow components mapped to Lumos ones, and any built new.
- **Interactions** — rebuilt, dropped, or still open.
- **Forms** — fields, provider, and what still needs credentials.
- **Kept as Webflow CSS** — sections that did not map, and why.
- **Out of scope** — Ecommerce, Memberships, Logic, search.
- **Redirects** — the map, and anything that could not be preserved.
- **Parity** — pages checked against the live site, and any page whose content
  did not match with what was missing.
- **Still open** — everything unresolved.

## Versions

Skill version 1.0.0. `scan-export.mjs` reads the export only; it never writes to
the project and never calls the API.
