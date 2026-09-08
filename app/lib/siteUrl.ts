/**
 * The origin this deployment describes itself with.
 *
 * Every absolute URL the page hands to a machine comes from here: `og:image`
 * and `og:url` in the root metadata, the canonical, the sitemap, and both
 * JSON-LD blocks. They have to agree, and they have to name a host that is
 * actually serving THIS build.
 *
 * ## Why it is not just a constant
 *
 * It was `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://yoolab.vn'`, written out
 * four times, and `NEXT_PUBLIC_SITE_URL` is not set on the Vercel project — so
 * the Vercel deployment described itself as `yoolab.vn`, which is a different
 * host on a different provider running an older build. `yoolab.vn` answers from
 * Cloudflare (`server: cloudflare`, no `x-vercel-id`); this repo deploys there
 * through Wrangler and to Vercel through the Nitro preset, and the two move
 * independently. On 2026-09-08 that produced, measured on the live sites:
 *
 *     yoolabstudio.vercel.app   og:image = https://yoolab.vn/og.jpg   404
 *     yoolabstudio.vercel.app   /og.jpg                               200
 *     yoolab.vn                 og:image = https://yoolab.vn/og.png   the old picture
 *
 * The file was deployed. The tag pointed at a host that did not have it, so
 * Messenger and Zalo did what they always do with an image they cannot fetch —
 * kept showing the last one they successfully scraped, which was the jellyfish
 * this page has not used for weeks. Nothing about that was visible from the
 * tags: they were correct, complete and pointed somewhere else.
 *
 * ## Why the whole origin moves together, and not just the image
 *
 * Pointing `og:image` at the serving host while `og:url` still said `yoolab.vn`
 * would not have fixed the card. `og:url` is the identity of the shared object,
 * not a link in it: Facebook and Zalo fold the pasted URL onto it and then use
 * *that* page's card. A Vercel deployment claiming `og:url = https://yoolab.vn`
 * is asking to be shown as yoolab.vn, old picture included. So a deployment
 * describes one origin — its own — for the image, the identity and the sitemap
 * alike, and `INDEXABLE` below is what keeps that from costing anything.
 *
 * ## The order
 *
 * 1. `NEXT_PUBLIC_SITE_URL`, because a person naming the host knows something
 *    this file cannot work out.
 * 2. On Vercel, the Vercel host serving this build.
 * 3. `CANONICAL` — local, `vinext start`, and the Cloudflare/Wrangler build,
 *    which is the one that actually serves `yoolab.vn`.
 *
 * Read once at module load. On Vercel these are present at both build and
 * request time, so a prerendered page and a rendered one agree.
 */
const CANONICAL = 'https://yoolab.vn';

const host = (value: string | undefined) =>
  value?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || undefined;

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  if (process.env.VERCEL) {
    /*
     * `VERCEL_URL` is the deployment's own unique hostname and is therefore, by
     * definition, serving this build — but it changes with every push, and a
     * share card wants a URL that outlives the deployment behind it. So a
     * production build prefers `VERCEL_PROJECT_PRODUCTION_URL`, the stable
     * alias, and only while it names a `*.vercel.app` host: that is an alias
     * Vercel itself maintains against this project, so it cannot be pointing
     * anywhere else. A custom domain in that variable is exactly the case this
     * file exists because of — Vercel knows the domain was claimed, not that
     * its DNS arrives at Vercel — and is not trusted without a person setting
     * `NEXT_PUBLIC_SITE_URL` to say so.
     *
     * Preview deployments always self-describe: the point of a branch build is
     * to show the branch's own picture, and Vercel serves previews
     * `x-robots-tag: noindex`, so nothing there is competing for a canonical.
     *
     * Vercel publishes both without a scheme — `example.vercel.app`, not a URL —
     * so the protocol is added rather than assumed of the value.
     */
    const stable = host(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    const self = host(process.env.VERCEL_URL);
    const chosen =
      process.env.VERCEL_ENV === 'production' && stable?.endsWith('.vercel.app') ? stable : self;
    if (chosen) return `https://${chosen}`;
  }

  return CANONICAL;
}

export const SITE_URL = resolveSiteUrl();

/**
 * Whether this deployment is the copy that should be in a search index.
 *
 * `yoolab.vn` is the address being promoted, and every deployment of this repo
 * is byte-for-byte the same site. Two indexable copies split the signals
 * between them, so only the one answering on the canonical host invites
 * crawling; the Vercel deployment is a staging copy that has to publish a
 * working share card, which is a different job from being findable.
 *
 * This is deliberately a comparison against the resolved origin rather than a
 * check for `VERCEL`: on the day `yoolab.vn` is served by Vercel, the resolver
 * returns it — via `NEXT_PUBLIC_SITE_URL` — and this turns back on by itself.
 *
 * `public/robots.txt` is static (see the note in it) and still says `Allow: /`
 * everywhere. That is not the contradiction it looks like: `robots.txt` governs
 * crawling and `noindex` governs indexing, and a page has to be crawled for its
 * `noindex` to be read at all.
 */
export const INDEXABLE = SITE_URL === CANONICAL;
