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
1366, 53 px out on a 768. `.tool-stage` is now one screen-tall grid — an `auto`
heading row over a `minmax(0, 1fr)` row holding the workspace and the narrative
column — so the arithmetic is done by the layout engine against the real heading.
When a band's height is not predictable, make the layout do the subtraction.

**And measure width against width.** The counterpart mistake is deriving one axis
from the other. A later version of this section sized the editor's *width* from the
viewport *height*, to hold the 1920 × 1237 source frame's aspect ratio; on a
1920 × 911 browser window that produced a 1122 px editor beside a 622 px narrative
column, and the section's proportions became a function of how tall the visitor's
window happened to be. The narrative column is now a bounded width
(`clamp(250px, 18.6vw, 344px)`) and the workspace takes the remainder — the only
thing in the section that stretches horizontally.

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

> **Open regression (not this pass).** `measure.mjs` currently reports a 47 px
> spread at 1920, from `header=33` against `story=80` and everything else at 80 —
> the header's left edge alone has drifted off the shell. It reads the same with
> the YooStudio work stashed, so it predates it and is untouched here.

## 10. YooStudio — one stylesheet, one unit

The authoring section lives entirely in `app/styles/studio.css`. It replaced five
stacked blocks in `globals.css` ("Figma v2" through "fidelity v5", ~2,300 lines)
that had been written to patch each other; by the end `v2` was still styling
`.studio-body`, `.studio-tree` and `.studio-topbar`, none of which the component
had rendered for three rounds, and every new fix had to out-specify four older
ones. **A second layer for this section is a bug, not a fix.**

Inside it, the source frame's real pixel sizes survive as arithmetic:

```css
--u: clamp(0.60px, 0.0522cqi, 0.95px);   /* one Figma pixel of geometry */
--t: clamp(0.72px, 0.0522cqi, 0.95px);   /* one Figma pixel of type     */
```

so `calc(15 * var(--u))` reads as "the 15 px control from the frame". The two
differ only in their floor: a 34 px control can become a 22 px control and still
be a control, while 15 px type cannot become 7 px type and still be type.

### Icons and colour come out of the frame, not off a screenshot

`app/components/studio/EditorIcons.tsx` is **generated**. `scripts/build-editor-icons.mjs`
reads `public/asset/ui/yoolab-editor/figma/*.svg` — one export per node, pulled
through the Figma MCP's `get_design_context` — and inlines them. Run the script
after re-exporting; never hand-edit the component.

Two rounds of review landed on this file and the history is worth keeping:

1. The original `/asset/ui/yoolab-editor/*.svg` set did not match the design.
   `settings.svg` was a byte-identical copy of `text.svg`, so "Thiết lập" drew a
   text cursor where the frame has a gear.
2. So the set was **redrawn by hand** on a 24-unit grid in `currentColor`. That
   fixed the wrong glyphs and made state a colour change, and it was rejected on
   sight: "các icon mình thấy bạn đang cố làm theo chứ không lấy từ figma". An
   icon redrawn from a thumbnail is a different icon, and a rail of sixty of them
   reads as an imitation of the product however close each one gets.

The generator makes exactly three normalisations and nothing else: it drops
Figma's `preserveAspectRatio="none"` (which stretches a glyph to its slot instead
of fitting it), namespaces the `id`s Figma reuses across every export, and maps
the flat house colours onto `currentColor` so the active state is still a colour
change. Multi-colour marks — the brand disc, the two-tone folder, the close
control whose cross is a hole in a translucent disc — keep their own fills. Three
canvas tools ship in a ~50-unit box because Figma writes the drop-shadow's bleed
into the SVG's own size; those carry an explicit `crop` back to their real 24.

The same rule holds for colour. `--ed-*` in `studio.css` are the frame's **named
styles** (Color/Green Offical `#195658`, Color/Neon Green `#00AAAB`,
Color/Gradient Brand `#96DEDA → #50C9C3`, Color/Brand Menu `#5D7E81`,
Light/White Blur2 `#F0F1F3`, Light/Grey Sup 2 `#D9D9D9`, Others/red `#AD172B`),
not neighbours picked by eye. Being four units off on each of nine tokens is not
visible one at a time and is completely visible all at once.

Geometry is the one place the frame is not copied literally. `--u` and `--t`
diverge below a ~1000 px editor on purpose (see above), so a control's *size* is
adapted while its shape, radius ratio and colour are not.

### The workspace glass

`.tool-frame` is a 6–12 px bezel around the editor card: a vertical tint, a 1 px
specular top edge, an inner shade at the bottom and a wide ambient below. The
blur lives **only in the rim** — the pool of light behind the section bends
through a band of cover glass at the card's edge while the editor's own surface
stays crisp. That is what keeps it a material rather than the decorative wash the
craft floor rejects. Its outer radius is the card's radius plus the bezel, and
`.tool-story` uses the same sum so the two surfaces on that row share a corner.
