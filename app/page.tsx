import { BrandMark } from './components/BrandMark';
import { BridgeSection } from './components/BridgeSection';
import { EducationSection } from './components/EducationSection';
import { ExploreStory } from './components/ExploreStory';
import { FormulaGate } from './components/FormulaGate';
import { LibraryWorkspace } from './components/library/LibraryWorkspace';
import { PracticeSection } from './components/PracticeSection';
import { ProofSection } from './components/ProofSection';
import { ScrollReveal } from './components/ScrollReveal';
import { SectionSnap } from './components/SectionSnap';
import { SiteHeader } from './components/SiteHeader';
import { StudioDemo } from './components/StudioDemo';

/**
 * The page is one journey, and each stop answers exactly one question:
 *
 *   01 Explore    what is YooLab?              (Bee -> Fish -> Jellyfish)
 *   02 Bridge     that was a lesson — and you can build it
 *   03 YooStudio  how do I make one?
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

const TOOL_FEATURES = [
  { index: '01', phase: 'Chọn học liệu', actor: 'Giáo viên', title: 'Dựng không gian', body: 'Ghép mô hình, ánh sáng và bối cảnh bằng thao tác trực quan.' },
  { index: '02', phase: 'Biên soạn', actor: 'Giáo viên', title: 'Ghi chú tại chỗ', body: 'Gắn kiến thức đúng vào bộ phận, đúng thời điểm.' },
  { index: '03', phase: 'Giao bài', actor: 'Lớp học', title: 'Timeline kể chuyện', body: 'Dàn nhịp mô hình, văn bản, âm thanh và hiệu ứng.' },
  { index: '04', phase: 'Khám phá', actor: 'Học sinh', title: 'Hoạt động tương tác', body: 'Thêm hotspot và câu hỏi trả lời ngay trên mô hình.' },
];

export default function Home() {
  return (
    <main id="trang-chu">
      <FormulaGate>
        <ScrollReveal />
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
              <div className="section-heading section-heading--split tool-heading" data-reveal>
                <div>
                  <p className="section-kicker section-kicker--light">Công cụ YooLab · YooStudio</p>
                  <h2 id="tool-title">Từ kiến thức <em>thành bài học.</em></h2>
                </div>
                <div className="tool-heading-copy">
                  <p>Chọn mô hình, thêm nội dung, âm thanh và tương tác — không cần lập trình.</p>
                  <a href="#thu-vien">Xem thư viện học liệu <span aria-hidden="true">→</span></a>
                </div>
              </div>
            </div>

            <div className="shell tool-workspace" data-reveal>
              <StudioDemo />
            </div>

            <div className="shell tool-feature-shell" data-reveal>
              <aside className="tool-story" aria-labelledby="tool-story-title">
                <header className="tool-story__intro">
                  <div>
                    <h3 id="tool-story-title">Một bài học, bốn nhịp.</h3>
                    <span aria-hidden="true">01—04</span>
                  </div>
                  <p>Từ học liệu đến khoảnh khắc học sinh tự tay khám phá.</p>
                </header>

                <ol className="tool-story__list">
                  {TOOL_FEATURES.map((feature) => (
                    <li key={feature.index}>
                      <span className="tool-story__node">{feature.index}</span>
                      <div className="tool-story__copy">
                        <div className="tool-story__meta">
                          <span>{feature.phase}</span>
                          <em>{feature.actor}</em>
                        </div>
                        <h4>{feature.title}</h4>
                        <p>{feature.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <a className="tool-story__cta" href="#thu-vien">
                  <span><small>Bước tiếp theo</small>Xem thư viện học liệu</span>
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
            <BrandMark size={42} />
            <b>YooLab</b>
            <p>Không gian học tập 3D/XR<br />cho một thế hệ tò mò.</p>
          </div>
          <div className="footer-links">
            <div>
              <b>Sản phẩm</b>
              <a href="#kham-pha">Khám phá</a>
              <a href="#cong-cu">YooStudio</a>
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
