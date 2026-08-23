'use client';

import { useFormulaGate } from './FormulaGate';
import { openLibraryExperience } from '../lib/library/openExperience';
import { ModelThumbnail } from './ModelThumbnail';
import { BEE_THUMBNAIL, JELLYFISH_THUMBNAIL } from '../lib/three/thumbnailRequests';

/**
 * Proof, built from evidence rather than from claims.
 *
 * YooLab has published no customer list, so this section carries no school
 * logos, no testimonials and no user counts: inventing any of those would damage
 * trust more than having none. What it carries instead is stronger and checkable
 * on the spot — every card opens something that is running on this page right
 * now, and the set spans four different subjects so the range is evidence too.
 */

type Sample = {
  id: string;
  subject: string;
  title: string;
  task: string;
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
  visual: { kind: 'thumbnail'; request: typeof BEE_THUMBNAIL } | { kind: 'poster'; src: string } | { kind: 'glyph'; glyph: string };
};

const SAMPLES: Sample[] = [
  {
    id: 'bee',
    subject: 'Sinh học · Giải phẫu',
    title: 'Ong mật',
    task: 'Đổi giữa ba trạng thái để thấy cơ chế bay.',
    action: { kind: 'link', href: '#ong-mat', label: 'Mở bài học' },
    visual: { kind: 'thumbnail', request: BEE_THUMBNAIL },
  },
  {
    id: 'periodic-table',
    subject: 'Hóa học · Nguyên tố',
    title: 'Bảng tuần hoàn',
    task: 'Chọn một trong 118 nguyên tố và mở mô hình nguyên tử.',
    action: { kind: 'library', id: 'periodic-table', label: 'Mở bảng tuần hoàn' },
    visual: { kind: 'glyph', glyph: 'Fe' },
  },
  {
    id: 'globe',
    subject: 'Địa lý · Địa cầu',
    title: 'Địa cầu tương tác',
    task: 'Xoay quả cầu, chọn quốc gia và đọc số liệu thật.',
    action: { kind: 'library', id: 'globe-explorer', label: 'Mở địa cầu' },
    visual: { kind: 'glyph', glyph: '◍' },
  },
  {
    id: 'formula',
    subject: 'KHCN & STEM · Thực hành',
    title: 'Xưởng mô hình xe đua',
    task: 'Lắp ráp từng chi tiết, quan sát, rồi tự cầm lái.',
    action: { kind: 'formula', label: 'Mở trải nghiệm' },
    visual: { kind: 'poster', src: '/asset/Library/Car/formula-preview.jpg' },
  },
  {
    id: 'studio',
    subject: 'YooStudio · Biên soạn',
    title: 'Bài học sứa biển',
    task: 'Chọn lớp, kéo mũi neo, thêm ghi chú, chạy timeline.',
    action: { kind: 'link', href: '#cong-cu', label: 'Mở không gian biên soạn' },
    visual: { kind: 'thumbnail', request: JELLYFISH_THUMBNAIL },
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
          <p>Năm nội dung dưới đây đang chạy thật trên trang này. Mở một mục và tự đánh giá.</p>
        </div>

        <div className="proof-grid" data-stagger>
          {SAMPLES.map((sample) => {
            const actionId = sample.action.kind === 'library' ? sample.action.id : '';
            return (
            <article className="proof-card" key={sample.id} data-reveal>
              <div className="proof-visual">
                {sample.visual.kind === 'thumbnail' && (
                  <ModelThumbnail request={sample.visual.request} alt={sample.title} />
                )}
                {sample.visual.kind === 'poster' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sample.visual.src} alt={sample.title} loading="lazy" decoding="async" />
                )}
                {sample.visual.kind === 'glyph' && (
                  <span className="proof-glyph" aria-hidden="true">{sample.visual.glyph}</span>
                )}
              </div>
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
