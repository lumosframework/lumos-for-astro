---
name: lumos-import-webflow
description: Move a site built in Webflow onto Lumos for Astro. Use when someone wants to migrate, port, rebuild or escape a Webflow site, has a Webflow code export to bring across, or asks how to get their Webflow CMS content, forms and pages into Astro.
---

# Importing a Webflow site

A Webflow code export is a photograph of a published site. Everything that made
it a Webflow site — which collection fed a list, which component an instance
was, what an interaction did — was resolved at publish time and thrown away.
The markup left behind proves those things existed without saying what they
were.

## Three passes, in this order

**One: rebuild it exactly.** Page for page from the export, Webflow's own CSS
and markup, changing nothing about how it looks. The site works and looks
right, in Astro, still wearing Webflow's clothes.

**Two: swap in what Lumos already has.** A widget at a time, replacing Webflow
markup with the real component and matching its props against what Webflow had.

**Three: connect the data.** CMS bindings, dynamic routes, forms.

The order is the point. Pass one produces something **provably identical to the
live site** — content parity exact, screenshots near enough to overlay, because
the CSS is Webflow's own. That becomes the baseline every later change is
measured against. Swap the slider in pass two and something shifts, the swap
did it; there is nowhere else for it to have come from. Rebuild and restructure
in one move and every difference has three possible causes and no way to tell
them apart.

Resist finishing a page. A half-Lumos, half-Webflow page that looks finished is
worse than an honestly Webflow one, because nothing can be verified against it.

## What to collect first

Ask for all five. Any one missing costs a category of information:

1. **The Webflow MCP, connected** — the only source for CMS bindings, component
   names and variants, and design variables. Without it this is guesswork; say
   so rather than proceeding quietly.
2. **The published URL** — the rendered truth, and the only place to see motion.
3. **A CSV export per collection** — the item content.
4. **The code export, unzipped** — every page's markup, including pages nobody
   remembers.
5. **The 301 redirects, exported from Webflow** — Site Settings → Publishing →
   301 redirects, which exports as CSV. **There is no API for these**: the
   sites tool reads settings, domains and publishing status, and redirects are
   not among them. If nobody exports the CSV, the only remaining record is
   Webflow's own settings screen, and once the site is unpublished it is gone.

   These are not the redirects this migration creates. They are the ones the
   site was already serving — often years of them, from restructures that
   happened long before anyone considered leaving. Losing them breaks inbound
   links that have nothing to do with the move.

## Step 0 — Scan, and scope the blockers

```bash
node .claude/skills/lumos-import-webflow/scan-export.mjs path/to/export
```

It reports the site and page IDs (lifted from `data-wf-site` and
`data-wf-page`, which is how every MCP call addresses things), the Webflow
widgets and what they map to, every collection list, every form and its fields,
interaction counts, component markers, embeds and third-party scripts.

Then check for features this framework has no answer to, and **stop if you find
one**: Ecommerce (`w-commerce`, `w-checkout`), Memberships, Logic, native site
search. Each changes the shape of the project — Shopify or Stripe, Cloudflare
Access, Pagefind. Agree an approach before rebuilding anything.

---

# Pass 1 — Rebuild it exactly

The goal is a site that is indistinguishable from the published one. Not
idiomatic, not tokenised. Identical.

**Pages, one for one.** Every page in the export becomes a page at the same
route. Body markup goes in as it is, Webflow class names intact — those classes
*are* the styling, and renaming them here would be renaming and restructuring at
once.

**CSS.** Webflow exports `normalize.css`, `webflow.css` and
`<site>.webflow.css`. The first two are framework and stay global. The third
holds every component's rules, scattered — `.hero_wrap`, `.hero_inner`, the
same names again inside each breakpoint, plus states.

```bash
node .claude/skills/lumos-import-webflow/split-css.mjs export/css/site.webflow.css
node .claude/skills/lumos-import-webflow/split-css.mjs export/css/site.webflow.css --prefix hero
```

The first call shows the component groups it can see. The second prints one
group's rules, media queries kept whole, ready for that component's `<style>`.

Two things it will not decide:

- **Rules that span two groups.** `.hero_wrap .button_primary` belongs to
  neither alone. Move it, duplicate it, or leave it global — but read it.
- **What is genuinely global.** Base type, colour variables and shared
  utilities stay in a global stylesheet. Only component rules move.

`u-*` classes are Lumos for Webflow's utility convention. Leave them working in
pass one; they are the clearest signal of intent in pass two.

**Components.** Every group the splitter found becomes a component, holding its
own markup and its own `<style>`. Where the markup matches nothing this
framework has, **build it now** — with Webflow's class names and Webflow's CSS.
It becomes a real Lumos component in pass two, or stays as it is if nothing
maps.

**JavaScript.** Keep `webflow.js` for now if widgets need it, and say so in the
report. It is jQuery and Webflow's runtime, and it comes out in pass two as the
widgets are replaced. Custom embeds are read one at a time.

**Verify, and keep the result.** For every page:

```bash
node .claude/skills/lumos-import-webflow/compare-pages.mjs \
  --live https://old-site.webflow.io/about \
  --local http://localhost:4321/about --shots
```

Content parity must be exact — headings, links, images, form fields, counted
not merely matched. Screenshots should be near-identical at this stage, because
the CSS is Webflow's own; a visible difference means something was missed, not
that a token rounded. **Keep these screenshots. They are the baseline for
everything after.**

---

# Pass 2 — Swap in what Lumos already has

One component at a time, verifying after each. A batch of swaps that breaks
something costs more to unpick than it saved.

**Widgets.** `w-slider` → `Interactive/Slider`, `w-tabs` → `Interactive/Tabs`,
`w-dropdown` → `Interactive/Dropdown`, `w-nav` → `Global/Nav`, `w-form` →
`Form/*`, `w-richtext` → `Typography/RichText`.

**Match the props, do not guess them.** The export lost the settings; the API
still has them. `data_localization_tool` → `list_components` finds the
component, `get_component_properties` gives its properties and variant values.
Read the Webflow slider's autoplay, delay and slides-per-view, then set the
Lumos `Slider` to match. Where Lumos has no equivalent for a Webflow setting,
say so in the report rather than dropping it silently.

**Structure.** `u-section` becomes `Wrapper/Section`, containers become
`Wrapper/ContentWrapper` or `Wrapper/Grid`, repeated cards become `Item/Card`,
text becomes `Typography/*`.

**Styles that came with a section — how it was set in Webflow decides.**

- Set as a **named class** in Webflow (a class someone made and reused): keep it
  as a custom class on the Lumos component, with its rules in that component's
  `<style>`. It was a decision, and it should stay one.
- Set as a **utility** (`u-*`, or a spacing class from a system): use the
  matching Lumos utility or prop — `Section`'s `paddingTop`, `theme`, `gap`. A
  utility in Webflow means the same thing as a utility here.
- Set as a **one-off on the element**: fold it into the component's own styles
  or drop it if a prop covers it. One-offs are how a system stops being one.

**Delete what the swap made dead.** When a Webflow widget's markup goes, its
CSS goes with it. A stylesheet still carrying rules for components that no
longer exist is the failure mode of this kind of migration.

**Interactions.** As each widget is replaced, its IX2 behaviour has to be
accounted for. Rebuild hovers, fades and scroll reveals in CSS or with an
`IntersectionObserver`. Multi-step timelines and scrub-linked animation are not
readable from `data-w-id` — watch them on the published site, describe them,
and ask whether they are worth rebuilding. When the last widget is gone,
`webflow.js` goes too.

**Verify against the baseline, not against live.** The pass-one screenshots are
what to compare with now. A difference here was caused by the swap that just
happened.

---

# Pass 3 — Connect the data

The markup is Lumos now. Bind it.

**Decide where content lives**, before converting anything. Let the answer
follow from who edits the site:

- **Astro content collections** — the CSV becomes markdown or JSON in the repo.
  Type-checked, versioned, no service and no bill. A non-technical editor has no
  interface until one is added.
- **A headless CMS** — closest to what they are leaving. Editors keep a UI; the
  project gains setup, a subscription and a build-time dependency.
- **Webflow as a headless backend** — keep the CMS, drop the hosting. Least
  disruption, but the Webflow bill and its rate limits stay.

**Bind the lists.** Each `w-dyn-list` from step 0 needs its collection.
`get_collection_list` and `get_collection_details` give the schemas; match them
against the fields rendered inside `w-dyn-item`. This is inference, not lookup
— **when two collections could both fit, ask.** A wrong binding renders
beautifully and says the wrong thing.

Filters and sorts are gone from the export entirely. The rendered order is the
only evidence, and the client's memory is the rest. Confirm each one.

**Collection templates become dynamic routes.** A Webflow collection page is
`/blog/[slug].astro` with `getStaticPaths`. Every published item needs a page at
the same URL it had, or the redirects in the hosting step have to cover it.

**Forms.** Fields survive; submission does not. Rebuild with `Form/*`
components, including the honeypot and the success and error states the original
had, then choose a provider. **Recommend Cloudflare** — a Worker endpoint plus
Cloudflare Email Service, on the same platform as the hosting and with no third
party. Say plainly that it is a recommendation: Formspree, Basin or a CRM
endpoint are all reasonable, and an existing CRM usually decides it.

**Verify.** Content parity again, and this time count items: a list that
rendered nine on the live site and renders six now is a filter that was not
carried across.

---

## Hosting

**Recommend Cloudflare Workers**, which this framework is already configured
for, with Cloudflare Email Service for form mail. A recommendation, not a
requirement.

**Redirects come in two sets, and both have to end up in one map.**

- **Inherited** — the CSV from step 0. Webflow was already serving these;
  carry every row across unchanged. A rule pointing at a URL this migration
  also changed needs its target updated, not its source.
- **Created by the move** — every URL that changed shape, including
  `/collection/item` paths if any slug changed, and any page that was renamed
  or reorganised on the way over.

Check the two sets against each other for chains and contradictions: an old
rule sending `/services` to `/what-we-do`, plus a new rule sending
`/what-we-do` to `/work`, should be flattened to one hop rather than left to
redirect twice.

Then the custom domain, SSL and DNS cutover. Keep Webflow published until the
new site answers on the domain.

## The report

- **Pass 1** — pages rebuilt, components created, CSS split per component, what
  stayed global, rules that spanned two components and what was decided.
- **Pass 2** — Webflow components mapped to Lumos ones, props matched and props
  with no equivalent, styles kept as classes versus moved to utilities, CSS
  deleted, interactions rebuilt or dropped.
- **Pass 3** — collections and where they landed, bindings inferred rather than
  told, filters confirmed, forms and their provider.
- **Parity** — pages checked against the live site, and any whose content did
  not match.
- **Out of scope** — Ecommerce, Memberships, Logic, search.
- **Redirects** — the inherited rules, the ones this move created, any chains
  that were flattened, and anything that could not be preserved.
- **Still open** — everything unresolved.

## Versions

Skill version 2.0.0. All three scripts read only: `scan-export.mjs` and
`split-css.mjs` never write to the project, and `compare-pages.mjs` only fetches
and screenshots.
