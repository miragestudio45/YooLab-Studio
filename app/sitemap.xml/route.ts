import { LIBRARY_ROUTES, ROUTABLE_SUBJECTS } from '../lib/library/slugs';

/**
 * The sitemap, read off the manifest instead of maintained by hand.
 *
 * The first version of this file was three static URLs in `public/`, written
 * when the library was reachable only as `#thu-vien` — a fragment, which is not
 * an address, so there was genuinely nothing else to declare. Now every `ready`
 * specimen has a page and a subject hub above it, and the count changes whenever
 * a model clears its licence check. A hand-written list would be wrong within a
 * week; this one cannot be.
 *
 * A route handler rather than a generated file because this build prerenders
 * nothing — `/` itself is rendered by the server on request — so there is no
 * build step that would be the natural place to emit it, and no staleness window
 * to manage.
 *
 * `lastmod` is deliberately absent. The honest value would be the commit date of
 * the manifest entry, which this module cannot see, and a synthesised "today" on
 * every request is worse than saying nothing: it tells crawlers the whole
 * library changed daily, which is a claim, and a false one.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://yoolab.vn';

type Entry = { path: string; changefreq: string; priority: string };

function entries(): Entry[] {
  return [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    ...ROUTABLE_SUBJECTS.map((subject) => ({
      path: `/thu-vien/${subject.id}`,
      changefreq: 'weekly',
      priority: '0.8',
    })),
    ...LIBRARY_ROUTES.map((route) => ({
      path: `/thu-vien/${route.subject}/${route.slug}`,
      changefreq: 'monthly',
      /* The specimens are the reason this sitemap exists — each one answers a
         specific query — so they outrank the account routes by a long way. */
      priority: '0.7',
    })),
    { path: '/register', changefreq: 'monthly', priority: '0.5' },
    { path: '/login', changefreq: 'monthly', priority: '0.3' },
  ];
}

export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries()
  .map(
    (entry) => `  <url>
    <loc>${SITE}${entry.path}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      /* Crawlers re-fetch this often and it is cheap to rebuild, but it should
         not be stale for a day after a specimen ships. */
      'cache-control': 'public, max-age=3600',
    },
  });
}
