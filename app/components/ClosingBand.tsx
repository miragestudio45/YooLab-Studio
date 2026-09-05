import Link from 'next/link';
import { BrandLockup } from './BrandMark';
import { ConsultButton } from './ConsultModal';
import { StartWithYooLabButton } from './StartWithYooLabButton';
import { IconCube3d } from './studio/EditorIconsShared';

/**
 * The closing band and the footer.
 *
 * These were two blocks of JSX at the bottom of `page.tsx` and they moved here
 * for one reason: the design they now follow needs eleven marks that the
 * product's generated icon set does not contain and has no reason to — a
 * mortarboard, a shield, a leaf, an envelope and four social glyphs are not
 * editor tools. Authoring them inline in the page file would have put a hundred
 * lines of path data between the sections and the page's own structure, which is
 * the thing `page.tsx` exists to show.
 *
 * ## What the two blocks are
 *
 * The band closes the argument: it repeats the three things the page has spent
 * nine sections demonstrating — you author in 3D/XR, students act rather than
 * watch, and it deploys with no new hardware — then offers the two ways in. It
 * is the one section on the site whose background is an illustration rather than
 * a render, because it is the one section with no specimen in it.
 *
 * The footer is the same room one step further back. It opens on a pledge strip
 * rather than on a link grid, because the last thing a visitor reads should be
 * what this project is for rather than a sitemap.
 */

/* ------------------------------------------------------------------ marks --- */
/*
 * Eleven marks, authored to the generated set's own language.
 *
 * `studio/EditorIcons` is produced from the product's Figma frame, and DESIGN.md
 * is explicit that a mark redrawn from a screenshot is a different mark — so
 * these are not traced from anything. They are drawn to the same rules the
 * generated set follows, which is what lets them sit beside `IconCube3d` in the
 * same row without reading as a second icon system:
 *
 *   24-unit box · 1.3 stroke · round caps and joins · no fill · `currentColor`
 *
 * The four social glyphs are the exception and are filled rather than stroked,
 * because they sit reversed out of a solid disc at 16 px, where a 1.3 stroke
 * closes up. They are simplified letterforms and shapes — an `f`, a play
 * triangle, an `in`, a meridian globe — not the platforms' trademarked logos.
 */
const LINE = {
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

const Mark = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g {...LINE}>{children}</g>
  </svg>
);

/** A beaker: what a student does with the model, rather than what it is. */
const IconFlask = () => (
  <Mark>
    <path d="M9.6 3.2v5.1L4.9 16.6A2.5 2.5 0 0 0 7.1 20.4h9.8a2.5 2.5 0 0 0 2.2-3.8L14.4 8.3V3.2" />
    <path d="M8.2 3.2h7.6" />
    <path d="M7.3 13.6h9.4" />
  </Mark>
);

/** Two figures, one behind the other: a class, not a person. */
const IconPeople = () => (
  <Mark>
    <circle cx="9.6" cy="8.1" r="3.1" />
    <path d="M3.6 19.4c0-2.9 2.7-5.2 6-5.2s6 2.3 6 5.2" />
    <path d="M16.1 5.4a3.1 3.1 0 0 1 0 5.9" />
    <path d="M17.6 14.7c1.7.8 2.8 2.4 2.8 4.2" />
  </Mark>
);

/** A mortarboard over an open page: the pledge strip's lead. */
const IconGraduation = () => (
  <Mark>
    <path d="M2.6 8.6 12 4.3l9.4 4.3-9.4 4.3z" />
    <path d="M6.7 10.6v4.2c0 1.8 2.4 3.2 5.3 3.2s5.3-1.4 5.3-3.2v-4.2" />
    <path d="M20.4 9.5v4.4" />
  </Mark>
);

/** A shield with a check: the data claim. */
const IconShield = () => (
  <Mark>
    <path d="M12 3.2 4.9 6v6c0 4 2.9 7.3 7.1 8.8 4.2-1.5 7.1-4.8 7.1-8.8V6z" />
    <path d="m8.9 11.8 2.2 2.3 4-4.3" />
  </Mark>
);

/** A leaf on its stem: the long view. */
const IconLeaf = () => (
  <Mark>
    <path d="M20.2 4.2c.9 6.6-1.2 10.9-4.4 12.7-3.1 1.7-6.9 1-8.6-1.2-1.6-2.2-1-5.3 1.3-7 2.6-1.9 6.5-1.6 11.7-4.5z" />
    <path d="M17.3 7.1C12.6 9 8.5 12.9 5.9 19.8" />
  </Mark>
);

/** An envelope, for the two contact rows. */
const IconMail = () => (
  <Mark>
    <rect x="3.1" y="5.4" width="17.8" height="13.2" rx="2.4" />
    <path d="m4.4 7.6 6.4 4.7a2 2 0 0 0 2.4 0l6.4-4.7" />
  </Mark>
);

const SOCIAL_MARKS = {
  facebook: <path d="M13.3 21.6v-8.3h2.8l.4-3.2h-3.2V8c0-.9.3-1.6 1.6-1.6h1.7V3.5A22 22 0 0 0 14.1 3c-2.5 0-4.2 1.5-4.2 4.3v2.8H7.1v3.2h2.8v8.3z" />,
  /*
   * One path, not two, with the play triangle knocked out by `evenodd`.
   *
   * Drawn as a filled body plus a white triangle over it, the mark is correct on
   * a white page and wrong everywhere it is actually used: these sit reversed out
   * of a near-black disc, so a white triangle on a white body is a solid white
   * pill with no play in it. A hole shows the disc through, at any disc colour.
   */
  youtube: (
    <path
      fillRule="evenodd"
      d="M19.6 5.9C18 5.4 12 5.4 12 5.4s-6 0-7.6.5A2.5 2.5 0 0 0 2.7 7.6 25 25 0 0 0 2.2 12c0 1.5.1 3 .5 4.4a2.5 2.5 0 0 0 1.7 1.7c1.6.5 7.6.5 7.6.5s6 0 7.6-.5a2.5 2.5 0 0 0 1.7-1.7c.4-1.4.5-2.9.5-4.4s-.1-3-.5-4.4a2.5 2.5 0 0 0-1.7-1.7zM10.2 14.9V9.1L15.1 12z"
    />
  ),
  linkedin: (
    <>
      <path d="M4.1 8.9h3.3v11.7H4.1zM5.7 3.4a1.9 1.9 0 1 1 0 3.9 1.9 1.9 0 0 1 0-3.9z" />
      <path d="M9.6 8.9h3.2v1.6a3.5 3.5 0 0 1 3.1-1.7c3.3 0 4 2.2 4 5v6.8h-3.3v-6c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2v6.1H9.6z" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.6 12h16.8M12 3.2c4.6 4.9 4.6 12.7 0 17.6-4.6-4.9-4.6-12.7 0-17.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
};

const SocialMark = ({ kind }: { kind: keyof typeof SOCIAL_MARKS }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
    {SOCIAL_MARKS[kind]}
  </svg>
);

/* ---------------------------------------------------------------- content --- */

/**
 * The three promises, and why they are these three.
 *
 * One per audience the Education section names — the teacher authors, the
 * student acts, the school deploys — so the band closes on the same three people
 * the page has been addressing rather than on three new feature claims. Each is
 * a thing the visitor has already been shown working further up: the editor, the
 * lesson player, and the fact that every experience on this site runs in the
 * browser they are reading it in.
 */
const PROMISES = [
  {
    title: 'Soạn bài 3D/XR',
    body: 'Biến ý tưởng thành trải nghiệm trực quan.',
    Icon: IconCube3d,
  },
  {
    title: 'Khám phá & thực hành',
    body: 'Học sinh chủ động tương tác, ghi nhớ sâu hơn.',
    Icon: IconFlask,
  },
  {
    title: 'Triển khai dễ dàng',
    body: 'Phù hợp mọi giáo viên, nhà trường và mọi môn học.',
    Icon: IconPeople,
  },
];

/** The pledge strip's three values. Two words and a clause each — no more. */
const PLEDGES = [
  { title: 'An toàn & bảo mật', body: 'Dữ liệu được bảo vệ', Icon: IconShield },
  { title: 'Đồng hành tận tâm', body: 'Luôn sẵn sàng hỗ trợ', Icon: IconPeople },
  { title: 'Vì giáo dục bền vững', body: 'Cùng kiến tạo tương lai', Icon: IconLeaf },
];

/*
 * Four social rows, and the reason they are not four `href="#"`.
 *
 * A dead social button is worse than no social button: it is the one control on
 * the page that a visitor can prove is fake in one click. Until each channel
 * exists, `href` is the site's own front door — `website` genuinely is — and the
 * label says which channel it is going to be. Fill these in as they open.
 */
const SOCIAL = [
  { kind: 'facebook' as const, label: 'YooLab trên Facebook', href: 'https://www.facebook.com/' },
  { kind: 'youtube' as const, label: 'YooLab trên YouTube', href: 'https://www.youtube.com/' },
  { kind: 'linkedin' as const, label: 'YooLab trên LinkedIn', href: 'https://www.linkedin.com/' },
  { kind: 'website' as const, label: 'yoolab.vn', href: 'https://yoolab.vn' },
];

/* -------------------------------------------------------------------- band --- */

export function FinalCta() {
  return (
    <section className="final-cta" id="bat-dau-voi-yoolab" aria-labelledby="cta-title">
      {/*
        The illustration, as five layers rather than as one background image.
        `band` is the whole artwork and carries the composition at desktop
        widths; `waves`, `globe` and `card` are its parts, cut out with a
        feathered edge, and they take over below 1024 px where a 3 : 1 image
        cropped into a portrait box would show nothing but its empty middle.
        Which set is visible is decided in closing.css — see
        `scripts/build-cta-background.mjs` for how the cut-outs are made.
      */}
      <div className="cta-scene" aria-hidden="true">
        <span className="cta-scene__band" />
        <span className="cta-scene__waves" />
        <span className="cta-scene__globe" />
        <span className="cta-scene__card" />
        <span className="cta-orb cta-orb--one" />
        <span className="cta-orb cta-orb--two" />
      </div>

      <div className="cta-inner">
        <p className="section-kicker section-kicker--light" data-reveal>Sẵn sàng để bắt đầu?</p>
        <h2 id="cta-title" data-reveal>Bắt đầu sáng tạo<br /><em>ngay bài học.</em></h2>
        <p className="cta-lede" data-reveal>
          Gửi cho chúng tôi môn học bạn đang dạy, chúng tôi sẽ dựng thử một
          scene cùng bạn.
        </p>

        <ul className="cta-promises" data-reveal>
          {PROMISES.map((promise) => (
            <li key={promise.title}>
              <span className="cta-promise__mark" aria-hidden="true"><promise.Icon /></span>
              <div>
                <b>{promise.title}</b>
                <small>{promise.body}</small>
              </div>
            </li>
          ))}
        </ul>

        {/* The secondary action used to be a bare `mailto:`, which is what MKT
            reported as "no clear way to submit their needs". It now opens the
            one consultation form the pricing table and the trial dialog also
            use. See `ConsultModal`. */}
        <div className="cta-actions" data-reveal>
          <StartWithYooLabButton className="cta-main">
            Mở YooLab ngay <span aria-hidden="true">↗</span>
          </StartWithYooLabButton>
          <ConsultButton className="cta-secondary" source="final-cta">Trao đổi thêm</ConsultButton>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer --- */

export function SiteFooter() {
  return (
    <footer className="site-footer">
      {/* The pledge strip. It sits ON the seam between the closing band and the
          footer — half in each — which is what keeps the page from ending on a
          horizontal rule and a link grid. */}
      <div className="footer-pledge">
        <div className="footer-pledge__lead">
          <span className="footer-pledge__mark" aria-hidden="true"><IconGraduation /></span>
          <div>
            <b>Cùng kiến tạo thế hệ học tập mới</b>
            <p>YooLab đồng hành cùng giáo viên, nhà trường và học sinh trên hành trình chuyển đổi số giáo dục.</p>
          </div>
        </div>
        <ul className="footer-pledge__values">
          {PLEDGES.map((pledge) => (
            <li key={pledge.title}>
              <span aria-hidden="true"><pledge.Icon /></span>
              <div>
                <b>{pledge.title}</b>
                <small>{pledge.body}</small>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="footer-main">
        <div className="footer-brand">
          <BrandLockup height={30} />
          <p className="footer-statement">Không gian học tập 3D/XR<br />cho một thế hệ tò mò.</p>
          <p className="footer-blurb">
            Chúng tôi tin công nghệ có thể làm việc học trở nên sống động, gần gũi
            và truyền cảm hứng hơn. YooLab là cầu nối giữa tri thức và thế giới
            thật, để mỗi ngày học là một ngày tò mò thêm một chút.
          </p>
        </div>

        <nav className="footer-links" aria-label="Liên kết chân trang">
          <div>
            <b>Sản phẩm</b>
            <a href="#kham-pha">Khám phá</a>
            <a href="#cong-cu">YooLab</a>
            {/* A URL, not a fragment: this is the only edge from the homepage
                into the library's own pages, and every specimen is two clicks
                behind it. The interactive rail is still one scroll away at
                `#thu-vien`. `Link` because it is a route — the neighbours here
                are fragments on this page and stay plain anchors. */}
            <Link href="/thu-vien" prefetch={false}>Thư viện</Link>
            <a href="#thuc-hanh">Thực hành &amp; STEM</a>
            <a href="#bang-gia">Bảng giá</a>
          </div>
          <div>
            <b>Giáo dục</b>
            <a href="#giao-duc">Giáo viên</a>
            <a href="#giao-duc">Học sinh</a>
            <a href="#giao-duc">Nhà trường</a>
            <a href="#bai-hoc-mau">Bài học mẫu</a>
            {/* The reference layout ends this column on "Tài nguyên", which is
                a page this build does not have. The FAQ is the nearest thing
                that is real, and a link that resolves beats a category that
                does not. */}
            <a href="#cau-hoi">Câu hỏi thường gặp</a>
          </div>
          <div className="footer-links__contact">
            <b>Kết nối</b>
            <a href="#bat-dau-voi-yoolab"><i aria-hidden="true"><IconMail /></i>Mở YooLab ngay</a>
            <a href="mailto:hello@yoolab.vn"><i aria-hidden="true"><IconMail /></i>hello@yoolab.vn</a>
            <ul className="footer-social">
              {SOCIAL.map((channel) => (
                <li key={channel.kind}>
                  <a
                    href={channel.href}
                    aria-label={channel.label}
                    target="_blank"
                    /* `noreferrer` as well as `noopener`: these are the only
                       outbound links on the page. */
                    rel="noopener noreferrer"
                  >
                    <SocialMark kind={channel.kind} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/*
          The last sentence on the site, and it has to earn the space.

          It used to read "Công nghệ tốt nhất là công nghệ giúp con người tò mò
          hơn về thế giới" — true, and the kind of true that could sit under any
          logo in the industry. A closing line signed with the company's own name
          is only worth printing if nobody else could have written it, so this one
          says the specific thing this product is for: a lesson a student handled
          outlasts a lesson they were told.
        */}
        <figure className="footer-quote">
          <blockquote>Học sinh nhớ lâu nhất không phải điều được nghe, mà là điều các em tự tay chạm vào.</blockquote>
          <figcaption>— YooLab</figcaption>
        </figure>
      </div>

      <div className="footer-bottom">
        <span>© 2026 YooLab. Made for curious minds.</span>
        {/*
          Two statements and one control.
          "Quyền riêng tư" and "Điều khoản" are not links because this build has
          no such routes, and a footer link that goes nowhere is the cheapest
          possible way to lose a visitor's trust on the last line of the page.
          "Liên hệ" is a real action — it opens the same consultation form the
          band above and the pricing table use.
        */}
        <span className="footer-legal">
          <span>Quyền riêng tư</span>
          <span>Điều khoản</span>
          <ConsultButton className="footer-legal__link" source="footer">Liên hệ</ConsultButton>
        </span>
      </div>
    </footer>
  );
}
