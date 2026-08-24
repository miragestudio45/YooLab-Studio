# YooLab — design system

One warm, light-first system. A calm scientific instrument, not a marketing page:
the specimen is the product, the interface recedes, and the brand lives in
precision rather than in decoration.

Mode per surface: the landing page is **Persuade** at the top (Explore, Bridge)
and **Operate** from YooStudio down — the Library and the editor are judged as
applications, not as sections.

---

## 1. One horizontal system

Every band on the page — header included — shares one shell. This is the single
rule that makes the page read as one product.

```css
--page-gutter: clamp(20px, 3vw, 64px);
--page-max: 1760px;
--shell: min(var(--page-max), calc(100% - var(--page-gutter) * 2));
```

`.shell` / `.shell-wide` / `.shell-editorial` / `.shell-narrow` / `.section-shell`
are **all the same width**. They survive as aliases only so 60 call sites did not
need editing; anything that invents a fourth width is a bug.

- Cinematic 3D canvases are full-bleed. Their **text safe area is the shell.**
- Prose measure is controlled by `max-width` in `ch` on the text block, never by
  narrowing the shell. Alignment is global; measure is local.
- The header uses the shell for its contents and is full-bleed for its glass.

## 2. Viewport-first

```css
--header-h: 64px;                          /* reserved, never overlapping */
--section-gap: clamp(32px, 5vh, 72px);
--fit-h: calc(100svh - var(--header-h) - var(--section-gap) * 2);
```

Every major section reserves the header band in **its own padding-top** and sets
`scroll-margin-top: 0`. Anchor navigation therefore lands the section's top edge
at viewport 0, and its heading appears one gap below the header — from navigation
and from ordinary scrolling alike. No title may begin behind the header.

Sections are not blindly `100svh`. A section whose idea must be understood on
arrival gives its primary block a height derived from `--fit-h` minus its own head
band, and lets secondary rows fall below the fold on purpose — that sliver is what
still invites the scroll.

**Prefer measuring the head band to estimating it.** The Library and Education
declare `--library-head` / `--edu-head` because their bands are one predictable
row. YooStudio does not: its heading wraps to a third line below 1000 px, and every
version of this that subtracted an estimated `--tool-head` from the viewport cut
the bottom of the editor at whichever width the estimate was wrong — 24 px out on a
1366, 53 px out on a 768. It is now a flex column (`.tool-stage`) one screen tall
whose workspace is the `flex: 1` row, so the arithmetic is done by the layout engine
against the real heading. When a band's height is not predictable, make the layout
do the subtraction.

Below 700 px a fitted section stops being fitted and scrolls: a phone cannot hold a
heading, a workspace and a readout at once without 9 px type. Which sections give up
the promise, and where, is recorded in KNOWN_LIMITATIONS.md and asserted by
`measure.mjs`.

## 3. Type — one family

**Plus Jakarta Sans**, 200–800, roman and italic. Nothing else. No serif anywhere;
`--font-display`, `--font-body`, `--font-editorial` and `--font-mono` all resolve
to it, and readouts align through `font-variant-numeric: tabular-nums` instead of
through a fixed advance width.

Hierarchy comes only from weight, size, tracking, italic and opacity:

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Display h1 / h2 | `clamp(34px, min(4.4vw, 6.2vh), 66px)` | 700 | −0.045em |
| Display italic (`em`) | inherits | 500 italic | −0.05em |
| Section h3 | 24–34px | 660 | −0.035em |
| Specimen name | 15.5–24px | 650–700 | −0.03em |
| Latin epithet | 12.5px | 450 italic | 0 |
| Body | 14–16.5px | 400 | 0 |
| Label / kicker | 9.5–11px | 650 | 0.10–0.15em, uppercase |
| Readout | 11–14px | 500 | −0.01em, `tnum` |

Display type is capped by viewport **height** as well as width (`min(4.4vw, 6.2vh)`).
A 1366×768 laptop is wide and short: the width term alone put two lines of heading
into a fifth of the visible page before the section's subject had started.

## 4. Colour

Warm off-white ground, one coral accent, soft lavender / cyan / blush for subject
coding only. Every colour is a token in `globals.css`; nothing downstream
hard-codes a hex. Section backgrounds step by a few units of value so the eye
never meets an edge — ivory → white → warm cream → ivory → blush-cream.

## 5. Surfaces

Three separate bordered, shadowed cards with a 14 px gutter — not one box with
dividers. A divider says "paragraphs of one document"; a gutter says "instruments
side by side". That gap is most of the difference between a section and an
application. Radii 22 / 14 / 10 / 7. Shadows are wide and very low-alpha
(`0 16px 44px rgba(87,62,43,.06)`).

## 6. Composition — the Explore chapters

Each creature chapter is a deliberate 12-column composition inside the shell, with
the copy column opposite the creature and no reserved empty band:

| Chapter | Creature | Copy |
|---|---|---|
| Hero (bee) | right, cols 6–12 | cols 1–6 |
| Bee study | left, cols 1–7 | cols 8–12 |
| Fish | left, cols 1–7 | cols 8–12 |
| Jellyfish (vertical) | right, cols 6–12 | cols 1–5 |

Creature placement is camera work in `ExploreCanvas`'s `shots` table, and it is
tuned so the subject never crosses into the copy column and never leaves the frame
vertically. Annotations live in the creature's half only.

## 7. Narrow viewports

Two rules carry the phone and portrait-tablet regimes, and both are the same idea:
a constant tuned on a laptop is wrong on a portrait screen.

- **Creatures are fitted, not scaled by a factor.** `ExploreCanvas` measures the
  frame the camera actually has in world units and scales the creature to 86% of
  its width or half its height, whichever binds. The flat `× 0.66` this replaced
  left the fish 117% as wide as a 390 px frame.
- **Copy gets a plate, not the section.** In one column the creature is *behind*
  the words. A section-wide wash strong enough to make a 9.5 px kicker readable
  also greys out the specimen; a gradient local to the copy block, transparent at
  its top edge and solid by its second line, does not.

## 8. Motion

One reveal for the whole page: a 20 px rise and a fade on `--ease-reveal`
(`cubic-bezier(.22,.61,.36,1)`), 760 ms, set once and never removed. Nothing
scales, nothing slides in from the side. The cinematic budget is spent entirely on
the creature stage; the product half stays calm. `prefers-reduced-motion` drops
transitions and auto-rotation.

## 9. Verification

`node reference-audit/shots.mjs --viewport w1366` for pictures,
`node reference-audit/measure.mjs` for numbers, `node reference-audit/probe.mjs`
for a one-off question. A section is done when the screenshot shows it, not when
`overflowX === 0`.

`measure.mjs` is the regression guard for this document's first two sections: it
reports the shell alignment as one spread across seven bands, and it must read
**0 px**. Anything else means a fourth width has been invented.
