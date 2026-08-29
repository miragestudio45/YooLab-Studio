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

**Never estimate a head band. Make the layout subtract it.** Education still
declares `--edu-head`, and it is the last section that does. Every other version of
that idea has been retired after the same failure: a token guesses a band's height,
the band gains a line, and the bottom of the section's product goes under the fold
at whichever width the guess was wrong. YooStudio paid for it first — an estimated
`--tool-head` cut the editor by 24 px on a 1366 and 53 px on a 768 — and the Library
paid for it twice, once with `--library-head` when the band grew to carry the
subject switcher, and once again on the phone regime with a hand-measured `168px`
that was 31 px wrong at 768 and 36 px wrong at 390.

Both are now one screen-tall grid whose `auto` rows measure themselves and whose
`minmax(0, 1fr)` row holds the product:

- `.tool-stage` — an `auto` heading row over the workspace and narrative column.
- `.library-stage` — `auto` head band, `auto` subject switcher, then the three
  panels. At every regime from 1920 down to 390 the panels land 15–22 px above the
  fold, and `measure.mjs` asserts it at all seven widths with no `fitAbove`
  exemption.

**And measure width against width.** The counterpart mistake is deriving one axis
from the other. A later version of YooStudio sized the editor's *width* from the
viewport *height*, to hold the 1920 × 1237 source frame's aspect ratio; on a
1920 × 911 browser window that produced a 1122 px editor beside a 622 px narrative
column, and the section's proportions became a function of how tall the visitor's
window happened to be. The narrative column is now a bounded width
(`clamp(250px, 18.6vw, 344px)`) and the workspace takes the remainder — the only
thing in the section that stretches horizontally.

Most fitted sections stop being fitted below 700–1000 px and scroll: a phone cannot
hold a heading, a two-up diagram and a readout at once without 9 px type. Which
sections give up the promise, and where, is recorded in KNOWN_LIMITATIONS.md and
asserted by `measure.mjs`. The Library is the exception and gives up nothing — see
below.

## 2b. The Library is a chapter of the snap track

`.library` carries `data-snap`, which makes it the seventh and last anchor of
`lib/story/snap.ts`. That became possible only when the section stopped having
anything below its fold: it used to end in a four-card "related" strip, and a
magnetic anchor on a section whose content continues past the viewport settles the
visitor onto a boundary they were scrolling *through*. The strip is gone (it
repeated three rows already in the rail 800 px above it), so the section is exactly
one screen and the snap has something honest to settle on.

Below 860 px it still reserves one screen and simply lets its own panels be
shorter — the phone does not get a different promise, it gets a smaller workspace
(566 px at 390, 723 px at 768). It can do that where Education and Practice cannot
because its own narrow regime removes height rather than stacking it: the asset
rail becomes a short horizontal shelf and the knowledge panel leaves the flow
entirely as a bottom sheet.

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

**Two greys, not one.** The frame separates `Light/Grey Offical #EEEEEE`, which
draws every PANEL boundary, from `Light/Grey Sup 2 #D9D9D9`, which draws CONTROL
borders. This sheet had collapsed both into `--ed-line`, so every rail edge, lane
divider and column rule wore the control grey — the single largest reason the
editor read heavier than the design. They are now `--ed-divider` and `--ed-line`,
and using the wrong one is the bug to look for when the editor feels "đậm".

**The weight ladder is Roboto's, three steps only.** The frame uses Regular 400
for every value, field label and secondary line; Medium 500 for section labels,
rail labels, the doc title, the clip title and panel headings; SemiBold 600 for
exactly three things — the active space chip, "Tạo Step" and the active segment.
Nothing in the editor is 700. A variable font makes 520/620/670 available and
this sheet had drifted into all of them; if a rule here reads `font-weight: 6xx`
and it is not one of those three controls, it is drift.

**Filled, not outlined.** Where the frame wants a quiet chip it fills `#F0F1F3`
and draws no keyline at all — the command bar's three pills, the Start/End
readout, "Tùy chỉnh", the leader-direction buttons. An outline plus a fill is one
edge more than the design has.

Geometry is the one place the frame is not copied literally. `--u` and `--t`
diverge below a ~1000 px editor on purpose (see above), so a control's *size* is
adapted while its shape, radius ratio and colour are not. The generator's
`STROKE_SCALE` is the same kind of adaptation for the same reason: a 1.5 stroke
drawn at 24 px is soft, and the same stroke at 15 px falls under one device pixel
and snaps to a hard line, so it is scaled to hold the frame's optical weight
rather than its literal number.

### The workspace glass

`.tool-frame` is a 6–12 px bezel around the editor card: a vertical tint, a 1 px
specular top edge, an inner shade at the bottom and a wide ambient below. The
blur lives **only in the rim** — the pool of light behind the section bends
through a band of cover glass at the card's edge while the editor's own surface
stays crisp. That is what keeps it a material rather than the decorative wash the
craft floor rejects. Its outer radius is the card's radius plus the bezel, and
`.tool-story` uses the same sum so the two surfaces on that row share a corner.

---

## 11. The Library — one mark set, one stage chrome

The Library is judged as an application, and two shared contracts are what stop it
reading as twelve loosely related panels.

### Every mark is drawn, on one grid

`app/components/library/LibraryIcons.tsx` is the section's whole vocabulary: a
20-unit box, a 2-unit margin, `currentColor`, 1.5 stroke, round caps and joins.
Stage controls, motion clips, the readout glyphs beside each measurement, the five
panel-section marks and the seven subject marks all come from it. There is no icon
font, no Unicode glyph standing in for a mark, and no second grid — the four camera
controls used to be drawn on a 16-unit box at 1.3 stroke while everything around
them was on 20 at 1.5, and side by side in one rail that reads as a softness on
exactly those four.

Two rules inside it are worth keeping:

- **Arcs are computed, not eyeballed.** Every `A` command has its endpoints on the
  circle it claims. The auto-rotate mark is two opposed 300° arcs on one r=6.4
  circle, which is why it survives being spun by CSS.
- **A clip is drawn as its action, not as its animal.** Five silhouettes of the
  same dinosaur at 15 px are five identical smudges, so `bite` is a toothed jaw
  opening, `roar` is a mouth with sound leaving it, `tail` is a whip with a
  direction.

`LibraryMark.tsx` is the *other* set and stays separate on purpose: those are
40-unit **diagrams** of a concept for the asset rail, colour-coded by subject
through `currentColor`. A mark says "this is what a plant cell is"; an icon says
"this button rotates the camera". The bacteria mark is the one to look at to see
the rule working — it is the only cell mark with no ring near its centre, and that
absence is how the row says "nhân sơ" at 46 px.

### The stage chrome is one composition, split along one line

`StageChrome.tsx` owns everything a visitor sees over a running canvas, and the
split is: what you do to the **camera** is a column, what the **specimen** does is
a row.

| Anchor | Holds | Why there |
|---|---|---|
| top-left | four camera controls | the corner a subject never occupies |
| bottom-centre | the specimen's clips | their axis is time, so they sit side by side |
| top-right | the three-line guide card | leaves for good on first drag, scroll or pin |
| bottom-left | name + surface caption | — |
| bottom-right | auto-rotate, as a real switch | it is a state, not a press |

The rail carried the clips too for one round. That made it nine cells and 410 px
of a 715 px stage — more chrome than specimen down one edge — and it drew the
T-rex's head behind its own glass. A control group that grows past about a third of
the frame's height is in the wrong axis.

The auto-rotate mark turns, slowly, only while the state is on. It is the only
place in this section where an icon reports state by moving, and
`prefers-reduced-motion` stops it in the stylesheet.

### Fitting a rigged specimen

Three things a games-pipeline asset needs that a static mesh does not, all of them
in `ModelStage`:

- **`lockRoot`** — authored clips travel. All five T-rex clips animate
  `bn_Spine.translation`, so without flattening that one track the animal walks out
  of the panel within two seconds. Resolve the joint through the object graph, not
  by matching the track name: `GLTFLoader` deletes `. : / [ ]` from node names, so
  `bn_Spine.4_4` is addressed as `bn_Spine4_4` and cannot be told from
  `bn_Spine1.5_5` by any string test. Depth in the hierarchy settles it.
- **`spinSafe`** — a fit is exact for one direction and the stage then turns away
  from it. A twelve-metre subject grows by nearly half between three-quarters and
  broadside, so `fill: 0.94` silently becomes `fill: 1.3`. `spinSafeBox` squares
  the footprint to its circumscribed radius **divided by what a square prism
  projects at the authored yaw** — the version without that divisor
  over-corrected by up to 41%, which is its own visible defect.
- **`refreshSkinnedBounds`** — `Box3` reads a `SkinnedMesh`'s cached box, and three
  computes it from `skeleton.boneMatrices`, which only the renderer refreshes. A
  fit solved between `mixer.update(poseTime)` and the first frame is solved against
  the bind pose. Not applied to `CreatureStage`: the bee, fish and jellyfish are
  normalised to authored world sizes with `fill` values hand-tuned against the old
  box, and correcting it under them would re-frame three finished chapters.

### Anatomy pins

An anchor names a **joint**, so the label travels with the animation — the jaw pin
stays on the jaw through a bite. Positions are written to CSS custom properties
every frame rather than to React state, so six pins on a moving skeleton cost no
renders. A pin on the far side of the subject drops to a third opacity instead of
disappearing: a set of six that keeps falling to three reads as a bug, and a solid
label on the animal's flank claims the joint is where it is not. Appearance lives
in `library.css` and only `--on` / `--hit` are forwarded inline, which is what lets
a pin the visitor deliberately opened override the dimming.

### The knowledge panel's content model

Small type throughout — nothing above 12.5 px except the specimen's name — and six
blocks in a fixed order: the authored one-line `poetic` in italic lavender, the
description, the glyph-led measurement table, the anatomy list, the goals, then two
notes and the real-world links. The two notes are **two tints in a fixed order**,
lavender for the mechanism and amber for the curiosity, ordered by the component
rather than by each entry — a column of identically tinted callouts is a column
with no callouts in it, and no specimen gets to put its curiosity above its
physics.
