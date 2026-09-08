/**
 * Bakes the lesson belt's cover images from the meshes this repository ships.
 *
 * ## Why files and not the runtime baker
 *
 * `app/lib/three/thumbnails.ts` already renders a real picture of any GLB — one
 * shared offscreen context, one frame per asset, cached. That is right for the
 * Library's rail, where a visitor has chosen a subject and the models are coming
 * anyway. It is wrong for the lesson belt on the homepage: sixteen cards would
 * mean sixteen GLB fetches, and the organ set alone is 6.4 MB — the brain is
 * 2.7 MB and the lungs 1.0 MB, for a card 240 px wide.
 *
 * The belt used drawn `LibraryMark` diagrams instead, which cost nothing and
 * came back from review as "xấu thí". They are line drawings of objects this
 * repository owns the actual meshes for, which is the weakest thing a picture on
 * a page like this can be.
 *
 * So the renders happen once, here, and ship as WebP. Each card is ~20 kB, no
 * geometry is fetched, and the picture is the real object rather than an
 * illustration of it — which is also stronger than any generated image would
 * be, because it *is* what the lesson opens.
 *
 * ## How it renders without a GPU in Node
 *
 * It does not try. Three.js needs a real WebGL context, so the bake runs inside
 * a browser: `reference-audit/probe.mjs` already launches a real headed Chrome
 * off-screen, evaluates one expression in the live page and prints the JSON
 * result, and `thumbnails.ts` exposes `window.__bakeThumbnail` in dev for
 * exactly this. That is the whole reason this script has no CDP code in it —
 * the plumbing is a hundred and fifty lines that already exist twice in this
 * repository and did not need a third copy.
 *
 * Requires the dev server. Run:
 *   npm run dev
 *   node scripts/bake-library-covers.mjs
 */

import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * `Library`, capital L, and that is not a typo to tidy.
 *
 * `public/asset/Library/` already exists — it holds the anatomy and car sets —
 * and this directory was first written as `library`, which on Windows silently
 * folded into it: the files landed in `Library/cover/` while every path in the
 * code said `library/cover/`. It served locally, because Windows does not care,
 * and 404'd through Vite's own case-sensitive public handler. On a Linux build
 * it would have been two directories and a broken belt in production.
 */
const OUT = 'public/asset/Library/cover';
const URL_BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:3000/';

/**
 * What to render, and the framing each subject needs.
 *
 * `slug` is what the manifest's `cover` field names. Everything else is a
 * `ThumbnailRequest` — see `app/lib/three/thumbnails.ts`, which auto-fits the
 * camera to the subject's bounding sphere, so `yaw` / `pitch` / `zoom` are
 * adjustments to a frame that is already correct rather than a camera built from
 * scratch per model.
 *
 * The organs share one framing on purpose. They are twelve single closed meshes
 * of comparable proportion and the fit is measured per model, so a hand-tuned
 * camera per organ would be twelve numbers to maintain for a difference nobody
 * can see at 240 px. The creatures do not share one: the jellyfish is mostly
 * tentacle and the T-rex mostly tail, and both need `targetY` to put the part
 * worth looking at in the middle of the frame.
 */
const ORGAN = { preset: 'natural', yaw: 0.72, pitch: 0.2, zoom: 1.12 };
const ANATOMY = '/asset/Library/Biology/anatomy';

const COVERS = [
  /* ---------------------------------------------------------- creatures --- */
  { slug: 'bee', url: '/asset/bee/bee_fixed.glb', preset: 'ruby', yaw: 0.62, pitch: 0.16, zoom: 1.06, poseTime: 0.4 },
  { slug: 'trex', url: '/asset/T-rex/T-rex.glb', preset: 'natural', yaw: 0.86, pitch: 0.18, zoom: 1.02, poseTime: 1.4, targetY: 0.62 },
  { slug: 'clownfish', url: '/asset/fish/Fish.glb', preset: 'natural', yaw: 1.5, pitch: 0.12, zoom: 1.06, poseTime: 0.9 },
  { slug: 'jellyfish', url: '/asset/fish/jellyfish.glb', preset: 'opal', yaw: 0.5, pitch: 0.1, zoom: 0.82, poseTime: 1.4, targetY: 0.58 },
  { slug: 'gram-wall', url: '/asset/Library/Biology/gram-positive-wall.glb', preset: 'tissue', yaw: 0.66, pitch: 0.22, zoom: 1.08 },

  /* ------------------------------------------------------------- organs --- */
  { slug: 'organ-heart', url: `${ANATOMY}/heart.glb`, ...ORGAN },
  { slug: 'organ-lungs', url: `${ANATOMY}/lungs.glb`, ...ORGAN },
  { slug: 'organ-brain', url: `${ANATOMY}/brain.glb`, ...ORGAN },
  { slug: 'organ-eye', url: `${ANATOMY}/eye.glb`, ...ORGAN },
  { slug: 'organ-liver', url: `${ANATOMY}/liver.glb`, ...ORGAN },
  { slug: 'organ-kidney', url: `${ANATOMY}/kidney.glb`, ...ORGAN },
  { slug: 'organ-spleen', url: `${ANATOMY}/spleen.glb`, ...ORGAN },
  { slug: 'organ-pancreas', url: `${ANATOMY}/pancreas.glb`, ...ORGAN },
  { slug: 'organ-gallbladder', url: `${ANATOMY}/gallbladder.glb`, ...ORGAN },
  { slug: 'organ-colon', url: `${ANATOMY}/intestine.glb`, ...ORGAN },
  { slug: 'organ-ileum', url: `${ANATOMY}/small_intestine.glb`, ...ORGAN },
  { slug: 'organ-thymus', url: `${ANATOMY}/thymus.glb`, ...ORGAN },

  /* -------------------------------------------------------------- STEM --- */
  /* The paint jar rather than the screwdriver, which is the toolkit entry's own
     rail thumbnail. A screwdriver is 200 mm of shaft and 30 of handle, so the
     fit — which measures the bounding sphere — frames 200 mm of nothing and the
     tool arrives as a 3 px sliver. A cylinder reads at 240 px. Both are in the
     same eight-piece kit the entry is about. */
  { slug: 'toolkit', url: '/asset/Library/Car/paintJar.glb', preset: 'plastic', yaw: 0.78, pitch: 0.24, zoom: 1.14 },
];

/* Rendered larger than they ship, then downsampled: a 240 px card on a retina
   display asks for 480, and supersampling the render is cheaper than asking
   three.js for antialiasing it does not do well at small sizes. */
const RENDER = { width: 900, height: 675 };
/* 4:3, matching the plate's own aspect, so `object-fit: cover` trims nothing. */
const SHIP = { width: 480, height: 360 };

/*
 * One page visit, every cover.
 *
 * Sequential inside the page rather than `Promise.all`, because
 * `requestThumbnail` serialises onto one queue and one shared context anyway —
 * firing sixteen at once would just fill the queue and hold sixteen decoded GLBs
 * in memory at the same time.
 */
const expression = `
  const wanted = ${JSON.stringify(COVERS.map(({ slug, ...request }) => ({ slug, request: { ...request, ...RENDER } })))};
  for (let attempt = 0; attempt < 120 && !window.__bakeThumbnail; attempt += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!window.__bakeThumbnail) throw new Error('the bake seam never appeared — is this a dev build?');
  const out = {};
  for (const { slug, request } of wanted) {
    try {
      const data = await window.__bakeThumbnail(request);
      out[slug] = data ?? null;
    } catch (error) {
      out[slug] = null;
    }
  }
  return out;
`;

const scratch = join(tmpdir(), `yoolab-bake-${process.pid}.js`);
writeFileSync(scratch, expression, 'utf8');

let payload;
try {
  const stdout = execFileSync(
    process.execPath,
    ['reference-audit/probe.mjs', scratch, '--viewport', 'w1512', '--url', URL_BASE],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  /* probe.mjs prints the JSON result and may print page problems to stderr; the
     result is the whole of stdout. */
  payload = JSON.parse(stdout);
} finally {
  rmSync(scratch, { force: true });
}

mkdirSync(OUT, { recursive: true });
const kb = (path) => Math.round(statSync(path).size / 1024);
let written = 0;
const missing = [];

for (const { slug } of COVERS) {
  const data = payload?.[slug];
  if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,')) {
    missing.push(slug);
    continue;
  }
  const png = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
  const file = `${OUT}/${slug}.webp`;
  await sharp(png)
    /* `contain` on transparency, not `cover`. The bake is a subject on an alpha
       ground and the plate behind it in the page carries the wash, so cropping
       to fill would cut a wingtip off to hide a background that is not there. */
    .resize({ ...SHIP, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 86, effort: 6, alphaQuality: 90 })
    .toFile(file);
  console.log(`  ${slug.padEnd(20)} ${String(kb(file)).padStart(3)} KB`);
  written += 1;
}

console.log(`\n${written}/${COVERS.length} covers written to ${OUT}`);
if (missing.length) {
  console.error(`\nNo render came back for: ${missing.join(', ')}`);
  console.error('A null result is usually a 404 on the GLB or a fit that put the camera inside the subject.');
  process.exitCode = 1;
}
