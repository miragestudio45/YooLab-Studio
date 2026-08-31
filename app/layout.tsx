import type { Metadata } from 'next';
import './globals.css';

const TITLE = 'YooLab — Biến kiến thức thành trải nghiệm 3D/XR';
const DESCRIPTION =
  'YooLab giúp giáo viên xây dựng bài học với mô hình 3D, học sinh khám phá, tương tác và sáng tạo nội dung số trên cùng một nền tảng.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://yoolab.vn'),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: [{ url: '/brand/yoolab-icon.svg', type: 'image/svg+xml' }],
    shortcut: '/brand/yoolab-icon.svg',
    apple: '/brand/yoolab-icon.svg',
  },
  openGraph: {
    title: TITLE,
    description: 'Thư viện học liệu 3D đa môn, không gian biên soạn YooLab và các trải nghiệm tương tác.',
    type: 'website',
    locale: 'vi_VN',
    images: [{ url: '/og.png', width: 1792, height: 933, alt: 'YooLab — Không gian học tập 3D' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: 'Thư viện học liệu 3D đa môn, không gian biên soạn YooLab và các trải nghiệm tương tác.',
    images: ['/og.png'],
  },
};

/**
 * Arms the scroll reveal before the first paint.
 *
 * The hidden state lives behind `html.reveal-ready`, and this is what adds it.
 * Doing it from a React effect instead would run *after* the first paint, so
 * every section would flash in at full opacity and then drop back to zero to
 * animate — worse than having no reveal at all.
 *
 * The timeout is a safety net, not part of the animation: if the observer never
 * runs (a hydration failure, a browser that surprises us), the class is removed
 * and the page is simply visible. Nothing here can leave content hidden.
 */
const REVEAL_BOOTSTRAP = `try{
  var d=document.documentElement;
  if('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    d.classList.add('reveal-ready');
    setTimeout(function(){
      if(!document.querySelector('[data-reveal][data-revealed]')) d.classList.remove('reveal-ready');
    },2500);
  }
}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The reveal bootstrap below adds a class to this element before React
    // hydrates, which is precisely what this flag is for. It suppresses the
    // warning on <html> only; every child is still checked normally.
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/*
            One family for the whole site: Plus Jakarta Sans, 200–800, roman and
            italic.

            The build before this one ran four faces — Inter Tight for display,
            Inter for body, Instrument Serif for Library specimen names and
            JetBrains Mono for readouts — and the seam showed: a serif "Ong mật"
            in a sans application, and a monospaced number column that belonged to
            a different site than the label beside it. Hierarchy here comes from
            weight, size, tracking, italic and opacity instead, and the readouts
            align through `font-variant-numeric: tabular-nums`, which Plus Jakarta
            Sans supports at every weight.

            The variable axis is loaded whole rather than as five static cuts: the
            display headings sit at 700, the italic at 500, body at 400 and labels
            at 650, and a variable font serves all four from one file.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router
            has no _document; this layout wraps every route. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
