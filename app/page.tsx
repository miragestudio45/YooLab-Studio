import { BrandLockup } from './components/BrandMark';
import { BridgeSection } from './components/BridgeSection';
import { EducationSection } from './components/EducationSection';
import { ExploreStory } from './components/ExploreStory';
import { FormulaGate } from './components/FormulaGate';
import { GfxHud } from './components/GfxHud';
import { LibraryWorkspace } from './components/library/LibraryWorkspace';
import { PracticeSection } from './components/PracticeSection';
import { ProofSection } from './components/ProofSection';
import { ScrollReveal } from './components/ScrollReveal';
import { SectionSnap } from './components/SectionSnap';
import { SiteHeader } from './components/SiteHeader';
import { StudioDemo } from './components/StudioDemo';
import { IconQuiz, IconSpace, IconSteps, IconText } from './components/studio/EditorIcons';

/**
 * The page is one journey, and each stop answers exactly one question:
 *
 *   01 Explore    what is YooLab?              (Bee -> Fish -> Jellyfish)
 *   02 Bridge     that was a lesson — and you can build it
 *   03 YooLab  how do I make one?
 *   04 Workflow   where does a lesson go?      (one ribbon, not a section)
 *   05 Library    where does content come from? (the multi-subject workspace)
 *   06 Practice   what can I simulate?
 *   07 Education  what do I get out of it?     (teacher / student / school)
 *   08 Proof      what actually works?
 *   09 Start      what do I do now?
 *
 * A section is allowed to say its one thing once. Where two sections were making
 * the same claim in different words — "khám phá", "sáng tạo" and "trải nghiệm"
 * appeared in nearly every block of the previous build — the later one now
 * defers, and the standalone "học sinh sáng tạo" section is gone: it made no
 * claim the student tab in Education does not.
 *
 * `FormulaGate` wraps everything because three of these sections open the same
 * full-screen workshop, and it must be one overlay rather than three.
 */

/*
 * The four beats, and why they carry the editor's own icons.
 *
 * This column used to pair a phase with an actor ("Chọn học liệu / GIÁO VIÊN")
 * over a sentence that restated the section heading, and it read as a spec table
 * beside a product. It now names the panel each beat is performed in and shows
 * that panel's glyph — the same export the rail two hundred pixels to the left is
 * drawing — so the column is a legend for the workspace rather than a second
 * feature list. Point at a line here, find it in the editor.
 */
const TOOL_BEATS = [
  { index: '01', panel: 'Không gian', title: 'Dựng không gian', body: 'Thả mô hình vào scene, đặt ánh sáng và bối cảnh — đúng tỉ lệ thật.', Icon: IconSpace },
  { index: '02', panel: 'Văn bản', title: 'Ghi chú tại chỗ', body: 'Neo chú thích vào đúng bộ phận, chỉnh đường dẫn ngay trên khung nhìn.', Icon: IconText },
  { index: '03', panel: 'Bước · Timeline', title: 'Dàn nhịp bài giảng', body: 'Bốn làn mô hình, văn bản, âm thanh, hiệu ứng — kéo để đổi thời điểm.', Icon: IconSteps },
  { index: '04', panel: 'Hotspot · Quiz', title: 'Giao cho lớp', body: 'Gắn điểm chạm và câu hỏi, xuất một liên kết. Học sinh mở là chạy.', Icon: IconQuiz },
];

export default function Home() {
  return (
    <main id="trang-chu">
      <FormulaGate>
        <ScrollReveal />
        <GfxHud />
        <SectionSnap />
        <SiteHeader />
        <ExploreStory />
        <BridgeSection />

        {/* Heading and workspace are on the same shell now, so the section has one
            left edge rather than an editorial one for its words and a wider one
            for its product. */}
        <section className="tool-section" id="cong-cu" data-snap aria-labelledby="tool-title">
          {/* Heading and workspace are one viewport-height column, so the editor
              takes exactly what the heading leaves rather than what a CSS token
              guessed the heading would measure. See `.tool-stage`. */}
          <div className="tool-stage">
            <div className="shell">
              {/*
                Three children, one shared baseline: the lede's last line sits on
                the heading's. There is no "Xem thư viện học liệu" here — the
                narrative column below ends with exactly that link, and one band
                asking twice for the same click is the duplication PRODUCT.md
                calls out ("a stop says its one thing once").
              */}
              <div className="section-heading tool-heading" data-reveal>
                <p className="section-kicker section-kicker--light">Công cụ YooLab</p>
                <h2 id="tool-title">Từ kiến thức <em>thành bài học.</em></h2>
                <p className="tool-heading-lede">Chọn mô hình, thêm nội dung, âm thanh và tương tác — không cần lập trình.</p>
              </div>
            </div>

            {/* No bezel. The editor carries the glass itself — the same material
                as the narrative column beside it — so the row is two panes, not
                a framed device next to a card. */}
            <div className="shell tool-workspace" data-reveal>
              <StudioDemo />
            </div>

            <div className="shell tool-feature-shell" data-reveal>
              <aside className="tool-story" aria-labelledby="tool-story-title">
                <header className="tool-story__intro">
                  <h3 id="tool-story-title">Một bài học, bốn nhịp.</h3>
                  <p>Bốn thao tác, làm trọn trong cửa sổ bên trái.</p>
                </header>

                <ol className="tool-story__list">
                  {TOOL_BEATS.map((beat) => (
                    <li key={beat.index}>
                      <span className="tool-story__node" aria-hidden="true"><beat.Icon /></span>
                      <div className="tool-story__copy">
                        <h4>{beat.title}<b aria-hidden="true">{beat.index}</b></h4>
                        <p>{beat.body}</p>
                        <span className="tool-story__panel">{beat.panel}</span>
                      </div>
                    </li>
                  ))}
                </ol>

                <a className="tool-story__cta" href="#thu-vien">
                  Xem thư viện học liệu
                  <i aria-hidden="true"><span /></i>
                </a>
              </aside>
            </div>
          </div>
        </section>
        <LibraryWorkspace />
        <PracticeSection />
        <EducationSection />
        <ProofSection />

        <section className="final-cta" id="bat-dau-voi-yoolab" aria-labelledby="cta-title">
          <div className="cta-orb cta-orb--one" /><div className="cta-orb cta-orb--two" />
          <p className="section-kicker section-kicker--light" data-reveal>Sẵn sàng để bắt đầu?</p>
          <h2 id="cta-title" data-reveal>Bắt đầu từ<br /><em>bài học tiếp theo.</em></h2>
          <p data-reveal>
            Gửi cho chúng tôi môn học bạn đang dạy, chúng tôi sẽ dựng thử một
            scene cùng bạn.
          </p>
          <div data-reveal>
            <a className="cta-main" href="mailto:hello@yoolab.vn?subject=Bắt%20đầu%20với%20YooLab">
              Bắt đầu với YooLab <span aria-hidden="true">↗</span>
            </a>
            <a href="mailto:hello@yoolab.vn?subject=Trao%20đổi%20cùng%20YooLab">Trao đổi cùng chúng tôi</a>
          </div>
        </section>

        <footer className="site-footer">
          <div className="footer-brand">
            <BrandLockup height={26} />
            <p>Không gian học tập 3D/XR<br />cho một thế hệ tò mò.</p>
          </div>
          <div className="footer-links">
            <div>
              <b>Sản phẩm</b>
              <a href="#kham-pha">Khám phá</a>
              <a href="#cong-cu">YooLab</a>
              <a href="#thu-vien">Thư viện</a>
              <a href="#thuc-hanh">Thực hành &amp; STEM</a>
            </div>
            <div>
              <b>Giáo dục</b>
              <a href="#giao-duc">Giáo viên</a>
              <a href="#giao-duc">Học sinh</a>
              <a href="#giao-duc">Nhà trường</a>
              <a href="#bai-hoc-mau">Bài học mẫu</a>
            </div>
            <div>
              <b>Kết nối</b>
              <a href="#bat-dau-voi-yoolab">Bắt đầu với YooLab</a>
              <a href="mailto:hello@yoolab.vn">hello@yoolab.vn</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 YooLab. Made for curious minds.</span>
            <span>Quyền riêng tư · Điều khoản</span>
          </div>
        </footer>
      </FormulaGate>
    </main>
  );
}
