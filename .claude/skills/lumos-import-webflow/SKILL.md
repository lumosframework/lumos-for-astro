---
name: lumos-import-webflow
description: Move a site built in Webflow onto Lumos for Astro. Use when someone wants to migrate, port, rebuild or escape a Webflow site, has a Webflow code export to bring across, or asks how to get their Webflow CMS content, forms and pages into Astro.
---

# Importing a Webflow site

**The finished site is indistinguishable from the published one and contains no
Webflow.** Every section is a Lumos component, every value a Lumos token, every
utility a Lumos utility. Not a near-miss rebuilt in the framework's own taste —
the same site, built properly.

That is achievable because Lumos for Webflow and Lumos for Astro are one design
system under two naming conventions. `--swatch--light-200` here is
`--light-200` there; `--_spacing---space--8` is `--space-8`; the fluid formulas
have the same shape. Port the variables and the components render the original
design with no hand-written CSS. A hand-built Webflow site takes more work, but
the destination is the same.

## The passes

|       |                                                                              | Verified by                        |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------- |
| **1** | Rebuild each page exactly, Webflow's own CSS intact                          | Matches the live site              |
| **2** | Port the variables, swap in Lumos components, delete the CSS each swap kills | Still matches pass 1               |
| **3** | Bind the CMS, routes and forms                                               | Item counts and content match live |

Pass 1 produces a **provable baseline**: parity exact, screenshots overlaying,
because the CSS is Webflow's own. Everything after is measured against it, so a
difference has one possible cause — the change just made. Rebuild and
restructure together and every difference has three causes and no way to tell
them apart.

Resist finishing a page end-to-end. A half-converted page looks finished and
verifies against nothing.

## Collect first

1. **The Webflow MCP, connected** — the only source for per-instance component
   props, and the best source for CMS bindings. Without it, stop and say so.
2. **The published URL** — the rendered truth, and the only place to see motion.
3. **A CSV per collection** — the item content.
4. **The code export, unzipped**.
5. **The 301 redirects** — Site Settings → Publishing, exports as CSV. **No API
   returns these**; once the site is unpublished the record is gone. They are
   not the redirects this migration creates — they are years of earlier ones,
   and losing them breaks links that have nothing to do with the move.

## Step 0 — Scan

```bash
node .claude/skills/lumos-import-webflow/scan-export.mjs path/to/export
```

Reports the site and page IDs (`data-wf-site`, `data-wf-page` — how every MCP
call addresses things), the component inventory, collection templates, widgets,
lists, forms, libraries and embeds.

**Read the provenance line first.** `u-*` classes and `data-*-columns`
attributes mean the site was built with **Lumos for Webflow**, and pass 2
becomes a lookup rather than a search.

**The export did not lose the components.** Webflow writes each instance as
`data-wf--<component>--<prop>="<value>"`, so names and variants survive in the
attribute names — on a real site, the whole inventory with usage counts.

**Templates are not pages.** `detail_<slug>.html` uses the collection's own
slug; matched against `get_collection_list` the binding is exact. Each becomes
one dynamic route.

**Per-page list counts mislead.** A CMS-driven nav and footer put eleven
collection lists on every page. Those bind once in the layout, not fifty-nine
times.

Then stop for anything with no equivalent here — **Ecommerce** (`w-commerce`,
`w-checkout`), **Memberships**, **Logic**, **native search**. Each changes the
shape of the project. Agree an approach before rebuilding anything.

---

# Pass 1 — Rebuild it exactly

Not idiomatic. Identical.

**Pages, one for one**, at the same routes, body markup as-is with Webflow's
class names intact — those classes _are_ the styling.

**CSS.** `normalize.css` and `webflow.css` are framework and stay global. The
site stylesheet holds every component's rules, scattered across breakpoints.

```bash
node .claude/skills/lumos-import-webflow/split-css.mjs export/css/site.webflow.css
node .claude/skills/lumos-import-webflow/split-css.mjs export/css/site.webflow.css --prefix hero
```

The first shows the component groups; the second prints one group's rules with
media queries intact, ready for that component's `<style>`. It separates
library CSS (Swiper and friends) and reports two things it will not decide:
rules whose selector spans two components, and what is genuinely global.

**Fonts.** `@font-face` blocks and the font files come across now. A missing
font changes every measurement on the page and makes the later diffs
meaningless.

**Components.** Every group becomes a component holding its own markup and
`<style>`. Where nothing here matches, build it now with Webflow's classes; it
becomes a real Lumos component in pass 2.

**JavaScript.** Keep `webflow.js` for now if widgets need it; it leaves in pass 2. Read every embed.

**Verify, and keep the screenshots.**

```bash
node .claude/skills/lumos-import-webflow/compare-pages.mjs \
  --live https://old-site.webflow.io/about \
  --local http://localhost:4321/about --shots
```

Content parity must be exact — headings, links, images, fields, counted not
merely matched. Screenshots should overlay. **This is the baseline.**

---

# Pass 2 — Make it Lumos

## First, port the variables

```bash
node .claude/skills/lumos-import-webflow/map-variables.mjs export/css/site.webflow.css
```

Compares the site's variables against `base.css` and sorts them four ways: what
already matches, what differs, what the site has and this framework does not,
and what cannot be mapped by name. The differing list prints paste-ready, with
references already renamed.

On a real site that list is short — brand colours, a font family, a nav height,
a tightened letter-spacing — because the two systems ship the same defaults.
**Port it before swapping a single component.** Do it after and every swap
lands at the framework's values instead of the site's, and each one looks like
a regression.

Theme colours live in the `.theme-*` blocks, not `:root`. A site with dark
sections has a value for each.

## Then swap, one component at a time

For a Lumos for Webflow site this is mostly a table. The variants are already
the prop values:

| Webflow                                                                        | Becomes                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `typography-heading` `display`/`h1`–`h6`                                       | `Typography/Heading` `variant`                               |
| `typography-paragraph` `inherit`/`text-large`/`text-small`                     | `Typography/Paragraph` `variant`                             |
| `section` `inherit`/`dark`/`brand`                                             | `Wrapper/Section` `theme`                                    |
| `spacer` `none`/`small`/`main`/`large`/`page-top`                              | `Section` padding (`main`→`medium`, `page-top`→`navoverlap`) |
| `layout` `stack`/`columns`/`contain`/`breakout`/`card`/`auto-width`/`sticky-*` | `Wrapper/ContentWrapper` `variant`, `-reversed` → `reverse`  |
| `button-main` `primary`/`secondary`/`tertiary`/`link*`                         | `Button` `emphasis` and `variant`                            |
| `button-wrapper`                                                               | `Wrapper/ButtonWrapper`                                      |
| `form-input`, `form-label-text` `hidden`                                       | `Form/Input`, `labelHidden`                                  |
| `data-{xsmall,small,medium,large}-columns`                                     | `Wrapper/Grid`'s four column props                           |
| `u-text-style-*`                                                               | the `text-style-*` utilities, same names                     |

**Props the export does not carry come from the page, not the component.**
`get_component_properties` returns a component's _defaults_ — a Button Main has
ten properties and only `variant` reaches the export. Instance values are in
`data_localization_tool` → `get_page_content`, as `component-instance` nodes
with `propertyOverrides`. Join three calls:

- `list_components` — id to name and group
- `get_component_properties` — property id to label
- `get_page_content` — this instance's values

That recovers what the export never had: a Section's `Container Classes`, each
button's own label, a video URL passed as a property.

**Widgets, where Webflow's own were used.** `w-slider` → `Interactive/Slider`,
`w-tabs` → `Interactive/Tabs`, `w-dropdown`, `w-nav`, `w-form`, `w-richtext`.
Do not expect to find them: a Lumos for Webflow site builds its own, so the
carousel is Swiper and the nav is custom markup. The library list is the better
guide — Swiper, GSAP, Three.js and Lenis on every page means motion is
third-party, and each library is a decision: reimplement, carry across, or
drop.

**Styles that came with a section — how it was set in Webflow decides.**

- A **named class** stays a custom class on the Lumos component, its rules in
  that component's `<style>`. It was a decision; keep it one.
- A **utility** becomes the matching Lumos utility or prop — `Section`'s
  `paddingTop`, `theme`, `gap`. A utility means the same thing in both systems.
- A **one-off** folds into the component's styles, or disappears if a prop
  covers it.

**Delete what the swap killed.** The rules for replaced markup go with it. A
stylesheet carrying styles for components that no longer exist is how this kind
of migration fails.

**Interactions.** As each widget goes, account for its IX2 behaviour: rebuild
hovers, fades and scroll reveals in CSS or with an `IntersectionObserver`.
Timelines and scrub-linked animation are not readable from `data-w-id` — watch
them live, describe them, ask whether they are worth rebuilding. When the last
widget is gone, so is `webflow.js`.

**Verify against the pass-1 baseline, not against live.** A difference now was
caused by the swap just made. It is a defect, not drift: the tokens are the
site's own, so the components should land where the Webflow markup did. Chase
it to the token or prop that is wrong rather than accepting it.

---

# Pass 3 — Connect the data

**Where content lives**, decided before converting anything, by who edits the
site: **Astro content collections** (typed, in git, no bill, no editor UI), **a
headless CMS** (closest to what they are leaving, plus a subscription), or
**Webflow as a headless backend** (least disruption, keeps the bill).

**Bindings.** Two are exact, one is not:

- **Templates** — `detail_<slug>.html` names the collection's slug.
- **CSVs** — each is named with its collection ID and carries a `Collection ID`
  column.
- **Lists on a page** — nothing in the export says which collection. Compare
  the fields inside `w-dyn-item` against `get_collection_details`, or read the
  binding from the element tree (`data_element_tool` → `query_elements`, then
  `get_attributes` with `with_resolved_bindings: false`). **When two
  collections could both fit, ask.**

**Filters and sorts are the one thing nothing hands you.** The published HTML
is the result of a filter, not the filter; the CMS API filters what you ask
for, it does not report how a page's list was configured. Look in the element
tree; failing that, the record is the client's Designer. Confirm each against
the live site — a list showing nine of forty items has a filter, and a rebuild
without it shows forty.

**Collection templates become dynamic routes** — `/blog/[slug].astro` with
`getStaticPaths`, at the URLs the items already had.

**Forms.** Fields survive, submission does not. Rebuild with `Form/*`, keeping
the honeypot and the success and error states, then choose a provider.
**Recommend Cloudflare** — a Worker plus Cloudflare Email Service, same
platform as the hosting, no third party. A recommendation: an existing CRM
usually decides it.

---

## Finish

**The gate:** no `.w-` classes outside the framework reset, no rules left in
the site stylesheet that a component or token now covers, no `webflow.js`, and
every page still matching. If Webflow CSS survives, name each rule in the
report and why nothing here replaced it.

**Hosting.** Recommend **Cloudflare Workers**, which this framework is
configured for, with Cloudflare Email Service for form mail.

**Redirects, one map from two sets.** The inherited CSV, carried across
unchanged, and the ones this move created. Check them against each other:
`/services → /what-we-do` plus `/what-we-do → /work` should be flattened to one
hop. Then the domain, SSL and DNS cutover, keeping Webflow published until the
new site answers.

## The report

- **Pass 1** — pages, components created, CSS split, what stayed global, rules
  spanning two components and the decision made.
- **Variables** — ported, added, and any left unmapped.
- **Pass 2** — components mapped, props from the export versus from
  `get_page_content`, props with no equivalent, styles kept as classes versus
  moved to utilities, CSS deleted, libraries reimplemented or carried,
  interactions rebuilt or dropped.
- **Pass 3** — collections and where they landed, bindings inferred rather than
  told, filters confirmed, forms and provider.
- **Parity** — every page checked, and any that did not match.
- **Webflow that survived** — with a reason each.
- **Out of scope**, **redirects**, **still open**.

## Versions

Skill 3.0.0. Tested against a 59-page Lumos for Webflow export: 13 collections,
147 variables, a 363 KB stylesheet. All four scripts read only.
