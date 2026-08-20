# Building with Lumos

How to build pages in this project so they stay consistent and cheap to change.
Read this before adding a page, a section, or a style.

## Building a page

- Compose from components. Write raw markup only for what no component covers.
- Wrap a block of `Eyebrow`, `Heading`, `Paragraph` and `ButtonWrapper` in a
  `ContentWrapper`, not a `div`: it carries the layout, spacing and variants
  with it. Center that block with `centered`, which the default `stack`
  variant takes.
- Everything a piece of markup needs to work — script, styles, frontmatter —
  goes in a component with it, however small the piece. Copy that component
  into another page and it should work untouched. The tokens and utility
  classes in `src/styles` are the exception; they are global on purpose.

## Where things live

<!-- src/components, src/layouts, src/pages, src/styles, src/consts.ts —
     what belongs in each, and what never belongs there. -->

## New style checklist

<!-- Every box has to be ticked before new CSS is accepted. -->

- [ ] Can't be had from an existing `variant`. New CSS is the last resort.
- [ ] Uses utilities only to override one instance of a variant — a change or
      two that stand on their own. The moment several have to hold together to
      make a look, that look is a variant, not a stack of classes.
- [ ] Ships with the new component that needs it, in that component's own
      `<style is:global>` under `@layer components`. A page carries no CSS.
- [ ] Roots on a class no other component uses — `.blog-gallery`,
      `.hero-condensed`, `.cta-impact` — and prefixes every child with it:
      `.blog-gallery_layout`, `.blog-gallery_title`, `.blog-gallery_text`.
- [ ] Names children for their role, never their mechanism: `_layout` or
      `_list`, not `_grid` or `_flex`, since the property behind them changes.
- [ ] Carries a pattern class beside the custom one wherever one fits —
      `text-style-h3`, `theme-invert` — leaving the custom class to hold only
      what it overrides. Editing a pattern then reaches every component using
      it.
- [ ] Uses no `px`. Lengths are `rem`, a max width on text is `ch`, and
      anything that should track the font size — letter spacing, an icon or
      flourish sitting in text — is `em`.
- [ ] Nests its media queries, one the whole component shares, inside the rule
      it modifies. Split into one query per variant only where variants wrap at
      different widths, as `ContentWrapper` does. Never one per child or per
      property — that spreads a single value across the file.
- [ ] Uses the breakpoints `Grid` declares, read from there rather than from
      memory, since a site may change them. Any other breakpoint needs a
      reason.

## New component checklist

<!-- Every box has to be ticked before a component is done. -->

- [ ] Earns its existence. A new kind of card is a `Card` variant or a
      conditional prop on it, not a second card component; a new component
      needs a case the existing ones genuinely can't cover.
- [ ] Has `render`, default `true`, and outputs nothing when it is `false`,
      when a prop it needs is missing, or when `slotContent` from
      `@/utils/slots.ts` — not `Astro.slots.has` — finds its slots empty.
- [ ] Orders props the same way in the type and the destructure: `render`,
      content that changes per instance, `variant`, props that only apply to
      some variants, then occasional settings. `class` and `...rest` last.
- [ ] Puts variant-specific props behind a discriminated union on `variant`,
      `never` on the variants that don't take them, so the wrong prop fails to
      type-check rather than being ignored. Destructure through a widened
      `AllProps` alias, as `Card` and `Img` do.
- [ ] Documents each prop with the exact wording other components already use
      for it. A shared prop only gets its own description where it genuinely
      behaves differently.
