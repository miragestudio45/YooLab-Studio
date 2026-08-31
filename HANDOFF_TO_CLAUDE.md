# Handoff — trạng thái sau vòng final

Tài liệu này mô tả những gì đang chạy trong repo và những invariant **không được
phá**. Bối cảnh sản phẩm và user journey ở `README_FINAL.md`.

## Trạng thái

- `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build` đều
  sạch (2026-08-23, vòng final).
- Đã QA production server (`npm run start`) bằng Chrome headless:
  - **Explore**: ba trạng thái ong đổi đúng, hint đổi theo, crossfade chạy.
  - **YooStudio**: canvas 3D thật, chọn lớp qua scene tree, ba tool transform,
    tạo ghi chú bằng click lên model (xuất hiện cả trong scene tree), slider Độ
    trong ghi vào material (`28%`), panel Hiệu ứng + slider ánh sáng (`90%`),
    timeline tự chạy → pause → scrub tới `00:02.97`.
  - **Thư viện**: tìm kiếm (`ong` → Ong mật, `sua` → Sứa biển, `xe dua` → xưởng
    xe, `thuoc` → bộ dụng cụ, `hoa hoc` → rỗng), danh mục rỗng hiện đúng trạng
    thái, nút xóa bộ lọc, panel chi tiết mở/đóng.
  - **Formula**: mở từ **cả ba** entry point (card thư viện, `#thuc-hanh`,
    `#bai-hoc-mau`); KIT / STUDIO / DRIVE; WASD và phím mũi tên đều tăng tốc;
    Escape đóng, body scroll restore, canvas overlay bị xoá (còn đúng 3 canvas
    của trang: Explore, YooStudio, preview thư viện) → không leak.
  - **Responsive** 1920 / 1600 / 1440 / 1024 / 768 / 390: không có tràn ngang ở
    bất kỳ size nào (`documentElement.scrollWidth === innerWidth`), menu mobile
    mở đủ 6 link + CTA.
  - Không có lỗi console, không có request fail, không có anchor chết.

### Đọc kết quả QA headless cho đúng

Chrome headless dùng SwiftShader (software WebGL). Trên scene Formula ở 1100×700
nó chạy **~0.44 fps**. Vì `kitProgress` tiến 16% *mỗi frame* (delta bị kẹp ở
`0.05`), chuyển KIT → STUDIO cần ~40 frame để xe lắp xong — tức **~90 giây** trong
headless và dưới một giây trên GPU thật.

Nếu ảnh chụp headless cho thấy xe vẫn rời rạc ở STUDIO, **đừng "sửa" assembly**.
Chờ lâu hơn rồi chụp lại: sau ~120 s xe lắp hoàn chỉnh, đúng như card preview
trong thư viện. Cùng lý do đó, DRIVE trong headless chỉ tăng được vài km/h sau
nhiều giây giữ phím, và smooth-scroll của anchor nav mất vài giây mới tới đích.

## Code map

| File | Trách nhiệm |
| --- | --- |
| `app/page.tsx` | Compose journey, bọc mọi thứ trong `FormulaGate` |
| `app/layout.tsx` | Document shell tiếng Việt, Google Fonts, favicon, OG/Twitter |
| `app/globals.css` | Design system, section layout, overlay, breakpoint `1240/1080/900/700px` |
| `app/components/BrandMark.tsx` | Logo chính thức đã trace, dùng cho header và footer |
| `app/components/SiteHeader.tsx` | Anchor nav (6 link), menu mobile, trạng thái scrolled |
| `app/components/ExploreStory.tsx` | Hero, `IntersectionObserver` chọn panel, nội dung giáo dục, ba trạng thái ong |
| `app/components/ExploreCanvas.tsx` | Renderer Explore: liquid, choreography, material, animation, lifecycle |
| `app/components/BridgeSection.tsx` | Bản lề wonder → product |
| `app/components/StudioDemo.tsx` | Không gian biên soạn YooStudio tương tác |
| `app/components/WorkflowSection.tsx` | Quy trình bốn bước (server component) |
| `app/components/LibrarySection.tsx` | Taxonomy, tìm kiếm, grid, panel chi tiết |
| `app/components/StudentCreationSection.tsx` | Học sinh sáng tạo 3D/XR |
| `app/components/ExperimentSection.tsx` | Thực hành & STEM, mở Formula |
| `app/components/EducationSection.tsx` | Ba nhóm người dùng |
| `app/components/ProofSection.tsx` | Bài học mẫu, mở Formula |
| `app/components/StartSection.tsx` | Bắt đầu với YooLab (server component, không có giá) |
| `app/components/ModelThumbnail.tsx` | Wrapper lazy cho bộ nướng thumbnail |
| `app/components/FormulaGate.tsx` | Context + chủ sở hữu duy nhất của overlay Formula |
| `app/components/FormulaPreview.tsx` | Preview 3D sống trên card thư viện |
| `app/components/FormulaExperience.tsx` | Overlay KIT / STUDIO / DRIVE |
| `app/lib/three/environment.ts` | Environment PMREM dựng theo thủ tục |
| `app/lib/three/liquid.ts` | Mô phỏng ping-pong + pass hiển thị |
| `app/lib/three/beeOptics.ts` | Giải phẫu ong từ skin + ba material |
| `app/lib/three/thumbnails.ts` | Bộ nướng thumbnail offscreen dùng chung |
| `app/lib/three/thumbnailRequests.ts` | Request dùng chung cho mọi section |
| `app/lib/formula/carRuntime.ts` | Loader protected, texture, material, neutralize branding, lắp ráp |

## Invariant toàn trang

- **`.bridge` là section duy nhất mang `margin-top: -100svh`.** `.explore-story`
  có `padding-bottom: 100svh` để chừa chỗ cho nó trồi lên trên sticky stage cuối.
  Trước đây `margin-top` đó nằm trên `.tool-section`; nếu thêm section mới giữa
  Explore và Bridge thì phải chuyển `margin-top` sang section mới, nếu không sẽ
  hở một khoảng trắng cao bằng viewport. Ở `max-width: 700px` giá trị tương ứng là
  `-820px` (khớp `padding-bottom: 820px` của `.explore-story`), và
  `.tool-section { margin-top: 0 }`.
- **Đừng dùng `ch` cho `max-width` trên một `div` bọc heading.** `ch` giải theo
  font của *chính element đó* (body 16px), không theo font display 50px của
  heading bên trong. `.bridge-copy` từng bị bóp xuống ~335px và heading vỡ thành
  5 dòng vì lý do này; nay nó dùng `880px`.
- **`.education-intro` chỉ rộng ~360px** (`grid-template-columns: 0.62fr 1.38fr`
  trong shell 1240px, gap 80px). Heading ở đó dùng cỡ riêng
  `clamp(36px, 3.6vw, 56px)` và ngắt dòng tường minh; đổi chữ dài hơn sẽ orphan
  một từ.
- **Mỗi `<em>` có gradient nên chiếm trọn một dòng.** `background-clip: text` trên
  một inline bị wrap sẽ vẽ gradient qua union box của các fragment và trông lệch.
  Vì vậy các heading đặt `<br />` ngay trước `<em>`.
- **Ba entry point của Formula phải đi qua `useFormulaGate()`.** Đừng cho section
  nào tự mount `FormulaExperience`: hai overlay đồng thời nghĩa là hai WebGL
  context, hai body-scroll lock và hai focus trap tranh nhau.
- **Ảnh render dùng chung phải import từ `thumbnailRequests.ts`**, không định
  nghĩa lại object tại chỗ. Cache của bộ nướng khoá theo *giá trị* request; một
  bản sao chỉ khác `yaw` là một lần nướng nữa. Đây cũng là lý do các section nhẹ
  không còn import hằng số từ `LibrarySection` — làm vậy sẽ kéo cả runtime Formula
  vào chunk của chúng.
- **Tìm kiếm thư viện khớp theo tiền tố từ, không phải substring.** Xem
  `matchesQuery()`. Quay lại `includes` sẽ khiến `"ong"` khớp toàn bộ thư viện qua
  `xuong` / `trong` / `dong` / `mo phong`.

## Explore

`ExploreStory` dùng state `jelly-hero`, `jelly-study`, `fish`, `bee`. Một sticky
`.explore-stage` giữ `ExploreCanvas` xuyên suốt; model và liquid nằm trong cùng
một `THREE.Scene`.

Invariant cần giữ:

- **Palette liquid được author ở không gian tuyến tính.** Material hiển thị đặt
  `toneMapped: false`, nên giá trị hex truyền vào `liquidPalette()` chính là màu
  cuối trên màn hình. Bật tone mapping lại sẽ làm lệch toàn bộ palette.
- **Render target của liquid là half-float và được clear trước pass đầu tiên.**
  Bỏ bước clear sẽ đưa NaN vào trạng thái sóng và cả nền sẽ đen.
- **Ba lớp sứa phải cùng transmissive hoặc cùng không.** Three sắp transmissive và
  transparent vào hai pass khác nhau; tách ra sẽ vẽ tim sứa lên trên màng ngoài.
  Trên `max-width: 780px` cả ba đều tắt transmission.
- **`JF_heart` và `JF_skin_in` là `MeshStandardMaterial` khi ra khỏi loader.** Chỉ
  `JF_skin_out` có clearcoat extension. Gán `transmission`/`ior` cho standard
  material sẽ định nghĩa `USE_TRANSMISSION` trên struct sai và shader không
  compile. `toPhysical()` lo việc nâng cấp.
- **Vây cá dùng `alphaTest` được scale theo presence.** Nếu để cố định, vây sẽ
  biến mất ngay khi opacity xuống dưới ngưỡng. Giá trị luôn được kẹp trên 0 để
  define `USE_ALPHATEST` không bật/tắt và program không phải compile lại.
- **Pass capture cho ong ẩn shell và wings nhưng giữ core**, nên shell khúc xạ cả
  nền và lõi. Ẩn cả core thì mất hoàn toàn "internal structure".
- Bee clip theo đúng thứ tự asset `_bee_idle`, `_bee_hover`,
  `_bee_take_off_and_land`; UI map sang Đứng yên / Bay tại chỗ / Bay đi và fade
  `0.45s`. Root translation của hover/fly bị neo về idle vì clip gốc chứa
  displacement world-scale (~4,479 đơn vị); locomotion nằm ở flight path
  procedural.
- **Copy của Explore là nội dung giáo dục.** Đừng đưa thông số render (ACES,
  triangle count, Fresnel, emissive) vào chữ. Ba panel dạy cấu tạo sứa, hệ vây cá
  và giải phẫu ong; `study-readout` của ong dùng biến thể `--compact` để bốn dòng
  vẫn vừa chiều cao viewport.

### Ong — chi tiết

- `buildBeeAnatomy()` phải nâng vertex sang **skinning space bằng `bindMatrix`**
  trước khi so với joint origin lấy từ `boneInverses`. glTF trả về bindMatrix
  không phải identity; bỏ bước này thì mọi khoảng cách vô nghĩa và độ dày sai.
- Bán kính được chuẩn hóa theo phân vị 86 thay vì cực đại, vì vài đỉnh râu sẽ nén
  toàn thân xuống một dải mỏng.
- `coreInset` tính từ span geometry của asset, không phải hằng số.
- Trong shell, direct và indirect specular được cộng riêng với hệ số khác nhau và
  subsurface bounce được nhân màu ruby. Cộng gộp toàn phần hoặc cộng
  `totalDiffuse` trắng là đúng cách biến ruby thành nhựa hồng.

## YooStudio

- API imperative nằm trong `apiRef`; state React đẩy vào bằng các `useEffect`
  riêng. Annotation giữ vị trí local trong controller, React chỉ giữ nhãn và
  đăng ký element qua `bindAnnotationElement`.
- Gizmo dùng picker cylinder vô hình để dễ bắt, `depthTest: false` để luôn thấy,
  và scale theo khoảng cách camera để giữ kích thước trên màn hình.
- Renderer pause khi section ra khỏi viewport hoặc tab bị ẩn.
- Khi test bằng automation: input `range` là controlled component của React, nên
  gán `el.value` trực tiếp **không** kích hoạt `onChange`. Phải gọi setter native
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) rồi
  dispatch `input`. Nếu bỏ bước này, slider trông như "không hoạt động" trong khi
  sản phẩm hoàn toàn bình thường.

## Formula

Overlay do `FormulaGate` sở hữu, mở từ ba chỗ, khóa body scroll, trap focus,
restore focus khi đóng, đóng bằng nút × hoặc Escape.

Invariant:

- Mọi GLB trong `public/asset/Library/Car` protected bằng XOR `0x5A`; phải đi qua
  `loadProtected` trước `GLTFLoader.parseAsync`.
- Draco decoder path là `/asset/draco/`.
- Material name gốc có hậu tố như `.003`; phải strip `/\.\d+$/` trước khi lookup.
- Base color là sRGB; normal/ORM/mask là `NoColorSpace`. Texture xe dùng
  `flipY = true`; texture prop có flip riêng.
- ORM của xe không chuẩn: G=roughness, B=metalness; AO chuyển giữa R ở assembled
  và A ở KIT. Shader `uKitProgress` không được bỏ.
- `kit_location`/`assembled_location` và rotation nằm trong node extras.
  Coordinate conversion bắt buộc:

  ```ts
  new THREE.Vector3(x, z, -y)
  new THREE.Quaternion(rawX, rawZ, -rawY, rawW) // extras là WXYZ
  ```

- **Endpoint nằm trên node, không phải trên mesh.** Node có nhiều primitive được
  Three tải thành `Group` và mesh con không mang extras. `prepareCarVisual` vì
  vậy thu thập theo object có `userData.assembled_location`, còn material thì gán
  cho mọi mesh trong một lượt traverse riêng. Quay lại cách thu thập mesh sẽ làm
  `body_bottom`, `main_shell`, `cockpit` và hai suspension sau kẹt ở pose KIT.
- Bounds/scale phải tính ở assembled endpoints rồi mới trả node về KIT.
- Desk atlas cần hai Texture instance: `flipY=false` cho ruler/scissor,
  `flipY=true` cho box cutter/screwdriver.
- Glass gốc có emissive mạnh; runtime thay hoàn toàn bằng material không emissive,
  transparent và `depthWrite=false`.
- `neutralizeBodyBranding()` chỉ thay phần mực in bên trong sáu box. Thuật toán:
  flood fill từ viền cửa sổ để loại nền atlas và đường ghép tấm, rồi inpaint
  phần còn lại theo hướng vuông góc với baseline. Nếu đổi sang tô đầy hình chữ
  nhật thì sẽ để lại vệt phẳng và tràn ra nền đen.

Mode behavior:

- KIT: `uKitProgress → 1`, hiện desk/sprue/tools và exploded endpoints.
- STUDIO: `uKitProgress → 0`, xe lắp ráp, orbit + auto rotation, floor/ring.
- DRIVE: xe lắp ráp, throttle/steering kinematic, chase camera, wheel roll và
  steering bánh trước; WASD/Arrow khi canvas focus, mobile có touch controls.

## Thumbnail baker

- Một `WebGLRenderer` dùng chung, queue tuần tự, cache theo request key, tự
  dispose sau 6 giây không dùng.
- Preset `opal`/`ruby` **cố ý không dùng transmission**: canvas clear trong suốt
  nên transmission target rỗng và ảnh nướng ra gần như trống. Độ "thủy tinh" đến
  từ iridescence, sheen và clearcoat.
- Chủ thể có phần đuôi dài (sứa) cần `targetY` và `zoom` nhỏ; nếu frame theo cả
  bounding sphere thì phần đáng nhìn chỉ còn vài pixel.
- Bỏ qua hoàn toàn khi `navigator.connection.saveData` bật.
- Ô nhỏ (`.creation-tray-item`, cao 62px) ẩn `.model-thumbnail-status`: dòng "Đang
  dựng bản xem trước…" wrap thành bốn dòng và tràn ra khỏi ô trong lúc chờ nướng.

## Asset và thư mục tham chiếu

- Explore: `public/asset/fish/jellyfish.glb`, `Fish.glb`,
  `public/asset/bee/bee_fixed.glb` + `bee_normal.webp` + `bee_orm.webp`.
- Liquid grain: `public/asset/bee/bluenoise128.png` qua CSS.
- Formula: `public/asset/Library/Car`, cùng poster dựng sẵn
  `formula-preview.jpg` (dùng cho card mobile *và* cho visual của `#thuc-hanh`,
  nên chỉ có một live Formula context trên trang).
- Formula shared masks: `public/asset/fish/sharedMaskAtlas.webp`,
  `deskSupplies_atlas.webp`, `eraser_baseColor.webp`.
- Logo: `public/brand/yoolab-logo.svg` (lockup ngang) và `public/brand/yoolab-icon.svg`
  (app tile / favicon) — **vector chính thức do khách gửi**. `app/components/BrandMark.tsx`
  được **sinh ra** từ hai file đó bằng `node scripts/build-brand-mark.mjs`; đừng sửa tay.
- **HAR và ảnh tham chiếu đã ra khỏi `public/`** và nằm trong `reference-audit/`
  (xem README trong đó). `public/` giảm từ ~71 MB xuống 16 MB.

## Việc còn có thể làm

- ~~Nếu có logo vector chính thức…~~ **Xong.** Bản trace từ bitmap đã bị thay bằng
  vector thật; chạy lại `scripts/build-brand-mark.mjs` mỗi khi re-export SVG.
- `public/og.png` vẫn là ảnh do bản trước sinh ra, dùng serif và một render sứa
  không phải asset thật. Nên dựng lại từ hero thật khi có dịp.
- `public/asset/fish/particle.glb` và `little-fish.glb` chưa được surface (xem
  `KNOWN_LIMITATIONS.md`).
- Khi YooLab có dữ liệu proof thật (trường, case study, media lớp học), thêm vào
  `ProofSection` cạnh các bài học mẫu — đừng thay thế chúng, bằng chứng mở được
  tại chỗ vẫn mạnh hơn.
- Khi có bảng giá chính thức, cập nhật `StartSection`; trước đó không đặt con số
  nào vào đó.
- Nếu muốn DRIVE mức physics, có thể thay kinematic loop bằng physics engine.
- Chạy visual regression trên Safari/iOS và Android thật trước khi phát hành công
  khai.
