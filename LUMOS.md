# Building with Lumos

How to build pages in this project so they stay consistent and cheap to change. Read this before adding a page, a section, or a style.

## Building a page

- Compose from components. Write raw markup only for what none of them cover.
- Most sections can be built without creating new components: a `Section`, a `ContentWrapper` inside it, the `Eyebrow`, `Heading`, `Paragraph` and `ButtonWrapper` inside that. Prefer `ContentWrapper` to a plain `div` for holding content: it ties text and flex alignment to one `--_alignment` variable that `ButtonWrapper` and everything else inside reads, so `centered` on the default `stack` variant moves the whole block together.
- Anything needing custom CSS, scripts or frontmatter becomes its own component — see [Custom components](#custom-components).

## Custom components

Only reach for one when custom CSS, scripts or frontmatter are needed. Keep those in the component file rather than the page. Copy a component, regardless of how small, into another page and it should work with nothing else moved. Tokens and utilities in `src/styles` are the global exception.

- Build its insides from components too — a `Heading` rather than an `h2` with a class, a `Button` rather than a styled link — as `Card` does.
- Wrap the contents by default, not the section, leaving the section's props free to differ per page. Name it `Content`, then the type, then the variant — `ContentBlogHero`, `ContentCtaMain` — so a search for `Content` finds every one and `ContentCta` narrows to a family.
- Wrap the whole section only when those styles act on the section itself: a pinned full-height scroll, a background image. Named the same way from `Section` — `SectionHeroMain`, `SectionCtaMain`.
- Forward props with `ComponentProps<typeof Section>` from `astro/types` rather than restating names and types. A section component passes up a `Pick` of `theme`, `paddingTop` and `paddingBottom` — or nothing at all when the section itself is styled, since those settings hold for every instance.
- A content component passes up content, not styling, so text sizes hold across instances. If passing a heading's `tag` up, set its `variant` yourself: `variant` defaults to `tag`, so the size would otherwise move with the level.
- Text identical on every page stays written in the component; text that differs per instance is a prop.

## New style checklist

Every box has to be ticked before new styling is accepted.

- [ ] Isn't already available as a `variant`. New CSS is the last resort.
- [ ] Uses utilities only to override one instance of a variant — a change or two that stand on their own. The moment several have to hold together to make a look, that look is a variant, not a stack of classes.
- [ ] Doesn't repeat the same utility, prop value or attribute on every instance of an element — that means the default is wrong. Fix it at the source rather than in the markup: a token in `src/styles/base.css`, the prop's default in the component, or a new prop defaulting to whichever version is used more often.
- [ ] Ships with the new component that needs it, in that component's own `<style is:global>` under `@layer components`. A page carries no CSS.
- [ ] Ends its root class in `_wrap` — `.blog-gallery_wrap`, `.hero-condensed_wrap`, `.cta-impact_wrap` — and prefixes every child with the family name: `.blog-gallery_layout`, `.blog-gallery_title`, `.blog-gallery_text`. A variant is a bare class beside the root (`.tabs_wrap.side`), so the two share a namespace: without `_wrap`, a variant named for a component — `button`, `card` — quietly inherits that component's styles.
- [ ] Skips `_wrap` when the component has no children to prefix. A primitive is its own name: `.heading`, `.text`, `.section`, `.container`, `.layout`. These are the classes `patterns.css` styles, and nothing in that file carries an underscore.
- [ ] Names children for their role, never their mechanism: `_layout` or `_list`, not `_grid` or `_flex`, since the property behind them changes.
- [ ] Carries a pattern class beside the custom one wherever one fits — `text-style-h3`, `theme-invert` — leaving the custom class to hold only what it overrides. Editing a pattern then reaches every component using it.
- [ ] Styles emphasis inside a heading from the parent — `.heading-accent strong`, `.heading-accent em` — rather than classing the `strong` or `em`, which rich text can't carry.
- [ ] Uses no `px`. Lengths are `rem`, a max width on text is `ch`, and anything that should track the font size — letter spacing, an icon or flourish sitting in text — is `em`.
- [ ] Keeps each media query nested in the rule it changes, and shares one query across the whole component. Split into one per variant only where variants wrap at different widths, as `ContentWrapper` does. Never one per child or per property: that spreads a single value across the file.
- [ ] Uses the breakpoints `Grid` declares, read from there rather than from memory, since a site may change them. Any other breakpoint needs a reason.
- [ ] Doesn't lean on a nested component's own media queries — leave a `Grid`'s column props unset, one column at every width, and make it responsive from your own class. Share the breakpoint values, not the queries.

## Graphics built from elements

A graphic that has to scale as one piece — an illustration, diagram or mockup
whose parts are still swappable and animatable — is an artboard with
`container-type: inline-size`, an `aspect-ratio`, and every length inside in
`cqw`. It is the one place the rem tokens are deliberately not used. See the
`lumos-scaling-graphic` skill.

## New component checklist

Every box has to be ticked before a component is done.

- [ ] Earns its existence. A new kind of card is a `Card` variant or a conditional prop on it, not a second card component; a new component needs a case the existing ones genuinely can't cover.
- [ ] Has `render`, default `true`, and outputs nothing when it is `false`, when a prop it needs is missing, or when `slotContent` from `@/utils/slots.ts` — not `Astro.slots.has` — finds its slots empty.
- [ ] Orders props the same way as other components in the type and the destructure: `render`, content that changes per instance, `variant`, props that only apply to some variants, then occasional settings. `class` and `...rest` last.
- [ ] Puts variant-specific props behind a discriminated union on `variant`, `never` on the variants that don't take them, so the wrong prop fails to type-check rather than being ignored. Destructure through a widened `AllProps` alias, as `Card` and `Img` do.
- [ ] Documents each prop with the exact wording other components already use for it. A shared prop only gets its own description where it genuinely behaves differently.
- [ ] Adds no comments beyond those prop tooltips, the banners dividing a stylesheet into sections, and one line labelling each section of a page.
