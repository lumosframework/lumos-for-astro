---
name: lumos-audit-props
description: Audit the component library for a consistent API — props declared in the same order across components, and tooltips written the same way. Use when asked to check prop order, doc comment or tooltip consistency, whether the components still read as one library, or before a release.
---

# Auditing the component API

A component library is read far more often than it is written, and almost
always through autocomplete. Two things drift as it grows: the **order props
are declared in**, and the **shape of the sentences describing them**. Neither
breaks a build. Both are felt every time someone types `<`.

This is an occasional sweep, not a rule to enforce on every change.

## Run it

```bash
node .claude/skills/lumos-audit-props/audit-props.mjs
```

Reports and exits non-zero when it finds something; it never rewrites a file.
Every fix is a judgement about wording or intent, and belongs to a person.

## What it checks

**`render`** — the one prop every component shares. It should be first, and its
sentence should be the same everywhere. Right now all 34 components agree on
*"Set to `false` to skip rendering this component and its children."* That is
worth keeping exactly.

**Prop order, by majority.** For every pair of props appearing together in two
or more components, the order should be the same. Where it is not, the majority
is treated as the convention and the rest are listed. One-against-one is
ignored: two components is a coincidence, not a convention.

**Doc style, not doc prose.** `variant` means something different in every
component, so comparing the text is meaningless. What should match is the
shape:

- how a default is marked — `(default)` in the option list, or a
  *"Defaults to `x`."* sentence, but not both across the library
- whether a `variant` lists its options as `- \`value\` — description` bullets
- whether a `number` prop states its range with `@min` / `@max` / `@int`, the
  way `Grid` and `Overlay` do

**Undocumented props** — anything a person would see in autocomplete with no
explanation. `class` is exempt; it explains itself.

**Destructuring order** — `const { … } = Astro.props` should read in the same
order the props were declared. When they disagree, one of the two is the
intended order and the other is drift.

## Reading the findings

Fix the cheap ones directly: a missing tooltip, a `@min` that was never added,
a destructuring order that got shuffled.

**Order conflicts need a decision, not a rewrite.** When the report says
*"tag before variant in 2 components, differs in Eyebrow"*, the question is
which order is right for the library, not how to make the outlier match. If the
minority is correct, change the majority and say so.

**Some findings are structural, not sloppy.** A component whose props span
several type aliases — `Button` declares `Tag`, `Kind` and `Props` — has no
single declaration order to compare, because a discriminated union writes its
branches in the order the variants demand. The script flags those as needing a
hand read rather than asserting they are wrong.

Anything the audit cannot see: whether the *names* are right. `emphasis` versus
`priority`, `preview` versus `open` — consistency of vocabulary is a
conversation, and worth having while the report is open.

## Fixing safely

Prop renames and reorders are API changes. Reordering a declaration is safe;
renaming a prop is not, and every call site has to move with it. After any
change:

```bash
npx astro check && npx astro build
```

If the library has shipped, a renamed prop belongs in the notes that
`/lumos-upgrade-version` migrates against, so sites can follow.
