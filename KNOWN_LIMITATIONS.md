# Known limitations

What this build does not do, stated plainly. The site itself says the same things
where a visitor would otherwise assume otherwise.

---

## Subjects with no content

**Khoa học vũ trụ** and **Lịch sử & Văn hóa** are listed in the subject switcher
and have nothing behind them. Both show a full-size empty state in the middle of
the workspace explaining why.

They are listed rather than hidden on purpose: the taxonomy is what YooLab is
building toward, and a visitor who can see the whole plan — including the parts
that are not done — can trust the parts that are. The reason in both cases is
that no source with verifiable commercial-use rights was found. See
[SOURCE_AUDIT.md](SOURCE_AUDIT.md) §6.

**Mô hình phân tử** (Chemistry) and **Phòng thực hành 3D** (STEM) exist as
`planned` manifest entries. They render as stated gaps with no controls, because
there is nothing behind a control to run.

## The chemistry and physics bench does not exist

The Practice & STEM section now carries three working labs — the Formula
workshop, a guided drone flight and a six-axis robot cell — and the outline of a
lab bench that used to sit beside the workshop is gone with it. What is still
missing is what that outline was promising: wet-lab work. Instruments,
procedures, reagents and titration are not started, and nothing on the page
claims otherwise any more.

Two honest notes about what the three labs *are*:

- **The drone and the robot are procedural.** Every mesh in both is built from
  Three.js primitives at runtime. That is a licensing decision rather than an
  aesthetic one — see [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) — and it
  holds up at the size the stage renders them, but neither is a scanned or
  authored model the way the Formula car is.
- **The drone flies one course and the robot runs one cell.** Both flight model
  and kinematics are general; the content is not. A second course or a second
  cell layout is data, but there is only one of each today.

## Two cell models were rejected, not lost

The NIH Animal Cell (3DPX-015797) and Neuron (3DPX-015796) meshes are
`CC-BY-NC-SA` — NonCommercial — and cannot ship on a product site. The animal
cell in the Library is therefore YooLab-authored procedural geometry rather than
a scanned mesh, and there is **no neuron**. Recorded in
[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) so nobody re-adds them believing
the surrounding repository's MIT licence covered them.

## Human anatomy now ships, but twelve organs is not a body

This used to be the headline gap. It is closed: the biology shelf carries
**twelve human organs** from the Human Reference Atlas under CC BY 4.0 — heart,
lungs, brain, eye, liver, gallbladder, pancreas, ileum, large intestine, kidney,
spleen and one thymic lobe. The gap was never engineering, it was a licence, and
it was closed by finding a source whose terms are published and checkable rather
than by relaxing the rule. The nine unverifiable meshes stay rejected and stay on
the record in [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).

What is honestly still missing:

- **No skeleton, no muscle, no vessels, no nerves.** Twelve organs is an organ
  shelf, not a body. There is no way to see where any of them sits relative to
  the others, because each mesh is loaded alone and the HRA's shared body-space
  coordinates are not used to place them together.
- **Three entries are a part, not the organ**, and each says so in its own title
  and readout rather than in a footnote: `small_intestine.glb` is the ileum,
  `thymus.glb` is the left lobe, `kidney.glb` is the left kidney.
- **No anatomy pins on the organs.** The T-rex's pins bind to rig joints; these
  meshes have no rig, so the pin machinery has nothing to attach to. The named
  structures are in the knowledge panel as text instead of on the model.
- **Two authored colours are diagram colours, not tissue colours** — the
  gallbladder's pure green and the optic chiasm's highlighter yellow. Both are
  desaturated at runtime to a tissue-plausible ceiling, hue preserved. That is a
  correction applied to the source's own values, and it is recorded in
  THIRD_PARTY_ASSETS.md rather than done quietly.

## Commercial terms are not stated anywhere

No pricing, no free tier, no trial length, no seat or asset quota, no
feature-gating. YooLab has published none of those, so the site invents none of
them. The CTA asks for a conversation.

## No customer evidence

No school logos, no testimonials, no user counts, no case studies. YooLab has not
published a customer list. The Proof section says this outright and offers
product evidence instead — five things that open and run on the page.

## Things named in the UI that are not implemented

- **YooStudio's rail** lists nine modules (Không gian, Bước, Mô hình, Văn bản, Âm
  thanh, Media, Hotspot, Hiệu ứng, Tạo Quiz). Selecting one switches the tool and
  the properties panel; Model, Văn bản and Hiệu ứng do real work on the live
  scene. Media, Hotspot and Tạo Quiz change the tool but have no authoring UI
  behind them yet.
- **The audio track** in the timeline says so in its own panel: "Bản demo này
  chưa kèm tệp âm thanh."
- **"Xem trước" and "Đặt góc nhìn"** in the Studio topbar: "Đặt góc nhìn" frames
  the selection for real; "Xem trước" is inert.
- **Footer legal links** (Quyền riêng tư · Điều khoản) have no destinations.
- **"Thêm vào bài giảng"** in the Library links to the YooStudio section; it does
  not transfer the selected specimen into the editor. The editor demo is a fixed
  jellyfish scene.

## Interaction gaps in the Library

- **Compare** — the Library has no side-by-side comparison mode. The knowledge
  panel describes one specimen at a time.
- **Cross-section / layer isolation** exists only in the cell (`tách bào quan`)
  and in the Explore jellyfish. GLB specimens support orbit and zoom, not
  clipping planes or per-part isolation, because those meshes are not authored
  in separable parts.
- **Quiz** — no assessment anywhere. Learning goals are stated, not tested.
- **The molecule viewer** is not built (see above).

## Verification: what has and has not been seen

**Screenshots are now real.** `reference-audit/shots.mjs` drives a headed Chrome
over the DevTools protocol, parked off-screen so the compositor treats the page
as visible and the WebGL actually renders. It waits for every specimen stage to
leave its loading block *and* for every on-screen thumbnail to finish baking
before it captures, and it fails the run on horizontal overflow or on anything
the page logged to `console.error`.

Captured and looked at, at 1920 / 1512 / 1440 / 1366 / 1024 / 768 / 390: the
hero, all three creature chapters, the product bridge, the workflow ribbon,
YooStudio, all 28 Library experiences, Practice, Education, the sample lessons
and the CTA. No horizontal overflow at any width, no console errors on any shot.

Two companions to the screenshots, because a picture is bad at proving a number:

- `reference-audit/measure.mjs` reports the shell alignment as a single spread
  across seven bands — header, creature chapter, YooStudio, Library, Practice,
  Proof, footer — and where each section's primary block lands relative to the
  fold. It reads **spread = 0 px at all seven viewports**, which is the whole
  "does this page use one grid" question answered numerically.
- `reference-audit/probe.mjs` evaluates an arbitrary expression in the real page
  at a given viewport. It exists because two of the faults in this round were
  invisible to a screenshot and obvious in three numbers.

One trap worth knowing about: `measure.mjs` disables the scroll reveal before it
measures anything. `getBoundingClientRect` includes transforms, and a
`[data-reveal]` block still 20 px into its rise made the probe report an 8 px
overrun on a section that has 12 px of clearance. A layout probe that reads a
transform invents defects.

What that inspection found and fixed is listed in this file's history rather
than here; what it did **not** cover:

- **Real hardware.** Every frame was rendered by one desktop GPU through one
  Chrome. Integrated graphics, mobile GPUs and Safari's WebGL are unexercised —
  the adaptive pixel-ratio governor in `libraryEnvironment.ts` exists for that
  case and has never been observed firing.
- **Motion.** A screenshot is one frame. The bee's three flight states, the
  scroll hand-offs between bee, fish and jellyfish, the camera easing and the
  Formula assembly sequence were each captured at a representative moment, not
  watched.
- **Touch.** Orbit, pinch-zoom and the mobile knowledge sheet were exercised
  with synthetic pointer events, not with fingers on glass.
- **Assistive technology.** Roles, labels and focus order are authored, and the
  canvases are labelled `role="img"`; no screen reader has read the page.

## Where a section deliberately does not fit one viewport

The whole page is composed viewport-first: `reference-audit/measure.mjs` reports,
for every major section at seven viewports, where the block that carries the
section's idea lands. Four sections stop promising a one-screen composition below
a stated width, and the probe knows it (`fitAbove` in its `TARGETS`), so the
report says `scrolls` rather than `CUT`:

| Section | Fits in one viewport above | Below that |
|---|---|---|
| Product bridge | 700 px | The two states stack; the arrow turns vertical |
| YooStudio | 700 px | Editor keeps its height, the section scrolls |
| Practice & STEM | 1180 px | Rail becomes a row of tabs above the stage; below 1000 the brief column moves under it |
| Education | 1000 px | Role panel stacks under the switcher |
| Sample lessons | 700 px | Four cards become one column |

Library, the hero, the three creature chapters and the CTA compose in one
viewport at **every** tested size, 390 to 1920.

The alternative for the four above would be shrinking the evidence — a 200 px
product shot in Education, a thumbnail-sized lab stage in Practice — to win an
arithmetic argument. What each of them does instead is put its heading, its claim
and the top of its primary visual in the first screen, and let the rest follow.
That is a composition, not an overflow, and it is why the probe distinguishes the
two.

## Rendering that is right but not beautiful

- **The eight hand tools** (`KHCN & STEM → Bộ dụng cụ mô hình`) ship with no
  textures at all — every mesh carries the same flat 0.8 grey. They are rendered
  with authored materials (steel, matte plastic, rubber) so the silhouettes read,
  but the ruler has no markings on it, because the mesh has none. A ruler
  without a scale is the weakest object in the Library.
- **The Formula car keeps its sponsor liveries.** Tobacco branding is painted out
  at load (`neutralizeBodyBranding`); the remaining marks are the source model's
  and are on the poster image too, so the workshop and its preview agree.
- **The DC circuit diagram is cramped on a short laptop.** `Vật lý → Mạch điện
  một chiều` has four fixed rows below its canvas — a readout strip, two lamp
  cards, a conclusion line and the control panel — and on a 1366×768 screen those
  leave the diagram about 110 px. It is legible and correct; the particle flow and
  the two lamp symbols are simply tighter than they are at 1920, where the same
  canvas gets 300 px. Fixing it means giving the panel an internal scroll or
  moving the lamp cards into the knowledge column, which is a change to that
  simulation rather than to the layout system.
- **The globe is a wireframe on a plain sphere.** Natural Earth gives borders,
  not terrain, and no terrain raster with verified commercial-use rights has been
  added. It is a data globe, and it says so.
- **The bee's glass does not refract the flower valley.** The hero's flowers are
  a Canvas2D layer *over* the WebGL canvas, and the bee's optical shell refracts
  a render target produced from the WebGL scene alone — so the meadow is not in
  the refraction. It cannot be: that renderer is `alpha: false` and paints its own
  ivory backdrop plate, so a layer behind it would never be seen at all, and
  making it transparent means rebuilding the plate the whole hero's light is
  balanced against. The previous procedural field did get this for free by living
  inside the scene, and it looked like polygon grass. Depth is recovered instead
  by depth-gated exclusion zones — midground plants lose alpha across the
  creature's head, thorax and abdomen, foreground plants at the frame edges do
  not — which reads correctly at every viewport but is a composite, not optics.
- **The flower valley leaves earlier than the brief for it asked.** It is at full
  composition on the hero and gone before the anatomy chapter is centred, rather
  than persisting to "section three". Its exclusion zones are authored against the
  hero frame — a bee at 62% of the width, a specimen card at 87% — and chapter two
  puts a full column of copy where the hero has nothing; captures at 1920 showed
  the field printing through the anatomy readout and the three mode buttons. The
  window is in `FADE_FROM`/`FADE_TO` in `app/lib/flowerValley/renderer.ts` with
  the same reasoning.

## Environment note for the next person

The mobile knowledge sheet toggles with `display` rather than animating its
height. That is deliberate — the panel's content runs to ~880 px and a fixed
`max-height` collapse silently clipped it into a nested scroller — but it means
the sheet appears instantly rather than sliding. If a slide is wanted later, it
needs a measured-height animation, not a magic number.

## Browser and platform

- WebGL2 is assumed. There is no 2D fallback; a context failure shows a message
  rather than a degraded scene.
- The Explore stage, YooStudio and the Library viewer are three separate WebGL
  contexts. They pause when off screen, but a browser with a low context limit
  and other WebGL tabs open may drop one.
- Touch: orbit and pick work; there is no pinch-zoom gesture on the Library
  viewer (wheel zoom only).
- `prefers-reduced-motion` is honoured everywhere — the bee's entrance resolves
  instantly, idle turns stop, mixers hold their pose.

## Content

All copy is Vietnamese. There is no i18n layer, no locale routing and no English
version. Element names use the IUPAC forms of the 2018 curriculum, with the
familiar Vietnamese name in parentheses where one is established.
