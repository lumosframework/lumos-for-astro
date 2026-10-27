# Building with Lumos

How to build pages in this project so they stay consistent and cheap to change. Read this before adding a page, a section, or a style.

## Building a page

- Compose the page directly from existing components. Use `Section`, `Grid`,
  `Slider` and the other layout components instead of hiding an ordinary layout
  inside a custom component.
- Most sections can be built without creating new components: a `Section`, a `ContentWrapper` inside it, the `Eyebrow`, `Heading`, `Paragraph` and `ButtonWrapper` inside that. Prefer `ContentWrapper` to a plain `div` for holding content: it ties text and flex alignment to one `--_alignment` variable that `ButtonWrapper` and everything else inside reads, so `centered` on the default `stack` variant moves the whole block together.
- Do not create a `<Fragment>` just to group or extract markup. Use one only
  when a named slot needs multiple siblings and a real element would change the
  layout or semantics.
- Create a custom component only when custom CSS or a script belongs to an
  element or its children — see [Custom components](#custom-components).

## Framework releases

Update the framework version in `package.json`, `package-lock.json`, and the
style-guide badge in `src/pages/index.astro` together. The badge names the
framework release, not the user's project version: `create-lumos` resets the
project's `package.json.version` to `0.0.1`. Do not bind the badge to that field.
The installer's `lumos` metadata can also be absent when GitHub's API is
unavailable. CI runs `.github/scripts/check-starter-version.mjs` to build fresh
sites with and without that metadata and verify their displayed release.

## Custom components

Only create one when custom CSS or a script belongs to an element or its
children. Keep that code in the component file rather than the page. Copy a
component, regardless of how small, into another page and it should work with
nothing else moved. Tokens and utilities in `src/styles` are the global
exception.

- Wrap the smallest subtree that owns the CSS or script. A custom card belongs
  inside an existing `Grid`, not around the grid or section. Own the layout only
  when its CSS or script acts on that layout.
- Never add a custom class to the outside of a component instance, only utility classes. If the component itself needs another version, add a variant.
- Put custom classes on plain semantic HTML inside the smallest custom
  component that owns their CSS. Never target a library component beneath a
  custom class. Use regular html tags when a custom class is needed.
- When custom styles or scripts are needed for a content block, name a content block for its role and variant — `HeroBlog`, `CtaMain`,
  `HeroTeam` — and place it in `src/components/content/`.
- Wrap the whole section only when those styles or scripts act on the section itself such as a pinned full-height scrolltrigger section. Use the same naming pattern, but place it in `src/components/section/`.
- Forward props with `ComponentProps<typeof Section>` from `astro/types` rather than restating names and types. A section component passes up a `Pick` of `render`, `theme`, `paddingTop` and `paddingBottom`, and forwards `...rest` attributes.
- A content component passes up content and accepts utility classes through `class`, but does not pass up styling props, so text sizes hold across instances. If passing a heading's `tag` up, set its `variant` yourself: `variant` defaults to `tag`, so the size would otherwise move with the level.
- Text identical on every page stays written in the component; text that differs per instance is a prop.

## New style checklist

Every box has to be ticked before new styling is accepted.

- [ ] Isn't already available as a `variant`. New CSS is the last resort.
- [ ] Uses utilities only to override one instance of a variant — a change or two that stand on their own. The moment several utilities have to hold together to make a look, that look is a variant, not a stack of classes.
- [ ] Adds no custom class to a library component. Call sites may pass utility
      classes only; a new component-wide look is a variant.
- [ ] Keeps custom selectors off library components, including beneath a custom
      root. Custom CSS belongs to the plain HTML owned by that component.
- [ ] Doesn't repeat the same utility, prop value or attribute on every instance of an element — that means the default is wrong. Fix it at the source rather than in the markup: a token in `src/styles/base.css`, the prop's default in the component, or a new prop defaulting to whichever version is used more often.
- [ ] Ships with the component that owns it, in that component's own `<style is:global>` under `@layer components`. A page carries no CSS.
- [ ] Ends its root class in `_wrap` — `.blog-gallery_wrap`, `.hero-condensed_wrap`, `.cta-impact_wrap` — and prefixes every child with the family name: `.blog-gallery_layout`, `.blog-gallery_title`, `.blog-gallery_text`. A variant is a bare class beside the root (`.tabs_wrap.side`), so the two share a namespace: without `_wrap`, a variant named for a component — `button`, `card` — quietly inherits that component's styles.
- [ ] Skips `_wrap` only when the class belongs in `patterns.css` or `utilities.css`. Every component root otherwise ends in `_wrap`, even when it has no children.
- [ ] Names children for their role, never their mechanism: `_layout` or `_list`, not `_grid` or `_flex`, since the property behind them changes.
- [ ] Carries a pattern class beside the custom one on plain HTML wherever one fits — `text-style-h3`, `theme-invert` — leaving the custom class to hold only what it overrides. Editing a pattern then reaches every component using it.
- [ ] Uses no `px`. Lengths are `rem`, a max width on text is `ch`, and anything that should track the font size — letter spacing, an icon or flourish sitting in text — is `em`.
- [ ] Keeps each media query nested in the rule it changes, and shares one query across the whole component. Split into one per variant only where variants wrap at different widths, as `ContentWrapper` does. Never one per child or per property: that spreads a single value across the file.
- [ ] Uses the breakpoints `Grid` declares, read from there rather than from memory, since a site may change them. Any other breakpoint needs a reason.

## Graphics built from elements

A graphic that has to scale as one piece — an illustration, diagram or mockup
whose parts are still swappable and animatable — is an artboard with
`container-type: inline-size`, an `aspect-ratio`, and every length inside in
`cqw`. It is the one place the rem tokens are deliberately not used. See the
`lumos-scaling-graphic` skill.

## New component checklist

Every box has to be ticked before a component is done.

- [ ] Owns custom CSS or a script. Grouping markup, shortening a page and
      anticipating reuse are not reasons to create a component.
- [ ] Uses the smallest useful boundary. A custom card stays inside the existing
      layout; a whole layout becomes a component only when its CSS or script
      acts on the layout.
- [ ] Earns its existence. A new kind of library card is a `Card` variant or a conditional prop on it, not a second library card component.
- [ ] Has `render`, default `true`, and outputs nothing when it is `false`, when a required prop is missing, or when a required slot is empty. Check required slots with `slotContent` from `@/utils/slots.ts`, not `Astro.slots.has`.
- [ ] Orders props the same way as other components in the type and the destructure: `render`, content that changes per instance, `variant`, props that only apply to some variants, then occasional settings. `class` and `...rest` last; callers use `class` for utilities only.
- [ ] Puts variant-specific props behind a discriminated union on `variant`, `never` on the variants that don't take them, so the wrong prop fails to type-check rather than being ignored. Destructure through a widened `AllProps` alias, as `Card` and `Img` do.
- [ ] Documents each prop with the exact wording other components already use for it. A shared prop only gets its own description where it genuinely behaves differently.
- [ ] Adds no comments beyond those prop tooltips, the banners dividing a stylesheet into sections, and one line labelling each section of a page.
