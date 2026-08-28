import type { PracticeGlyph } from './glyphs';

/**
 * The three practice labs, as data.
 *
 * Same rule as the Library's manifest, for the same reason: the hub's rail, its
 * brief column, its preloader and its step chrome are all derived from this
 * list, so a fourth lab is an entry rather than four coordinated edits to JSX.
 * And the same honesty clause — every entry here opens something that actually
 * runs. The version of this section that shipped before had a card for a lab
 * that did not exist yet, drawn as a stated gap precisely so it could not be
 * mistaken for a product. There is no gap to state any more, so there is no
 * fourth card.
 */

export type PracticeId = 'formula' | 'drone' | 'robot';

export type PracticeCapability = {
  glyph: PracticeGlyph;
  label: string;
  /** One clause. This is a capability line, not a paragraph. */
  detail: string;
};

export type PracticeExperience = {
  id: PracticeId;
  /** The two-digit number the rail and the brief both show. */
  index: string;
  title: string;
  /** Two lines at most — the rail cell is 200 px wide. */
  railTitle: string;
  /** The paragraph under the title in the brief column. */
  summary: string;
  capabilities: [PracticeCapability, PracticeCapability, PracticeCapability];
  /** What the primary button says while the lab is idle. */
  action: string;
  /** The lab's own drawn mark, used in the rail before its stage has been built. */
  mark: PracticeGlyph;
  /** Names the WebGL work, so the hub can warn honestly on a weak device. */
  weight: 'heavy' | 'medium';
};

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
    action: 'Mở toàn màn hình',
    mark: 'car',
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
    action: 'Bắt đầu bài bay',
    mark: 'drone',
    weight: 'medium',
  },
  {
    id: 'robot',
    index: '03',
    title: 'Robot công nghiệp',
    railTitle: 'Vận hành\nrobot công nghiệp',
    summary: 'Điều khiển cánh tay robot gắp và xếp vật vào đúng vị trí sản xuất.',
    capabilities: [
      { glyph: 'joint', label: 'Điều khiển', detail: 'Sáu khớp, một bộ điều khiển đơn giản.' },
      { glyph: 'grip', label: 'Gắp vật', detail: 'Kẹp chi tiết từ băng chuyền.' },
      { glyph: 'auto', label: 'Chạy tự động', detail: 'Lặp lại thao tác vừa dạy.' },
    ],
    action: 'Bắt đầu vận hành',
    mark: 'robot',
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
 * engine, get a verdict the instant a box lands in its slot. Kept as data
 * beside the labs so a claim cannot outlive the thing that made it true.
 */
export const PRACTICE_BENEFITS: { glyph: PracticeGlyph; label: string; detail: string }[] = [
  { glyph: 'shield', label: 'An toàn tuyệt đối', detail: 'Thực hành trong môi trường ảo.' },
  { glyph: 'repeat', label: 'Lặp lại không giới hạn', detail: 'Thử, sai và làm lại dễ dàng.' },
  { glyph: 'depth', label: 'Hiểu sâu hơn', detail: 'Quan sát ở mọi góc độ.' },
  { glyph: 'signal', label: 'Kết quả tức thì', detail: 'Phản hồi ngay sau thao tác.' },
];
