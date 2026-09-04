'use client';

import { useState } from 'react';
import { ModelThumbnail } from './ModelThumbnail';
import { BEE_THUMBNAIL, CLOWNFISH_THUMBNAIL, JELLYFISH_THUMBNAIL } from '../lib/three/thumbnailRequests';
import type { ThumbnailRequest } from '../lib/three/thumbnails';
import {
  IconChevronDown,
  IconCube3d,
  IconFullscreen,
  IconHotspot,
  IconLabels,
  IconMenu,
  IconModel,
  IconPencil,
  IconPlay,
  IconReset,
  IconShareNodes,
  IconTrackText,
  IconViewpoint,
  IconVr,
/* The shared module, not the full set — this section is not the editor, and
   importing from `EditorIcons` would pull all forty-nine of its glyphs into the
   first request wave. See `EditorIconsShared.tsx`. */
} from './studio/EditorIconsShared';

/**
 * One platform, three ways to use it.
 *
 * Three SaaS cards side by side is the wrong shape for this: it asks a visitor
 * to read all three to find the one that is theirs, and it forces every role to
 * be summarised in the same four lines. A segmented control lets each role have
 * a full asymmetric layout — the claim, what that person actually does, and a
 * picture of the product doing it.
 *
 * The student tab also absorbed what used to be a separate "học sinh sáng tạo"
 * section further down the page. That section made no claim this one does not,
 * and two sections making the same claim is how a page gets long without getting
 * stronger.
 *
 * ## One viewer, three lessons
 *
 * The three roles used to get three *different* mocks — a compose frame, an
 * explore stage and a two-by-two deploy grid. Three shapes with three intrinsic
 * heights meant switching role made the section jump, and each shape only had
 * room to be a diagram of itself: four empty rounded squares for a tool rail,
 * a bare column of text for an object panel, and a timeline of four saturated
 * bars in colours that exist nowhere else on this site.
 *
 * There is now ONE shape — the lesson player, the thing all three roles
 * actually open — and the role changes its *content*: which specimen is on the
 * stage, which of its parts are pinned, which tool is live in the rail, and
 * where the lesson is in its five steps. The frame never resizes, so the tabs
 * swap a lesson rather than rebuilding the section.
 *
 * Every visual is a real render of an asset that ships in this repository,
 * baked through the shared thumbnail renderer, and every part name, note and
 * subtitle below is the same string the Library's own manifest publishes for
 * that specimen. Nothing here is an illustration of a product that does not
 * exist, and nothing here is anatomy invented to fill a label.
 */

type RoleId = 'teacher' | 'student' | 'school';

/* ------------------------------------------------------------- role marks --- */
/*
 * The three role marks, and why they are drawn here.
 *
 * Everything inside the viewer mock below is an icon from
 * `studio/EditorIcons` — generated out of the product's own Figma frame, and
 * DESIGN.md is explicit that a mark redrawn from a screenshot is a different
 * mark. But that set has no mortarboard and no institution, because the editor
 * has no reason to draw either. These three are authored to the same language
 * the generated set speaks — 24-unit box, 1.26 stroke, round caps and joins,
 * `currentColor` — so the segmented control reads as one hand with the panel
 * beside it rather than as a second icon system.
 */
const MARK = {
  stroke: 'currentColor',
  strokeWidth: 1.26,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

const IconRoleTeacher = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g {...MARK}>
      <rect x="3.1" y="3.5" width="17.8" height="12.1" rx="2.4" />
      <path d="M12 15.6v3.2M8.4 18.8h7.2" />
      <path d="M7.4 8.1h6.2M7.4 11.2h3.4" />
    </g>
  </svg>
);

const IconRoleStudent = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g {...MARK}>
      <path d="M2.9 8.7 12 4.5l9.1 4.2-9.1 4.2z" />
      <path d="M6.5 10.7v4c0 1.86 2.46 3.37 5.5 3.37s5.5-1.51 5.5-3.37v-4" />
      <path d="M20.3 9.2v4.5" />
    </g>
  </svg>
);

const IconRoleSchool = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g {...MARK}>
      <path d="M3.3 20.5h17.4" />
      <path d="M5.2 20.5v-9.9c0-.59.32-1.13.84-1.41l5.2-2.83a1.6 1.6 0 0 1 1.52 0l5.2 2.83c.52.28.84.82.84 1.41v9.9" />
      <path d="M9.9 20.5v-4.3h4.2v4.3" />
    </g>
  </svg>
);

/* ----------------------------------------------------------------- content --- */

/**
 * The player's left rail. Five tools, one of them live per role.
 *
 * Two of these were chosen twice. The first pass took `IconText` for "Ghi chú"
 * and `IconComponents` for "Tách lớp", and a 4× capture of the rail showed why
 * both were wrong: `IconText` is a FILLED hexagon badge and sat in a column of
 * four line marks as the one solid shape, and `IconComponents` is the product's
 * shape-library mark — a square, a triangle, a cross and a circle — which at
 * 18 px is four small things where every mark beside it is one thing.
 *
 * All five are now outline marks from the same generated set, and the fourth is
 * `IconLabels`, the product's own tag: a label tool is exactly what the three
 * pins on the stage are, so the rail is a legend for the frame rather than five
 * generic verbs.
 */
type ToolId = 'select' | 'note' | 'draw' | 'label' | 'view';

const TOOLS: { id: ToolId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'select', label: 'Chọn', Icon: IconViewpoint },
  { id: 'note', label: 'Ghi chú', Icon: IconTrackText },
  { id: 'draw', label: 'Bút vẽ', Icon: IconPencil },
  { id: 'label', label: 'Nhãn', Icon: IconLabels },
  { id: 'view', label: 'Xem 3D', Icon: IconCube3d },
];

type Role = {
  id: RoleId;
  tab: string;
  TabIcon: React.ComponentType<{ className?: string }>;
  kicker: string;
  headline: string;
  lede: string;
  points: { title: string; body: string }[];
  cta: { label: string; href: string };
  /** What the player is showing while this role's tab is selected. */
  lesson: {
    /** The specimen on the stage, and the still in the media shelf. */
    thumb: ThumbnailRequest;
    /** A second piece of media on the lesson — carries the play badge. */
    clip: ThumbnailRequest;
    /** The specimen, exactly as the Library manifest names it. */
    specimen: string;
    latin: string;
    /** The object outline. The first row is always the overview. */
    parts: string[];
    /** Which of `parts` get a pin on the stage, by index. */
    pins: number[];
    note: string;
    step: { index: number; total: number; title: string };
    tool: ToolId;
    spin: boolean;
  };
};

/*
 * The school enquiry, composed rather than hand-encoded.
 *
 * A `mailto:` with a Vietnamese subject and a multi-line body is most of a
 * screen of percent-escapes if written out, and the half-escaped version is
 * indistinguishable from the correct one by eye. `encodeURIComponent` is the
 * only reader that gets it right every time.
 *
 * The body is four prompts, because the first reply to a bare enquiry is always
 * the same four questions and asking them here saves a round trip.
 */
const SCHOOL_ENQUIRY = `mailto:hello@yoolab.vn?subject=${encodeURIComponent(
  'Tư vấn triển khai YooLab cho nhà trường',
)}&body=${encodeURIComponent(
  [
    'Tên trường:',
    'Số lớp / tổ bộ môn:',
    'Môn muốn triển khai trước:',
    'Người liên hệ và số điện thoại:',
    '',
  ].join('\n'),
)}`;

const ROLES: Role[] = [
  {
    id: 'teacher',
    tab: 'Giáo viên',
    TabIcon: IconRoleTeacher,
    kicker: 'Soạn & tổ chức',
    headline: 'Soạn bài giảng 3D không cần viết code.',
    lede: 'Chọn học liệu, dựng không gian, gắn ghi chú và xếp nhịp trình bày — tất cả trong một scene dùng lại được cho các lớp sau.',
    points: [
      { title: 'Chọn học liệu', body: 'Mở thư viện theo môn và đưa mô hình vào bài.' },
      { title: 'Tạo bài học', body: 'Dựng không gian, đặt góc nhìn, chia thành từng bước.' },
      { title: 'Chú thích', body: 'Gắn kiến thức đúng vào bộ phận, đúng thời điểm.' },
      { title: 'Giao bài', body: 'Chia sẻ để mở trên web, màn hình lớp học hoặc XR.' },
      { title: 'Tổ chức hoạt động', body: 'Thêm hotspot và câu hỏi trả lời ngay trên mô hình.' },
    ],
    cta: { label: 'Xem YooStudio', href: '#cong-cu' },
    lesson: {
      thumb: JELLYFISH_THUMBNAIL,
      clip: CLOWNFISH_THUMBNAIL,
      specimen: 'Sứa biển',
      latin: 'Ba lớp cơ thể trong suốt',
      parts: ['Màng ngoài', 'Tầng giữa', 'Khoang giữa', 'Xúc tu'],
      pins: [0, 1, 3],
      note: 'Ngành Ruột khoang. Di chuyển bằng cách co bóp màng, đẩy nước ra sau.',
      step: { index: 2, total: 5, title: 'Ba lớp cơ thể sứa' },
      tool: 'note',
      spin: true,
    },
  },
  {
    id: 'student',
    tab: 'Học sinh',
    TabIcon: IconRoleStudent,
    kicker: 'Khám phá & tạo',
    headline: 'Không chỉ xem. Tự tay tạo ra.',
    lede: 'Xoay, tách lớp và đọc chú thích trên mô hình thật — rồi tự dựng scene 3D/XR của mình và trình bày nó.',
    points: [
      { title: 'Xoay & quan sát', body: 'Nhìn mô hình từ mọi phía, phóng vào chi tiết.' },
      { title: 'Tương tác', body: 'Đổi trạng thái, tách lớp, mở chú thích.' },
      { title: 'Thực hành', body: 'Làm những thao tác khó thực hiện trong lớp.' },
      { title: 'Tạo scene', body: 'Chọn học liệu, sắp đặt không gian, chọn góc nhìn.' },
      { title: 'Trình bày', body: 'Dẫn người xem theo mạch của mình, kể cả trong XR.' },
    ],
    cta: { label: 'Mở thư viện học liệu', href: '#thu-vien' },
    lesson: {
      thumb: BEE_THUMBNAIL,
      clip: JELLYFISH_THUMBNAIL,
      specimen: 'Ong mật',
      latin: 'Apis mellifera',
      parts: ['Đầu', 'Ngực', 'Cánh', 'Bụng'],
      pins: [1, 2, 3],
      note: 'Cả hai đôi cánh và cả sáu chân đều gắn vào ngực. Nhịp cánh khoảng 230 lần mỗi giây.',
      step: { index: 3, total: 5, title: 'Cánh gắn vào đâu' },
      tool: 'view',
      spin: true,
    },
  },
  {
    id: 'school',
    tab: 'Nhà trường',
    TabIcon: IconRoleSchool,
    kicker: 'Triển khai',
    headline: 'Một kho học liệu số cho toàn trường.',
    lede: 'Học liệu và bài giảng ở cùng một nơi, để giáo viên mới nhận lớp là dùng được ngay.',
    points: [
      { title: 'Học liệu số', body: 'Thư viện dùng chung cho nhiều lớp, nhiều khối.' },
      { title: 'Đồng hành cùng giáo viên', body: 'Hỗ trợ trong giai đoạn đầu làm quen.' },
      { title: 'Lớp học', body: 'Mở bài giảng trên web hoặc màn hình lớp.' },
      { title: 'Năng lực số', body: 'Giáo viên và học sinh đều tạo được nội dung 3D.' },
      { title: 'Triển khai theo quy mô', body: 'Mở rộng theo từng trường, từng tổ bộ môn.' },
    ],
    /*
     * The one tab whose CTA must not land on the signup form.
     *
     * This pointed at `#bat-dau-voi-yoolab`, and the button waiting there
     * creates a personal teacher account — so a principal who asked for a
     * rollout consultation was handed a form for one seat. The other two tabs
     * are correctly self-serve; this audience is not, and scrolling them into
     * the wrong funnel loses the enquiry that the whole tab was written for.
     *
     * `mailto:` rather than a form because there is no lead endpoint on this
     * API — it exposes auth and studio projects and nothing else — and a form
     * posting nowhere is worse than a mail client that opens. The subject is
     * pre-filled so the enquiry arrives already sorted from a teacher's.
     */
    cta: { label: 'Nhận tư vấn triển khai', href: SCHOOL_ENQUIRY },
    lesson: {
      thumb: CLOWNFISH_THUMBNAIL,
      clip: BEE_THUMBNAIL,
      specimen: 'Cá cảnh biển',
      latin: 'Hệ vây và chuyển động',
      parts: ['Thân', 'Vây lưng', 'Vây ngực', 'Vây đuôi'],
      pins: [1, 2, 3],
      note: 'Năm nhóm vây — lưng, ngực, bụng, hậu môn, đuôi. Thân dẹp hai bên để len qua khe hẹp.',
      step: { index: 1, total: 5, title: 'Bộ vây và chuyển động' },
      tool: 'select',
      spin: false,
    },
  },
];

/*
 * The four capability cards.
 *
 * Marks come from the editor's own generated set rather than from a second icon
 * grid: drag is the four-way move the canvas uses, the library is a model in its
 * box, multi-platform is the XR mark, and sharing is the share graph.
 *
 * The second card says what this repository actually ships. The reference for
 * this section asked for "hàng nghìn mô hình 3D" and the Library publishes 33
 * across six subjects, so the claim is stated as the shelf rather than as a
 * count — PRODUCT.md's first non-negotiable is that nothing on this page is
 * proof that has not been earned.
 */
const FEATURES: { title: string; body: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  {
    title: 'Kéo thả trực quan',
    body: 'Xây dựng bài giảng chỉ với vài thao tác kéo thả đơn giản.',
    Icon: IconHotspot,
  },
  {
    title: 'Thư viện theo môn',
    body: 'Mô hình 3D chuẩn khoa học cho sáu môn, vẫn đang được bổ sung.',
    Icon: IconModel,
  },
  {
    title: 'Đa nền tảng',
    body: 'Dạy học mọi lúc, mọi nơi: web, màn hình lớp học và XR.',
    Icon: IconVr,
  },
  {
    title: 'Chia sẻ dễ dàng',
    body: 'Xuất bản bài giảng, chia sẻ hoặc dùng chung trong tổ chuyên môn.',
    Icon: IconShareNodes,
  },
];

/* -------------------------------------------------------------- the viewer --- */

/**
 * The lesson player.
 *
 * `aria-hidden`, because it is a picture of software rather than software: every
 * control in it is a `div`, nothing here is focusable, and a screen reader
 * walking sixteen unusable buttons would be worse than walking none. The claim
 * the section is making is already written in the column beside it.
 */
function LessonViewer({ lesson }: { lesson: Role['lesson'] }) {
  const { step } = lesson;

  return (
    <div className="edu-viewer" aria-hidden="true">
      <div className="edu-viewer-stage">
        <div className="edu-viewer-floor" />
        <ModelThumbnail request={lesson.thumb} alt="" />

        {/* The tool rail floats over the stage, as it does in the product: the
            grid runs under it, which is what says "this is one canvas with a
            palette on it" rather than "these are two panels". */}
        <div className="edu-tools">
          {TOOLS.map((tool) => (
            <div
              key={tool.id}
              className={`edu-tool${tool.id === lesson.tool ? ' is-active' : ''}`}
            >
              <tool.Icon />
              <span>{tool.label}</span>
            </div>
          ))}
        </div>

        <div className="edu-stage-controls">
          <div className="edu-stage-control"><IconReset /></div>
          <div className="edu-stage-control"><IconFullscreen /></div>
          <div className="edu-stage-control"><IconMenu /></div>
        </div>

        {/* Three pins, on three real parts of the specimen on the stage. The
            middle one leads the other way so the set reads as anchors on a
            subject rather than as a stack of labels down one edge. */}
        {lesson.pins.map((partIndex, order) => (
          <div
            key={partIndex}
            className={`edu-pin edu-pin--${order + 1}${order === 2 ? ' edu-pin--flip' : ''}`}
          >
            <span className="edu-pin-label">{lesson.parts[partIndex]}</span>
            <span className="edu-pin-dot"><i /></span>
            <span className="edu-pin-lead" />
          </div>
        ))}
      </div>

      <div className="edu-transport">
        <div className="edu-transport-play"><IconPlay /></div>

        <div className="edu-transport-step">
          <small>Bước {String(step.index).padStart(2, '0')} / {String(step.total).padStart(2, '0')}</small>
          <b>{step.title}</b>
        </div>

        {/* Five nodes on one rail, filled to the live step. A dot per step
            rather than a percentage bar: the lesson has five discrete beats and
            a smooth bar would claim it has a duration. */}
        <div className="edu-transport-track">
          <span className="edu-track-rail" />
          <span
            className="edu-track-done"
            style={{ '--done': `${((step.index - 1) / (step.total - 1)) * 100}%` } as React.CSSProperties}
          />
          {Array.from({ length: step.total }, (_, index) => (
            <span
              key={index}
              className={`edu-track-node${index < step.index ? ' is-done' : ''}${index === step.index - 1 ? ' is-live' : ''}`}
              style={{ '--at': `${(index / (step.total - 1)) * 100}%` } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="edu-transport-spin">
          <span>Tự động xoay</span>
          <span className={`edu-switch${lesson.spin ? ' is-on' : ''}`}><i /></span>
        </div>

        <div className="edu-transport-steps">
          <div className="edu-transport-arrow edu-transport-arrow--back"><IconChevronDown /></div>
          <div className="edu-transport-arrow edu-transport-arrow--next"><IconChevronDown /></div>
        </div>
      </div>

      <div className="edu-object">
        <p className="edu-object-label">Đối tượng</p>
        <div className="edu-object-name">
          <i />
          <b>{lesson.specimen}</b>
          <small>{lesson.latin}</small>
        </div>

        <div className="edu-object-list">
          <span className="is-active">Thông tin tổng quan</span>
          {lesson.parts.map((part) => <span key={part}>{part}</span>)}
          <span>Ghi chú &amp; câu hỏi</span>
        </div>

        <div className="edu-object-note">
          <b>Ghi chú nhanh</b>
          <p>{lesson.note}</p>
        </div>

        <div className="edu-object-media">
          <p className="edu-object-label">Media</p>
          <div>
            <div className="edu-media-slot">
              <ModelThumbnail request={lesson.thumb} alt="" />
            </div>
            <div className="edu-media-slot edu-media-slot--clip">
              <ModelThumbnail request={lesson.clip} alt="" />
              <span><IconPlay /></span>
            </div>
          </div>
        </div>

        <div className="edu-object-add">+ Thêm ghi chú</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the section --- */

export function EducationSection() {
  const [role, setRole] = useState<RoleId>('teacher');
  const active = ROLES.find((entry) => entry.id === role) ?? ROLES[0];

  return (
    <section className="education" id="giao-duc" aria-labelledby="education-title">
      {/*
        One screen-tall grid whose rows measure themselves.
        DESIGN.md: "Never estimate a head band. Make the layout subtract it."
        The head, the switcher and the brief card are `auto` rows inside the
        left column and the player takes the remainder, so the section stops
        depending on a token that guessed how tall two lines of display type
        would be at each of seven widths. The capability row is the only thing
        deliberately below the fold — it is a summary of what the panel above
        already demonstrated, and that sliver is what invites the scroll.
      */}
      <div className="shell education-stage">
        <div className="education-panel" role="tabpanel" aria-label={active.tab} data-reveal>
          <div className="education-aside">
            {/* `section-heading` carries no layout of its own — it is the hook
                every display heading on this page hangs off, `h2` and `h2 em`
                both. Dropping it here would give this section its own display
                type, which is the one thing DESIGN.md §3 forbids. */}
            <div className="section-heading education-head">
              <p className="section-kicker">Dành cho giáo dục</p>
              <h2 id="education-title">Một nền tảng.<br /><em>Ba cách sử dụng.</em></h2>
            </div>

            <div className="education-tabs" role="tablist" aria-label="Vai trò">
              {ROLES.map((entry) => (
                <button
                  type="button"
                  role="tab"
                  key={entry.id}
                  aria-selected={role === entry.id}
                  className={role === entry.id ? 'is-active' : ''}
                  onClick={() => setRole(entry.id)}
                >
                  <entry.TabIcon />
                  {entry.tab}
                </button>
              ))}
            </div>

            <div className="education-brief">
              <p className="education-kicker">{active.kicker}</p>
              <h3>{active.headline}</h3>
              <p className="education-lede">{active.lede}</p>
              <ol className="education-points">
                {active.points.map((point, index) => (
                  <li key={point.title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <b>{point.title}</b>
                    <small>{point.body}</small>
                  </li>
                ))}
              </ol>
              <a className="education-cta" href={active.cta.href}>
                {active.cta.label} <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="education-showcase">
            {/* Two lines from a measure in `ch`, not from a `<br />`. The break
                was hard-coded and hidden on phones, which left
                `phục vụba việc` with no space where the tag had been. */}
            <p className="education-showcase-lede">
              Cùng một mô hình phục vụ ba việc khác nhau. Chọn phần của bạn.
            </p>
            <LessonViewer lesson={active.lesson} />
          </div>
        </div>

        <ul className="education-features" data-reveal>
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <span className="education-feature-mark" aria-hidden="true"><feature.Icon /></span>
              <b>{feature.title}</b>
              <small>{feature.body}</small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
