# HAR notes

Ba HAR được đọc như nguồn kỹ thuật, không được app fetch ở runtime. Local payload được so byte/SHA-256 với response body khi có thể.

## `bee.har`

- 22 requests; source chính là `demoBee` và bundle `demoBee.C948SwLj.js`.
- Local normal/ORM khớp response body byte-for-byte. `bee_fixed.glb` là đúng model HAR sau khi XOR từng byte bằng `0x5A`.
- GLB: glTF 2.0, Draco required, một skinned mesh, một material PBR không có texture, skin 107 joints.
- Clip thật:
  - `_bee_idle`: 9.833333s.
  - `_bee_hover`: 1.9s.
  - `_bee_take_off_and_land`: 2.7s.
  - Mỗi clip có 214 LINEAR translation/rotation channels.
- Reference UI map clip index 0/1/2 sang Idle/Hover/Fly và blend có easing. Runtime hiện fade 0.45s.
- Reference optical setup là hai shell dùng chung skeleton: outer shell sampling scene/reflection target; inner shell tối tạo absorption và chống mất silhouette.
- `bee_normal.webp`: 2048². `bee_orm.webp`: 1024²; outer dùng R=AO, B=roughness; reference inner có đọc G như AO. Texture dùng repeat.
- `bluenoise128.png` phục vụ ground/grain, không phải bee albedo.
- Clip Hover/Fly chứa root motion rất lớn (`_bee_take_off_and_land` đạt khoảng 4,479 source units), vì vậy runtime neo `body_jnt*.position` về Idle và tạo locomotion procedural có framing ổn định.
- Pitfall rút ra: không nhân refracted color quá mạnh trên nền sáng, không thêm bloom/emissive trắng, và không render Bee tách khỏi background mà optical shader cần sample.

## `peachweb.io.har`

- 99 requests. Local `Fish.glb`, `jellyfish.glb`, `little-fish.glb`, `particle.glb` khớp response tương ứng byte-for-byte.
- Capture chứa `scene-state/...json`; đây là nguồn rõ nhất cho transform, clip và material override, tốt hơn việc đoán từ ảnh.

Fish:

- `Fish.glb`: 3 meshes/materials (`fish_Body`, `fish_Fin`, `fish_Eyes`) và clip `Fish|swim_B3` 5.167s.
- Reference scene để Fish scale 3.8, rotation x/z π và y≈-1.4675; runtime dùng bounds normalization và framing riêng.
- Reference fin là physical material với alpha test, transmission và iridescence; eyes tối, double-sided và bóng.
- Runtime cố ý giữ albedo/texture nhưng hạ fin transmission xuống `0.26`, metalness `0.08`, env intensity `0.34`; body/eyes emissive bằng 0. Đây là safeguard chống Fish cháy sáng.

Jellyfish:

- `jellyfish.glb`: ba material `JF_heart`, `JF_skin_in`, `JF_skin_out`; clip `jellyfish|move_1` 4.25s.
- Scene state xác nhận palette: heart `#739dff`, inner `#a5beff`, outer `#9ca8ff`; inner alpha cutoff xấp xỉ `0.7816`; outer có clearcoat ≈`0.1563`, clearcoat roughness ≈`0.6958`, transparent.
- Runtime giữ ba layer và palette nhưng giảm metal/emissive, đặt depth/render order rõ để cap, core và membrane không cộng dồn thành mảng trắng.
- `little-fish.glb` (`Take 01`, 16.208s) và `particle.glb` (`Scene`, 20.792s) là candidate từ scene gốc, không cần cho experience hiện tại.
- Fish/Jelly GLB yêu cầu Meshopt; vì vậy `loader.setMeshoptDecoder(MeshoptDecoder)` là bắt buộc.

## `Car.har`

- 112 entries; nhiều resource xuất hiện hai lần do capture lặp. Bundle chính: `demoFormula.jOmcpGiP.js`.
- Tất cả Formula GLB/textures hiện có trong `public/asset/Library/Car` khớp HAR byte-for-byte.
- Bốn shared payload cũng khớp chính xác nhưng được lưu lại ở thư mục hiện hữu: `fish/sharedMaskAtlas.webp`, `fish/deskSupplies_atlas.webp`, `fish/eraser_baseColor.webp`, `bee/bluenoise128.png`.
- Protected loader trong bundle dùng XOR key decimal `90` (`0x5A`) rồi kiểm magic `glTF`. Regular `GLTFLoader.load` trực tiếp vào file protected sẽ lỗi.
- Tất cả Car GLB trừ `cuttingMatt.glb` yêu cầu `KHR_draco_mesh_compression`.
- `formulaCar.glb`: 41 nodes, 41 meshes, 5 materials, không animation/embedded texture. Material raw có hậu tố `.003`.
- `formulaCar.glb` lưu `kit_location`, `kit_rotation`, `assembled_location`, `assembled_rotation` trong node extras. Bundle đổi Blender Z-up/WXYZ sang Three Y-up/XYZW bằng `(x,z,-y)` và `(rawY,rawW,-rawZ,rawX)` rồi lerp/slerp theo progress.
- Car forward là +X, up +Y, left -Z sau conversion. Assembly hoàn toàn code-driven; không có clip glTF.
- Formula ORM: G roughness, B metalness; AO là R ở assembled và A ở KIT. Bỏ custom AO switch sẽ làm KIT sai shading.
- Raw glass có BLEND + white emissive và emissive strength 2; phải replace chứ không dùng nguyên, nếu không glass dễ cháy trắng.
- Prop atlas channel/flipY khác nhau; đặc biệt ruler/scissor và box cutter/screwdriver không được dùng chung một mutable Texture instance.
- Reference còn tải `Studio_1K.hdr`, `GN_Plane_Lines_curve_centers.json` và Rapier. Runtime hiện không phụ thuộc các file này: studio dùng light/floor procedural, assembly đọc trực tiếp extras và DRIVE dùng kinematic loop.

## Kết luận áp dụng

- HAR dùng để xác nhận semantics và packed channels; không copy nguyên scene graph/UI/reference exposure.
- Runtime chỉ dùng local assets; không phụ thuộc domain Patrick Heintzmann hoặc Peach.
- Bốn safeguard phải giữ: unified optical pass cho Bee, zero-emissive calibration cho Fish, three-layer depth order cho Jellyfish, và protected loader + explicit material table cho Formula.
