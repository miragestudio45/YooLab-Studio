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

## 2c. Nothing on this page may take the page's scroll

`lib/three/wheelZoom.ts` owns one rule, and every 3D surface goes through it:
**a plain wheel scrolls the document, always; zoom needs `ctrl`/`⌘`; and only a
surface with no document scroll left to take may claim the plain wheel.**

It exists because the opposite shipped. Each stage carried its own copy of

```ts
if (Math.abs(event.deltaY) < 2) return;
event.preventDefault();
```

written as "only a clear zoom gesture, so the page still scrolls past the
viewer", and it does not do that: a wheel notch is 100 px of delta and a
trackpad's gentlest glide clears 2 in its first frame, so the branch never
returned. The page simply could not be scrolled while the pointer was over a 3D
panel — which, on a page whose sections are mostly 3D panels, is most of the
page. Review reported it as "scroll vướng vào phần zoom", and on a site whose
scroll position *is* the animation clock it is the same class of defect the
chapter snap exists to prevent: a region that eats the gesture.

Three things make the replacement more than a compromise:

- **`ctrl` + wheel is also a trackpad pinch.** Chrome, Safari and Edge all
  deliver a two-finger pinch as `wheel` with `ctrlKey: true`, so pinch-to-zoom
  over a specimen now works on every stage without a line of code that mentions
  pinching.
- **The exception is read, not passed.** Whether the document can scroll is
  computed per event from `body`/`html` overflow and the document's own scroll
  height, not handed down as a prop. The Library's stages mount in-page under
  `LibraryWorkspace`, full-screen behind `FormulaGate`, and again on the
  `/thu-vien/…` routes where the page can be too short to scroll at all — so a
  flag would have to be threaded correctly through all of them and a future
  fourth parent would inherit whatever it forgot to pass.
- **The affordance is replaced, not dropped.** `ModelStage`, `CreatureStage` and
  `MoleculeViewer` already carry `Gần` / `Xa` buttons in their rails, and every
  hint that read "Cuộn để phóng" now names the modifier through
  `lib/useZoomModifier.ts` — which resolves `Ctrl` versus `⌘` with
  `useSyncExternalStore`, so a server render and a Mac agree without a hydration
  mismatch. The bridge and `CellStudio` have no button and are left with the hint
  alone; the bridge because its own toolbar replaces the stage rail.

Verified in a real browser: over the bridge viewer, the Library viewer and the
YooStudio editor canvas a plain wheel is left to the page and `ctrl` is claimed;
with the body locked, both are claimed. That last check was run against the drone
lab's overlay, which no longer exists — see §12b: the practice experiences are
embedded builds now, and an iframe's wheel belongs to the iframe.

## 2d. The snap track is measured, not declared

`data-snap` used to mean "settle here". It now means "settle here **while this
section fits**", and the difference is a `measure()` in `lib/story/snap.ts` that
reads each marked section's box on every re-measure and skips the ones that
overflow.

That turns §2b from a convention into a mechanism. The rule §2b states — a
magnetic anchor on a section whose content continues past the viewport settles
the visitor onto a boundary they were scrolling *through* — was previously
enforced by only marking sections that were one screen tall by construction. The
four sections that became height-responsive (Practice, Education, the lesson
belt, Pricing) compose in one screen at desktop sizes and deliberately stack at
1024 × 768 and on a phone, so they could not be marked either way. Now they are
marked once and qualify per viewport, with nothing to keep in sync.

**What counts as fitting is content, not the box.** Measured at 1512 × 982:
Practice is 1,017 px tall and 956 of content, Education 1,003 and 979, Pricing
1,042 and 967. All three overflow by their own bottom padding and nothing else,
and padding below the fold is not content a visitor is being cut off from — it
is the gap before the next section. A strict box test would have excluded exactly
the case this change exists to serve.

**The run has to stay contiguous**, which is why the lesson belt is on the track
even though it was not asked for. `targetFor` brackets a position between the two
nearest anchors, so a non-anchor sitting between two anchors is a section the
visitor cannot rest in — they get pulled to whichever side the direction bias
picks. Practice, Education, belt and Pricing are adjacent in the document: either
all four are anchors or the middle two are unrestable.

## 2e. Kinetic type — a second layer, by element

`KineticType` splits the page's eight display headings into lines, masks each
line, and rises them out of their masks with a blur-to-clear and a per-line
stagger on a ScrollTrigger that plays forward on the way down and **reverses on
the way up**.

It is additive to §8's reveal rather than a replacement, and the division is by
element: the CSS reveal owns the *block* — kicker, heading and lede rise and fade
together, once, never reversing — and this owns the *lines inside the heading*.
They share a trigger point and a direction so the compound reads as one gesture,
and the line opacity resolves in the first third of its tween so the two fades
are never visibly fighting. Two systems on the same property on the same node is
how a page gets muddy; two systems on nested nodes in phase is a composition.

Four things about it are load-bearing:

- **It does not write scroll.** §2c's one-owner rule still holds. ScrollTrigger
  only reads scroll unless given `scrub` + its own `snap`, `normalizeScroll` or a
  `scrollerProxy` — none of which is used. Every trigger is a plain
  `toggleActions: 'play none none reverse'`.
- **Nothing in CSS hides a heading.** The armed state is written by the tween's
  own `fromTo` after the split succeeds, so a failure to load GSAP leaves every
  heading visible. A `[data-kinetic] { opacity: 0 }` rule would have made a
  network hiccup blank the page's typography — the exact failure the `reveal-ready`
  bootstrap is built to avoid.
- **Lines, not words.** `mask` wraps every split unit in its own
  `overflow: hidden` element and blurring one promotes it to its own raster
  layer. A four-line heading is four layers; the same heading by words is
  twenty-six, over a canvas that is already the frame's critical path.
- **Three opt-outs, all silent.** `prefers-reduced-motion`, `data-gpu="lean"`
  (an animated `filter: blur()` on text is the same class of per-frame cost as
  the backdrop blurs that flag already drops), and below 720 px, where a heading
  is three lines at 31 px and the stagger has nothing to stagger. GSAP is behind
  `await import`, so none of those cases downloads it.

The splits happen after `document.fonts.ready` and are rebuilt by `autoSplit` on
a resize that changes the line breaks, with the timeline built *inside* `onSplit`
and returned from it. Both are the standard ways this effect ships broken:
splitting on the fallback face records the fallback's line breaks and holds them,
and a timeline built outside `onSplit` keeps animating the previous split's
orphaned line divs.

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

**The brand is one colour: `#00AAAB`.** Not a ramp and not a gradient — every
accent surface on this site is that value, flat. Buttons, chips, bars, dots,
marks, kickers, links, focus rings, the display italic: all `#00AAAB`.

Three values support it, and none of them is a second brand colour:

| Token | Value | Job |
|---|---|---|
| `--color-accent` | `#00AAAB` | **the colour** — and its four aliases all resolve here |
| `--color-accent-on` | `#042E2D` | text **on** a `#00AAAB` fill (5.1:1) |
| `--color-accent-soft` | `#8CD9D9` | a tint of it, for washes and spinner tracks |
| `--color-accent-hover` | `#018E8F` | hover only, so a brand control still answers the pointer |

### The cost, stated once

`#00AAAB` reads **2.7:1** on the ivory ground. That is below the 4.5:1 body text
needs and below the 3:1 large text and focus rings need. This is an instructed
brand decision — the accent is to be seen as the brand before it is to be read —
and it is **not drift**. Do not "fix" it by nudging accent labels darker one rule
at a time; that is how a single colour turns back into a ramp.

There is exactly one lever. `--color-accent-readable` is what every accent
**label** resolves through, and it currently points at `#00AAAB`. Pointing it at
`#017E7F` instead makes every accent label on the site legible at 4.5:1 in one
edit, without touching a single fill. That is the whole remedy, and it is one line.

### What did not change

The ground is untouched: `#fbf8f4` ivory → `#fffdf9` white → `#f7f2ea` cream,
with warm-brown borders (`rgba(117,91,70,·)`) and shadows (`rgba(87,62,43,·)`).
A build that rotated the ground onto the brand hue was tried and rejected — it
read colder and thinner and bought nothing. **A warm ivory under a cool teal is
the design.** Lavender / cyan / blush / sage / cream remain for subject coding
only, at their original values.

Gradients that mixed the accent with lavender — the display italics in the hero,
the bridge and the Library head, and the bridge CTA pill — are now solid. One
colour means one colour, and the italic's emphasis was always carried by the
italic, the weight drop and the size rather than by the ramp inside it.

Every colour is a token in `globals.css`; nothing downstream hard-codes a hex.

### The one room that is not the ground, and how much of it it may be

The bridge viewer is the exception, and it is an exception about **value**, not
about hue. The bee's optical shell is colourless: in the Library's near-white
cove it loses its silhouette, so that stage runs its own room — a warm ivory sky
and key over a cooler horizon and ground — purely so a transparent specimen has a
shadow side. The relationship that does the work is the 15-point luminance step
from horizon to ground. Nothing about it needs chroma.

Two passes proved that the hard way. The first room was mauve and pink and came
back as "cứ hồng hồng": the biggest rectangle on the site rendering in a colour
the brand does not contain, reflected in the glass so the specimen looked pink
too. Moving it onto the brand teal was right and the amount was not — the rim
landed at `#9fdfdd` and the point fill at `#a6dcd8`, chroma 64 and 54 against a
ground of chroma 16, and it came back again as "xanh nhiều quá, rực quá". The
`LearningGrid`'s salmon-over-lavender lines are what turned that into glare
rather than colour: on a saturated mint plate they are a near-complementary pair
at matching chroma.

So the rule is now written down. **A room may hold its value structure and about
a third of its chroma, and its floor has to be in its own family.** Every cool
value in `bridgeEnvironmentPalette` keeps its luminance and lost two thirds of
its chroma; the plate's vignette was re-cut as a ten-point *value* falloff,
because a hue-shift vignette reads flat once desaturated; and the bridge passes
`LearningGrid` its own low-chroma cool-neutral pair, since the authored salmon is
tuned for the Library's warm cove and belongs there. `.bridge-viewport`'s CSS
placeholder carries the same three hex values as the backdrop palette, so the
panel does not change colour when WebGL composites its first frame.

The Library's own room is untouched.

## 5. Surfaces

Three separate bordered, shadowed cards with a 14 px gutter — not one box with
dividers. A divider says "paragraphs of one document"; a gutter says "instruments
side by side". That gap is most of the difference between a section and an
application. Radii 22 / 14 / 10 / 7. Shadows are wide and very low-alpha
(`0 16px 44px rgba(87,62,43,.06)`) — warm brown, like the borders, and unchanged
by the accent swap.

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

### A label that names a body part is on that body part

The fish and the jellyfish keep grid-placed annotations: those two fill their
half of the frame, so a label beside them with a leader reaching in is a margin
note, and a margin note makes no claim about a position.

The bee's three could not do that honestly. It sits right of centre in the hero
and left of centre in the study chapter, and its labels were grid children on
rows 1 / 2 / 3 — placed against the *layout*. That was itself a fix, for an
earlier build that positioned them in viewport percentages and printed all three
through the headline; the grid stopped the collisions and left the labels
pointing at empty air. Review named it exactly: "hiện tại nó k bám theo con ong".

They are pins now. `BEE_PINS` in `ExploreCanvas` names one joint each —
`l_wingroot_jnt`, `thorax_jnt`, `abdomen_jnt02`, all of which the shipped rig
carries — and the frame loop projects them beside the projection that already
feeds the flower field, writing `--pin-N-x/y/on` as custom properties. Three
pins at 60 fps therefore cost no React renders, which is the same trade
`ModelStage.syncPins` makes for the Library's anatomy pins (§11).

Two decisions inside that are worth keeping:

- **Reach clear ground; do not build a surface.** Three versions got here. The
  halo the grid annotations use failed, for a reason the grid version never
  faced: these labels sit *on* a dark red transmissive body and there is no
  clear ground within a short leader's reach, so 9.5 px uppercase over
  refracting glass is unreadable at any text-shadow strength. Putting the labels
  on glass plates fixed that and turned three anatomy callouts into three chips
  floating over a specimen. The client pointed at a reference that solves it the
  older and better way: **make the leader long enough to carry the label out of
  the subject.** A 6 px filled dot marks the anatomy, a hairline runs 38-88 px to
  a hollow 9 px ring on the clear ivory, and the label sits beside the ring where
  a halo is all the separation type needs. Nothing is boxed, and the line becomes
  part of the drawing instead of an apology for one — which is how a plate in an
  anatomy atlas has always been labelled.
- **Direction is a collision rule.** The copy column owns the right half, so no
  label grows rightwards: the wing root goes up, the thorax goes left, the
  abdomen goes down. `PIN_SAFE` hides any pin whose dot has drifted where its
  plate would leave the frame or reach the type — an annotation absent for part
  of a chapter costs nothing, and one printing through a heading costs the
  composition.

Both label systems are off below 860 px. The bee is scaled to 22% and lifted
into the top half there, so a callout would be larger than the part it names —
and `.study-readout` beside it already publishes all four parts as a real `<dl>`,
which is also why the pin layer is `aria-hidden`.

### The hero's scroll cue is an object

It was bare 9.5 px uppercase at 46% ink over a 1 px hairline, which is fine over
a flat ground and illegible over the one it has: `FlowerValley` paints a
photographic meadow across the bottom of the hero, so the label sat on white
daisies, magenta cosmos and dark foliage at once. No text colour reads over all
three and a halo needs a quiet background to lift off — it was not a contrast
value to nudge, it was type with nothing behind it.

It is a pill in the site's own chip material, with the chevron in a teal disc on
its trailing edge: a pill with a label alone is a badge, and one round accented
target makes it a control, which is what the element is. Two departures from the
other chips, both because of what is behind this one — the fill is 0.82 rather
than 0.42, and the shadow carries a real offset so it sits above the flowers
rather than in them. The valley itself is untouched.

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
(`cubic-bezier(.22,.61,.36,1)`), **520 ms** with a 44 ms stagger step, set once
and never removed. Nothing scales, nothing slides in from the side. The cinematic
budget is spent entirely on the creature stage; the product half stays calm.
`prefers-reduced-motion` drops transitions and auto-rotation.

### The reveal and the settle are one number

Those two durations are not free choices, because the chapter settle in
`lib/story/snap.ts` lands a section's top edge at viewport 0 in 300–620 ms. The
reveal used to be 760 ms with a 70 ms stagger, which put a six-item row's last
card 1,180 ms after it was observed — the page had stopped, the visitor was
already reading, and the content was still arriving underneath them. Review
called it "chưa mượt", and it was not a dropped frame: it was a transition still
running after the gesture that caused it had visibly finished. **A reveal must
not outlast the scroll that triggered it.**

It also costs less. `translate3d` promotes each section to its own layer, and
while it moves the browser composites it under the fixed blurred header — the one
per-frame CSS cost on this page, the same one `data-gpu="lean"` exists to remove.
Halving the time in that state halves how often it is paid.

### The settle is an ease-out, not an ease-in-out

`snap.ts` eased cubic in-out over 420–800 ms. Wrong curve for the job: the
settle begins *after* the page has already been still for `IDLE_MS`, so its first
frames are the answer to "did anything notice I stopped?" — and an in-out curve
spends them accelerating from rest, which reads as a pause and then a lunge. It
is now a cubic ease-out over 300–620 ms: motion on the first frame, deceleration
into the anchor, and the page appears to have been going there all along.

Two guards came with it, both from real input rather than from taste. A trackpad
momentum tail delivers 10–20 px of delta that scrolls nothing, so cancelling a
glide on any wheel over 8 px stranded the page between anchors; overriding now
takes 26 px in the direction of travel but only 6 px against it, because nobody
reverses direction by accident. And the 100 ms liveness interval — which exists
because rAF ticks about once a second under a software rasteriser — now defers
whenever rAF has run in the last 70 ms, instead of stepping the scroll a second
time between frames.

## 9. Verification

`node reference-audit/shots.mjs --viewport w1366` for pictures,
`node reference-audit/measure.mjs` for numbers, `node reference-audit/probe.mjs`
for a one-off question. A section is done when the screenshot shows it, not when
`overflowX === 0`.

**`probe.mjs --motion`** forces `prefers-reduced-motion: no-preference`, and it
exists because its absence produced a false pass. The harness inherits the host
OS's animation setting through Chrome, so on a machine with Windows' "Show
animations" off every motion path on this site correctly switches itself off —
`KineticType` does not even import GSAP — and the probe then reports the opt-out
working while asserting nothing whatsoever about the effect. That is
indistinguishable from the effect being broken. `--reduced` could only ever test
the quiet half.

**Read position alongside state.** The second lesson from the same round: a
scroll-triggered animation measured by computed style alone will lie to you. The
kinetic layer appeared to leave a heading hidden on screen; it had not — the
chapter snap had settled to the previous anchor and the heading was 122% down
the viewport, where hidden is correct. Any probe of a scroll effect has to record
`getBoundingClientRect` in the same breath as the property it is checking.

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

---

## 11b. Sample lessons — a belt, not a row

The section's claim is that there is a *library* of lessons, and four cards
cannot make it: four is a number you finish counting. It is sixteen cards on a
strip that moves continuously, and the fifteen the visitor has not read yet are
the argument.

Four rules hold it, and each of them is the answer to a way a marquee usually
goes wrong.

- **Nothing in it is authored.** `BELT` in `ProofSection.tsx` is a list of
  manifest ids; every title, subtitle, subject label, subject tint and picture is
  read from `lib/library/manifest.ts` at render time, and both numbers in the
  lede are counted (`CARDS.length` and `READY_EXPERIENCES.length`). A card cannot
  drift from the thing it opens, and a mistyped id warns rather than silently
  shortening the belt — which is exactly what `formula-workshop` for `formula`
  did before the warning existed.
- **Nine of the sixteen are pre-baked renders of real meshes.** The belt first
  shipped as sixteen drawn `LibraryMark` diagrams — cheap, and line drawings of
  objects this repository owns the actual meshes for, which review called ugly
  and was right to. A live bake was not the answer either: sixteen cards would
  be sixteen GLB fetches, and the organ set alone is 6.4 MB — the brain is 2.7
  for a card 240 px wide. So `scripts/bake-library-covers.mjs` renders them
  **once**, at build time, through this project's own thumbnail pipeline driven
  by `reference-audit/probe.mjs` in a real Chrome, and the belt ships WebP: 3-22
  kB a card, ~155 kB for eighteen covers, no geometry fetched.

  The remaining six are entries with **nothing to render** — the periodic table
  is a DOM grid, the physics labs are simulations, the molecules are generated
  from bond tables — and a drawn mark is the honest picture of those. Dropping
  them would make the belt claim the library is only biology. `cover` in
  `types.ts` is therefore optional, and its absence is information.

  Two notes on the bake. The organ covers derive their slug from the entry's own
  id, so twelve of them are one line in `organEntry` rather than twelve fields
  that can drift. And a cover is a subject on **transparency** — the plate in the
  page carries the ground — which is why `.proof-belt-plate--cover` runs a 9%
  subject tint under it: half the organ meshes are near-white, and on the blush
  plate the photographs use they came out as ghosts.
- **The order is the composition.** Interleaved by subject, so every card
  entering the frame is a different colour from the one leaving it. Grouped, the
  belt would read as four blocks of one colour sliding past.
- **It has three regimes, because a strip that cannot be stopped cannot be
  read.** With a pointer and motion allowed it runs and pauses on hover or
  focus-within. With no hover — touch has no pointer to park — the animation is
  off and the belt is a native horizontal scroller with snap points and the clone
  removed. Reduced motion gets the same scroller. The looping regime fades both
  edges because cards enter through one and leave through the other; the scroller
  fades only the right, because it has a real first card at scroll 0 and fading
  that is indistinguishable from a fault.

Two mechanics worth keeping: the track is the same run **twice** and translates
to exactly `-50%` of its own width, so the reset is invisible at any card count
without a number knowing the count; and it is `translate3d`, because this is the
only thing on the page animating continuously outside a canvas and it must cost
the main thread nothing.

It is also the section that stopped overrunning the fold on a phone — see
KNOWN_LIMITATIONS.md, which it left rather than joined.

## 12. Education — one player, three lessons

The section's product is the **lesson player**, and the role tabs change its
content rather than its shape.

Before this pass each role got a different mock: a "compose" frame with four
empty rounded squares for a tool rail, an "explore" stage, and a two-by-two
"deploy" grid. Three shapes with three intrinsic heights meant switching role
resized the section, and none of the three had room to be more than a diagram of
itself — the compose frame's timeline was four saturated bars in `#A852FC`,
`#2B7FFF`, `#00C950` and `#F6339A`, four colours that exist nowhere else on this
site.

One frame now holds five regions, and the split is the product's own:

| Region | Holds | Why there |
|---|---|---|
| left, floating | five tools, one live | the grid runs *under* it, so it reads as a palette on a canvas rather than a second panel |
| centre | the specimen, a masked ground grid, a contact shadow, three pins | — |
| top-right | reset / fit / menu | the corner a subject never occupies |
| bottom bar | play, step readout, a five-node track, auto-rotate, prev/next | its axis is time, so it sits along the bottom |
| right column | object outline, quick note, media shelf, add-note | it belongs to the specimen, not to the canvas, so it runs full height |

Three rules hold it together:

- **Every string is the Library's own.** The specimen name, its subtitle, its
  four part names and the quick note are the same strings
  `lib/library/subjects/biology.ts` publishes for that asset. Nothing here is
  anatomy invented to fill a label, and swapping a role swaps a lesson that
  actually exists.
- **Every mark is one family.** The rail, the stage controls, the transport and
  the capability row all draw from `studio/EditorIcons` — the generated Figma
  set. The first pass mixed `IconText`, which is a *filled* hexagon badge, into a
  column of four line marks, and used `IconComponents` — a square, a triangle, a
  cross and a circle — for "Tách lớp"; a 4× capture of a 48 px rail is what
  showed both. The three role marks in the segmented control are the one
  exception and are authored to the generated set's own language (24-unit box,
  1.26 stroke, round caps) because that set has no mortarboard and no
  institution.
- **A stale reflection, never a stale creature.** The bee's two refraction
  captures run at 30 Hz; see §13.
- **If the specimen does something on its own, the panel names it.** The teacher
  lesson's drone carries four painted liveries and its reel cycles through them
  every ~4.6 s (see THIRD_PARTY_ASSETS.md for why that is the asset rather than
  a runtime trick). An object that changes colour with nothing in the interface
  accounting for it reads as a glitch, so the object outline's fourth row is
  "Vỏ thân · 4 lớp" and the manifest's own `subtitle` says the same. The row is
  the whole fix and it is the cheapest kind: the panel is a picture of software
  and may not grow a live control — see the note in `EducationSection` on why
  the transport's play button was removed — so the answer is a label, not a
  switcher.

### The height contract, and the width it gives up

`.education-stage` is the third section built on the pattern §2 argues for: a
screen-tall grid, `auto` rows that measure themselves, `minmax(0, 1fr)` for the
product. `--edu-head` and its hard-coded 66 px tab strip are gone, and with them
the last token on this site that guessed how tall a heading would be.

It is `height: var(--fit-h)`, not `min-height`. With a minimum only, the grid is
`auto`-height, a `minmax(0, 1fr)` row resolves to its content's max-content
height and the panel grows past the viewport — 726 px inside a 665 px budget at
1024×768, which `measure.mjs` caught and no screenshot would have.

The section's fitted floor moved from **1000 px to 1180 px**, because the player
needs 64% of the shell before its own panels stop being narrower than the product
they are a picture of. That leaves the brief a 340 px column at 1024, where five
rows whose bodies each wrap twice are 420 px of content in a 283 px budget. The
number is recorded in KNOWN_LIMITATIONS.md and asserted by `measure.mjs`.

---

## 11c. One platform, three roles — said once

The Education section's heading and the role dialog's heading are now the same
sentence: **"Một nền tảng, ba vai trò."**

Two faults produced it. `TrialInvite` asked a visitor which role they were under
"Một nền tảng. Ba cách sử dụng." while the section that answers that question
was headed "Một nền tảng cho cả trường." — the same claim, introduced with
different words, two screens apart. And the section's own wording read badly in
Vietnamese: "cho cả trường" puts a school on the receiving end of a platform,
which is not how the language hands something over. Review said so bluntly and
was right.

The count is allowed to be bare here because the **lede** carries the warmth —
that was the other half of the note, that the heading alone read curt.
`.education-head-lede` names the three verbs the three tabs are about to
demonstrate ("Giáo viên soạn bài, học sinh khám phá, nhà trường triển khai"),
which is the shape every other heading block on this page already uses. A tight
heading over a sentence that explains it; not a heading trying to be both.

## 11d. The consultation dialog is a question over a form

It was an eyebrow, a heading, a lede and five identical field boxes on one flat
cream rectangle, and review called the concept ugly. The fault was structural
rather than decorative: eight similar blocks stacked on one surface, with nothing
telling the eye where the asking stopped and the answering began.

Three changes, in the order they matter:

- **A header band.** The top third gets its own washed surface — the pricing
  section's teal-and-cream duotone at a smaller radius — bled to the panel's
  corners with a negative margin rather than inset, because a washed card inside
  a card is the nested-container smell. This is the top of *this* card and it
  should meet its own corners.
- **"Bạn liên hệ với tư cách" moved first.** It was a pill row wedged between
  the name and the email, breaking the column's rhythm exactly once and for no
  reason — and it is the answer that changes how the rest of the form should be
  read, because a school and a teacher are asking for different things. Asked
  first it frames the message field; asked fourth it is a surprise.
- **A reassurance line under the button**, with a drawn clock mark rather than a
  glyph. It is not a new claim: the dialog's own `sent` panel already promises a
  reply within one working day. Saying it *before* the button is the point — a
  promise a visitor reads after submitting is not one that helped them submit.

## 12b. Thực hành & STEM — three embeds, not three labs

The section is a poster wall over a popup, and that was already the design: a
landing section cannot host a running WebGL lab and stay a landing section, so
the labs opened into `PracticeModal` — a full-viewport dialog with a body slot,
a fullscreen button and an exit.

What changed is what is in the slot. Each experience is now its own deployment,
embedded in that dialog rather than bundled into this page.

| | Before | After |
|---|---|---|
| Section cost | 3 posters (~148 kB) | 3 posters (~440 kB) |
| Bundle | `FormulaLab`, `DroneLab`, `RobotLab` + `lib/formula`, `lib/drone`, `lib/robot` | none |
| Assets in `public/asset/practice` | **18.7 MB** of GLB | 452 kB of WebP |
| `practice.css` | 2,136 lines | 907 |

Three things this is not. It is **not** a link-out: the visitor never leaves the
page, and the dialog keeps its own head, its own Escape and its own fullscreen.
It is **not** free — an embedded origin cannot be styled, cannot share this
page's fonts, and owns its own first paint, which is why `.practice-frame`
starts at `opacity: 0` behind `.lab-status` and fades in on `load`. And it is
**not** sandboxed: these are first-party YooX builds, and a `sandbox` attribute
permissive enough for a WebGL simulator grants back everything it would have
withheld, so it would be theatre. What the frame does carry is a deliberate
`allow` — fullscreen plus the two motion sensors — because without the
delegation the embedded build's own fullscreen button is dead *inside* the
frame, which reads as the dialog being broken.

`Mở tab mới` in the head is a real `<a target="_blank" rel="noopener">`, not a
button that calls `window.open`, and it is there for the two things an iframe
genuinely cannot do: fullscreen on iOS Safari, and being the only thing on the
screen.

Card 01 changed subject with the move. The racing workshop is retired and an
excavator took its place — a mechanism lesson where the car was an assembly one,
which also makes all three cards machines you *operate* rather than models you
inspect. Every capability line in `lib/practice/manifest.ts` is written from that
build's own interface: the telemetry column, the four camera modes, the boom /
arm / bucket groups and the shift-cycle mission are all things the simulator
actually shows.

The QA harness lost thirteen shots with the labs and has three. There is nothing
this repository can honestly photograph inside the frame — it is another origin's
first paint, on another origin's schedule — so what is captured is what this page
is still responsible for: the poster wall on each card, and the dialog's chrome
around a frame that has reached `load`.

## 12c. Pricing — the anchor contract, and a height regime

Two defects, and the first is a straight violation of §2.

**The header band was reserved twice.** The contract is that a major section
either reserves the fixed header inside its own `padding-top` and declares
`scroll-margin-top: 0`, or takes the site-wide `:where([id])` scroll margin and
reserves nothing. Pricing did neither: a `9vw` top padding that happened to be
132 px, and no `scroll-margin-top`. So clicking "Bảng giá" in the header landed
the section's top edge 104 px down the viewport and *then* paid 132 px of
padding — 236 px of nothing above the heading, which is what review called "nó
bị tụt xuống". It now follows the contract, and the heading arrives exactly one
`--section-gap` below the bar like every other section's. Measured at 1366 × 768:
section top at viewport 0, `h2` at 102, which is 38 px clear of the bar.

**The vertical rhythm was measured in `vw`.** Every spacing value in
`pricing.css` looked only at width, so a 1920 × 720 projector, a docked 16:10
laptop under three toolbars and a landscape iPad all got the tall-screen layout
and paid the full 248 px of section chrome. The paddings and the two internal
gaps now carry a height term, and a `@media (max-height: 900px)` block
compresses the four things that compress without touching the price type or the
tick rows: the aura's reserve, the heading block, the card padding and the
feature rhythm. At 1366 × 768 the section went from 1,107 px to 902, the card
from 576 to 523, and on arrival the heading, the switch and 89% of a card are on
one screen.

`900px` is the floor because it is where there is nothing left to give: head plus
cards plus foot is about 790 px of content, so below that the section is honestly
a scroll rather than a composition — the same distinction §9's probe draws
everywhere else.

## 13. The GPU budget — `lib/three/deviceTier.ts`

Every WebGL surface used to pick its own resolution ceiling by hand — 1.75 in the
editor, 1.6 in the explore canvas, 2 in the thumbnail baker, 1.4/1.75 in the
Library stage — and three of them then wrote their own adaptive downscaler on
top, with three sets of thresholds and no way back up. Ten numbers, none
measured. There is now one module, and it makes two decisions in deliberately
different ways.

**Everything that can be measured is measured.** Nothing in a user-agent string
distinguishes an M3 Max from a 2017 Intel Iris — or a 13-inch MacBook Air, which
reports eight cores, eight gigabytes and a fine pointer, so every signal calls it
a desktop. `lib/three/qualityLadder.ts` owns an ordered ladder of rungs and walks
it from frame times alone. The signals survive only as a *starting rung*, so a
phone does not spend its first seconds discovering that it is a phone; a machine
that starts low and turns out to be fast climbs all the way back to full.

The order is by what a rung costs the picture, cheapest first, and the ladder
**stops descending the moment the budget is met** — so the quality given up is
only ever what it took to hold the frame:

| Rung | Gives up | Why here |
|---|---|---|
| 1–3 | Supersampling, down to 1:1 | The only thing on this page nobody can see. A 1x display has none to spend, so it gets no rungs here at all — which is why the list is built from the device's own ceiling rather than written as a constant. |
| 4 | Suspended dust and god-ray quads | Large, additive, overdraw-heavy, decoration by construction |
| 5 | Bubbles | Same class, and a crossing effect rather than part of the reef |
| 6 | Reef instance counts | The coral and rock fields |
| 7 | Schools, then megafauna | The specimen the chapter is *about* is never touched |
| 8 | Sharpness below 1:1 | Last, because it is the first rung that spends surplus it does not have |

Every density lever is a `setDrawRange`, an `InstancedMesh.count` or a `visible`
— see `OceanDensity` in `ocean/scene.ts`. Nothing is reallocated, nothing is
re-uploaded, and climbing back is free because the buffers still hold every
authored transform. That is what makes reef density something a measurement can
move rather than something a device test has to guess right once and live with.

Three guards, and all three are here because a measurement caught the version
without them:

- **Descending is a hypothesis.** After three rungs the ladder asks whether the
  frame time actually improved; under 8% and it climbs straight back and refuses
  to descend for 30 s. The hero of this page is substantially bound by the
  browser compositing three full-screen layers — a cost set by the CSS box that
  no rung can reach — and a one-way governor pointed at it slid to its floor and
  bought 6 fps for a visibly softer picture.
- **Load is not a frame rate.** Any window containing a frame over 100 ms is
  discarded, and descending needs two consecutive over-budget windows. At the
  earlier 250 ms threshold, a window full of 40–150 ms frames from a model
  arriving had a mean over budget with nothing in it big enough to discard, and a
  screenshot pass caught the jellyfish chapter running a thinned reef on a
  machine that holds 60 fps at full density.
- **Only oscillation is punished.** Climbing takes five consecutive comfortable
  windows, doubling to forty — but only when a descent *undoes a climb*. Doubling
  on every descent, including the initial search, left an emulated phone two
  rungs below what it could hold at a locked 60 fps.

### The context budget — `lib/three/contextRegistry.ts`

Pausing a render loop stops the work; it does not release the context. A full
page held five at once. On a desktop that is wasted memory; on iOS Safari the
per-page limit is low and a page over it has the browser **take the oldest
context away**, which is the difference between a page that stutters and one that
flickers.

So there are two layers. `visibility.ts` answers "should this draw a frame?".
This answers "should this hold a context at all?" — keeping the nearest N
surfaces, N being 2 on a handheld, 3 on a lean device and 4 otherwise. That is
the one place a device signal is still load-bearing rather than advisory, and it
has to be: a context limit is a property of the browser, so there is nothing to
measure.

Managed surfaces gate their existing effect on a boolean (`useManagedContext`)
rather than exposing a second teardown path. `createLibraryStage` hands its
renderer to six consumers that call `setRenderTarget`, `capabilities` and
`setAnimationLoop` on it directly, and one that passes it to a workshop builder;
swapping that renderer underneath them is not a safe operation, while letting
React run the component's own cleanup and setup is.

Two surfaces are deliberately outside it:

- **The bee's foreground pass** is chapter-scoped, not distance-scoped, because
  what decides whether the bee is on screen is the dive. It is built when the bee
  arrives and released 2.5 s after it leaves, so a scrubbed crossing rebuilds
  nothing.
- **The Explore canvas itself is never released.** Rebuilding it means re-parsing
  a 2.6 MB rigged bee and the whole reef, which is seconds of work charged to the
  one interaction — scrolling back to the top — that would pay for it. What it
  gives back instead are its two full-viewport half-float composite targets,
  about 60 MB at a retina frame, six seconds after it leaves the screen;
  `ensureTargets` is already lazy, so the composite re-allocates them on the next
  frame that needs one.

No flash, and the guarantee is structural rather than cosmetic: surfaces are
admitted at 1.6 viewports and released at 3 — 4.5 for the editor, the page's most
expensive rebuild — so **every state change happens off screen**. Nothing is
released within 6 s of being acquired, so a flick through the whole page acquires
along the way and releases nothing until it settles.

`ExploreCanvas` still distinguishes the two ideas by name, for the decisions that
genuinely cannot be walked back at runtime: MSAA, seabed tessellation and the
transmission pass are fixed when the context and the geometry are built.
`compact` is a **width** and decides composition; `lean` is a **budget**.
Everything the ladder owns used to be signalled and is now measured.

The stylesheet reads the same tier through `data-gpu="lean"`, stamped on `<html>`
before the first paint by the bootstrap in `layout.tsx`. It removes exactly one
thing: the backdrop blurs. A blurred backdrop is the only CSS on this page whose
cost is **per frame** rather than once — it is recomputed whenever anything
behind it repaints, and the fixed header sits over a full-viewport WebGL canvas
for the whole Explore chapter. The four surfaces whose readability was coming
from the blur get the opacity it was providing.
