---
name: lumos-scaling-graphic
description: Build a graphic that scales as one piece like an image, but is made of real elements so its parts can be swapped, recoloured or animated. Use when a design has an illustration, diagram, device mockup, badge or composed visual that must hold its proportions at any width while staying editable markup rather than a flat asset.
---

# Graphics that scale like an image

An illustration exported as a PNG scales perfectly and can't be touched. The
same illustration built as divs can be recoloured, swapped and animated, but
falls apart when it scales — text reflows, padding stays put, corners stop
matching. This gets both: one artboard that scales as a unit, made of real
elements.

The whole technique is three rules.

```css
.graphic {
  container-type: inline-size;   /* 1cqw now means 1% of this box */
  aspect-ratio: 16 / 9;          /* height follows width, so it scales as one */
  position: relative;
}

.graphic_title { font-size: 5cqw; }
.graphic_card {
  position: absolute;
  inset: 10cqw 4cqw auto;
  padding: 2cqw;
  border-radius: 1.5cqw;
  translate: 4cqw 0;
}
```

1. **The artboard declares `container-type: inline-size` and an `aspect-ratio`.**
   The ratio is the design's frame — measure it off the Figma frame and reduce it.
2. **Every length inside is in `cqw`.** Font size, padding, inset, radius,
   translate offsets, borders, shadow offsets, gaps. Anything left in `px` or
   `rem` stays put while the rest shrinks.
3. **Nothing inside sets `container-type`** unless it means to. See below.

Halve the container and every number halves with it. Verified: at 800px wide a
`5cqw` title computes to 40px, padding to 16px, radius to 12px, a translate to
32px. At 400px: 20px, 8px, 6px, 16px. The picture is identical, just smaller.

## The three ways this breaks

**A container's own `cqw` does not mean itself.** `cqw` on `.graphic` resolves
against `.graphic`'s *nearest ancestor* container — and if there is none, the
viewport. Measured: `border-radius: 5cqw` on the artboard computed to **50px in
a 1000px window**, not the 40px that 5% of its own 800px width would be. It
drifts as the window resizes and has nothing to do with the graphic.

> Put the artboard's own rounding, borders and shadows on an inner wrapper, or
> express them in `%` / `rem`. Only descendants may use `cqw`.

**No container anywhere means the viewport.** `cqw` outside any container
silently falls back to the small viewport rather than failing. Measured: the
same `5cqw` gave 50px in a 1000px window. It looks like it works, and scales to
the browser instead of the graphic — the worst kind of bug. If a part seems to
scale wrongly, check that it is actually inside the artboard.

**A nested `container-type` steals the unit.** Measured: a `10cqw` span inside
the artboard is 80px; add `container-type: inline-size` to the card it sits in
and it becomes 70.4px — 10% of the card's 736px, not the artboard's 800px. Only
add a nested container when a part genuinely needs to scale to its own box.

## Working in it

- **A local unit reads better than percentages.** `--_u: 1cqw` on the artboard,
  then `padding: calc(var(--_u) * 2)`. Custom properties resolve where they are
  used, so this scales correctly — verified. Sizes then read as multiples of a
  design grid rather than as decimals.
- **Take numbers straight from the design.** With the artboard ratio fixed, a
  measurement converts once: `value ÷ frame width × 100 = cqw`. A 24px padding
  on a 1440px frame is `1.667cqw`. No rem conversion — this is the one place in
  Lumos where the rem tokens are deliberately not used, because a token that
  does not scale would break the picture.
- **Images inside** are `width: 100%; height: 100%; object-fit: cover` in a
  `cqw`-sized box, so swapping one changes nothing else.
- **Animate transforms and colours**, not layout. The proportions are the point;
  moving a part with `translate` in `cqw` keeps it in the artboard's terms.

## When not to use it

**Text that has to be read.** Scaling type with the container ignores the
reader's font-size setting, and a narrow container makes it genuinely tiny — a
5cqw heading is 40px at 800 and 17px at 350. That is right for a label inside an
illustration and wrong for a paragraph someone has to read. If the text is
content rather than part of the picture, keep it outside the artboard, or floor
it with `max(0.875rem, 3cqw)` and accept that the layout shifts a little.

**Hairlines.** A `0.1cqw` border is half a pixel on a small container and
disappears. Use `--border-width` and let that one thing not scale.

**Anything that is really an image.** If nothing inside will ever be swapped,
recoloured or animated, export the asset and use `<Img>`. This costs markup and
attention; it should buy something.
