'use client';

import { useFormulaGate } from './FormulaGate';
import { openLibraryExperience } from '../lib/library/openExperience';

/**
 * Hands-on & STEM.
 *
 * This section carries exactly one working thing and says so: the Formula
 * workshop, which opens on this page. The virtual lab bench that belongs beside
 * it does not exist yet, and the temptation here is to draw it anyway — a nice
 * frame, a row of instrument icons, a disabled "Bắt đầu" button. That would be
 * the one piece of furniture on this page that lies, so the lab is a stated gap
 * with an outline where the bench will go and nothing to click.
 *
 * The composition says the same thing before a word is read. The two used to be a
 * matching pair of cards in a `1.18fr 0.82fr` grid, which gave a section with one
 * product and one absence the shape of a section with two products — and made the
 * absence the second largest object on the screen. The workshop is now a wide
 * two-part card that reads as an application, and the bench is a column beside it
 * with no frame of its own: present, explained, obviously not a product yet.
 *
 * Formula itself lives in the Library under KHCN & STEM, where a teacher looking
 * for content will actually find it. What it does here is prove the claim of the
 * headline.
 */
export function PracticeSection() {
  const { openFormula } = useFormulaGate();

  return (
    <section className="practice" id="thuc-hanh" aria-labelledby="practice-title">
      <div className="shell-editorial">
        {/* Two lines, not three. At the old size the third line pushed the
            workshop below the fold on every laptop, and the section opened on a
            headline and the top edge of a photograph. */}
        <div className="section-heading section-heading--split practice-head" data-reveal>
          <div>
            <p className="section-kicker">Thực hành &amp; STEM</p>
            <h2 id="practice-title">Thực hành những điều<br /><em>khó thực hiện trong lớp học.</em></h2>
          </div>
          <p>
            Thiết bị đắt, thao tác nguy hiểm, hoặc quá nhỏ để nhìn thấy. Trong
            không gian 3D, học sinh làm được — và làm lại bao nhiêu lần cũng được.
          </p>
        </div>

        <div className="practice-grid" data-reveal>
          <article className="practice-live">
            <div className="practice-visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/asset/Library/Car/formula-preview.jpg"
                alt="Xưởng mô hình xe đua trong YooLab"
                loading="lazy"
                decoding="async"
              />
              <button type="button" className="practice-open" onClick={openFormula}>
                Mở xưởng thực hành <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="practice-body">
              <span className="practice-tag">Đang chạy trên trang này</span>
              <h3>Xưởng mô hình xe đua</h3>
              <p>
                Tháo từng chi tiết khỏi khung nhựa, xem xe thành hình, rồi tự cầm
                lái để hiểu vì sao hình khối đó được thiết kế như vậy.
              </p>
              <ol className="practice-modes">
                <li><b>KIT</b><span>Hiểu cấu tạo — từng chi tiết trên bàn lắp ráp.</span></li>
                <li><b>STUDIO</b><span>Quan sát hệ thống — xoay quanh xe hoàn thiện.</span></li>
                <li><b>DRIVE</b><span>Vận hành — tự lái bằng WASD hoặc phím mũi tên.</span></li>
              </ol>
            </div>
          </article>

          <aside className="practice-next" aria-label="Phòng thực hành 3D — đang xây dựng">
            <svg viewBox="0 0 260 190" aria-hidden="true" className="practice-art">
              <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                {/* bench */}
                <path d="M20 148h220" opacity="0.5" />
                <path d="M36 148v22M224 148v22" opacity="0.28" />
                {/* flask */}
                <path d="M92 44h26v30l22 50a12 12 0 0 1-11 18H81a12 12 0 0 1-11-18l22-50Z" opacity="0.42" />
                <path d="M92 44h26" opacity="0.62" />
                <path d="M79 112h52" opacity="0.26" />
                {/* burette */}
                <path d="M164 34v58M158 92h12l-2 44h-8Z" opacity="0.4" />
                <path d="M158 56h12" opacity="0.24" />
                {/* stand */}
                <path d="M196 40v106M196 62h-18" opacity="0.3" />
                <circle cx="176" cy="62" r="9" opacity="0.3" />
              </g>
            </svg>
            <div>
              <span className="practice-tag practice-tag--pending">Đang được bổ sung</span>
              <h3>Phòng thực hành 3D</h3>
              <p>
                Bàn thí nghiệm ảo cho hoá học và vật lý — dụng cụ thật, thao tác
                thật, làm lại bao nhiêu lần cũng được. Đây là hạng mục lớn tiếp
                theo của YooLab. Khung kiến trúc đã sẵn trong thư viện; chưa có
                thao tác nào chạy được, nên chưa có nút nào để nhấn ở đây.
              </p>
              <p className="practice-pending-note">
                Trong lúc chờ, môn Vật lý đã có một mô phỏng chạy thật:{' '}
                <button type="button" onClick={() => openLibraryExperience('projectile-lab')}>
                  chuyển động ném
                </button>{' '}
                trong thư viện.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
