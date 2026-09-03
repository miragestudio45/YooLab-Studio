'use client';

import { useEffect, useState } from 'react';
import { BrandLockup } from './BrandMark';
import { UserMenu } from './UserMenu';

/**
 * Navigation follows the journey, in order: see it, use the tool, find the
 * content, see the hands-on side, find yourself, then check the evidence. Six
 * short labels, and the one thing a visitor might want to do at any moment stays
 * pinned as the CTA.
 *
 * The bar is a compact glass rail inset from the viewport. Its theme follows the
 * current Explore chapter while its geometry stays independent from the WebGL
 * scene and the scroll-driven camera.
 */
const links = [
  ['Khám phá', '#kham-pha'],
  ['YooLab', '#cong-cu'],
  ['Thư viện', '#thu-vien'],
  ['Thực hành', '#thuc-hanh'],
  ['Giáo dục', '#giao-duc'],
  ['Bài học mẫu', '#bai-hoc-mau'],
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const themedSections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-header-theme]'),
    );
    let frame = 0;
    let ranges: Array<{ start: number; end: number; theme: 'light' | 'dark' }> = [];

    const measure = () => {
      const offset = window.scrollY;
      ranges = themedSections.map((section) => {
        const rect = section.getBoundingClientRect();
        return {
          start: offset + rect.top,
          end: offset + rect.bottom,
          theme: section.dataset.headerTheme === 'dark' ? 'dark' : 'light',
        };
      });
    };

    const sample = () => {
      frame = 0;
      setScrolled(window.scrollY > 24);
      const probe = window.scrollY + 36;
      const active = ranges.find(({ start, end }) => probe >= start && probe < end);
      setTheme(active?.theme ?? 'light');
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(sample);
    };
    const onResize = () => { measure(); sample(); };

    measure();
    sample();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const resizeObserver = new ResizeObserver(onResize);
    for (const section of themedSections) resizeObserver.observe(section);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`site-header${open ? ' is-open' : ''}${scrolled ? ' is-scrolled' : ''}`}
      data-theme={theme}
      aria-label="Điều hướng chính"
    >
      <div className="site-header-inner">
        <a className="brand" href="#trang-chu" aria-label="YooLab — Trang chủ" onClick={() => setOpen(false)}>
          <BrandLockup height={19} />
        </a>
        <nav className="desktop-nav" aria-label="Các khu vực của YooLab">
          {links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
        </nav>
        <UserMenu variant="desktop" />
        <button
          className="menu-toggle"
          type="button"
          aria-label={open ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <i /><i />
        </button>
      </div>
      <nav
        className="mobile-nav"
        aria-label="Điều hướng trên thiết bị di động"
        aria-hidden={!open}
        inert={!open}
      >
        {links.map(([label, href], index) => (
          <a href={href} key={href} onClick={() => setOpen(false)}><span>0{index + 1}</span>{label}</a>
        ))}
        <UserMenu variant="mobile" onNavigate={() => setOpen(false)} />
      </nav>
    </header>
  );
}
