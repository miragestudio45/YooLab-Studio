# Third-party assets and data

Everything in this repository that came from outside YooLab, with its licence and
the attribution that licence requires. Nothing is listed here that is not
actually shipped in `public/` or bundled into `dist/`.

Provenance research and the reasoning behind each decision is in
[SOURCE_AUDIT.md](SOURCE_AUDIT.md).

---

## 3D models

### `public/asset/Library/Biology/gram-positive-wall.glb`

| | |
| --- | --- |
| Name | Gram Positive Bacterial Cell Wall Model |
| Author | A.C. Vinal, Wake Technical Community College |
| Licence | **Public Domain** (as declared by the NIH 3D entry metadata) |
| Origin | NIH 3D Print Exchange, entry [3DPX-010752](https://3d.nih.gov/entries/3DPX-010752) |
| Obtained via | `yuryuri/cell-architecture-studio` (MIT), which documents the NIH origin in `docs/ASSETS.md`; licence verified independently against the NIH 3D API |
| Modification | Renamed from `bacteria-wall-nih.glb`. Geometry untouched. The file carries no materials, so YooLab's `tissue` preset is applied at runtime in `ModelStage.tsx`. |
| Required attribution | The entry's `attributionInstructions` field asks for "A.C. Vinal, Wake Technical Community College". Carried in `app/lib/library/manifest.ts` (`credits`) and displayed to users in the Library's "Nguồn & giấy phép" panel. |

### `public/asset/T-rex/T-rex.glb`

| | |
| --- | --- |
| Name | Animated Tyrannosaurus Rex Dinosaur Running Loop |
| Author | **LasquetiSpice** ([sketchfab.com/LasquetiSpice](https://sketchfab.com/LasquetiSpice)) |
| Licence | **CC BY 4.0** — <http://creativecommons.org/licenses/by/4.0/> |
| Origin | [Sketchfab](https://sketchfab.com/3d-models/animated-tyrannosaurus-rex-dinosaur-running-loop-38007d947ae74dea83988cb0b08ee053) |
| Verified how | The file carries its own provenance: `asset.extras` in the GLB declares `author`, `license`, `source` and `title`, written by `glTF-Transform v4.3.0`. Nothing here was inferred from a page title. |
| Modification | None to the geometry, the rig or the five clips (`run`, `bite`, `roar`, `attack_tail`, `idle`). Two runtime adaptations, neither written back to the file: `ModelStage` maps the asset's `KHR_materials_pbrSpecularGlossiness` material onto metallic-roughness (three.js dropped that extension in r155, and without the mapping the hand-painted skin does not load at all), and it flattens the `bn_Spine` position track so the animal performs in place instead of walking out of the viewer. |
| Required attribution | CC BY 4.0 requires author, licence and source. All three are carried in `app/lib/library/subjects/biology.ts` (`credits` on the `trex` entry) and displayed to users under "Nguồn & giấy phép" in the Library's knowledge panel. |

### `public/asset/robotics/*.glb` — 3 robotics models ⚠️ **LICENCE NOT VERIFIED**

| | |
| --- | --- |
| Files | `work-drone.glb` (1,158 KB), `spider-drone.glb` (906 KB), `mech-whale.glb` (544 KB) |
| Source names | `Dv2 Animated 4 Skins Set.glb`, `Spider Drone Animations Reel.glb`, `Biomechanical Whale Animated.glb` |
| Author | **Unknown** |
| Licence | **Unknown** |
| Origin | Sketchfab, per the person who supplied them. The specific entries are not recorded. |
| Where used | The Education section's lesson player only — `app/lib/education/showcase.ts`. Deliberately **not** in the Library manifest, and they carry no `credits` block, because `app/lib/library/types.ts` requires a verified licence before an entry ships. |
| Obtained via | Hand-off into `reference-sources/Model -robot/`. |
| Verified how | **Not verified.** Unlike the T-rex above, none of the three carries `asset.extras` — `glTF-Transform` re-wrote each file and the only thing `asset` declares is its own generator, so there is no author, licence or source string inside the files to check. |
| Modification | `scripts/build-robotics-models.mjs`. **All three are now copied byte for byte.** `Dv2` used to be subsetted to its Cybertech subtree, and that was a defect rather than an economy: the source is four drones in one file — Cybertech, RedManga, SciFi and Wood — as four sibling subtrees at the origin at scales three orders of magnitude apart, and those scales are the file's **skin switch**. Each `Dummy00N` holds its drone at 1.5708 for one window of the 19.33 s reel and at its own near-zero value for the rest, so exactly one livery is on stage at a time (0.04–5.00 s Cybertech, 5.04–9.63 RedManga, 9.67–13.71 SciFi, 13.75–18.67 Wood). Keeping Cybertech's scale track while deleting the three siblings it takes turns with left a drone that was full size for 5.0 s of every 19.33 and 218× too small for the other 13.7 — measured in a real browser at `Dummy001` scale 0.0072, with the camera, contact shadow and grid all fitted against a 0.015 × 0.010 × 0.030 box. Shipping the file whole restores the authored behaviour and makes the twelve extra images load-bearing rather than dead weight. Two runtime adaptations, not written back: `ModelStage` flattens the root translation track on **all four** roots so each livery performs in place (root rotation is left alone — it reads as yaw plus a mild bank, not a tumble), and the `natural` preset calibrates the file's own materials. |
| **What is needed** | Three lines per model — the Sketchfab entry URL, the author's name and the licence it is published under. Sketchfab is a marketplace, not a licence: its entries ship under everything from CC0 to "editorial use only" to a paid royalty-free licence with attribution terms, and CC BY needs attribution rendered where a user can see it. **Until those three lines exist for each file, treat these as unlicensed and do not ship this section to production.** Once known, add the `credits` blocks in `showcase.ts` and the entries can move into `app/lib/library/subjects/stem.ts` unchanged. |

A fourth model, `Smart Drone.glb`, was prepared and then dropped rather than
fixed. Its texture atlas carries another company's wordmark — 完美世界 (Perfect
World) with three emoji — painted across the disc on the front of the machine, at
the exact centre of the composition. A third party's branding rendered full size
on a product page is a trademark question rather than a copyright one, and it is
not a question worth answering when a clean model was available: the Dv2 above
replaced it and its Cybertech atlas carries no marks of any kind.

### `public/asset/Library/Biology/anatomy/*.glb` — 12 human organs

| | |
| --- | --- |
| Name | Human Reference Atlas 3D Reference Object Library — Visible Human Male reference objects, release **v1.2** |
| Files | `heart`, `lungs`, `brain`, `eye`, `liver`, `gallbladder`, `pancreas`, `small_intestine`, `intestine`, `kidney`, `spleen`, `thymus` — 6.4 MB total |
| Authors | Heidi Schlehlein, Bruce W. Herr II, Ellen M. Quardokus, Andreas Bueckle, Katy Börner |
| Publisher | Human BioMolecular Atlas Program (**HuBMAP**) |
| Licence | **CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/> |
| Origin | [humanatlas.io/3d-reference-library](https://humanatlas.io/3d-reference-library) |
| Obtained via | [`HongChao6/open-anatomy-studio`](https://github.com/HongChao6/open-anatomy-studio) (MIT code, commit `8c0e6f3`… `origin/HEAD` at retrieval), whose own `THIRD_PARTY_ASSETS.md` records the HRA origin, the v1.2 release, the CC BY 4.0 terms, the Meshopt optimisation step and the intermediary it came through ([`tejasghalsasi/anatomy-atelier@1da7761`](https://github.com/tejasghalsasi/anatomy-atelier/tree/1da776126a81dd803fd12d22e6723522db3bb3b5/public/models)) |
| Verified how | The upstream record publishes SHA-256 checksums for three of the twelve files. All three were recomputed against the bytes actually committed here and **match**: `gallbladder.glb` `0d3fa986…dc9da3`, `small_intestine.glb` `2a96d7d5…e094df`, `thymus.glb` `5b355875…66d448`. So the provenance record describes these exact files, not a similar set. |
| Modification | **None to any geometry, and nothing written back to any file.** The twelve GLBs are redistributed byte-identical to the intermediary's Meshopt-compressed versions, and filenames are kept exactly as that intermediary set them rather than renamed to the Vietnamese titles, so the published checksums keep pointing at the right files. Everything below is a **runtime** adaptation in `ModelStage`'s `organ` preset, applied to the loaded materials only: (1) every file requires `EXT_meshopt_compression` and `KHR_mesh_quantization`, which the shared loader already registers; (2) each material is re-made as physical to add a wet specular sheen while keeping the mesh's own anatomical `baseColorFactor`, its `map` and its `COLOR_0` vertex colours — the heart, lungs, thymus and eye carry their colour in that attribute rather than in the factor, and the eye carries it *only* there plus a shared palette atlas; (3) two meshes that are closed opaque envelopes around the parts the model exists to show — `VH_M_kidney_capsule_L` and `VH_M_sclera_L` — are rendered translucent, which is disclosed in both entries' own on-screen description; (4) a chroma ceiling is applied so no surface exceeds a tissue-plausible saturation. Ten of the twelve are unaffected. It moves exactly two authored values, both of which are diagram colours rather than tissue colours: `Gall_Mat` is `rgb(0,136,0)` — pure green with the red and blue channels at zero — and the `retina` material inside `brain.glb` is a highlighter yellow. Hue is preserved in both; only the saturation comes down. |
| Required attribution | CC BY 4.0 requires author, licence and source. All three are carried in `app/lib/library/subjects/human-body.ts` (`HRA_CREDIT`, one block shared by all twelve entries) and displayed to users under "Nguồn & giấy phép" in the Library's knowledge panel. |
| Scope disclosure | Three titles deliberately do **not** name a whole organ, because three of the meshes are not one. Upstream records that `small_intestine.glb` contains `VH_M_ileum` and `thymus.glb` contains `VH_M_thymus_lobe_L`, so the Library calls them **"Hồi tràng"** and **"Thùy tuyến ức trái"**, and both say so in their own `subtitle`, `description` and readout. `kidney.glb` is the left kidney and is titled "Thận" with the side named in its subtitle. A teaching model that overstates what it shows is worse than no model. |

### `public/asset/practice/*` — REMOVED, and one open risk closed with them

Two entries used to stand here: the Open-Industry robot cell (nine models,
twenty texture maps, MIT) and the Mint drone pack (twenty files, terms not
stated). **Both sets of files are deleted from this repository.** The three
practice experiences are separate deployments now and this page embeds them —
see DESIGN.md §12b — so nothing under `public/asset/practice` is a third-party
model any more. What remains there is 452 kB of WebP posters, listed in the
"ours" table below.

The MIT set needed no further action: the licence permitted redistribution, the
notice travelled with the files in `public/asset/practice/robot/LICENSE`, and
removing the files removes the obligation along with them.

**The drone set is the one worth recording.** It was the single entry in this
file whose terms were never established. The models were fetched from
`cdn.mint.gg` and are *not* in the Mint Playground repository — that repo's
`asset-manifest.json` declares `"assets": []` — so its MIT grant did not reach
them, and Mint publishes no terms for the CDN artifacts. This project's standing
rule is not to ship art whose terms are unverified; the position was put to the
project owner, who reviewed it and directed that the real models be used anyway.
That was theirs to decide and the row said so.

It is now moot. The files are gone, no unlicensed geometry is served from this
origin, and the experience a visitor reaches is a build at
`yoox-drone-iota.vercel.app` whose own asset provenance is that deployment's
record to keep, not this one's. **Whoever owns that deployment inherits the
question**: if any of the Mint models are in it, the same unestablished terms
apply there, and this paragraph is the pointer to why.

Both entries in full — names, checksummed verification, the geometry-preservation
notes and the 108.9 MB → 8.1 MB and 20.1 MB → 4.6 MB processing records — are in
this file's git history, at the commit before the practice section was rebuilt.

### `public/asset/robotics/*.glb` — ⚠️ PROVENANCE NOT ESTABLISHED### `public/asset/robotics/*.glb` — ⚠️ PROVENANCE NOT ESTABLISHED

**This is the one entry in this file that does not clear its own bar, and it is
here to say so rather than to record a clearance.** Every other row above names
an author, a licence and a source that was checked. These three name none,
because none arrived with them.

| | |
| --- | --- |
| Files | `smart-drone.glb` (784 KB), `spider-drone.glb` (906 KB), `mech-whale.glb` (544 KB) |
| Author | **Unknown** |
| Licence | **Unknown** |
| Origin | **Unknown.** Handed over as three files in `reference-sources/Model -robot/`, named `Smart Drone.glb`, `Spider Drone Animations Reel.glb` and `Biomechanical Whale Animated.glb`. |
| What the files themselves say | Nothing. All three were written by `glTF-Transform v4.3.0` and carry `asset.generator` and `asset.version` only — no `asset.extras`, which is where the T-rex above carries its own author, licence and source. Their internal names (`b8d0a9c282cc4ca1b4fd778dc0924ae3.fbx`, `Smart_Drone.FBX`) are export artefacts, not attribution. |
| Where they are used | The Education section's lesson player, and nowhere else. They are deliberately **not** in the Library manifest — see `app/lib/education/showcase.ts`, which states the same reason: `lib/library/types.ts` requires that "an asset whose licence has not been verified does not get an entry — it does not ship". |
| Modification | Copied byte for byte by `scripts/build-robotics-models.mjs`, except for one patch to `smart-drone.glb`. Its 2048² base-colour atlas carried a **game studio's wordmark and three emoji** painted onto the display panel that faces the camera, which at the size the page renders it is a legible foreign logo in the middle of a YooLab product page. The script paints that rectangle out in the panel's own interior tone and re-encodes the atlas to WebP (q84, 170,522 → 154,548 bytes), splicing it back at the same byte offset so the meshopt-compressed views around it are untouched. Geometry, rig and animation are unchanged in all three. |
| Runtime | `natural` preset — all three ship real base-colour, normal and ORM maps, and any other preset would discard them. Each carries one clip (`Scene`), and each has its root joint's translation track flattened at load (`Move_Body`, `Main body driver`, `Core_bone`) so the machine performs on the spot instead of travelling out of the viewer. |
| **What has to happen before this ships** | Find the author, the licence and the source, and record them here. Then either add a `credits` block to the three entries in `app/lib/education/showcase.ts` and move them into `subjects/stem.ts`, or replace them. Note that painting a logo out is a **visual** fix and not a licence: if the terms turn out to require attribution or to forbid modification, the patch above is itself a problem and the right answer is a different model. |

### Models **not** shipped, and why

Two further NIH meshes were available through the same repository and were
rejected after checking their licences:

| Model | NIH entry | Licence | Decision |
| --- | --- | --- | --- |
| Animal Cell | [3DPX-015797](https://3d.nih.gov/entries/3DPX-015797) | CC-BY-NC-SA | Rejected — NonCommercial |
| Neuron | [3DPX-015796](https://3d.nih.gov/entries/3DPX-015796) | CC-BY-NC-SA | Rejected — NonCommercial |

They are recorded here so nobody re-adds them later believing the MIT licence of
the surrounding repository covered them. It does not.

Nine further meshes were rejected in the 2026-08-28 pass, from
`reference-sources/anatomy/public/models/` — `heart`, `brain`, `lungs`, `liver`,
`kidneys`, `eyeball`, `intestine`, `pancreas`, `skin`, plus the painted
illustration set in `public/anatomy/*/`:

| Model set | Licence | Decision |
| --- | --- | --- |
| 9 human organ GLBs + 45 organ illustrations | **None findable** | Rejected — unverifiable |

The reason is that there is nothing to verify against. The surrounding repository
declares no licence, its README is an unmodified `vinext-starter`, it ships no
`THIRD_PARTY` file, and unlike the T-rex above **none of the nine GLBs carries any
`asset.extras`** — every one reports only `{"generator":"glTF-Transform v4.4.2"}`.
So the author is unknown, the origin is unknown, and the commercial-use rights are
unknown, which is exactly the condition PRODUCT.md forbids shipping under.

**Resolved, and not by relaxing the rule.** The organs were the obvious next
expansion of the biology shelf, and this row was written asking whoever supplied
that repository to name the source of those nine files. The answer was better than
that: a different repository, carrying the **Human Reference Atlas** set under a
licence that is published, specific and checkable — recorded above, and now
shipping as twelve entries. The nine unverifiable files stay rejected and stay on
this list, because the reason they were rejected has not changed and the next
person to find them sitting in `reference-sources/` should read this before
reaching for them. `app/lib/library/subjects/human-body.ts` repeats the reasoning
at the point where somebody would be tempted.

---

## Textures

### `public/asset/valley/flowers/pool_summer.png` — 8x7 flower atlas

| | |
| --- | --- |
| Name | `pool_summer.png`, a 1500x1312 sheet of 56 photographic plant cut-outs — four rows of blooms, two of grasses and foliage, one of dried leaves |
| Licence | **Not stated.** See the warning below. |
| Origin | `reference-sources/flower-valley/assets/valley/flowers/pool_summer.png`, supplied to this repository as a working reference implementation of the hero's flower valley |
| Obtained via | Copied verbatim from that folder. `pool_winter.png` from the same folder is **not** shipped: its cells are painted on opaque near-black grounds, which read as dark blobs on YooLab's ivory hero, so the renderer never loads it. |
| Modification | None to the file. At load the renderer slices it into 56 tiles and grades each one — `saturate(0.95) contrast(0.97)` plus a 9% ivory wash — for the light page. Nothing is written back. |
| Attribution | None available to give. |

> **This is the one asset in this repository whose licence has not been
> verified, and it should not ship to production until it has been.**
>
> The reference folder carries a `README.md` and a `CLAUDE_INTEGRATION.md` and
> neither states an author, a source or a licence for the sheet, so there is
> nothing here to verify against. The cut-outs are photographic, which means they
> are somebody's photographs. Every other row in this file exists because a
> licence was checked before the file was committed; this row exists to say that
> for this one, it was not — the sheet was handed over as the visual source of
> truth for the hero and integrating it was the task.
>
> Whoever owns the sheet needs to confirm its terms, or it needs replacing with
> plant photography whose commercial-use rights are verifiable. The renderer does
> not care which sheet it slices: `atlasUrl` in `FlowerValleyOptions` is the only
> reference to the path, and any 8x7 sheet with the same row semantics drops in.

---

## Data

### `public/data/periodic-elements.json` — 118 elements

| | |
| --- | --- |
| Licence | **CC BY-SA 4.0** (Periodic-Table-JSON) and **public domain** (PubChem) |
| Sources | [Bowserinator/Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON) · [PubChem periodic table](https://pubchem.ncbi.nlm.nih.gov/periodic-table/) (NIH) |
| Obtained via | `mintdotgg/mint-playground` → `experiences/periodic-table/src/data/elements.json`, whose `THIRD_PARTY_NOTICES.md` records the same provenance |
| Modification | Long English `summary` prose removed; the remaining factual and numeric fields kept verbatim. Vietnamese labels and category naming added by YooLab in `app/lib/chemistry/elements.ts`. |
| Attribution | Kept in the file's own `_source` field, in the Library credits panel, and here. The upstream CC BY-SA terms continue to apply to the data; they are not relicensed by anything in this repository. |

### `public/data/world-110m.json` — 177 countries

| | |
| --- | --- |
| Name | Natural Earth, 1:110m Admin 0 Countries |
| Authors | Tom Patterson and Nathaniel Vaughn Kelso, with contributors |
| Licence | **Public domain.** "No permission is needed to use Natural Earth." |
| Origin | https://www.naturalearthdata.com · [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) |
| Modification | Outer rings only; Ramer–Douglas–Peucker simplification at 0.35°; coordinates quantised to 1/32° and delta-encoded. 839 kB → 92 kB. Attribute set reduced to name (`NAME_VI` and `NAME`), ISO code, continent, sub-region, population, GDP and label point. |
| Attribution | Not required by the licence. Given anyway — "Made with Natural Earth" — in the file's `_source` field, in the Library credits panel, and here. Vietnamese country names are the dataset's own `NAME_VI` values. |

---

## Code

| Project | Licence | Used how |
| --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | MIT | npm dependency. Draco decoder binaries redistributed under the same licence in `public/asset/draco/`. |
| [React](https://github.com/facebook/react), [Next.js](https://github.com/vercel/next.js), [Vite](https://github.com/vitejs/vite), [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | npm dependencies. |
| [CloudyLo001 / mintdotgg periodic table](https://github.com/mintdotgg/mint-playground) | MIT | **No code copied.** Studied as an architectural reference for the periodic-table experience; YooLab's implementation is a rewrite. Credited because the element dataset was obtained through it and because the experience design informed ours. |
| [IlliniOpenEdu/PhysicsSims](https://github.com/IlliniOpenEdu/PhysicsSims) | MIT | **No code copied.** Studied for simulation-module architecture. `ProjectileLab.tsx` is a YooLab implementation. |
| [yuryuri/cell-architecture-studio](https://github.com/yuryuri/cell-architecture-studio) | MIT | **No code copied.** Studied for specimen/organelle information architecture; supplied the public-domain GLB above. |
| [HongChao6/open-anatomy-studio](https://github.com/HongChao6/open-anatomy-studio) | MIT | **No code copied.** The intermediary the twelve Human Reference Atlas organ meshes were obtained through, and the reason their provenance is checkable: its own `THIRD_PARTY_ASSETS.md` records the HRA release, the CC BY 4.0 terms, the Meshopt step and the SHA-256 checksums that were recomputed here. The meshes are HuBMAP’s under CC BY 4.0, not this repository’s under MIT — credited above accordingly. |
| [mintdotgg/mint-playground — `quadrotor-sandbox`](https://github.com/mintdotgg/mint-playground/tree/main/experiences/quadrotor-sandbox) | MIT (code) | **REMOVED — no longer in this repository.** `app/lib/drone/*` is deleted along with the art; the drone experience is a separate deployment (DESIGN.md §12b) and its provenance is that deployment's record. The row is kept because the adaptation shipped from here for several builds and the history has to stay legible. What it said at the time: **Code adapted; art taken from its CDN under unstated terms — see the model entry above.** The flight core in `app/lib/drone/flight.ts` is derived from this experience: the six-degree-of-freedom rigid-body integrator, the first-order motor lag, the control-allocation mixer, the derivative-on-measurement PID with conditional integration, the cascaded position→velocity→attitude→rate controller, the seeded sinusoidal wind model and the sink-rate landing grades. Its own upstream is [`CloudyLo001/quadrotorsim`](https://github.com/CloudyLo001/quadrotorsim) at `a6f968c`, whose `UPSTREAM.md` records that the developer approved publication of the Playground adaptation under that mirror's MIT licence. Further modules adapted since: the four-mode camera (`view.ts` — chase-on-heading, the pose interpolation the onboard view needs, the bolted-to-the-airframe onboard rule and its stabilised/raw horizon switch), the rotor-disc blur and the fixed-spatial-interval motion trail (`fx.ts`), the airframe fit table and assembly (`airframe.ts`), and the city's design-height table, footprint cap, block plan and measured-collider rule (`city.ts`). YooLab retunes the airframe to a lighter trainer, drops acro and stabilized modes, replaces the release-position hold with a brake-to-stop anchor, and adds the lesson, the autopilot and the course. Deliberately not carried over: Rapier (1.1 MB of WASM to answer a question fifty axis-aligned boxes answer in fifty comparisons), the 32-ray lidar and occupancy grid, the seven-aircraft roster, the tuning panel and the plots. |
| [Open-Industry-Project](https://github.com/Open-Industry-Project/Open-Industry-Project) | MIT | **REMOVED — no longer in this repository.** The models, their textures and `app/lib/robot/*` are all deleted; the robot experience is a separate deployment (DESIGN.md §12b). Kept for history. What it said at the time: **Assets shipped and rig data adapted** — see the model entry above for the two GLBs and their textures, which are redistributed under this licence with the notice beside them. The code side: `app/lib/robot/sixAxis.ts` transcribes the arm's joint hierarchy from `parts/SixAxisRobot.tscn` (every pivot offset, every mesh placement) and its behaviour from `src/SixAxisRobot/six_axis_robot.gd` — the six-axis layout (base yaw, shoulder, elbow, forearm roll, wrist pitch, tool roll), the ±180/±135/±160/±180/±120/±360 degree joint-limit table, the home pose `[0, −45, 90, 25, 75, 0]`, the rate-limited joint interpolation, the shoulder hydraulic strut's aim-at-each-other controller, the suction plate's 5 × 5 cup grid from `parts/EOATSuction.tscn`, and the teach-a-point-then-replay model the lab's pendant is built on. No GDScript is copied — it is Godot, and a Godot editor cannot be embedded in a Next.js page — but the numbers are theirs and the credit is owed for them. The cell around the arm (conveyor, pallet, racking, guarding, floor markings, beacon) is re-authored in Three.js in `app/lib/robot/cellScene.ts`, because upstream generates all of that procedurally too and there is no conveyor asset to import. The analytic tool-down IK replaces its iterative CCD solver, and its OPC-UA / EtherNet/IP / Modbus stack is deliberately not modelled. |
| [thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy) | **No licence declared** | **Nothing taken** — no code, no CSS, no fonts, no models, no prose. Visual and UX architecture reference only: what a specimen readout is *made of* (a measured table led by per-row marks, a scientific note and a curiosity note in two tints, a list of real-world links), which are categories rather than content. Every sentence in YooLab's panels is written here, about specimens this repository ships. Its nine organ GLBs were **rejected** — see "Models **not** shipped, and why" above. |

## Fonts

| Family | Licence | Delivery |
| --- | --- | --- |
| Inter, Inter Tight, Instrument Serif | SIL Open Font License 1.1 | Loaded from Google Fonts at runtime; not vendored. |

---

## Assets authored by YooLab

For completeness, so that the boundary is unambiguous. These are ours and carry
no third-party terms:

- `public/asset/bee/*`, `public/asset/fish/*`, `public/asset/Library/Car/*` — the
  bee, clownfish, jellyfish, Formula car, sprue and the eight-piece toolkit,
  including all their textures.
- **The eighteen lesson covers under `public/asset/Library/cover/`.** Renders of
  meshes already listed in this file, produced by
  `scripts/bake-library-covers.mjs` through this project's own thumbnail
  pipeline. They carry no terms of their own beyond the ones their source meshes
  carry — twelve are the HuBMAP organs, which are **CC BY 4.0**, so the
  attribution obligation for those renders is the same obligation the entries
  already discharge in the Library's knowledge panel (`HRA_CREDIT` in
  `subjects/human-body.ts`). A render of a CC BY model is a derivative of it, and
  the credit travels with the entry the cover belongs to.
- The three studio renders under `public/asset/practice/poster/`, derived from
  `public/asset/thuc-hanh/renew/` by `scripts/build-practice-posters.mjs`. These
  are the whole of what this section now ships: the flight model, the palletising
  cell and the excavator's hydraulics all live in separate deployments (DESIGN.md
  §12b), and the code that used to implement them here — `lib/drone`, `lib/robot`
  and the three lab components — is deleted.
- The procedural animal cell in `CellStudio.tsx` — every organelle generated from
  Three.js primitives at runtime; no mesh file involved.
- The globe engine in `GlobeExplorer.tsx`, which renders the public-domain
  Natural Earth coordinates listed above.
- The projectile integrator in `ProjectileLab.tsx`.
- The periodic-table interface and atom scene in `PeriodicTable.tsx`.
- The `BrandMark` component, generated by `scripts/build-brand-mark.mjs`.
  The vectors it reads — `public/brand/yoolab-logo.svg` and
  `public/brand/yoolab-icon.svg` — are the client's own brand files, supplied
  by them and not third-party.
