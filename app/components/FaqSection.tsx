import { READY_EXPERIENCES, SUBJECTS, readyCountForSubject } from '../lib/library/manifest';

/**
 * The questions a teacher asks between "this looks good" and "đăng ký".
 *
 * Placed immediately before the final CTA, because that is where the objections
 * are: everything above this section argues that YooLab is worth using, and a
 * visitor who has been convinced still has five practical reasons not to make an
 * account today. Answering them next to the button is what the section is for.
 *
 * Two rules govern what is allowed in here.
 *
 * The first is PRODUCT.md's: no invented proof. Every answer below is checkable
 * against this repository — the subject counts are read from the manifest at
 * render time rather than typed, the "no account for students" answer is the
 * fourth beat of the tool section, and the browser requirement is what a WebGL
 * page is. Questions whose honest answer is not in this repository — pricing,
 * where student data lives, alignment to Chương trình GDPT 2018 — are *not
 * here*, because a plausible-sounding answer to those is precisely the kind of
 * claim the product rule exists to prevent.
 *
 * The second is that the hardware answer has to survive a measurement. A lab
 * audit of this page runs 18.6 s of main-thread blocking under Lighthouse's
 * throttled mobile profile, so "chạy mượt trên mọi thiết bị" would be a claim
 * this project's own numbers contradict. It says the true thing instead.
 *
 * `<details>` rather than a React accordion: it is keyboard and screen-reader
 * correct for free, it costs no JavaScript, and open/close is the browser's own
 * so there is no height animation to jank.
 */

type Faq = { q: string; a: string };

/* The two subjects with no ready entry yet, named rather than counted, so the
   answer stays honest if one of them ships. */
const pending = SUBJECTS.filter((subject) => readyCountForSubject(subject.id) === 0);
const stocked = SUBJECTS.filter((subject) => readyCountForSubject(subject.id) > 0);

export const FAQS: Faq[] = [
  {
    q: 'Có phải cài phần mềm gì không?',
    a: 'Không. YooLab chạy thẳng trong trình duyệt — mở liên kết là dùng được, không cài đặt, không plugin. Máy cần trình duyệt hỗ trợ WebGL 2, tức là Chrome, Edge, Safari hoặc Firefox bản vài năm gần đây.',
  },
  {
    q: 'Tôi có cần biết lập trình không?',
    a: 'Không. Bạn chọn mô hình từ thư viện, thả vào không gian, gõ chú thích và kéo các bước trên dòng thời gian. Toàn bộ thao tác là chọn và kéo thả.',
  },
  {
    q: 'Học sinh có phải tạo tài khoản không?',
    a: 'Không. Khi bài giảng xong, bạn xuất một liên kết và gửi cho lớp. Học sinh mở liên kết là chạy — trên máy tính, màn hình lớp học hoặc điện thoại. Tài khoản chỉ cần cho người soạn bài.',
  },
  {
    q: 'Thư viện học liệu hiện có những môn nào?',
    a: `Hiện có ${READY_EXPERIENCES.length} học liệu mở được ngay, thuộc ${stocked.length} môn: ${stocked
      .map((subject) => subject.label)
      .join(', ')}. ${pending
      .map((subject) => subject.label)
      .join(' và ')} đang được bổ sung — YooLab chỉ đưa vào thư viện những mô hình đã xác minh được nguồn và giấy phép sử dụng, nên hai môn này sẽ mở khi có học liệu đạt điều kiện.`,
  },
  {
    q: 'Đăng ký bằng cách nào?',
    a: 'Bằng email, hoặc bằng tài khoản Google, Facebook, Apple sẵn có. Bạn có thể xem trước toàn bộ thư viện và mở thử các mô hình ngay trên trang này trước khi tạo tài khoản.',
  },
  {
    q: 'Máy tính cần cấu hình thế nào?',
    a: 'YooLab dựng hình 3D thời gian thực nên máy càng khoẻ càng mượt. Trên máy tính để bàn hoặc laptop đời gần đây, cảnh mở gần như tức thì. Trên máy cấu hình thấp hoặc điện thoại phổ thông, trang vẫn chạy nhưng cảnh 3D cần thêm thời gian tải và YooLab sẽ tự giảm bớt hiệu ứng để giữ khung hình. Cách chắc chắn nhất là mở thử ngay trên trang này bằng chính thiết bị bạn sẽ dạy.',
  },
];

export function FaqSection() {
  return (
    <section className="faq section-frame" id="cau-hoi" aria-labelledby="faq-title">
      <div className="shell">
        <div className="section-heading section-heading--split" data-reveal>
          <div>
            <p className="section-kicker section-kicker--light">Trước khi bắt đầu</p>
            <h2 id="faq-title">Những câu <em>hỏi trước nhất.</em></h2>
          </div>
          <p>
            Sáu câu dưới đây là những gì giáo viên hỏi nhiều nhất trước khi tạo
            tài khoản. Còn thắc mắc khác, viết cho chúng tôi ở{' '}
            <a href="mailto:hello@yoolab.vn">hello@yoolab.vn</a>.
          </p>
        </div>

        <ul className="faq-list" data-reveal>
          {FAQS.map((item) => (
            <li key={item.q}>
              <details className="faq-item" name="yoolab-faq">
                <summary>
                  <span>{item.q}</span>
                  <i aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The same six questions as `FAQPage` structured data.
 *
 * Generated from `FAQS` rather than written twice: a rich result that disagrees
 * with the page it describes is a spam signal, and the only reliable way to keep
 * them identical is to not have two copies.
 */
export function FaqStructuredData() {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
