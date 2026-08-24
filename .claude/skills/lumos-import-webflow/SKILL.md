---
name: lumos-import-webflow
description: Move a site built in Webflow onto Lumos for Astro. Use when someone wants to migrate, port, rebuild or escape a Webflow site, has a Webflow code export to bring across, or asks how to get their Webflow CMS content, forms and pages into Astro.
---

# Importing a Webflow site

**The finished site is indistinguishable from the published one and contains no
Webflow.** Every section is a Lumos component, every value a Lumos token, every
utility a Lumos utility.

**It is a substitution, not a rewrite.** Keep the original HTML, CSS and
JavaScript. Swap three things — variables, classes, components — for their
Lumos equivalents, and move what Webflow kept in global files into the
component that uses it. Markup you re-author is markup you have to re-verify,
and the export is the only record of what the site actually was.

That is achievable because Lumos for Webflow and Lumos for Astro are one design
system under two naming conventions. `--swatch--light-200` here is
`--light-200` there; `--_spacing---space--8` is `--space-8`; the fluid formulas
have the same shape. Port the variables and the components render the original
design with no hand-written CSS. A hand-built Webflow site takes more work, but
the destination is the same.

## The passes

|       |                                                                                                | Verified by                        |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| **1** | Bring it across as it is — HTML, CSS, JS, fonts — and split the global stylesheet by component | Matches the live site              |
| **2** | Substitute variables, then classes, then components; relocate the JS                           | Still matches pass 1               |
| **3** | Bind the CMS, routes and forms                                                                 | Item counts and content match live |

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

## The layout comes first

**Change the framework's own files. Never create a second version of one.** An
import runs on a fresh scaffold: `BaseLayout.astro`, `Global/Nav.astro`,
`Global/Footer.astro` and `base.css` are placeholders that exist to be
overwritten. A `WebflowLayout` beside `BaseLayout` leaves two layouts, one
wired to nothing. Replace what is inside `Nav`; do not build a second one.

**Webflow has no layout, so every exported page repeats the chrome.** The
scanner's SITE CHROME table names the blocks — on a real site,
`header.navbar_wrapper` and `footer.footer_wrap` on 36 of 59 pages, a
`div.page_wrap` around everything and a `main.page_main` inside it. Import each
one **once**:

| Export                                                        | Goes to                                       |
| ------------------------------------------------------------- | --------------------------------------------- |
| the outer wrapper (`page_wrap`)                               | `BaseLayout`, around everything               |
| `header.navbar_wrapper`                                       | `Global/Nav.astro`, replacing its contents    |
| `footer.footer_wrap`                                          | `Global/Footer.astro`, replacing its contents |
| fixed and furniture blocks (`u-position-fixed`, `guide_wrap`) | `BaseLayout`                                  |
| `main.page_main`                                              | `<main><slot /></main>` in `BaseLayout`       |
| everything inside `page_main`                                 | the page file, and nothing else               |

**A page file holds only what was inside `main`.** Nav markup in a page means
it is in the wrong place — and it will be in every page, because that is how
the export was written.

**Page metadata uses the layout's existing `SeoProps` and `Utility/BaseHead`.**
Title and description props on a new layout rebuild what the framework does.

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

**Fonts and images.** `@font-face` blocks and the font files come across now —
a missing font changes every measurement and makes the later diffs meaningless.

Images move too. The export ships an `images/` folder and rewrites `src` and
`srcset` to point at it; keep those paths working. What each image becomes is a
pass-2 decision — a plain `<img>` becomes `Media/Img` and moves to
`src/assets` for optimisation, while a CMS-bound image stays a URL until pass 3
binds it. Anything still served from `cdn.prod.website-files.com` is a file
that never came across, and it stops working when the Webflow site does.

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

**Then rename the references, or the port does nothing.** The CSS carried
across in pass 1 refers to Webflow's variable names thousands of times — 3859
`var()` uses on a real site. Values in `base.css` under new names leave every
one of those pointing at a variable that no longer exists.

```bash
node .claude/skills/lumos-import-webflow/map-variables.mjs export/css/site.webflow.css --sed
```

Writes a rename script, longest names first so shorter ones cannot truncate
them. Run it over the component styles and stylesheets, rebuild, and diff
before going further.

Theme colours live in the `.theme-*` blocks, not `:root`. A site with dark
sections has a value for each.

## Then the classes

```bash
node .claude/skills/lumos-import-webflow/map-classes.mjs path/to/export
node .claude/skills/lumos-import-webflow/map-classes.mjs path/to/export --sed
```

Lumos for Webflow prefixes its utilities `u-`; this framework does not. The
vocabulary is otherwise largely identical, so most of this is a rename over the
markup you already have. On a real site, **256 of 359 classes rename cleanly**,
ten belong to a component, and the rest need a decision. `--sed` writes the
rename script.

A class a component owns is a signal rather than an order: `u-section` means
that markup wants `Wrapper/Section`, which is the next step anyway.

A third group is answered by a component or a technique rather than another
class, and the script names each one:

- `u-content-wrapper`, `u-layout-column-*` → `Wrapper/ContentWrapper` and a variant
- `u-section-spacer` → `Wrapper/Section`, with `paddingTop` / `paddingBottom`
- `u-svg` → `Media/Icon`; `u-rich-text` → `Typography/RichText`
- `u-embed-css`, `u-embed-js` → drop the wrapper, keep only its child `<style>`
  or `<script>`
- `u-hide-if-empty` → render nothing instead: a slot check or the `render`
  prop, decided at build time rather than hidden with CSS

**Everything else stays exactly as it is.** Those classes are the site's own,
their rules came across in pass 1, and inventing framework utilities to absorb
them is how a substitution turns into a rewrite.

## Then the components, one at a time

**A swap has two halves, and the second is the one that gets skipped.** Replace
the markup with the Lumos component, _then style that component to match the
original_. Keeping `u-eyebrow-wrapper` markup because it already looks right
leaves the site with no component, no reuse, and the Webflow class still in it
— the design survived and the substitution did not.

The framework's components are placeholders, exactly like `BaseLayout` was.
`Button.astro`, `Typography/Eyebrow.astro`, `Wrapper/ButtonWrapper.astro` ship
with defaults meant to be replaced by the site being imported. Change them.
Every instance across every page then inherits the design, which is the whole
reason to use a component.

For each component:

1. **Find its markup and its CSS.** `map-classes` names the families —
   `u-eyebrow-wrapper`, `u-eyebrow-layout`, `u-eyebrow-marker`,
   `u-eyebrow-text` are one component, not four utilities. `split-css --prefix
eyebrow` prints their rules.
2. **Move those rules into the Lumos component's `<style>`**, replacing what is
   there. The two components have the same anatomy — a marker and a text node
   in `Eyebrow`, a wrapper and a label in `Button` — so the rules transfer
   nearly as they are.
3. **Map the Webflow variants onto the component's props**, from the
   `data-wf--<component>--variant` values the scanner found.
4. **Swap the markup and delete the Webflow classes.** They are expressed by
   the component now. A class left behind is a rule that will contradict the
   component later.
5. **Diff the page.** Nothing should move.

### Markup Webflow needed and this framework does not

Webflow cannot make a component's own element a link, or style text without a
wrapper, so its components carry scaffolding. **Drop the scaffolding, keep what
carries design.** The test: does this element exist because the design has it,
or because Webflow had no other way?

- **Eyebrow** arrives as four nested divs — `u-eyebrow-wrapper`,
  `u-eyebrow-layout`, then the marker and the text. `Typography/Eyebrow` is the
  whole thing; the outer two are Webflow's and go.
- **Heading** arrives as `<div class="u-heading" data-wf--typography-heading--variant="h2"><h1>…</h1></div>`.
  Read it before deleting it: the inner tag is the semantics and the attribute
  is the style, which is the pair `Heading` separates — `<Heading tag="h1"
variant="h2">`. Take both, drop the div. `u-text` is `Typography/Paragraph`
  the same way.
- **`clickable`** is pure workaround, and on this site the most-used component
  of all at 1445 instances: an empty, absolutely positioned button laid over
  its parent, because a Webflow component cannot be a link itself.

```html
<div class="button_main_wrap" data-wf--button-main--variant="link-reversed">
  <div class="clickable_wrap u-cover-absolute">
    <button type="button" aria-label="Back" class="clickable_btn"></button>
  </div>
  <div class="button_main_element">
    <div aria-hidden="true" class="button_main_text">Back</div>
    <svg class="button_main_arrow">…</svg>
  </div>
</div>
```

`Button` renders the `<button>` or `<a>` itself, so the whole `clickable_wrap`
subtree goes, and the label wrappers with it. **Carry the accessible name as
you delete it**: the name lived on the empty button and the visible text is
`aria-hidden`, so collapsing the structure without moving it leaves a button
with no accessible name. The text becomes the label and the `aria-hidden` comes
off.

**The SVG stays** — that is design. Bring it through `Media/Icon`, or as
`Button`'s `arrow` variant where it matches. Anything else a custom button
holds is design too, and if `Button` has no place for it, that is a prop to
add.

If a Webflow variant has no matching prop, add the prop — it is the framework's
own component and the site needs it. Say so in the report.

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
carousel is Swiper and the nav is custom markup.

**Third-party libraries come across as they are.** Swiper, GSAP, Three.js and
Lenis are the site's behaviour, not Webflow's, and swapping Swiper for
`Interactive/Slider` changes how the site moves. Install them, keep the
initialisation code with the component that needs it, and only replace a
library where its markup was Webflow's own widget.

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

**JavaScript moves; it does not get rewritten.** A custom embed goes into the
component that owns the markup it acts on, unchanged. A site-wide script stays
site-wide, in the layout.

The single exception is Webflow's own IX2, which is compiled into `webflow.js`
against `data-w-id` attributes and cannot be lifted out. Only that gets
rebuilt: hovers, fades and scroll reveals in CSS or with an
`IntersectionObserver`; timelines and scrub-linked animation watched on the
live site, described, and confirmed as worth the effort before anyone starts.
When the last Webflow widget is gone, so is `webflow.js` — and nothing else
about the site's behaviour should have changed.

**Verify against the pass-1 baseline, not against live.** Capture the pages
before starting pass 2 and again after each swap; the sibling skill's
`visual-check.mjs` does both and pixel-diffs the pairs:

```bash
node .claude/skills/lumos-upgrade-version/visual-check.mjs capture before
node .claude/skills/lumos-upgrade-version/visual-check.mjs capture after
node .claude/skills/lumos-upgrade-version/visual-check.mjs compare
```

Here a pixel diff is the right instrument, unlike pass 1 against live: both
sides are the same build on the same machine, so anything that moved, moved
because of the swap. A difference now was caused by the change just made. It is a defect, not drift: the tokens are the
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

**What should be gone:** `u-` prefixes, Webflow's variable names, Webflow's
component markup, `webflow.js`, and any rule a Lumos token or component now
expresses.

Grep for it. A page still containing `u-eyebrow-wrapper`, `u-heading` or
`u-button-wrapper` is a component that was never swapped — the design will look
right, which is why this is worth checking rather than eyeballing.

**What should still be there:** the site's own classes, its own CSS, its own
JavaScript and its own libraries — each now living with the component that uses
it rather than in a global file. A migration that deleted them rewrote the site
instead of moving it.

Every page still matches. Anything Webflow that survived is named in the report
with the reason nothing here replaced it.

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

Skill 3.4.0. Tested against a 59-page Lumos for Webflow export: 13 collections,
147 variables, a 363 KB stylesheet. All five scripts read only; `map-classes --sed` writes a rename script for you to run and review.
