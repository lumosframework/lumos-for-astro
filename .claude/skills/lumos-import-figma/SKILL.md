---
name: lumos-import-figma
description: Build a page or fill in Lumos for Astro variables from a Figma file, especially a messy one missing global variables. Use when the user shares a Figma link or design and asks to implement it, translate it into Lumos, fill in the design tokens, or when the design's spacing, type and color are inconsistent and need reconciling against src/styles/base.css.
---

# Building Lumos from a Figma file

A design file is a picture of an intention, not a source of truth. The job is
to land the intention in the token system with as few new tokens as possible,
and to be explicit about every guess.

**The rule that outranks the rest: never invent a variable or a class to paper
over an inconsistency in the design. Surface it and ask.** Two paddings that
differ by 6px are usually one padding drawn twice. Ask which it is before
writing anything.

## What Figma cannot say

Three conversions are always needed, because the file physically cannot hold
the values this system uses.

| In Figma | In Lumos | Conversion |
| --- | --- | --- |
| `32px` | `2rem` | ÷ 16 |
| line height `70px` on a `64px` size | `1.094` | line height ÷ font size |
| letter spacing `-2.4px` on an `80px` size | `-0.03em` | letter spacing ÷ font size, or % ÷ 100 |
| `#FFFFFF` at 60% opacity | `color-mix(in lab, var(--light-100) 60%, transparent)` | alpha becomes the mix percentage |

One refinement on the last row. If the faded hex is whatever a theme uses for
`--text`, the answer is `currentcolor`, not that swatch — otherwise the muted
label stays dark when the section flips to the dark theme. The script spots
this and says so.

The opacity one matters most. A designer who wants a muted label has no
`color-mix`, so they restate the base hex at lower opacity. That is not a new
color — it is the existing swatch, mixed. Adding `--grey-400: #999` for it is
the mistake this skill exists to prevent.

## A desktop frame is the maximum, not the value

Tokens here are fluid: `--space-6-min: 32` at a 320px viewport, `--space-6-max: 40`
at 1440px. A measurement taken off a 1440px frame is therefore the token's
**max**. The min has to come from somewhere:

**Check which frames exist before measuring anything** — files differ, and the
two paths produce different work:

- **Both frames.** Measure each. The mobile value is the min, the desktop value
  is the max, and nothing is guessed. Say which frame widths you measured, since
  a 375px frame and a 320px `--viewport-min` are not the same thing — a value
  read at 375 is slightly larger than the token's true min.
- **Desktop only.** `convert.mjs` derives the min from the ratio of whichever
  existing token is closest in size, and marks it as a guess. Every derived min
  goes in the report; they are the values most likely to be wrong.

Never mix the two silently. If half the tokens are measured and half derived,
the report has to say which is which.

## Steps

1. **Read the file.** Use the Figma MCP tools — `get_variable_defs` for whatever
   variables do exist, `get_design_context` for the frame, `get_screenshot` to
   see what it should look like. Start with the variables: they tell you how
   much of the system the designer actually used.

2. **Inventory before converting.** List every distinct spacing value, type
   size with its line height, and color with its opacity. Distinct *values*,
   not distinct layers — the same 24px appearing eleven times is one value.

3. **Convert and match.** Write the inventory to JSON and run the script:

   ```bash
   node .claude/skills/lumos-import-figma/convert.mjs --json design.json
   ```

   The script does the arithmetic because there is a lot of it and it is easy
   to get quietly wrong: forty values, each measured against twenty fluid token
   pairs, plus RGB distance for every colour. It reads the tokens out of
   `base.css` rather than carrying a copy, so it cannot drift from the system.

   ```json
   {
     "space":  [{ "name": "stack gap", "px": 30 }],
     "type":   [{ "name": "Section title", "sizePx": 64, "lineHeightPx": 70 }],
     "letter": [{ "name": "Hero tracking", "px": -2.4, "sizePx": 80 }],
     "radius": [{ "name": "Card corner", "px": 16 }],
     "weight": [{ "name": "Heading", "value": "Medium" }],
     "color":  [{ "name": "Muted label", "hex": "#FFFFFF", "alpha": 0.6 }]
   }
   ```

   Add `"on": "#1F1D1E"` and `"sizePx"` to a colour and the script also reports
   its WCAG contrast, using the large-text bar of 3:1 at 24px and above. These
   are flagged, never blocking — a decorative label may fail deliberately — but
   an unreadable body colour is usually the design being messy rather than a
   decision, so raise it with the other questions.

   `letter` takes either `px` with its `sizePx`, or `pct`. Add `"token": "name"`
   to any entry to choose what a new variable would be called. Unknown keys are
   rejected rather than silently ignored, so a typo does not read as "nothing
   to convert".

   It reads the real tokens out of `src/styles/base.css`, converts the units,
   snaps anything within 2px to the token it is drifting from, derives fluid
   mins, and prints an `ASK BEFORE WRITING` list. Values off by more than 2px
   are decisions, not drift, and belong in that list.

   For one-off lookups: `--px 30`, `--lh 50/42`, `--color "#FFFFFF@60"`.

4. **Ask the questions.** Put the whole `ASK BEFORE WRITING` list to the user
   at once, each with the option to consolidate:

   > The design uses 30px, 32px and 34px gaps in three places. `--space-5` is
   > 32px. Consolidate all three, or is one of them deliberate?

   Wait for answers. Do not write tokens for anything still in question.

5. **Place the tokens yourself.** The script prints what to add under
   `TO PLACE BY HAND`; it does not touch `base.css`. Where a token goes says
   what it means, and `:root` is ordered by kind — put each one with its own:

   | Kind | Goes beside |
   | --- | --- |
   | spacing | `--space-8`, before the section-space group |
   | section spacing | `--section-space-large` |
   | type size | the `h1`–`h6` / `text-*` block, in size order |
   | line height | the four `--line-height-*` values |
   | letter spacing | beside `--letter-spacing-tight` / `-normal` |
   | radius | the `--radius-*` group |
   | font weight | the `--primary-*` weights |
   | swatch | the swatch list at the top of `:root` |
   | themed color | **every** theme block — `:root`, `.theme-dark`, `.theme-brand` — or it breaks on one theme |

   A fluid token is three lines (`-min`, `-max`, and the `clamp()`), and the
   `clamp()` the script prints already matches the formula the others use.
   Keep the scale in order: a `--space-9` of 120px belongs after `--space-8`,
   not wherever it was measured.

6. **Fill the gaps the design forgot.** A messy file will be missing states
   nobody drew: hover and focus colors, the dark-theme counterpart of a button,
   disabled text. Derive them from what the file does show, following the
   existing pattern in `base.css` — each theme block defines the same set of
   `--button-*` variables, so a missing dark-theme hover has an obvious shape
   to fill. **Every one of these is a guess and goes in the report.**

7. **Build with what exists, then build what doesn't.** Compose from the
   library first — `Wrapper/Section` and `Wrapper/ContentWrapper` for layout,
   `Wrapper/Grid` for columns, `Item/Card` for repeated blocks,
   `Typography/*` for text. A design that "needs" a new class usually needs an
   existing variant, and a one-off class is how a system stops being one.

   When something genuinely does not compose — a testimonial slider, a stats
   row — build it, following the new component checklist in `LUMOS.md`. List
   every component you added in the report, with a sentence on why nothing
   existing covered it. That list is the one most worth arguing with: it is
   where the system grows, and growth is harder to undo than a token.

8. **Look at it.** Tokens matching the table does not mean the page matches the
   design. Start the dev server, open the page, and compare it against the
   screenshot from step 1:

   ```bash
   astro dev --background
   ```

   Screenshot the built page at the same width as the frame you measured, and
   check the two side by side. Then check the width you did *not* measure —
   a design given only at 1440px still has to survive 375px, and that is where
   derived mins show up as wrong. Report what does not match rather than
   quietly adjusting tokens until it does: a mismatch is often the design
   being inconsistent, which is a question, not a bug.

## The report

Close with four lists. Anything empty, say so.

- **New variables** — name, value, and what in the design asked for it.
- **New components** — what was built, and why nothing existing covered it.
- **Guesses** — derived fluid mins, invented states (dark-theme button hover,
  focus rings), anything the file did not actually specify.
- **Snapped** — values moved to an existing token, with the delta. These were
  applied without asking; the user may still want to reverse one.
- **Contrast** — any pair below its WCAG floor, with the ratio. Flagged, not
  fixed.
- **Still open** — inconsistencies the user has not ruled on yet.

## Versions

This skill versions separately from the framework. A fix here does not need a
Lumos release, and a Lumos release does not invalidate the skill.

- **Skill version** — `SKILL_VERSION` in `convert.mjs`. Bump it when the
  conversion rules or the workflow change.
- **Lumos version** — `package.json` is the source of truth. Nothing here
  duplicates it; the script reads it and prints both on every run:

  ```
  lumos-import-figma 1.0.0  ·  Lumos <whatever package.json says>
  ```

  If the running project is a different version than `TESTED_AGAINST`, the
  script says so. That is a prompt to check `base.css` still looks the way this
  skill assumes — token names, the `clamp()` shape, the theme blocks — not a
  reason to stop.

## Using this without Claude Code

Nothing here is Claude-specific except the loading. The workflow is this file
and the script is plain Node, so another assistant can be pointed at
`.claude/skills/lumos-import-figma/SKILL.md` and follow it, and anyone can run
`node .claude/skills/lumos-import-figma/convert.mjs` by hand. Only the automatic
triggering and `/lumos-import-figma` are Claude Code features.
