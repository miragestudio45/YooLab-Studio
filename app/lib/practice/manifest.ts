import type { PracticeGlyph } from './glyphs';

/**
 * The three practice labs, as data.
 *
 * Same rule as the Library's manifest, for the same reason: the hub's rail, its
 * poster stage, its brief column, its modal and its preloader are all derived
 * from this list, so a fourth lab is an entry rather than five coordinated
 * edits to JSX. And the same honesty clause — every entry here opens something
 * that actually runs.
 */

export type PracticeId = 'formula' | 'drone' | 'robot';

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
  /** Cropped to the stage's own aspect at build time — see `scripts/`. */
  poster: string;
  /** 4:3, for the rail. */
  thumb: string;
  /** Alt text. A poster of a machine has to say which machine. */
  posterAlt: string;
  /** Names the WebGL work, so the hub can warn honestly on a weak device. */
  weight: 'heavy' | 'medium';
};

const POSTER = '/asset/practice/poster';

export const PRACTICE_EXPERIENCES: PracticeExperience[] = [
  {
    id: 'formula',
    index: '01',
    title: 'Xưởng mô hình xe đua',
    railTitle: 'Xưởng mô hình\nxe đua',
    summary: 'Lắp ráp, quan sát cấu tạo và lái thử mô hình xe đua F1.',
    capabilities: [
      { glyph: 'assemble', label: 'Lắp ráp', detail: 'Từng chi tiết, từng bộ phận.' },
      { glyph: 'inspect', label: 'Quan sát', detail: 'Khám phá cấu tạo bên trong.' },
      { glyph: 'drive', label: 'Lái thử', detail: 'Điều khiển và cảm nhận tốc độ.' },
    ],
    tools: [
      { glyph: 'orbit', label: 'Xoay' },
      { glyph: 'zoom', label: 'Phóng to' },
      { glyph: 'layers', label: 'Xuyên thấu' },
    ],
    action: 'Mở trải nghiệm',
    poster: `${POSTER}/car.webp`,
    thumb: `${POSTER}/car-thumb.webp`,
    posterAlt: 'Mô hình xe đua công thức 1 trên bàn quay trong phòng chụp sáng màu ngà.',
    weight: 'heavy',
  },
  {
    id: 'drone',
    index: '02',
    title: 'Trải nghiệm lái drone',
    railTitle: 'Trải nghiệm\nlái drone',
    summary: 'Cất cánh, bay qua các điểm mốc và hạ cánh — với mô hình bay thật.',
    capabilities: [
      { glyph: 'takeoff', label: 'Cất cánh', detail: 'Giữ độ cao và thăng bằng.' },
      { glyph: 'route', label: 'Bay theo lộ trình', detail: 'Qua từng vòng mốc trên không.' },
      { glyph: 'landing', label: 'Hạ cánh', detail: 'Đặt xuống đúng bãi đáp.' },
    ],
    tools: [
      { glyph: 'orbit', label: 'Bay tự do' },
      { glyph: 'route', label: 'Lộ trình' },
      { glyph: 'gauge', label: 'Bảng đồng hồ' },
    ],
    action: 'Mở trải nghiệm',
    poster: `${POSTER}/drone.webp`,
    thumb: `${POSTER}/drone-thumb.webp`,
    posterAlt: 'Drone bốn cánh màu trắng bay lơ lửng trong phòng chụp sáng màu ngà.',
    weight: 'medium',
  },
  {
    id: 'robot',
    index: '03',
    title: 'Trải nghiệm robot công nghiệp',
    railTitle: 'Trải nghiệm\nrobot công nghiệp',
    summary: 'Vận hành cánh tay robot sáu khớp gắp và xếp thùng hàng lên pallet.',
    capabilities: [
      { glyph: 'joint', label: 'Điều khiển sáu khớp', detail: 'Bảng điều khiển như thật.' },
      { glyph: 'grip', label: 'Gắp bằng chân không', detail: 'Hút thùng hàng từ băng tải.' },
      { glyph: 'auto', label: 'Chạy tự động', detail: 'Lặp lại chu trình đã dạy.' },
    ],
    tools: [
      { glyph: 'joint', label: 'Sáu khớp' },
      { glyph: 'auto', label: 'Chu trình tự động' },
      { glyph: 'gauge', label: 'Bảng điều khiển' },
    ],
    action: 'Mở trải nghiệm',
    poster: `${POSTER}/robot.webp`,
    thumb: `${POSTER}/robot-thumb.webp`,
    posterAlt: 'Cánh tay robot công nghiệp màu trắng bên một thùng kim loại trong phòng chụp sáng màu ngà.',
    weight: 'medium',
  },
];

export function findExperience(id: PracticeId): PracticeExperience {
  return PRACTICE_EXPERIENCES.find((entry) => entry.id === id) ?? PRACTICE_EXPERIENCES[0];
}

/**
 * The bottom strip.
 *
 * Four claims about what a virtual lab is *for*, and each one is a claim the
 * three experiences above actually honour — repeat a landing, orbit a running
 * engine, get a verdict the instant a case lands on the pallet. Kept as data
 * beside the labs so a claim cannot outlive the thing that made it true.
 */
export const PRACTICE_BENEFITS: { glyph: PracticeGlyph; label: string; detail: string }[] = [
  { glyph: 'shield', label: 'An toàn tuyệt đối', detail: 'Thực hành trong môi trường ảo.' },
  { glyph: 'repeat', label: 'Lặp lại không giới hạn', detail: 'Thử, sai và làm lại dễ dàng.' },
  { glyph: 'depth', label: 'Hiểu sâu hơn', detail: 'Quan sát ở mọi góc độ.' },
  { glyph: 'signal', label: 'Kết quả tức thì', detail: 'Phản hồi và đánh giá ngay lập tức.' },
];
