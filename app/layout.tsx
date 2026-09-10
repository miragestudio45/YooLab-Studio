import type { Metadata } from 'next';
import './globals.css';
import { StructuredData } from './components/StructuredData';
import { ToastHost } from './components/ToastHost';
import { INDEXABLE, SITE_URL } from './lib/siteUrl';

const TITLE = 'YooLab — Biến kiến thức thành trải nghiệm 3D/XR';
const DESCRIPTION =
  'YooLab giúp giáo viên xây dựng bài học với mô hình 3D, học sinh khám phá, tương tác và sáng tạo nội dung số trên cùng một nền tảng.';

export const metadata: Metadata = {
  /* One resolver for every absolute URL this page publishes — see the note in
     `lib/siteUrl.ts` for what a deployment describing the wrong host cost. */
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  /*
   * The homepage is one page carrying nine anchored sections, and every nav
   * link, footer link and shareable deep link is a fragment on it —
   * `#thu-vien`, `#thuc-hanh/robot`, `#bai-hoc-mau`. Fragments do not create
   * URLs, but they are pasted, shared and linked, and some of them arrive back
   * with tracking parameters attached. A canonical is what keeps all of that
   * consolidated onto one indexable address instead of splitting its signals.
   */
  alternates: { canonical: '/' },
  /*
   * `index` is not a constant because not every deployment of this repo should
   * be in the index — only the one answering on `yoolab.vn`. See `INDEXABLE` in
   * `lib/siteUrl.ts`. `follow` stays true either way: a staging copy that is not
   * itself indexable has no reason to strand the links it carries.
   */
  robots: {
    index: INDEXABLE,
    follow: true,
    googleBot: {
      index: INDEXABLE,
      follow: true,
      /* The Library and the practice rooms are the product; a text-only snippet
         cannot represent them, and a preview frame can. */
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [{ url: '/brand/yoolab-icon.svg', type: 'image/svg+xml' }],
    shortcut: '/brand/yoolab-icon.svg',
    apple: '/brand/yoolab-icon.svg',
  },
  /*
   * The share card, and the three scrapers that actually matter here.
   *
   * Most of this page's traffic is pasted into Zalo and Messenger rather than
   * crawled, and both of those are stricter than the spec: Zalo wants `og:url`
   * and a same-origin absolute image and quietly renders nothing without them,
   * and Facebook trusts the declared `og:image:width`/`height` over the file —
   * a card whose numbers disagree with its bytes comes back blank or letterboxed
   * in Messenger. `metadataBase` above is what makes the relative URLs here come
   * out absolute; the dimensions are the file's real ones, and stay that way.
   *
   * The filename is a cache key, not a name. Facebook and Zalo both cache a
   * scrape against the image URL for days, so replacing the picture *at* the old
   * `/og.png` would have gone on serving the jellyfish to every existing thread
   * until each one was re-scraped by hand. `/og.jpg` is a URL neither has seen,
   * which is the only re-scrape that needs nobody's cooperation. Any future
   * change to this picture should change this filename too.
   *
   * Baked from `reference-sources/THUMB -  Open Graph  social share/` down to
   * 1200x675 — Facebook's recommended width, the source's own 16:9 so nothing is
   * cropped out of the headline, and 173 kB, which keeps it under the size where
   * Zalo starts skipping images.
   */
  openGraph: {
    title: TITLE,
    description: 'Thư viện học liệu 3D đa môn, không gian biên soạn YooLab và các trải nghiệm tương tác.',
    type: 'website',
    locale: 'vi_VN',
    url: '/',
    siteName: 'YooLab',
    images: [{
      url: '/og.jpg',
      width: 1200,
      height: 675,
      type: 'image/jpeg',
      alt: 'YooLab — Kiến tạo không gian học tập số',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: 'Thư viện học liệu 3D đa môn, không gian biên soạn YooLab và các trải nghiệm tương tác.',
    images: ['/og.jpg'],
  },
};

/*
 * Two Search Console properties were verified against this same host.
 * `metadata.verification.google` takes only one code — an array renders as a
 * single tag with the codes comma-joined into one `content`, which Google
 * does not parse as two verifications — so both go in as literal tags below.
 */
const SITE_VERIFICATIONS = [
  '4_ReIsy9dFXLO-i0Jt4V7uuejHJ-vHGhkGFWlVNgz-A',
  'ZlsQjhBv4I-__izDobdI4N6r6fZOl9NGieI_eC6qHZ4',
];

const GA_MEASUREMENT_ID = 'G-NDFFXN9JPG';
const GA_BOOTSTRAP = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`;

const META_PIXEL_ID = '1025211157015141';
/* The stub loader Meta's own snippet ships, verbatim — it queues calls made
   before `fbevents.js` has finished loading rather than dropping them. */
const META_PIXEL_BOOTSTRAP = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`;

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
  /*
   * The GPU tier, stamped before the first paint.
   *
   * data-gpu="lean" is what lets the STYLESHEET spend less on a machine that
   * cannot afford it — specifically the backdrop blurs, which are the one CSS
   * feature on this page that costs per frame rather than once. A blurred
   * backdrop over a surface that is repainting sixty times a second is
   * re-blurred sixty times a second, and the fixed header sits over a
   * full-viewport WebGL canvas for the entire Explore chapter. On WebKit that
   * is the most expensive rule on the page and it is invisible in a profile of
   * the render loop, because it is not in the render loop.
   *
   * It has to be a pre-paint inline script rather than a React effect for the
   * same reason \`reveal-ready\` does: a header that mounts blurred and then
   * un-blurs is worse than one that was never blurred.
   *
   * The test is the same one \`lib/three/deviceTier.ts\` makes — kept in sync by
   * hand because this string runs before any module is parsed — and it errs
   * toward keeping the design: only unambiguous evidence downgrades.
   */
  var n=navigator;
  var handheld=matchMedia('(hover: none) and (pointer: coarse)').matches;
  var cores=n.hardwareConcurrency||8;
  var mem=n.deviceMemory||0;
  if(handheld||cores<=4||(mem>0&&mem<=4)) d.setAttribute('data-gpu','lean');
}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The reveal bootstrap below adds a class to this element before React
    // hydrates, which is precisely what this flag is for. It suppresses the
    // warning on <html> only; every child is still checked normally.
    <html lang="vi" suppressHydrationWarning>
      <head>
        {SITE_VERIFICATIONS.map((code) => (
          <meta key={code} name="google-site-verification" content={code} />
        ))}
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
        {/* Google tag (gtag.js) */}
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
        <script dangerouslySetInnerHTML={{ __html: GA_BOOTSTRAP }} />
        {/* Meta Pixel Code */}
        <script dangerouslySetInnerHTML={{ __html: META_PIXEL_BOOTSTRAP }} />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element -- a
              1x1 tracking beacon, not a rendered image; `next/image` cannot
              stand in for the `noscript` fallback Meta's snippet requires. */}
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <StructuredData />
      </head>
      <body>
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
