'use client';

import { useFormulaGate } from './FormulaGate';
import { openLibraryExperience } from '../lib/library/openExperience';
import { ModelThumbnail } from './ModelThumbnail';
import { LibraryMark } from './library/LibraryMark';
import { BEE_THUMBNAIL } from '../lib/three/thumbnailRequests';
import type { MarkId } from '../lib/library/types';

/**
 * Proof, built from evidence rather than from claims.
 *
 * YooLab has published no customer list, so this section carries no school
 * logos, no testimonials and no user counts: inventing any of those would damage
 * trust more than having none. What it carries instead is stronger and checkable
 * on the spot — every card opens something that is running on this page right
 * now, and the set spans four different subjects so the range is evidence too.
 *
 * Four cards, not five, and every one of them *opens an experience* rather than
 * scrolling to a section. Five cards on a 1512 px screen are 265 px wide, which
 * is small enough that the picture stops being a specimen and becomes a chip —
 * and the fifth was a link to the studio section, which is the one promise on
 * the row that "mở ngay" did not actually keep. The two cards that used to show
 * a letter now show the same drawn diagrams the Library rail uses, so no card
 * on the row is visibly weaker than its neighbours.
 */

type Sample = {
  id: string;
  subject: string;
  title: string;
  task: string;
  /*
   * The subject's own accent, for the two cards whose experience has no mesh to
   * render. It arrives as a custom property and becomes both the plate's wash and
   * `currentColor` inside the drawn mark — the same mechanism the Library rail
   * uses to make nineteen hand-drawn diagrams read as one colour-coded set rather
   * than as nineteen missing images.
   */
  tint?: string;
  /*
   * `library` opens a named experience in the workspace rather than linking to
   * the section. A card that says "mở bảng tuần hoàn" and delivers whatever the
   * Library happened to have selected would be exactly the kind of empty promise
   * this section exists to avoid.
   */
  action:
    | { kind: 'link'; href: string; label: string }
    | { kind: 'library'; id: string; label: string }
    | { kind: 'formula'; label: string };
  visual: { kind: 'thumbnail'; request: typeof BEE_THUMBNAIL } | { kind: 'poster'; src: string } | { kind: 'mark'; mark: MarkId };
};

const SAMPLES: Sample[] = [
  {
    id: 'bee',
    subject: 'Sinh học · Giải phẫu',
    title: 'Ong mật',
    task: 'Đổi giữa ba trạng thái để thấy cơ chế bay.',
    action: { kind: 'library', id: 'bee', label: 'Mở bài học' },
    visual: { kind: 'thumbnail', request: BEE_THUMBNAIL },
  },
  {
    id: 'periodic-table',
    subject: 'Hóa học · Nguyên tố',
    title: 'Bảng tuần hoàn',
    task: 'Chọn một trong 118 nguyên tố và mở mô hình nguyên tử.',
    action: { kind: 'library', id: 'periodic-table', label: 'Mở bảng tuần hoàn' },
    visual: { kind: 'mark', mark: 'atom-grid' },
    tint: 'var(--color-lavender)',
  },
  {
    id: 'globe',
    subject: 'Địa lý · Địa cầu',
    title: 'Địa cầu tương tác',
    task: 'Xoay quả cầu, chọn quốc gia và đọc số liệu thật.',
    action: { kind: 'library', id: 'globe-explorer', label: 'Mở địa cầu' },
    visual: { kind: 'mark', mark: 'globe' },
    tint: 'var(--color-cyan)',
  },
  {
    id: 'formula',
    subject: 'KHCN & STEM · Thực hành',
    title: 'Xưởng mô hình xe đua',
    task: 'Lắp ráp từng chi tiết, quan sát, rồi tự cầm lái.',
    action: { kind: 'formula', label: 'Mở trải nghiệm' },
    visual: { kind: 'poster', src: '/asset/Library/Car/formula-preview.jpg' },
  },
];

export function ProofSection() {
  const { openFormula } = useFormulaGate();

  return (
    <section className="proof" id="bai-hoc-mau" aria-labelledby="proof-title">
      <div className="shell-editorial">
        <div className="section-heading section-heading--split" data-reveal>
          <div>
            <p className="section-kicker">Bài học mẫu</p>
            <h2 id="proof-title">Những bài học<br /><em>bạn có thể mở ngay.</em></h2>
          </div>
          <p>Bốn nội dung dưới đây đang chạy thật trên trang này. Mở một mục và tự đánh giá.</p>
        </div>

        <div className="proof-grid" data-stagger>
          {SAMPLES.map((sample) => {
            const actionId = sample.action.kind === 'library' ? sample.action.id : '';
            return (
            <article className="proof-card" key={sample.id} data-reveal>
              {/*
                The object itself opens the lesson (MKT: "cho phép click vào vật
                thể dẫn ra sector tương ứng").

                It is a `button` so a pointer gets a real control with a real
                cursor, and it is `aria-hidden` with `tabIndex={-1}` so it does
                *not* become a second tab stop: the labelled CTA below already
                reaches the same destination, and an unlabelled duplicate in the
                tab order would make the card worse for a keyboard than it was.
                Mouse gains a shortcut; assistive technology loses nothing.
              */}
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => {
                  if (sample.action.kind === 'formula') openFormula();
                  else if (sample.action.kind === 'library') openLibraryExperience(actionId);
                  else if (sample.action.kind === 'link') window.location.hash = sample.action.href.replace(/^#/, '');
                }}
                className={`proof-visual is-openable${sample.visual.kind === 'mark' ? ' proof-visual--mark' : ''}`}
                style={sample.tint ? ({ '--proof-tint': sample.tint } as React.CSSProperties) : undefined}
              >
                {sample.visual.kind === 'thumbnail' && (
                  <ModelThumbnail request={sample.visual.request} alt={sample.title} />
                )}
                {sample.visual.kind === 'poster' && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sample.visual.src} alt={sample.title} loading="lazy" decoding="async" />
                    {/* The only still photograph among these cards. Its
                        neighbours are live bakes of real meshes, so without this
                        it is the one card that quietly claims to be a render of
                        something the visitor can open. */}
                    <span className="proof-still">Ảnh minh họa</span>
                  </>
                )}
                {sample.visual.kind === 'mark' && (
                  <span className="proof-mark" aria-hidden="true"><LibraryMark mark={sample.visual.mark} /></span>
                )}
              </button>
              <span className="proof-subject">{sample.subject}</span>
              <h3>{sample.title}</h3>
              <p>{sample.task}</p>
              {sample.action.kind === 'formula' && (
                <button type="button" className="proof-action" onClick={openFormula}>
                  {sample.action.label} <span aria-hidden="true">↗</span>
                </button>
              )}
              {sample.action.kind === 'library' && (
                <button
                  type="button"
                  className="proof-action"
                  onClick={() => openLibraryExperience(actionId)}
                >
                  {sample.action.label} <span aria-hidden="true">→</span>
                </button>
              )}
              {sample.action.kind === 'link' && (
                <a className="proof-action" href={sample.action.href}>
                  {sample.action.label} <span aria-hidden="true">→</span>
                </a>
              )}
            </article>
            );
          })}
        </div>

        <p className="proof-note" data-reveal>
          Không logo trường, không lời nhận xét, không con số người dùng — YooLab
          chưa công bố danh sách trường đang triển khai, nên trang này không dựng
          ra một danh sách.
        </p>
      </div>
    </section>
  );
}
