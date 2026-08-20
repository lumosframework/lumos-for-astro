# Building with Lumos

How to build pages in this project so they stay consistent and cheap to change.
Read this before adding a page, a section, or a style.

## Compose, don't author

<!-- When to reach for an existing component instead of writing markup. -->

## Where things live

<!-- src/components, src/layouts, src/pages, src/styles, src/consts.ts —
     what belongs in each, and what never belongs there. -->

## Styling

<!-- Design tokens and the utility/pattern classes in src/styles.
     When a new class is justified, and where it goes. -->

## Component props

<!-- The prop conventions shared across components: theme, spacing scales,
     class and attrs passthrough. -->

## New component checklist

<!-- Every box has to be ticked before a component is done. -->

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

## Content and SEO

<!-- Page titles, descriptions, canonical URLs, images, and the settings in
     src/consts.ts. -->

## Accessibility

<!-- Requirements that hold for every page, not just the ones that ask. -->

## Anti-patterns

<!-- The specific shortcuts that make a Lumos site hard to scale. -->
