import { FaFacebook, FaTiktok, FaYoutube } from 'react-icons/fa';
import { BrandLockup } from './BrandMark';

/*
 * The YooLab lockup stays at the top, same as before. Below it, four
 * columns — contact, product, resources, connect — replace the old
 * three-column link list. Content and layout follow the reference footer
 * directly; colour and type still come from this site's own tokens
 * (`--ink*`, `--line`, `--brand*`), not the reference's palette.
 */

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.2" />
      <path d="M4 6.5l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.3 1.1.4 2.3.6 3.5.6.6 0 1.1.5 1.1 1.1V20c0 .6-.5 1-1.1 1C10.6 21 3 13.4 3 4.1 3 3.5 3.5 3 4.1 3H7c.6 0 1.1.5 1.1 1.1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.3 1z" strokeLinejoin="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z" />
    </svg>
  );
}

// Same list as the header nav (SiteHeader.tsx's `links`).
const PRODUCT_LINKS = [
  { label: 'Khám phá', href: '#kham-pha' },
  { label: 'YooLab', href: '#cong-cu' },
  { label: 'Thư viện', href: '#thu-vien' },
  { label: 'Thực hành', href: '#thuc-hanh' },
  { label: 'Giáo dục', href: '#giao-duc' },
  { label: 'Bài học mẫu', href: '#bai-hoc-mau' },
];

const EDUCATION_LINKS = [
  { label: 'Giáo viên', href: '#giao-duc' },
  { label: 'Học sinh', href: '#giao-duc' },
  { label: 'Nhà trường', href: '#giao-duc' },
  { label: 'Bài học mẫu', href: '#bai-hoc-mau' },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <BrandLockup height={26} />
        <p>Không gian học tập 3D/XR<br />cho một thế hệ tò mò.</p>
      </div>

      <div className="footer-col">
        <h3>Liên hệ với chúng tôi</h3>
        <ul className="footer-contact-list">
          <li className="footer-contact-item">
            <PinIcon />
            <span>Địa chỉ: Tầng 2, Tòa N09B2 Thành Thái, Cầu Giấy, TP. Hà Nội</span>
          </li>
          <li className="footer-contact-item">
            <MailIcon />
            <span>Email: info@yootek.vn</span>
          </li>
          <li className="footer-contact-item">
            <PhoneIcon />
            <span>Số điện thoại: 0964714148</span>
          </li>
          <li className="footer-contact-item">
            <GlobeIcon />
            <span>
              Website: <a href="https://yoolab.vn">yoolab.vn</a>
            </span>
          </li>
        </ul>
      </div>

      <div className="footer-col">
        <h3>Sản phẩm</h3>
        <ul className="footer-link-list">
          {PRODUCT_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </div>

      <div className="footer-col">
        <h3>Giáo dục</h3>
        <ul className="footer-link-list">
          {EDUCATION_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </div>

      <div className="footer-col">
        <h3>Kết nối với YooTek</h3>
        <div className="footer-social-row">
          <a
            className="footer-social-link"
            href="https://www.facebook.com/profile.php?id=61593602137812"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
          >
            <FaFacebook size={20} />
          </a>
          <a
            className="footer-social-link"
            href="https://www.tiktok.com/@yoolifeedu"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
          >
            <FaTiktok size={19} />
          </a>
          <a
            className="footer-social-link"
            href="https://www.youtube.com/@yootekofficial"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YouTube"
          >
            <FaYoutube size={21} />
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 YooLab. Made for curious minds.</span>
        <span className="footer-bottom-links">
          <a href="#">Chính sách bảo mật</a>
          <a href="#">Điều khoản dịch vụ</a>
        </span>
      </div>
    </footer>
  );
}
