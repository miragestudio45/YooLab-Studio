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

### Models **not** shipped, and why

Two further NIH meshes were available through the same repository and were
rejected after checking their licences:

| Model | NIH entry | Licence | Decision |
| --- | --- | --- | --- |
| Animal Cell | [3DPX-015797](https://3d.nih.gov/entries/3DPX-015797) | CC-BY-NC-SA | Rejected — NonCommercial |
| Neuron | [3DPX-015796](https://3d.nih.gov/entries/3DPX-015796) | CC-BY-NC-SA | Rejected — NonCommercial |

They are recorded here so nobody re-adds them later believing the MIT licence of
the surrounding repository covered them. It does not.

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
| [thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy) | **No licence declared** | **Nothing taken** — no code, no CSS, no fonts, no models. Visual and UX architecture reference only. |

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
- The procedural animal cell in `CellStudio.tsx` — every organelle generated from
  Three.js primitives at runtime; no mesh file involved.
- The globe engine in `GlobeExplorer.tsx`, which renders the public-domain
  Natural Earth coordinates listed above.
- The projectile integrator in `ProjectileLab.tsx`.
- The periodic-table interface and atom scene in `PeriodicTable.tsx`.
- `public/brand/yoolab-mark.svg` and the `BrandMark` component.
