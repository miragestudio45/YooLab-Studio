'use client';

import { useState } from 'react';
import { ModelThumbnail } from './ModelThumbnail';
import { LibraryViewer } from './library/LibraryViewer';
import { showcaseById } from '../lib/education/showcase';
import { useConsult } from './ConsultModal';
import { StartWithYooLabButton } from './StartWithYooLabButton';
import {
  MECH_WHALE_THUMBNAIL,
  SPIDER_DRONE_THUMBNAIL,
  WORK_DRONE_THUMBNAIL,
} from '../lib/three/thumbnailRequests';
import type { ThumbnailRequest } from '../lib/three/thumbnails';
import {
  IconCube3d,
  IconHotspot,
  IconLabels,
  IconModel,
  IconPencil,
  IconShareNodes,
  IconTrackText,
  IconViewpoint,
  IconVr,
/* The shared module, not the full set — this section is not the editor, and
   importing from `EditorIcons` would pull all forty-nine of its glyphs into the
   first request wave. See `EditorIconsShared.tsx`. */
} from './studio/EditorIconsShared';

/**
 * One platform, three roles.
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
 * Every visual is a real render of an asset that ships in this repository, baked
 * through the shared thumbnail renderer, and every part name and note below is
 * the same string the showcase manifest publishes for that specimen. Nothing
 * here is an illustration of a product that does not exist, and no part is named
 * that the mesh does not have.
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
  /* `href` navigates; `action: 'product' | 'consult'` runs the real thing.
     The teacher row used to be labelled "Xem YooStudio" and merely scrolled to
     the demo — a product name that is not this product, on a button that does
     not do what it says. */
  cta: { label: string; href: string } | { label: string; action: 'product' | 'consult' };
  /** What the player is showing while this role's tab is selected. */
  lesson: {
    /** The specimen on the stage, and the still in the media shelf. */
    /*
     * A manifest id, so the panel runs a real mesh through the real viewer —
     * same loader, same framing, same material preset the Library uses —
     * instead of showing a baked still of one. That is the point: the section
     * claims the platform is real, and a photograph of it is the weakest
     * possible way to make that claim.
     *
     * The ids resolve against `lib/education/showcase.ts`, not against the
     * Library's own manifest. The panel used to run the T-rex, the bee and the
     * clownfish — the same three assets the hero, the bridge, the proof layer
     * and the Library rail all already show — so by the time a visitor reached
     * this section it was the fourth appearance of the site's best-looking
     * animals rather than evidence that the platform takes whatever a teacher
     * brings it. The three robotics models are engineering subjects, which is
     * the argument this section is actually making.
     */
    specimenId: string;
    thumb: ThumbnailRequest;
    /** A second piece of media on the lesson — carries the 3D badge. */
    clip: ThumbnailRequest;
    /** The specimen, exactly as the showcase manifest names it. */
    specimen: string;
    /*
     * The line under the name.
     *
     * Called `latin` while the three specimens were animals, which is what it
     * held: `Tyrannosaurus rex`, `Apis mellifera`. A binomial is one kind of
     * subtitle, not the only kind, and a machine does not have one — so the
     * field is named for its slot rather than for what used to sit in it.
     */
    caption: string;
    /** The object outline. The first row is always the overview. */
    parts: string[];
    /** Which of `parts` get a pin on the stage, by index. */
    pins: number[];
    note: string;
    step: { index: number; total: number; title: string };
    tool: ToolId;
  };
};

/*
 * The school enquiry used to be a composed `mailto:` here.
 *
 * It is gone because the enquiry now goes through the shared consultation
 * form — see `ConsultModal`. The reasoning that put a `mailto:` here was
 * sound at the time (there is still no lead endpoint) but it made the visitor
 * write the message themselves, which is the gap MKT reported. The four
 * prompts this body used to carry are now fields in that form, and the same
 * message is composed for them by `lib/contact/consult.ts`.
 */

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
    cta: { label: 'Mở YooLab ngay', action: 'product' },
    lesson: {
      specimenId: 'work-drone',
      thumb: WORK_DRONE_THUMBNAIL,
      clip: MECH_WHALE_THUMBNAIL,
      specimen: 'Drone quan trắc Dv2',
      caption: 'Công nghệ 8 · Cơ cấu bay',
      parts: ['Ống đẩy', 'Cánh cân bằng', 'Khoang quan sát', 'Vỏ thân'],
      pins: [0, 1, 3],
      note: 'Bốn ống đẩy đặt đối xứng quanh trọng tâm. Đổi lực đẩy giữa chúng là đổi hướng bay — không có bánh lái nào cả.',
      step: { index: 2, total: 5, title: 'Không bánh lái thì rẽ bằng gì' },
      tool: 'note',
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
    cta: { label: 'Khám phá bài học', href: '#thu-vien' },
    lesson: {
      specimenId: 'walker-drone',
      thumb: SPIDER_DRONE_THUMBNAIL,
      clip: WORK_DRONE_THUMBNAIL,
      specimen: 'Robot nhện thăm dò',
      caption: 'STEM · Robot đi bộ',
      parts: ['Thân trung tâm', 'Chân ba đoạn', 'Cụm cảm biến', 'Vành dẫn hướng'],
      pins: [1, 2, 3],
      note: 'Bốn chân hạ và nâng lệch pha nhau nên luôn còn điểm tựa. Thân ở giữa xoay độc lập với chân.',
      step: { index: 3, total: 5, title: 'Chân giữ thăng bằng thế nào' },
      tool: 'view',
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
    cta: { label: 'Trao đổi thêm', action: 'consult' },
    lesson: {
      specimenId: 'bionic-whale',
      thumb: MECH_WHALE_THUMBNAIL,
      clip: SPIDER_DRONE_THUMBNAIL,
      specimen: 'Cá voi cơ khí',
      caption: 'Liên môn · Mô phỏng sinh học',
      parts: ['Thân đốt', 'Vây chính', 'Vây đuôi', 'Ăng-ten'],
      pins: [1, 2, 3],
      note: 'Sóng uốn chạy dọc các đốt thân là nguyên lý đẩy mượn từ cá voi thật. Vây đuôi nằm ngang, đập lên xuống.',
      step: { index: 1, total: 5, title: 'Máy học được gì từ sinh vật' },
      tool: 'select',
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
const NOOP = () => {};

function LessonViewer({ lesson }: { lesson: Role['lesson'] }) {
  const { step } = lesson;
  const specimen = showcaseById(lesson.specimenId);

  return (
    <div className="edu-viewer" aria-hidden="true">
      <div className="edu-viewer-stage">
        <div className="edu-viewer-floor" />
        {/* The real Library viewer, not a picture of one. Its own caption and
            chrome are suppressed by `.edu-viewer-stage` in sections.css, because
            this frame draws its own step strip under it. */}
        {specimen ? <LibraryViewer item={specimen} onOpenWorkshop={NOOP} /> : null}

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

        {/*
          Three round icon buttons used to float in this corner — reset, full
          screen, menu — and they are gone for the same reason the transport's
          play button is. See the note on `.edu-transport`.
        */}

        {/*
          The mock used to draw its own three pins here, at fixed CSS positions.
          That was right when the stage was a baked still of one specimen and
          wrong the moment it became a live viewer: the positions were authored
          against the jellyfish composition, so on a T-rex they pointed at empty
          air, and the specimen now rotates underneath them anyway.

          The real viewer already carries better ones — `ModelStage` binds its
          anchors to actual joints, so a label on the skull stays on the skull
          through the animation. Deleting the decorative set is what lets those
          be seen.
        */}
      </div>

      {/*
        A caption, not a transport.
        This strip used to carry a play button, an auto-rotate switch and a
        previous/next pair, and every one of them was a `div` that did nothing —
        the section is a picture of the product, so there was no lesson for a
        play button to start. A control a visitor can prove is dead in one click
        costs more trust than the realism it was buying, and the review found all
        four in the first pass over the section.

        What is left states where the lesson is, which is the only thing this
        strip was ever telling the reader. The five nodes are a dot per step
        rather than a percentage bar, because the lesson has five discrete beats
        and a smooth bar would claim it has a duration.
      */}
      <div className="edu-transport">
        <div className="edu-transport-step">
          <small>Bước {String(step.index).padStart(2, '0')} / {String(step.total).padStart(2, '0')}</small>
          <b>{step.title}</b>
        </div>

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
      </div>

      <div className="edu-object">
        <p className="edu-object-label">Đối tượng</p>
        <div className="edu-object-name">
          <i />
          <b>{lesson.specimen}</b>
          <small>{lesson.caption}</small>
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
            {/*
              A 3D model, marked as one.
              This slot carried a play triangle over a baked still of the
              clownfish, which is the exact confusion MKT reported: nothing here
              is video, and a play glyph is a promise that pressing it will start
              something. The media in a YooLab lesson is a model, so the badge
              says so.
            */}
            <div className="edu-media-slot edu-media-slot--clip">
              <ModelThumbnail request={lesson.clip} alt="" />
              <span className="edu-media-kind"><IconCube3d /> 3D</span>
            </div>
          </div>
        </div>

        {/* "+ Thêm ghi chú" sat here as a full-width dashed button. Removed with
            the transport's controls: it was the most button-shaped thing in the
            panel and the least able to do anything. */}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the section --- */

/**
 * The role CTA, which is three different kinds of action wearing one style.
 *
 * Teacher opens the real product, school opens the shared consultation form,
 * student scrolls to the Library. Keeping them behind one component is what
 * lets the manifest above describe intent (`action: 'product'`) instead of
 * hard-coding a destination that later turns out to be wrong — which is exactly
 * how the teacher row ended up labelled with another product's name.
 */
function EducationCta({
  cta,
  roleId,
}: {
  cta: { label: string; href: string } | { label: string; action: 'product' | 'consult' };
  roleId: string;
}) {
  const consult = useConsult();
  const arrow = <span aria-hidden="true">→</span>;

  if ('action' in cta && cta.action === 'product') {
    return (
      <StartWithYooLabButton className="education-cta">
        {cta.label} {arrow}
      </StartWithYooLabButton>
    );
  }
  if ('action' in cta && cta.action === 'consult') {
    return (
      <button type="button" className="education-cta" onClick={() => consult.open(`education:${roleId}`)}>
        {cta.label} {arrow}
      </button>
    );
  }
  /* Narrowed by exclusion: the two `action` branches returned above, so what
     is left is the navigating shape. */
  const href = 'href' in cta ? cta.href : '#';
  return <a className="education-cta" href={href}>{cta.label} {arrow}</a>;
}

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
              {/*
                Two rejected headings, and why this one.

                "Ba cách sử dụng" promised three features, which is the reading
                the next screen spends its whole time contradicting: the three
                tabs are three *people*. "Ba vai trò" fixed that and stopped
                there — it counts the audiences without saying anything about
                them, and a heading whose only content is a number is a label on
                a filing cabinet.

                What the section actually claims is that a teacher, a student and
                a school all open the same thing, which is the sentence below. It
                is also the one a principal reads and recognises as their own
                problem, and that audience is the one this section exists for.

                One sentence over two lines, not two sentences: "Cả trường cùng
                dùng." was tried and ran to a third line in this column, which
                pushes the tab strip and the whole brief card down with it.
              */}
              <p className="section-kicker">Dành cho giáo dục</p>
              <h2 id="education-title">Một nền tảng<br /><em>cho cả trường.</em></h2>
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
              <EducationCta cta={active.cta} roleId={active.id} />
            </div>
          </div>

          <div className="education-showcase">
            {/* Two lines from a measure in `ch`, not from a `<br />`. The break
                was hard-coded and hidden on phones, which left
                `phục vụba việc` with no space where the tag had been. */}
            <p className="education-showcase-lede">
              Cùng một trình chiếu bài học, ba người mở nó vì ba lý do khác nhau.
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
