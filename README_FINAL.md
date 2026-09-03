# YooLab

A 3D/XR learning platform site: a cinematic explore sequence, a working lesson
editor, a multi-subject interactive library, and a full-screen engineering
workshop — all on one page, all running for real.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run start    # production preview, same port
npm run lint
```

Node ≥ 22.13. Stack: Next.js App Router on vinext/Vite, React 19, Three.js
0.185, Tailwind v4 (tokens only — layout is hand-written CSS).

---

## The page

One journey, nine stops, each answering exactly one question:

| | Section | Question it answers |
| --- | --- | --- |
| 01 | **Explore** — Bee → Fish → Jellyfish | What is YooLab? |
| 02 | **Bridge** | That was a lesson — and you can build it |
| 03 | **YooStudio** | How do I make one? |
| 04 | **Workflow ribbon** | Where does a lesson go? |
| 05 | **Library** | Where does the content come from? |
| 06 | **Practice & STEM** | What can I simulate? |
| 07 | **Education** | What do I get out of it? |
| 08 | **Proof** | What actually works? |
| 09 | **CTA + footer** | What do I do now? |

A section says its one thing once. Where two sections were making the same claim
in different words, the later one defers — which is why the standalone "học sinh
sáng tạo" section is gone (it made no claim the Education student tab does not)
and why the workflow is a one-line ribbon rather than four cards.

---

## Layout: three regimes, no others

Locked in `:root` and used everywhere. A fourth width is a bug — inconsistent
section edges were the main source of stray whitespace in the previous build.

| Regime | Token | Used by |
| --- | --- | --- |
| **A** Cinematic | `100vw`, no wrapper | Hero and the creature stage |
| **B** Product wide | `--shell-wide` = `min(1600px, 100vw - 64px)` | YooStudio, Library workspace |
| **C** Editorial | `--shell-editorial` = `min(1400px, 100vw - 64px)` | All prose, workflow, education, proof, CTA |

All three share the same 64 px outer margin, so once a viewport is narrow enough
that a regime stops capping, its edges line up exactly with its neighbours'. At
1920 the Library is 1600 wide with the specimen viewer at ~996 px; at 1440 every
shell is 1376 and every edge agrees.

## Colour: one token block

Every colour on the site resolves to a token in the `:root` block at the top of
`app/globals.css`. It now runs the **official brand**: the gradient
`#96DEDA → #50C9C3`, with `#50C9C3` as the solid wherever a surface takes one
flat colour, on the site's own warm ivory ground (`--color-bg: #fbf8f4`), which
the accent swap deliberately did not touch. The older variable names
(`--brand`, `--surface`, `--ink`, `--line`, …) are aliased to those tokens at the
bottom of the same block, which is what let the whole re-key off the previous
coral/ivory experiment be an edit to one block rather than a find-and-replace
across 2,900 lines. See DESIGN.md §4 for the ramp and the two rules that make it
legible — the sweep fills but never writes, and white is not available on a
brand fill.

The site is light-first throughout. The only dark surface is the Formula
workshop overlay, which is a full-screen mode change rather than another section
in a different key.

Section backgrounds form a continuous chain — ivory → white → ivory →
lavender-ivory → cream — where each section starts on the colour the one above
ended on. No hard cuts, and never a dark one.

## Type

Inter Tight for display, Inter for body, and Instrument Serif for exactly one
thing: specimen names in the Library. Navigation, buttons, labels and body text
are sans throughout — the serif is a scientific-catalogue accent, not a second
system.

---

## Explore: the bee arrives

`ExploreStory` turns scroll position into one continuous number across four
panels; `ExploreCanvas` samples camera, lights, backdrop palette and the three
creature weights from it every frame. Nothing ever switches — Bee → Fish →
Jellyfish is one camera moving through one world.

The bee leads because it is the only creature with a skeleton and authored flight
clips, so it can *arrive*:

1. The page opens on an empty studio, the bee off-frame right and high.
2. `Fly` plays; the bee travels a curved path — lateral motion leads the vertical
   so the path bends rather than sliding — and decelerates on an out-cubic ease
   into its mark over 2.6 s.
3. At 72% it crossfades `Fly` → `Hover` over 0.85 s and holds, hovering, with
   procedural micro-motion.

Leaving is a flight, not a fade. Each creature has an exit vector; the offset is
`recede²` where `recede = 1 − presence`, and `presence` is a pure function of
scroll. So scrolling back up walks the bee back in along the same arc and settles
it — no teleport, no re-entry animation to re-trigger.

Three sources want to drive the bee's clip (the entrance, leaving the frame, and
the three buttons in the study panel). They are resolved in one place, strongest
first, so a visitor who leaves the bee on "đứng yên" never watches it slide out
of frame with its wings folded.

The jellyfish is framed rather than shown whole: the camera aims above the model
centre and carries a −0.075 rad roll, which turns a very tall subject into a
diagonal that fits one screen instead of asking for two screens of scrolling
before the tentacles end.

---

## The Library

The section that has to answer *"does this platform actually have content?"* — and
a grid of cards cannot, because a card is a promise. So the Library is the
application: subject switcher on top, specimens down the left, the specimen
itself running at full size in the middle, and what a teacher needs to know on
the right.

### Content model

Everything comes from `app/lib/library/manifest.ts`, never from JSX. Two rules
are enforced by the type in `types.ts` rather than by discipline:

- **`status` is required.** An entry is `ready` only when opening it produces a
  real experience *in this build*. Anything else is `planned` and renders as a
  stated gap, never as a card that looks live.
- **`credits` is required on anything derived from an outside source**, and it
  carries the licence with it. An asset whose licence has not been verified does
  not get an entry — it does not ship.

### What is in it

| Subject | Live | Planned |
| --- | --- | --- |
| Sinh học | Ong mật · Cá cảnh biển · Sứa biển · Tế bào động vật · Vách tế bào Gram dương | — |
| Hóa học | Bảng tuần hoàn (118 nguyên tố) | Mô hình phân tử |
| Vật lý | Chuyển động ném | — |
| Địa lý & Trái Đất | Địa cầu tương tác (177 quốc gia) | — |
| Khoa học vũ trụ | — | stated empty state |
| Lịch sử & Văn hóa | — | stated empty state |
| KHCN & STEM | Xưởng mô hình xe đua (Formula) · Bộ dụng cụ | Phòng thực hành 3D |

Nine live experiences across five subjects. Two subjects are empty and say so,
in full words, in the middle of the workspace — see
[SOURCE_AUDIT.md](SOURCE_AUDIT.md) for why, and
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for what is missing.

### The experiences

- **Bảng tuần hoàn** — 118 elements as a CSS grid (not textured planes: 118
  interactive tiles need crisp Vietnamese type, keyboard focus and screen-reader
  access). Selecting one opens a Three.js atom whose shell radii and occupancies
  come from that element's real configuration, plus a 12-row property sheet.
- **Tế bào động vật** — the whole cell generated from Three.js primitives that
  YooLab owns: membrane, nucleus and nucleolus, mitochondria with cristae, folded
  ER, Golgi cisternae, 300 instanced ribosomes. Click an organelle in the model
  or pick it by name; "tách bào quan" lifts it out along its own vector.
- **Chuyển động ném** — a real integrator, 1 ms semi-implicit Euler. Drag-free it
  matches the closed-form parabola to within a pixel, so the readouts match what
  a student computes by hand; with drag on, the trajectory visibly stops being
  symmetric.
- **Địa cầu tương tác** — Three.js globe from public-domain Natural Earth data.
  Drag to spin, click a country for its Vietnamese name, continent, region,
  population and GDP; colour by continent or by population.
- **Xưởng mô hình xe đua** — the existing Formula workshop, unchanged, opened
  from the Library as the flagship KHCN & STEM item.

### Deep links are real

`openLibraryExperience(id)` sets the subject and specimen and scrolls the Library
into view. The Proof cards and the Practice section use it, so a card that says
"mở bảng tuần hoàn" delivers the periodic table rather than scrolling to the
Library with the bee still selected.

---

## Performance

- Every subject experience is behind its own `lazy` import. The homepage carries
  none of them: opening Chemistry fetches a 9 kB chunk, Geography 9 kB, the cell
  8 kB, the simulation 6 kB. A visitor who never scrolls to the Library
  downloads none of it. Formula is a separate chunk again.
- Element and geography data are files in `public/data`, fetched on demand — 74
  kB and 92 kB respectively, and neither is in any JS bundle.
- Every render loop pauses on `IntersectionObserver` *and* `visibilitychange`, so
  a Library with five specimens never runs five loops. Contexts, geometries,
  materials, textures and render targets are disposed on unmount.
- Adaptive DPR: the Explore stage steps its pixel ratio down after two sustained
  slow windows; the Library stage after 40 slow frames. Mobile caps DPR lower and
  drops antialiasing and transmission.
- Library thumbnails are baked once through a single shared offscreen renderer
  and memoised, so a grid of previews costs one WebGL context and one frame per
  asset rather than a live canvas each.

## Layout hazard worth knowing about

A `<canvas>` has an intrinsic size from its `width`/`height` attributes, and the
renderer sets those to box × devicePixelRatio. In flow that intrinsic size
becomes the element's min-content contribution, so the canvas widens its own
column, the ResizeObserver enlarges the drawing buffer to match, and the two grow
together. At 768 px the Library viewer had inflated itself to 1092 px this way.
Every render canvas on the site is therefore `position: absolute; inset: 0`, and
the Library workspace has a definite height rather than a `min-height`.

## Responsive

| Width | Library |
| --- | --- |
| ≥ 1441 | three columns, viewer ~996 px |
| ≤ 1440 | panels narrow, viewer takes the slack |
| ≤ 1180 | knowledge panel becomes a sheet under the viewer, opened by a button |
| ≤ 820 | viewer first, specimens as a horizontal rail below it, detail below that |

Verified with no horizontal overflow at 1920, 1440, 1366, 768 and 375.

---

## Layout of the code

```
app/
  globals.css               tokens, three layout regimes, every section
  page.tsx                  the nine-stop journey
  components/
    ExploreStory.tsx        scroll → one continuous number
    ExploreCanvas.tsx       the cinematic stage (bee/fish/jellyfish)
    FlowerValleyLayer.tsx   the hero's flower valley, one Canvas2D layer
    BridgeSection.tsx       explore → product hinge
    StudioDemo.tsx          YooStudio — real GLB, raycast, gizmo, timeline
    WorkflowRibbon.tsx      four beats, one line
    PracticeSection.tsx     Formula + the stated lab gap
    EducationSection.tsx    teacher / student / school tabs
    ProofSection.tsx        five things that open
    Formula*.tsx            the full-screen workshop
    library/
      LibraryWorkspace.tsx  the three-column application
      LibraryViewer.tsx     lazy-import map for the centre
      ModelStage.tsx        shared GLB viewer: orbit, zoom, idle turn
      experiences/          PeriodicTable · CellStudio · ProjectileLab · GlobeExplorer
  lib/
    library/                types · manifest · openExperience
    chemistry/elements.ts   data access, Vietnamese labels, formatting
    three/                  environment · liquid · beeOptics · thumbnails
    flowerValley/           atlas · valley · composition · renderer
public/
  asset/                    GLBs and textures
  data/                     periodic-elements.json · world-110m.json
scripts/
  build-vercel.mjs          the Vercel production build (see below)
vercel.json                 framework: null — the whole Vercel fix
reference-sources/          research clones, git-ignored, never shipped
```

## Building and deploying

Two targets, one Vite config, and the difference is a single plugin.

```
npm run dev            vinext dev          workerd, HMR, local sign-in shim
npm run build          vinext build        → dist/   (local / OpenAI Sites)
npm run build:vercel   vite build + Nitro  → .vercel/output   (Vercel)
```

vinext is Next.js on Vite, and a Vite build does not know where it is going. The
*deployment plugin* is what tells it: vinext looks for a plugin named
`vite-plugin-cloudflare` or `nitro` in the plugin list and hands that plugin
ownership of the server environment — externalisation, the server entry, the
output layout. Exactly one may be present, so `vite.config.ts` chooses:

- **No `NITRO_PRESET`, no `VERCEL`** → `@cloudflare/vite-plugin`, which is what
  gives `vinext dev` a real workerd runtime and what the D1/R2 bindings in
  `.openai/hosting.json` are declared against.
- **Either one set** → `nitro/vite` with that preset. Vercel sets `VERCEL=1` in
  every build container, so the Vercel build needs no flag; `NITRO_PRESET` is
  Nitro's own variable and overrides it, which is how any other Nitro host
  (`netlify`, `deno_deploy`, `node_server`) can be targeted without editing code.

On Vercel the `vercel` preset emits **Build Output API v3** into `.vercel/output`:
`/` prerendered to `static/index.html`, everything in `public/` copied to
`static/`, `_next/static/*` served with immutable cache headers, and one Node
function (`functions/__server.func`) behind a catch-all for anything not on disk.
The client bundle is unchanged from the Cloudflare build — same Three.js, same
scenes, same flower valley.

`vercel.json` carries `"framework": null`. Without it Vercel sees `next` in
`dependencies`, applies its Next.js preset and runs `next build`, which this
project has no pipeline for. That single line is the deployment fix; the Nitro
plugin is what makes the build it then runs produce something Vercel can serve.

To inspect an output build locally: `npx vite preview` serves `.vercel/output`
exactly as the CDN and the function would.

## Documents

- [SOURCE_AUDIT.md](SOURCE_AUDIT.md) — every external project studied, what was
  checked, what was taken, and the two models rejected on licence grounds.
- [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) — licences and required
  attribution for everything shipped.
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) — what is not built, stated
  plainly.
