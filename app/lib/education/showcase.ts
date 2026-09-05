import type { ExperienceManifest } from '../library/types';

/**
 * The three specimens the Education panel's lesson player runs.
 *
 * ## Why these are not in the Library
 *
 * They use the Library's own manifest shape and the Library's own viewer, and
 * they are deliberately NOT in `EXPERIENCES`. Two reasons, and the second is the
 * binding one:
 *
 *   1. The Education section is an argument about three *roles*, not a shelf.
 *      Adding three rows to the STEM rail would say the Library grew, which it
 *      did not.
 *   2. `types.ts` states the rule this file has to obey: "an asset whose licence
 *      has not been verified does not get an entry — it does not ship". The
 *      three arrived as a hand-off (`reference-sources/Model -robot/`) and are
 *      stated to be Sketchfab downloads, which names a marketplace rather than a
 *      licence: entries there ship under anything from CC0 to editorial-use-only.
 *      Until the specific entry, author and terms are recorded in
 *      THIRD_PARTY_ASSETS.md they carry no `credits` block below and stay out of
 *      the Library. The moment those three lines exist, these entries can move
 *      into `subjects/stem.ts` unchanged.
 *
 * ## Why robots, and why these three
 *
 * The panel showed a T-rex, a bee and a clownfish — the same three specimens the
 * hero, the bridge and the Library rail already run, which made the section read
 * as a fourth showing of the site's best assets rather than as a demonstration
 * that the platform takes whatever a teacher brings it. The three below are
 * engineering subjects: a quadrotor, a walking sensor platform and a biomimetic
 * swimmer. None of them is biology, which is exactly the point — "một nền tảng,
 * cả trường cùng dùng" is a stronger claim when the thing on the stage is not
 * the animal the rest of the page has been photographing.
 *
 * ## What the manifests say, and what they do not
 *
 * These are concept models, not scanned hardware, and nothing here pretends
 * otherwise: `topic` is "Thiết kế & cơ cấu", the parts are named for the
 * mechanisms visible in the mesh, and no entry carries a measurement, a mass or
 * a date. Naming a joint a model actually has is honest; inventing a payload
 * spec for a machine that was never built is not.
 *
 * ## The two technical notes that matter
 *
 *   - `lockRoot`. All three reels animate their root joint, so unlocked the
 *     drone flies out of frame in about four seconds and the whale swims past
 *     the camera. The stem names the joint whose translation track is flattened;
 *     everything below it keeps moving. See `lockRootMotion` in `ModelStage`.
 *   - No `clips`. Each file carries exactly one animation, named `Scene` by the
 *     exporter, so a clip rail would be one button that changes nothing. With
 *     `clips` absent the stage plays animation zero, and `animate: true` in the
 *     framing is what keeps it running rather than holding a pose.
 */
const SHOWCASE: ExperienceManifest[] = [
  {
    id: 'work-drone',
    title: 'Drone quan trắc Dv2',
    subtitle: 'Bốn ống đẩy · khoang quan sát mở được',
    poetic: 'Không có bánh lái nào cả — nó lái bằng cách đẩy bên này mạnh hơn bên kia.',
    subject: 'stem',
    topic: 'Thiết kế & cơ cấu',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Bốn ống đẩy quanh trọng tâm, cánh cân bằng và nắp khoang quan sát.',
    description:
      'Mô hình khái niệm của một drone quan trắc. Bốn ống đẩy đặt đối xứng quanh trọng tâm, và toàn bộ việc điều khiển nằm ở chênh lệch lực đẩy giữa chúng — đây là cách trực quan nhất để nói vì sao một cỗ máy không có bánh lái vẫn rẽ, nghiêng và giữ độ cao được. Nắp khoang mở ra khi thiết bị quan sát làm việc.',
    view: {
      type: 'model',
      url: '/asset/robotics/work-drone.glb',
      preset: 'natural',
      /* `spinSafe` because the frame auto-orbits and this machine is much wider
         across its thrusters than it is deep: fitting one angle only leaves an
         outer duct outside the frame a quarter turn later. */
      framing: { yaw: 0.92, pitch: 0.42, fill: 0.94, poseTime: 6, animate: true, spinSafe: true },
      /* The reel flies the whole aircraft across the scene. The joint below is
         the one that carries it — note it is the bare `Drone v2 WorkMachine`
         and not the mesh node `Drone v2 WorkMachine_Cybertech Material_0`,
         which the stem matcher does not reach because the suffix is joined with
         an underscore rather than a dot. */
      lockRoot: 'Drone v2 WorkMachine',
    },
    rail: { kind: 'thumbnail', thumb: 'work-drone' },
    parts: [
      { label: 'Ống đẩy', body: 'Bốn ống quanh trọng tâm — chênh lực đẩy là đổi hướng.' },
      { label: 'Cánh cân bằng', body: 'Cặp cánh nhỏ và vạt trước, giữ thân khỏi chao.' },
      { label: 'Khoang quan sát', body: 'Nắp trượt mở khi thiết bị bên trong làm việc.' },
      { label: 'Vỏ thân ghép mảnh', body: 'Nhiều tấm rời, tháo được từng mảnh để bảo trì.' },
    ],
    keywords: 'drone quan trac dv2 ong day canh can bang khoang quan sat bay khong nguoi lai stem',
  },
  {
    id: 'walker-drone',
    title: 'Robot nhện thăm dò',
    subtitle: 'Bốn chân · thân xoay độc lập',
    poetic: 'Thân đứng yên trong khi bốn chân làm hết phần việc.',
    subject: 'stem',
    topic: 'Thiết kế & cơ cấu',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Bốn chân ba đoạn giữ thân nằm ngang khi địa hình đổi.',
    description:
      'Mô hình khái niệm của một robot đi bộ. Bốn chân ba đoạn hạ và nâng lệch pha nhau, còn khối thân ở giữa xoay độc lập với chân — nên hướng quan sát không đổi theo mỗi bước. Đây là ví dụ trực quan nhất cho câu hỏi vì sao robot đi bộ cần nhiều khớp hơn xe bánh.',
    view: {
      type: 'model',
      url: '/asset/robotics/spider-drone.glb',
      preset: 'natural',
      framing: { yaw: 1.1, pitch: 0.3, fill: 0.9, poseTime: 6.5, animate: true, spinSafe: true },
      lockRoot: 'Main body driver',
    },
    rail: { kind: 'thumbnail', thumb: 'spider-drone' },
    parts: [
      { label: 'Thân trung tâm', body: 'Xoay độc lập với chân, giữ hướng quan sát.' },
      { label: 'Chân ba đoạn', body: 'Bốn chân, hạ và nâng lệch pha để luôn có điểm tựa.' },
      { label: 'Cụm cảm biến', body: 'Gắn trên thân, quét quanh trục đứng.' },
      { label: 'Vành dẫn hướng', body: 'Ổ xoay nối thân với bệ chân.' },
    ],
    keywords: 'robot nhen di bo bon chan khop than xoay tham do ky thuat stem co cau',
  },
  {
    id: 'bionic-whale',
    title: 'Cá voi cơ khí',
    subtitle: 'Mô phỏng sinh học · thân đốt',
    poetic: 'Một cỗ máy mượn cách bơi của con vật nó mang tên.',
    subject: 'stem',
    topic: 'Mô phỏng sinh học',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Thân nhiều đốt tạo sóng uốn — cách bơi mượn từ sinh vật thật.',
    description:
      'Mô hình khái niệm về mô phỏng sinh học: kỹ thuật đi tìm lời giải ở sinh vật. Thân được chia thành nhiều đốt nối tiếp, và sóng uốn chạy dọc các đốt đó chính là nguyên lý đẩy của cá voi thật — vây đuôi nằm ngang, đập lên xuống, chứ không đứng và quạt ngang như đuôi cá.',
    view: {
      type: 'model',
      url: '/asset/robotics/mech-whale.glb',
      preset: 'natural',
      framing: { yaw: 1.24, pitch: 0.24, fill: 0.96, poseTime: 4.4, animate: true, spinSafe: true },
      lockRoot: 'Core_bone',
    },
    rail: { kind: 'thumbnail', thumb: 'mech-whale' },
    parts: [
      { label: 'Thân đốt', body: 'Nhiều đốt nối tiếp — nơi sóng uốn được tạo ra.' },
      { label: 'Vây chính', body: 'Một đôi hai bên, giữ hướng và độ sâu.' },
      { label: 'Vây đuôi', body: 'Nằm ngang và đập lên xuống, như cá voi thật.' },
      /* Dorsal, not on the head. The rig's `Antenna_*` joints sit between the
         fifth and fourth spine segments, and the render agrees: the masts stand
         in a row along the back. */
      { label: 'Ăng-ten', body: 'Dãy cần dựng dọc lưng, thu và phát tín hiệu.' },
    ],
    keywords: 'ca voi co khi mo phong sinh hoc bionic whale than dot vay duoi song uon stem',
  },
];

export function showcaseById(id: string) {
  return SHOWCASE.find((item) => item.id === id) ?? null;
}
