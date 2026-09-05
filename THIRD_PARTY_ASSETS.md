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
| Files | `work-drone.glb` (337 KB), `spider-drone.glb` (906 KB), `mech-whale.glb` (544 KB) |
| Source names | `Dv2 Animated 4 Skins Set.glb`, `Spider Drone Animations Reel.glb`, `Biomechanical Whale Animated.glb` |
| Author | **Unknown** |
| Licence | **Unknown** |
| Origin | Sketchfab, per the person who supplied them. The specific entries are not recorded. |
| Where used | The Education section's lesson player only — `app/lib/education/showcase.ts`. Deliberately **not** in the Library manifest, and they carry no `credits` block, because `app/lib/library/types.ts` requires a verified licence before an entry ships. |
| Obtained via | Hand-off into `reference-sources/Model -robot/`. |
| Verified how | **Not verified.** Unlike the T-rex above, none of the three carries `asset.extras` — `glTF-Transform` re-wrote each file and the only thing `asset` declares is its own generator, so there is no author, licence or source string inside the files to check. |
| Modification | `scripts/build-robotics-models.mjs`. The whale and the spider are copied byte for byte. `Dv2` is subsetted: the source is four drones in one file — Cybertech, RedManga, SciFi and Wood — as four sibling subtrees at the origin at scales three orders of magnitude apart, so all four render at once. Only the Cybertech subtree survives, with the twelve images belonging to the other three dropped; 1,158 KB → 337 KB. Nothing is decompressed, and no meshopt block is re-encoded — the subset moves byte ranges and rewrites the offsets that name them. Two runtime adaptations, not written back: `ModelStage` flattens each reel's root translation track so the machine performs in place, and the `natural` preset calibrates the file's own materials. |
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

### `public/asset/practice/robot/*` — the robot cell and the warehouse around it

| | |
| --- | --- |
| Name | Nine models and twenty texture maps: `Six-Axis_01` articulated robot, `EOAT_Suction` vacuum end effector, `Wall_A` / `Wall_D` building sections, `Roof_A` roof bay, `Floor` slab, `Light_A` high-bay fixture, `Pallet` and `AGV` |
| Author | **Automation Standard LLC and Contributors** |
| Licence | **MIT** — <https://github.com/Open-Industry-Project/Open-Industry-Project/blob/main/LICENSE> |
| Origin | [Open-Industry-Project](https://github.com/Open-Industry-Project/Open-Industry-Project), `assets/3DModels/` — `Six-axis/`, `EOATSuction/`, `WallsAndRoof/`, `Pallet.glb`, `AGV/` |
| Verified how | The repository carries one MIT `LICENSE` at its root with **no separate carve-out for `assets/`**, and its `README.md` states the terms once, for the project as a whole. So the grant covers these files on the same terms as the code, which is what makes them shippable here where the `quadrotor-sandbox` art was not — that art lives on a CDN outside its repository and is not covered by that repository's licence. |
| Modification | **Geometry: none.** No vertex is moved, welded, decimated or re-indexed in any of the nine models. `scripts/build-robot-model.mjs` does two things. *(1)* It removes four vertex attributes and repacks the buffer: `COLOR_0` and `COLOR_1` (Godot writes custom per-vertex data into these, and glTF says a `COLOR_n` slot is a vertex colour — so `GLTFLoader` sets `vertexColors: true` and three.js multiplies the base colour by whatever those channels hold, rendering the model in a colour nobody painted; removing them is a **correctness** fix), `TEXCOORD_1` (a lightmap UV set nothing here samples) and `TANGENT` (three.js differentiates the normal map in the fragment shader instead). Positions, normals, `TEXCOORD_0` and indices are copied byte for byte, and the script asserts rather than guesses when it meets anything it does not handle. *(2)* It re-encodes textures. `Pallet.glb` carries 13.7 MB of embedded 4K PNGs for 3,144 triangles and `AGV.glb` 18.2 MB for 54,278 — those are resampled in place to WebP at 1024². The wall, roof, floor and light kit reference external `.tres` materials instead, so their texture sets are exported separately to WebP at 256–1024² and re-bound by material name at runtime. Across everything: **108.9 MB → 8.1 MB, 93% smaller, triangle counts unchanged.** Nothing is written back to the reference copies under `reference-sources/`. |
| Required attribution | MIT requires the copyright notice and the permission notice to travel with the files. Both are reproduced in `public/asset/practice/robot/LICENSE`, beside the models. The author and licence are also named in `app/lib/robot/sixAxis.ts` and shown to users in the lab. |
| Rig disclosure | Two things these GLBs do **not** contain, both supplied from other files in the same MIT project. *(a)* The arm's joint hierarchy: the GLB is nine loose meshes, and the chain is transcribed from `parts/SixAxisRobot.tscn` into `app/lib/robot/sixAxis.ts` pivot by pivot, with the joint-limit table and home pose from `src/SixAxisRobot/six_axis_robot.gd`. *(b)* The building's materials: `Wall_A.glb` and friends carry placeholder base colours and no images at all — Godot binds `.tres` materials to them by name at import — so `app/lib/robot/warehouse.ts` makes the same join, `Wall_01` → `BuildingPart_Wall_01_*`. Both are code adapted from an MIT project and are credited in the Code table below. |
| Runtime tint | The building materials carry a colour multiplier over their base-colour maps. Godot renders these through its own tonemapper; three.js here uses ACES at 0.92 exposure, and the same albedo comes out several stops brighter — untinted, galvanised siding reads as white plastic. The textures are unmodified; the tint corrects for the engine, not for the art. |

### `public/asset/practice/drone/*` — the aircraft, the city and the sky

| | |
| --- | --- |
| Name | Twenty files: the `drone-quad` pack (fuselage, motor arm, propeller, landing skid, camera pod), the `city-buildings` pack (eight façades), the `yard-props` pack (six industrial props) and the `sky-backdrop` mountain panorama |
| Author | Generated with [Mint MCP](https://mcp.mint.gg/) for [Mint Playground](https://play.mint.gg/quadrotor-sandbox); no individual author is named |
| Licence | **Not stated.** This is the one entry in this file whose terms are not established — see the honesty note. |
| Origin | `cdn.mint.gg`, addressed by the `runtimeUrl` fields in [`experiences/quadrotor-sandbox/mint-assets.json`](https://github.com/mintdotgg/mint-playground/blob/main/experiences/quadrotor-sandbox/mint-assets.json) |
| Honesty note | These files are **not in the sandbox's repository** — its own `asset-manifest.json` declares `"assets": []`, and the experience fetches them at runtime. So that repository's MIT licence, which covers "the Software and associated documentation files", does not reach them, and Mint publishes no terms for the CDN artifacts themselves. This project's standing rule is not to ship art whose terms are unverified, and an earlier build of this lab honoured that by generating the aircraft and its course from Three.js primitives instead. **The project owner reviewed that position and directed that the real models be used.** That is theirs to decide; this row exists so the position is on the record rather than lost, and so that reversing it later is a one-directory operation. |
| Verified how | Every model was checked against the `byteSize` recorded for it in `mint-assets.json` before being processed — all nineteen match exactly, so these are the artifacts that file describes and not something else served at those URLs. |
| Modification | **No geometry changed** — no vertex moved, welded, decimated or re-indexed, and every triangle count is unchanged. Two things are done, both by `scripts/build-drone-assets.mjs`. *(1) De-interleaving*: these GLBs pack position, normal and UV into one strided buffer view, and the repacker writes each attribute out tightly instead. The bytes are identical; the layout is not, and it is disclosed because it is a real change to the file. Verified afterwards by re-measuring all four airframe parts against the bounds the sandbox's own `assets/drone.ts` records for them — 0.971 × 0.260 × 0.998 for the fuselage and so on, matching to the millimetre. *(2) Texture re-encoding*: each model embeds three PBR maps, which is where the megabyte goes — `setback-tower` is 1.75 MB for 4,103 triangles. They are resampled and re-encoded to WebP at 512² (airframe, which the onboard camera sits inside), 384² (props) and 256² (buildings, never closer than 30 m). The panorama goes to 2048 × 1024 WebP. Total **20.1 MB → 4.6 MB, 77% smaller.** |
| Source files | Downloaded into `.cache/mint/` (gitignored) and re-fetchable from the URLs in `mint-assets.json`; only the processed output under `public/asset/practice/drone/` is committed. |
| Files | `fuselage-normalized-6522f19fea2b75a9.glb`, `motor-arm-normalized-6fef996b69c9ac52.glb`, `propeller-normalized-e08127e92a577c02.glb`, `landing-skid-normalized-451b7f833b22aabd.glb`, `camera-pod-normalized-dbc7f71872911c6a.glb`, `glass-tower-normalized-7fcdce95838dd939.glb`, `setback-tower-normalized-797ce47c71e3bdd3.glb`, `corner-office-normalized-214b2fef93ded224.glb`, `apartment-block-normalized-785c7ebf0af12916.glb`, `podium-tower-normalized-84a8a66352e8753b.glb`, `concrete-mid-rise-normalized-d8104d81b8b2906a.glb`, `storefront-block-normalized-6444a878987a7e4f.glb`, `hotel-tower-normalized-a6dfd731c01aaf06.glb`, `shipping-container-normalized-16a139c1ee46ff53.glb`, `scaffold-tower-normalized-5034d54bbc0818d9.glb`, `concrete-barrier-normalized-4e1219aceea984ac.glb`, `cable-drum-normalized-83782e35ffc8a817.glb`, `antenna-mast-normalized-54051007d20b1b55.glb`, `traffic-cone-normalized-9c4e797c99aae7db.glb`, `mountain-horizon-panorama-7c9f3e-069d64edae2fdf24.png` |

### `public/asset/robotics/*.glb` — ⚠️ PROVENANCE NOT ESTABLISHED

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
| [mintdotgg/mint-playground — `quadrotor-sandbox`](https://github.com/mintdotgg/mint-playground/tree/main/experiences/quadrotor-sandbox) | MIT (code) | **Code adapted; art taken from its CDN under unstated terms — see the model entry above.** The flight core in `app/lib/drone/flight.ts` is derived from this experience: the six-degree-of-freedom rigid-body integrator, the first-order motor lag, the control-allocation mixer, the derivative-on-measurement PID with conditional integration, the cascaded position→velocity→attitude→rate controller, the seeded sinusoidal wind model and the sink-rate landing grades. Its own upstream is [`CloudyLo001/quadrotorsim`](https://github.com/CloudyLo001/quadrotorsim) at `a6f968c`, whose `UPSTREAM.md` records that the developer approved publication of the Playground adaptation under that mirror's MIT licence. Further modules adapted since: the four-mode camera (`view.ts` — chase-on-heading, the pose interpolation the onboard view needs, the bolted-to-the-airframe onboard rule and its stabilised/raw horizon switch), the rotor-disc blur and the fixed-spatial-interval motion trail (`fx.ts`), the airframe fit table and assembly (`airframe.ts`), and the city's design-height table, footprint cap, block plan and measured-collider rule (`city.ts`). YooLab retunes the airframe to a lighter trainer, drops acro and stabilized modes, replaces the release-position hold with a brake-to-stop anchor, and adds the lesson, the autopilot and the course. Deliberately not carried over: Rapier (1.1 MB of WASM to answer a question fifty axis-aligned boxes answer in fifty comparisons), the 32-ray lidar and occupancy grid, the seven-aircraft roster, the tuning panel and the plots. |
| [Open-Industry-Project](https://github.com/Open-Industry-Project/Open-Industry-Project) | MIT | **Assets shipped and rig data adapted** — see the model entry above for the two GLBs and their textures, which are redistributed under this licence with the notice beside them. The code side: `app/lib/robot/sixAxis.ts` transcribes the arm's joint hierarchy from `parts/SixAxisRobot.tscn` (every pivot offset, every mesh placement) and its behaviour from `src/SixAxisRobot/six_axis_robot.gd` — the six-axis layout (base yaw, shoulder, elbow, forearm roll, wrist pitch, tool roll), the ±180/±135/±160/±180/±120/±360 degree joint-limit table, the home pose `[0, −45, 90, 25, 75, 0]`, the rate-limited joint interpolation, the shoulder hydraulic strut's aim-at-each-other controller, the suction plate's 5 × 5 cup grid from `parts/EOATSuction.tscn`, and the teach-a-point-then-replay model the lab's pendant is built on. No GDScript is copied — it is Godot, and a Godot editor cannot be embedded in a Next.js page — but the numbers are theirs and the credit is owed for them. The cell around the arm (conveyor, pallet, racking, guarding, floor markings, beacon) is re-authored in Three.js in `app/lib/robot/cellScene.ts`, because upstream generates all of that procedurally too and there is no conveyor asset to import. The analytic tool-down IK replaces its iterative CCD solver, and its OPC-UA / EtherNet/IP / Modbus stack is deliberately not modelled. |
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
- The drone course in `app/lib/drone/course.ts` — pads, gates, hoop and the H,
  all Three.js primitives. **The aircraft, the city, the props and the sky are
  not ours** — see the Mint entry above, including the note on its terms.
- The drone autopilot in `app/lib/drone/autopilot.ts` — the guidance law that
  flies the course by moving the sticks through the ported controller.
- The palletising cell around the robot arm in `app/lib/robot/cellScene.ts` —
  conveyor, racking, mesh guarding, floor markings, stack light and cases, all
  procedural, as upstream also generates them. **The arm, the building, the
  floor, the pallet and the AGV are not ours** — they are the Open-Industry
  models listed above.
- The three studio renders under `public/asset/practice/poster/`, derived from
  `public/asset/thuc-hanh/` by `scripts/build-practice-posters.mjs`.
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
