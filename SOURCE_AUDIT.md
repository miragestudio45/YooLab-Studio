# Source audit

Every external project studied for this release, what was checked, and what was
actually taken. Research clones live in `/reference-sources` (git-ignored, never
shipped). Nothing in `dist/` comes from those clones except the one asset noted
below as verified public domain.

The rule applied throughout: **a public URL is not a licence.** Where a licence
could not be verified as permitting commercial use, the asset was not shipped —
even when downloading it would have been trivial and even when it would have
filled a visibly empty subject.

---

## 1. Cell Architecture Studio — `yuryuri/cell-architecture-studio`

| | |
| --- | --- |
| Repo | https://github.com/yuryuri/cell-architecture-studio |
| Code licence | MIT (`LICENSE`, © 2026 cclank) |
| Studied | Specimen-list architecture, organelle detail panel, mesh/focus preview modes |
| Code imported | **None** |
| Assets imported | 1 of 3 GLBs — see below |

The repo's `docs/ASSETS.md` traces its three GLB files to NIH 3D entries. The
repo's own MIT licence covers its code, **not** those assets, so each entry was
checked against the NIH 3D API (`https://3d.nih.gov/api/entries/<id>`):

| Model | NIH entry | Licence field | Shipped? |
| --- | --- | --- | --- |
| Animal Cell | 3DPX-015797 | `CC-BY-NC-SA` | ❌ **No** — NonCommercial |
| Neuron | 3DPX-015796 | `CC-BY-NC-SA` | ❌ **No** — NonCommercial |
| Gram Positive Bacterial Cell Wall | 3DPX-010752 | `Public Domain` | ✅ Yes |

YooLab is a commercial product site, so the two NonCommercial meshes are
unusable regardless of attribution. They were deleted from the working tree and
never entered `public/`.

**What was done instead.** The Animal Cell subject needed to exist, so it was
built rather than downloaded: `app/components/library/experiences/CellStudio.tsx`
generates the whole cell — membrane, nucleus and nucleolus, mitochondria with
cristae, folded endoplasmic reticulum, Golgi cisternae and instanced ribosomes —
from Three.js primitives that YooLab owns outright. It is a better teaching
object than the print-exchange mesh would have been: each organelle is a
separate object, so selecting one can physically lift it out of the cell, which
a single fused STL-derived mesh cannot do.

The bacterial wall model **is** shipped, at
`public/asset/Library/Biology/gram-positive-wall.glb`, with the attribution its
author asked for (A.C. Vinal, Wake Technical Community College) carried in the
manifest entry and rendered in the Library's credits panel.

---

## 2. Mint Playground — periodic table

| | |
| --- | --- |
| Repo | https://github.com/mintdotgg/mint-playground |
| Path | `experiences/periodic-table` |
| Code licence | MIT (© 2026 CloudyLo001; `UPSTREAM.md` records the permission chain) |
| Data licence | `src/data/elements.json` — CC BY-SA (Periodic-Table-JSON) + public domain (PubChem) |
| Code imported | **None** |
| Data imported | Yes, filtered — see below |

**Studied:** how the experience is structured — a table view that opens into a
per-element atom scene, the property-sheet grouping (identity / atomic structure
/ chemical / physical), and the Bohr-shell animation approach.

**Taken:** the element dataset only. `public/data/periodic-elements.json` is
derived from `elements.json` with the long English `summary` prose dropped — it
is CC BY-SA Wikipedia text, and it is English on a Vietnamese site — leaving the
factual and numeric fields. 118 elements, 74 kB.

**Rewritten:** everything visible. The upstream renders its tiles as textured
planes in a dark WebGL scene; YooLab renders the table as a CSS grid, because
118 interactive tiles need crisp Vietnamese type, keyboard focus and screen
reader access, and a texture atlas gives up all three. The atom scene is a fresh
implementation on the light warm ground with YooLab's own category palette.
Attribution for both the MIT code lineage and the CC BY-SA data is recorded in
`THIRD_PARTY_ASSETS.md` and shown in the Library's credits panel.

**Not done:** `experiences/compound-visualization` (the molecule viewer). It was
reviewed and deferred — the Library carries a `planned` entry for it so the
architecture is in place, and the entry says plainly that it is not open yet.

---

## 3. PhysicsSims — `IlliniOpenEdu/PhysicsSims`

| | |
| --- | --- |
| Repo | https://github.com/IlliniOpenEdu/PhysicsSims |
| Licence | MIT |
| Code imported | **None** |

**Studied:** the module layout under `src/pages/mechanics` (25 simulations,
16–40 kB each) and the shape they share: a parameter panel, a live canvas, a
readout of derived quantities, and presets.

**Decision: do not port.** Each page is tightly bound to that project's Tailwind
config, its own `src/components/ui` library and its router. Lifting one would
have pulled all three into YooLab for a single simulation — exactly the scope
explosion the brief warns about.

**What was done instead.** `ProjectileLab.tsx` is a YooLab implementation of
projectile motion with the same module shape. Physical equations are not
copyrightable and the integrator is written from scratch: semi-implicit Euler at
a 1 ms step, which in the drag-free case agrees with the closed-form parabola to
within a pixel. Verified against theory at 24 m/s and 45°: range 58.7 m
(v²sin2θ/g = 58.70), apex 14.7 m (v²sin²θ/2g = 14.68), flight 3.46 s
(2v sinθ/g = 3.459).

---

## 4. Anatomy Atelier — `thebuggeddev/anatomy`

| | |
| --- | --- |
| Site | https://anatomyatelier.vercel.app/en |
| Repo | https://github.com/thebuggeddev/anatomy |
| Licence | **None declared** — no `LICENSE` or `COPYING` file in the repository |
| Code imported | **None** |
| Assets imported | **None** |

With no licence, this is reference-only, and it was treated strictly as such.
The clone contains 34 MB of organ GLBs under `public/anatomy/`; not one byte
entered YooLab.

**Studied and adapted as UX architecture** (ideas, not implementation): a
near-full-width application layout instead of a centred document column; left
asset navigation, a large central viewer, a right knowledge panel; warm ivory
surfaces with hairline warm-brown borders; small utility controls; the 3D object
holding the largest area on screen at all times; secondary knowledge modules
below the fold.

Its token file confirmed the family the brief's palette belongs to — a warm
ivory canvas, a coral accent, lavender and sage as soft accents. YooLab's tokens
were written independently to the brief's own values (`#ed8a72` / `#e87868` on
`#fbf8f4`) and no CSS, typography stack, naming or asset was copied.

---

## 5. Natural Earth — geography data

| | |
| --- | --- |
| Source | https://www.naturalearthdata.com |
| Dataset | 1:110m Admin 0 Countries |
| Licence | **Public domain**, explicitly: "All versions … are in the public domain … including modifying the content and design, electronic dissemination, and offset printing … for personal, educational, and commercial purposes." |
| Imported | Yes — `public/data/world-110m.json` |

This is the release's substitute for the David Rumsey historical globes (see
below). The raw GeoJSON is 839 kB; the shipped file is 92 kB — outer rings only,
Ramer–Douglas–Peucker simplified at 0.35°, quantised to 1/32° and delta-encoded.
177 countries, 10,642 points, with continent, sub-region, population, GDP and —
importantly — the dataset's own `NAME_VI` field, so the Vietnamese country names
come from the source rather than from us transliterating them.

Credit is not required by the licence; it is given anyway, in the Library credits
panel and in `THIRD_PARTY_ASSETS.md`.

---

## 6. Reference-only, nothing taken

| Source | Studied for | Why nothing was taken |
| --- | --- | --- |
| [David Rumsey interactive globes](https://www.davidrumsey.com/view/interactive-globes) | Historical globe explorer interaction: a single artefact, spun, with its date, maker and context beside it | Neither the viewer nor the scans are ours to use, and per-item rights would need checking artefact by artefact. The interaction idea is honoured by the Natural Earth globe above; no scan was downloaded. |
| [Leap For Mankind — Lift Off](https://leap-for-mankind.com/lift-off) | Camera storytelling, hold-to-act mechanic, cinematic scale, launch pacing | Proprietary. No model, texture, audio or code taken. **Khoa học vũ trụ** therefore ships as an honest empty state rather than as a rocket that is not ours. |
| [Google Arts Experiments — Meroë](https://artsexperiments.withgoogle.com/meroe/) | Immersive history: scroll narrative, artefact plus context, fact layering | Proprietary Google Arts & Culture assets. **Lịch sử & Văn hóa** ships as an honest empty state; digitised artefacts need an agreement with whoever holds the objects. |

No HAR capture or network inspection was used to obtain any asset from these
sites. Where a technique was worth having, it was re-implemented.

---

## 7. Open Industry Project and the quadrotor sandbox — the two hands-on labs

| | |
| --- | --- |
| Repos | https://github.com/Open-Industry-Project/Open-Industry-Project · https://github.com/mintdotgg/mint-playground (`experiences/quadrotor-sandbox`) |
| Licence | MIT (both) |
| Code imported | Yes, adapted — see below |
| Assets imported | **Open Industry: yes** (nine models, twenty texture maps, MIT). **Quadrotor sandbox: yes** (twenty files from its CDN, terms unstated — see below) |

This is the one place in the audit where two MIT projects were treated
differently, so the reasoning is worth writing down.

**Open Industry Project.** One MIT `LICENSE` at the repository root, no carve-out
for `assets/`, and the models are *in the repository*. So the grant reaches them
and they ship — not just the arm, but the room: `Six-Axis_01`, `EOAT_Suction`,
the `Wall_A` / `Wall_D` building sections, the `Roof_A` bay, the concrete floor
slab, the `Light_A` high-bay fixture, the Euro pallet and the AGV. The notice
travels with them at `public/asset/practice/robot/LICENSE` and every
modification is itemised in `THIRD_PARTY_ASSETS.md`.

Shipping the *building* rather than only the arm was a correction. The first
version of this lab loaded the arm and then stood it in the Library's ivory
studio, on the house rule that all three labs share one room — which produced
something that had almost nothing in common with the reference the lab was
supposed to match, and read as a large white toy rather than as industrial
equipment. The rule was right for the other two labs and wrong for this one.

Two things the GLBs do not carry had to come from elsewhere in the same project.
The **joint rig** is not in the file — it is nine loose meshes — so it is
transcribed from `parts/SixAxisRobot.tscn` into `app/lib/robot/sixAxis.ts`, pivot
by pivot, with the joint-limit table and the home pose from
`six_axis_robot.gd`. The **building materials** are not in the file either: the
wall and roof GLBs carry placeholder base colours and no images at all, because
Godot binds `.tres` materials to them by name at import time. Loading them as
authored gives a red and blue building. `app/lib/robot/warehouse.ts` makes the
same join Godot makes.

Two conventions had to be established before any of those numbers could be
trusted, and both are recorded in that file's header because both are easy to get
backwards: Godot's `Transform3D(...)` nine-float form assigns **rows**, not basis
vectors — checked against three independent joints whose stored bases had to
agree with the declared home angles — and `Node3D.rotation.y = x` **replaces** a
node's rotation rather than composing with it, which is why a joint pivot's saved
basis carries no information the chain needs.

The transcription was verified before it was wired into anything: the arm was
assembled offline from the GLB's real mesh bounds at the home pose and the links
come out continuous from the floor to the tool with no gaps (`Base` 0.01–0.35 m,
`Linkage01` 0.23–0.77, `Linkage02` 0.35–2.07, and so on to the plate at 3.38),
and the resulting tool-centre point matches the browser's readout to the
millimetre — 144 / 2277 / 850 mm. The silhouette was then compared against the
upstream editor's own thumbnail cache, which ships in the repository: the same
Z-fold, the same plate rake.

**The quadrotor sandbox.** Same MIT licence, and for one build this audit drew
the opposite conclusion on its art — because the difference is not the licence,
it is *where the files are*. Its aircraft, city, props and panorama are not in
the repository; they are fetched at runtime from `cdn.mint.gg`, generated by a
separate product (Mint MCP), and a repository's licence does not grant rights
over files it does not contain. Nobody has published terms for those artifacts.
So the first version of this lab took the code and generated the aircraft and
its course from primitives.

**That position was overruled by the project owner, and the models now ship.**
The reasoning is recorded here rather than quietly dropped: the ambiguity is
unchanged, the decision was the owner's to make, and `THIRD_PARTY_ASSETS.md`
carries an entry that says so plainly and lists every file. Removing them again
is a one-directory operation, which is why they are confined to
`public/asset/practice/drone/` and loaded through two modules.

Before processing, each of the nineteen models was checked against the
`byteSize` its own `mint-assets.json` records — all nineteen match, so these are
the artifacts that file describes. The repack de-interleaves their vertex
buffers, which is a layout change and is disclosed as one; it was verified by
re-measuring the four airframe parts against the bounds the sandbox's own
`assets/drone.ts` records for them, and all four agree to a millimetre.

On the code side much more came across than the flight core: the four-mode
camera, the pose interpolation the onboard view depends on, the rotor-disc
blur, the motion trail, the airframe fit table, and the city's design-height
table, footprint cap, block plan and measured-collider rule. What was left
behind: Rapier (1.1 MB of WASM to answer a question fifty box tests answer),
the 32-ray lidar and occupancy grid, the seven-aircraft roster, the tuning
panel and the plots. The lesson, the autopilot and the course are YooLab's.

---

## Summary

| Subject | Status | Source |
| --- | --- | --- |
| Sinh học | 5 live | 3 existing YooLab GLBs, 1 public-domain NIH mesh, 1 YooLab-authored procedural cell |
| Hóa học | 1 live, 1 planned | CC BY-SA / public-domain element data, YooLab UI |
| Vật lý | 1 live | YooLab implementation, PhysicsSims as architectural reference |
| Địa lý & Trái Đất | 1 live | Natural Earth (public domain), YooLab globe engine |
| Khoa học vũ trụ | empty, stated | no rights-clear source found |
| Lịch sử & Văn hóa | empty, stated | no rights-clear source found |
| KHCN & STEM | 2 live, 1 planned | existing YooLab Formula workshop and toolkit |
| Thực hành & STEM | 3 live | YooLab Formula workshop; the Open Industry warehouse and six-axis cell shipped under MIT with the rig and materials transcribed; the quadrotor sandbox's code adapted and its Mint art shipped on the owner's decision, with terms unstated and recorded as such |

Two of the four candidate cell meshes were rejected on licence grounds and two
subjects ship empty. One asset set — the Mint aircraft and city — ships with its
terms unresolved, on the project owner's explicit decision, and is labelled as
such in both this file and `THIRD_PARTY_ASSETS.md`. Both outcomes are deliberate: a stated gap costs a visitor
nothing, and a licence violation or a fake experience costs the product its
credibility.
