# Formula texture audit

Audit cuối: 2026-08-22. Nguồn đối chiếu là `formulaCar.glb`, toàn bộ texture local, `Car.har` và code runtime trong `app/components/FormulaExperience.tsx`.

## Loader và color pipeline

- GLB protected: nếu magic đầu file chưa là `glTF`, XOR toàn bộ bytes bằng `0x5A`, sau đó `GLTFLoader.parseAsync` với Draco decoder path `/asset/draco/`.
- Renderer: `SRGBColorSpace`, ACES Filmic exposure `0.94`, pixel ratio cap `1.5`.
- Base-color texture: sRGB. Normal, ORM và mask: `NoColorSpace`.
- Formula car texture: `flipY=true`, anisotropy tối đa 8. Prop texture dùng flipY ghi riêng bên dưới.
- Mesh car thiếu UV1 riêng; runtime copy UV0 sang `uv1` để Three `aoMap` đọc cùng layout.
- Raw material name `*.003` được chuẩn hóa bằng `/\.\d+$/` trước lookup.

## Car material table

| Runtime key ← raw GLB | Base color | Normal | Packed map | Hệ số runtime |
| --- | --- | --- | --- | --- |
| `body_mat` ← `body_mat.003` | `body_baseColor.webp` | `body_normal.webp` | `body_orm.webp` | roughness 0.82, metalness 0.36, AO 0.82 |
| `bottom_details_mat` ← `bottom_details_mat.003` | `bottom_baseColor.webp` | `bottom_normal.webp` | `bottom_orm.webp` | roughness 1.0, metalness 0.28, AO 0.82 |
| `interior_mat` ← `interior_mat.003` | `interior_baseColor.webp` | `interior_normal.webp` | `interior_orm.webp` | roughness 0.9, metalness 0.22, AO 0.78 |
| `wheels_mat` ← `wheels_mat.003` | `wheels_baseColor.webp` | `wheels_normal.webp` | `wheels_orm.webp` | roughness 0.8, metalness 0, AO 0.5, normalScale 2 |
| `glass_details_mat` ← `glass_details_mat.003` | `glass_baseColor.webp` | — | `glass_orm.webp` | roughness 1, metalness 0, transmission 0.12, thickness 0.04, IOR 1.45, opacity 0.4 |

Packed ORM behavior:

- G điều khiển roughness; B điều khiển metalness.
- AO không cố định: `mix(orm.r, orm.a, uKitProgress)`; `uKitProgress=0` ở assembled/STUDIO/DRIVE, `1` ở KIT.
- Runtime giảm metalness theo `1.0 - uKitProgress * 0.72` để exploded KIT bớt chói nhưng vẫn còn chi tiết livery.
- Glass không gắn aoMap/normalMap. Base RGBA nhân với opacity; material transparent, `depthWrite=false`, emissive bằng 0. Raw GLB glass emissive-strength 2 đã bị thay hoàn toàn.
- Material giữ `DoubleSide` để không làm mất các mặt mỏng trong source asset.

Material được gắn theo primitive material name, không đoán theo mesh name. Vì vậy các primitive body/bottom/wheel nằm chung một node vẫn nhận đúng texture set.

## Assembly mapping

`formulaCar.glb` mở ở KIT endpoints. Mỗi mesh đọc bốn extras:

```ts
position = [x, y, z] => new Vector3(x, z, -y)
rotation = [w, x, y, z] => new Quaternion(x, z, -y, w)
object.position.lerpVectors(assembled, kit, progress)
object.quaternion.slerpQuaternions(assembled, kit, progress)
```

Runtime đặt tạm toàn bộ node vào assembled pose, tính bounds/center/scale từ chiếc xe hoàn chỉnh, rồi mới trả node về KIT. Đây là phần sửa lỗi STUDIO rời rạc/undersized.

Wheel detection dùng tên chứa `tire|rim|lock|tube|brake_disc`; assembled wheel nhận roll quaternion, front wheels nhận thêm steering quaternion trong DRIVE. Vì asset hướng về local +X, DRIVE dùng `heading - π/2` để model trùng hướng chuyển động +Z ban đầu.

## KIT desk props

| Prop | Mapping cuối | Color space / flipY |
| --- | --- | --- |
| Sprue | `sprue_packed.webp`: G modulate plastic; R là label alpha; label transparent, không depth-write | NoColor / false |
| Cutting mat | `cm_baseTexture.webp`.R là design mask; `cm_packedEffects.webp` dùng planar local XY, G làm sáng scratches, R làm tối fingerprint/detail | NoColor / false |
| Paint jar | `paintJar_body.webp` base; `sharedMaskAtlas.webp` làm AO, UV0 được mirror sang UV1 | base sRGB false; AO NoColor false |
| Eraser | `eraser_baseColor.webp` | sRGB / false |
| Pencil | Không có texture cần thiết; material vàng gỗ procedural | — |
| Ruler | `deskSupplies_atlas.webp` B, UV `vec2(u, v*0.125)` | NoColor / false |
| Scissor | `deskSupplies_atlas.webp` R | NoColor / false |
| Box cutter | atlas G | NoColor / true |
| Screwdriver | atlas A | NoColor / true |

Atlas được load thành hai Texture instance độc lập cho hai hướng flipY. Không đổi flipY trên texture đang được prop khác dùng.

`chipboard_atlas.webp` đã audit nhưng không có runtime reference; desk và studio floor hiện là geometry/material procedural.

Reference fidelity note: UV, packed channel và flipY đã khớp HAR. Runtime hiện dùng một tint/channel theo từng tool, không tái tạo toàn bộ `_PARTID` color/specular array của shader reference. Đây là lựa chọn stylization ở prop nhỏ, không phải lỗi UV/texture mapping của car; chỉ cần phục hồi `_partid` nếu sau này cần parity tuyệt đối từng vật liệu trên tool.

## Visual verification

Browser QA ở `http://localhost:3003`:

| Hạng mục | Kết quả |
| --- | --- |
| Body/livery | Pass — đỏ/trắng, sponsor và panel đúng vùng; không trôi UV. |
| Bottom | Pass — underside/detail nhận đúng set, không dùng nhầm body map. |
| Glass | Pass — tinted/transparent, không dùng emissive raw gây cháy. |
| Interior | Pass — cockpit tách khỏi glass/body. |
| Wheels | Pass — tire/rim/brake texture đúng, normal không đảo, form còn rõ. |
| Desk props | Pass — sprue, mat, paint jar, eraser và packed-atlas tools hiển thị đúng trong KIT. |
| STUDIO assembly | Pass — mesh về đúng extras endpoints và tạo silhouette xe liên tục. |
| DRIVE | Pass — assembled pose, input HUD/chase camera và hướng model khớp chuyển động. |

Regression Formula “texture mapping sai” được xem là đã xử lý: mapping được khóa bằng material table, packed channel shader và visual QA, không còn dựa vào auto-material từ GLB.
