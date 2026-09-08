import type { PracticeGlyph } from './glyphs';

/**
 * The three practice experiences, as data.
 *
 * Same rule as the Library's manifest, for the same reason: the hub's rail, its
 * poster stage, its brief column and its modal are all derived from this list,
 * so a fourth experience is an entry rather than five coordinated edits to JSX.
 * And the same honesty clause — every entry here opens something that actually
 * runs.
 *
 * ## They are separate builds now, embedded rather than bundled
 *
 * Each of these used to be a WebGL lab inside this bundle: `FormulaLab`,
 * `DroneLab`, `RobotLab`, plus `lib/formula`, `lib/drone` and `lib/robot` behind
 * them and about 18.7 MB of GLB in `public/asset/practice`. Every one of those
 * was code-split and none of it was free — three simulators in one repository is
 * three renderers, three physics loops and three asset pipelines to keep alive
 * inside a page whose job is to be read.
 *
 * So each experience is now its own deployment and this page embeds it in the
 * popup it always opened into. What that buys, in order of how much it matters:
 *
 *   1. **The homepage stops carrying them.** The section's entire cost is three
 *      WebP posters and three thumbnails — about 440 kB, fetched lazily — and
 *      the simulators are downloaded only by a visitor who opens one.
 *   2. **They can move at their own speed.** A flight model or a hydraulics
 *      curve is now a deploy of one small app, not a release of this site.
 *   3. **The popup did not have to change shape.** `PracticeModal` was already
 *      a full-viewport dialog with a body slot, a fullscreen button and an
 *      Escape route, built on the argument that a landing section cannot host a
 *      running lab. An `<iframe>` in that slot is the same dialog.
 *
 * The cost, stated plainly: an embedded origin cannot be styled, cannot share
 * this page's fonts, and its loading state is its own. `PracticeModal` shows a
 * frame of its own until `load` fires, and offers "Mở tab mới" for the cases an
 * iframe genuinely cannot serve — iOS Safari's fullscreen, and a visitor who
 * wants the simulator on its own.
 *
 * ## Card 01 is an excavator, not a racing car
 *
 * The racing workshop is retired. What replaced it is a different kind of
 * machine on purpose — a hydraulic excavator, which is a *mechanism* lesson
 * where the car was an assembly one: four hydraulic groups, a slew ring and a
 * bucket, all of which move against each other in ways a student can feel. All
 * three cards are now vehicles you operate rather than models you inspect, and
 * the copy below is written from what each build's own interface actually
 * offers.
 */

export type PracticeId = 'excavator' | 'drone' | 'robot';

export type PracticeCapability = {
  glyph: PracticeGlyph;
  label: string;
  /** One clause. This is a capability line, not a paragraph. */
  detail: string;
};

/**
 * A hint printed on the poster's tool pill.
 *
 * These are not buttons and they are deliberately not styled as any: they name
 * what the *experience behind the poster* lets you do, which is the one thing a
 * still image cannot demonstrate about itself.
 */
export type PracticeTool = { glyph: PracticeGlyph; label: string };

export type PracticeExperience = {
  id: PracticeId;
  /** The two-digit number the rail, the poster and the brief all show. */
  index: string;
  title: string;
  /** Two lines at most — the rail cell is 200 px wide. */
  railTitle: string;
  /** The paragraph under the title in the brief column. */
  summary: string;
  capabilities: [PracticeCapability, PracticeCapability, PracticeCapability];
  tools: [PracticeTool, PracticeTool, PracticeTool];
  /** What the primary button says. All three open a modal, so all three agree. */
  action: string;
  /**
   * The deployment the popup embeds.
   *
   * Absolute and external. All three are YooX's own builds, which is why they
   * are embedded rather than linked — a visitor never leaves this page to reach
   * one — and it is also why the modal offers a new tab as well: an iframe
   * cannot request fullscreen on iOS Safari, and a simulator is exactly the kind
   * of thing someone wants on its own screen.
   */
  url: string;
  /** Cropped to the stage's own aspect at build time — see `scripts/`. */
  poster: string;
  /** 4:3, for the rail. */
  thumb: string;
  /** Alt text. A poster of a machine has to say which machine. */
  posterAlt: string;
};

const POSTER = '/asset/practice/poster';

export const PRACTICE_EXPERIENCES: PracticeExperience[] = [
  {
    id: 'excavator',
    index: '01',
    title: 'Vận hành máy xúc thủy lực',
    railTitle: 'Vận hành\nmáy xúc',
    summary: 'Nổ máy, lái bằng bánh xích, quay cabin và điều khiển từng khớp thủy lực để đào.',
    capabilities: [
      { glyph: 'drive', label: 'Lái bằng bánh xích', detail: 'Ga, vòng tua và tốc độ thật.' },
      { glyph: 'joint', label: 'Bốn khớp thủy lực', detail: 'Cabin, cần, tay và gầu — điều khiển riêng.' },
      { glyph: 'grip', label: 'Đào và xúc', detail: 'Cuộn gầu, nâng tải, đếm khối lượng.' },
    ],
    tools: [
      { glyph: 'orbit', label: 'Bốn góc nhìn' },
      { glyph: 'gauge', label: 'Bảng đồng hồ' },
      { glyph: 'route', label: 'Nhiệm vụ theo ca' },
    ],
    action: 'Mở trải nghiệm',
    url: 'https://yooxgame-excavator.vercel.app/',
    poster: `${POSTER}/excavator.webp`,
    thumb: `${POSTER}/excavator-thumb.webp`,
    posterAlt: 'Máy xúc thủy lực bánh xích với cần và gầu hạ xuống, trong phòng chụp sáng màu ngà.',
  },
  {
    id: 'drone',
    index: '02',
    title: 'Trải nghiệm lái drone',
    railTitle: 'Trải nghiệm\nlái drone',
    summary: 'Kích hoạt, cất cánh và bay bằng ga, chúc mũi, nghiêng và xoay trở — qua nhiều loại khí cụ.',
    capabilities: [
      { glyph: 'takeoff', label: 'Cất cánh & giữ độ cao', detail: 'Ga, chúc mũi, nghiêng và xoay trở.' },
      { glyph: 'route', label: 'Ba chế độ bay', detail: 'Position, acro và stabilized.' },
      { glyph: 'gauge', label: 'Thời tiết & gió', detail: 'Từ trời quang đến giông bão.' },
    ],
    tools: [
      { glyph: 'orbit', label: 'Đổi khí cụ' },
      { glyph: 'zoom', label: 'Bốn góc nhìn' },
      { glyph: 'gauge', label: 'Đồ thị & lidar' },
    ],
    action: 'Mở trải nghiệm',
    url: 'https://yoox-drone-iota.vercel.app/',
    poster: `${POSTER}/drone.webp`,
    thumb: `${POSTER}/drone-thumb.webp`,
    posterAlt: 'Drone bốn cánh màu trắng bay lơ lửng trong phòng chụp sáng màu ngà.',
  },
  {
    id: 'robot',
    index: '03',
    title: 'Trải nghiệm robot công nghiệp',
    railTitle: 'Trải nghiệm\nrobot công nghiệp',
    summary: 'Một dây chuyền thật: cánh tay robot, xe tự hành AGV và kệ hàng chạy theo chu trình.',
    capabilities: [
      { glyph: 'joint', label: 'Cánh tay robot', detail: 'Gắp và xếp theo từng chu trình.' },
      { glyph: 'auto', label: 'Xe tự hành AGV', detail: 'Chở hàng giữa các trạm trong xưởng.' },
      { glyph: 'inspect', label: 'Kệ hàng', detail: 'Nơi thùng hàng được xếp vào.' },
    ],
    tools: [
      { glyph: 'orbit', label: 'Bốn góc nhìn' },
      { glyph: 'auto', label: 'Đếm chu trình' },
      { glyph: 'gauge', label: 'Chọn thiết bị' },
    ],
    action: 'Mở trải nghiệm',
    url: 'https://yoox-robot-industry.vercel.app/',
    poster: `${POSTER}/robot.webp`,
    thumb: `${POSTER}/robot-thumb.webp`,
    posterAlt: 'Cánh tay robot công nghiệp màu trắng bên một thùng kim loại trong phòng chụp sáng màu ngà.',
  },
];

export function findExperience(id: PracticeId): PracticeExperience {
  return PRACTICE_EXPERIENCES.find((entry) => entry.id === id) ?? PRACTICE_EXPERIENCES[0];
}

/**
 * The bottom strip.
 *
 * Four claims about what a virtual lab is *for*, and each one is a claim the
 * three experiences above actually honour — repeat a dig cycle, orbit a running
 * machine, get a reading the instant the bucket takes a load. Kept as data
 * beside the experiences so a claim cannot outlive the thing that made it true.
 */
export const PRACTICE_BENEFITS: { glyph: PracticeGlyph; label: string; detail: string }[] = [
  { glyph: 'shield', label: 'An toàn tuyệt đối', detail: 'Thực hành trong môi trường ảo.' },
  { glyph: 'repeat', label: 'Lặp lại không giới hạn', detail: 'Thử, sai và làm lại dễ dàng.' },
  { glyph: 'depth', label: 'Hiểu sâu hơn', detail: 'Quan sát ở mọi góc độ.' },
  { glyph: 'signal', label: 'Kết quả tức thì', detail: 'Phản hồi và đánh giá ngay lập tức.' },
];
