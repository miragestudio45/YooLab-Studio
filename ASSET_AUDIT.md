# Asset audit

Audit ngày 2026-08-22. `Used` nghĩa là có request/reference trực tiếp từ code hiện tại; `Audit only` nghĩa là giữ để truy vết HAR nhưng không được app fetch; `Unused` nghĩa là không có runtime reference.

## Runtime assets

| Asset | Kích thước / nội dung | Mapping | Trạng thái |
| --- | --- | --- | --- |
| `public/asset/bee/bee_fixed.glb` | 1.81 MB; 1 skinned mesh, 107 joints, 3 clips | Explore / Bee | Used |
| `public/asset/bee/bee_normal.webp` | 2048×2048 | Bee outer + inner normal | Used |
| `public/asset/bee/bee_orm.webp` | 1024×1024 | Bee outer shader: R AO, B roughness | Used |
| `public/asset/bee/bluenoise128.png` | 128×128 | CSS grain trên unified Explore stage | Used |
| `public/asset/fish/Fish.glb` | 608,824 B; 3 meshes/materials, 1 clip | Explore / Fish | Used |
| `public/asset/fish/jellyfish.glb` | 1,432,900 B; 3 meshes/materials, 1 clip | Hero + Jellyfish study | Used |
| `public/asset/fish/sharedMaskAtlas.webp` | 512×512 | Formula paint jar AO | Used |
| `public/asset/fish/deskSupplies_atlas.webp` | 1024×1024 | Formula ruler/scissor/cutter/screwdriver packed detail | Used |
| `public/asset/fish/eraser_baseColor.webp` | 512×512 | Formula eraser | Used |
| `public/asset/draco/draco_wasm_wrapper.js` | 58,572 B | Draco WASM loader | Used |
| `public/asset/draco/draco_decoder.wasm` | 192,420 B | Draco decoder | Used |
| `public/asset/draco/draco_decoder.js` | 512,498 B | Draco JS fallback | Used/fallback |
| `public/og.png` | 1792×933 | Open Graph/Twitter image | Used |
| `public/favicon.svg` | SVG | Document icon | Used |

Fish/Jelly GLB details:

- `Fish.glb`: `fish_Body`, `fish_Fin`, `fish_Eyes`; clip `Fish|swim_B3`, 5.167s; requires Meshopt, WebP and mesh quantization extensions.
- `jellyfish.glb`: `JF_heart`, `JF_skin_in`, `JF_skin_out`; clip `jellyfish|move_1`, 4.25s; requires Meshopt, WebP and mesh quantization; uses clearcoat extension.
- `bee_fixed.glb`: clips `_bee_idle` 9.833s, `_bee_hover` 1.9s, `_bee_take_off_and_land` 2.7s; requires Draco; material payload gần như trống nên runtime material override là bắt buộc.

## Formula car

Tất cả file dưới đây nằm trong `public/asset/Library/Car`. Mọi GLB đều XOR-protected bằng `0x5A`; tất cả trừ `cuttingMatt.glb` cần Draco.

| Group | Assets | Mapping | Trạng thái |
| --- | --- | --- | --- |
| Main model | `formulaCar.glb` | 41 nodes/meshes; body, bottom, glass, interior, wheels; assembly extras | Used |
| Body | `body_baseColor.webp` 2048²; `body_normal.webp`, `body_orm.webp` 1024² | `body_mat.003` | Used |
| Bottom | `bottom_baseColor.webp`, `bottom_normal.webp`, `bottom_orm.webp` 1024² | `bottom_details_mat.003` | Used |
| Glass | `glass_baseColor.webp`, `glass_orm.webp` 512² | `glass_details_mat.003` | Used |
| Interior | `interior_baseColor.webp`, `interior_normal.webp`, `interior_orm.webp` 512² | `interior_mat.003` | Used |
| Wheels | `wheels_baseColor.webp`, `wheels_normal.webp` 1024²; `wheels_orm.webp` 512² | `wheels_mat.003` | Used |
| Sprue | `formulaSprue.glb`, `sprue_packed.webp` 1024² | KIT plastic + label | Used |
| Cutting mat | `cuttingMatt.glb`, `cm_baseTexture.webp` 2048², `cm_packedEffects.webp` 1024² | KIT desk mat shader | Used |
| Paint jar | `paintJar.glb`, `paintJar_body.webp` 1290×334 | KIT prop + shared AO atlas | Used |
| Pencil | `pencil.glb` | KIT procedural color material | Used |
| Ruler | `ruler.glb` | KIT, desk atlas B | Used |
| Scissor | `scissor.glb` | KIT, desk atlas R | Used |
| Box cutter | `boxCutter.glb` | KIT, desk atlas G | Used |
| Screwdriver | `screwdriver.glb` | KIT, desk atlas A | Used |
| Eraser | `eraser.glb` | KIT + `fish/eraser_baseColor.webp` | Used |

`formulaCar.glb` không có embedded image/texture/animation. Runtime strip hậu tố material `.003`, gắn texture ngoài và animate bằng node extras.

## Audit/reference only

| Asset | Ghi chú |
| --- | --- |
| `public/asset/bee/bee.har` | 22-request capture của demoBee; dùng xác thực model, clips, textures và optical pipeline. |
| `public/asset/fish/peachweb.io.har` | 99-request Peach capture; dùng xác thực Fish/Jelly model, material names, clips và scene state. |
| `public/asset/Library/Car/Car.har` | 112 entries, gồm capture lặp; dùng xác thực protected loader, Formula textures, props và transforms. |

Ba HAR nằm trong `public` nên vẫn được copy vào `dist`, nhưng app không request chúng.

## Present nhưng không dùng ở runtime

| Asset | Lý do giữ / quyết định |
| --- | --- |
| `public/asset/Background/1.jpg` | Background candidate cũ; unified liquid shader thay thế. |
| `public/asset/fish/little-fish.glb` | Alternative school/particle fish, clip `Take 01` 16.208s; không cần cho Explore hiện tại. |
| `public/asset/fish/particle.glb` | Particle candidate, clip `Scene` 20.792s; không dùng. |
| `public/asset/fish/ezgif-1b0b7f3260a94a.webp` | Reference raster; không dùng. |
| `public/asset/Library/Car/chipboard_atlas.webp` | Ground atlas từ Formula reference; runtime dùng procedural studio/desk. |
| `public/asset/Library/figma.png` | Design reference; không dùng. |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | Scaffold icons; không dùng. |

Không xóa các asset này trong lần bàn giao để giữ nguyên nguồn user cung cấp. Nếu tối ưu deploy, archive HAR/reference files ra ngoài `public` trước rồi mới loại khỏi artifact.
