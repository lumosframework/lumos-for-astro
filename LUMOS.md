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

### `render`

Every component takes a `render` prop, defaulting to `true`. Set it to `false`
to drop the component and its children. `BaseHead` is the one exception: a
page's head tags aren't optional.

They also hide themselves when there is nothing to show: an empty slot, or a
missing prop they can't render without, such as `Video` with no `src`. Comments
and whitespace don't count as content.

So pass content straight through — a section fed by empty CMS fields disappears
on its own, and pages need no `{data.heading && <Heading>}` guards.

## Content and SEO

<!-- Page titles, descriptions, canonical URLs, images, and the settings in
     src/consts.ts. -->

## Accessibility

<!-- Requirements that hold for every page, not just the ones that ask. -->

## Anti-patterns

<!-- The specific shortcuts that make a Lumos site hard to scale. -->
