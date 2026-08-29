/**
 * Prepares the quadrotor sandbox's Mint art for the web.
 *
 * These twenty files are not in the sandbox's repository — it fetches them from
 * `cdn.mint.gg` at runtime, and `asset-manifest.json` there is literally empty.
 * They are downloaded into `.cache/mint/` (gitignored) and processed here into
 * `public/asset/practice/drone/`, and every one was checked against the byte
 * size `mint-assets.json` records for it before being touched.
 *
 * **Geometry: none changed.** Each model is 3.7–5.4 k triangles with only
 * `POSITION`, `NORMAL` and `TEXCOORD_0` — already lean, and nothing is dropped.
 *
 * **Textures: the whole story.** Each GLB carries three embedded PBR maps and
 * that is where the megabyte goes: `setback-tower` is 1.75 MB for 4,103
 * triangles. They are resampled and re-encoded to WebP at a size chosen per
 * pack, because the three packs are seen from very different distances — a
 * tower is never closer than about twenty metres, while the drone's own
 * fuselage sits half a metre from the onboard camera.
 *
 * Run: node scripts/build-drone-assets.mjs
 */

import { statSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { readGlb, writeGlb, repackGlb, countTriangles } from './lib/glb.mjs';

const CACHE = '.cache/mint';
const OUT = 'public/asset/practice/drone';

/**
 * [file stem, embedded-texture size].
 *
 * The airframe gets 512: the onboard camera is mounted *inside* it and the
 * chase camera sits 1.1 m behind, so its surface is the one thing in this lab
 * that is ever seen close. Buildings get 256 — from the pad, the nearest façade
 * is 30 m away and a 512 map on it is detail nobody can resolve. Props sit
 * between the two.
 */
const MODELS = [
  ['drone-fuselage', 512],
  ['drone-motor-arm', 512],
  ['drone-propeller', 512],
  ['drone-skid', 512],
  ['drone-pod', 512],
  ['city-glass-tower', 256],
  ['city-setback-tower', 256],
  ['city-corner-office', 256],
  ['city-apartment', 256],
  ['city-podium-tower', 256],
  ['city-mid-rise', 256],
  ['city-storefront', 256],
  ['city-hotel-tower', 256],
  ['prop-container', 384],
  ['prop-scaffold', 384],
  ['prop-barrier', 384],
  ['prop-cable-drum', 384],
  ['prop-antenna', 384],
  ['prop-cone', 384],
];

mkdirSync(OUT, { recursive: true });

const missing = MODELS.filter(([name]) => !existsSync(`${CACHE}/${name}.glb`));
if (missing.length) {
  console.error(
    `Missing ${missing.length} source model(s) in ${CACHE}/.\n`
    + 'They are downloaded from cdn.mint.gg — see THIRD_PARTY_ASSETS.md for the URLs\n'
    + 'and SOURCE_AUDIT.md for why they are cached rather than committed as sources.',
  );
  process.exit(1);
}

const kb = (bytes) => Math.round(bytes / 1024);
let before = 0;
let after = 0;

for (const [name, size] of MODELS) {
  const from = `${CACHE}/${name}.glb`;
  const to = `${OUT}/${name}.glb`;
  const { json, bin } = readGlb(from);

  /*
   * `drop: []` — nothing to remove.
   *
   * `repackGlb` is still worth running: it rebuilds the buffer around the
   * re-encoded images, and an image shrinking from 600 kB to 20 kB inside a
   * buffer that is not repacked leaves the old bytes stranded in the file.
   */
  const { bin: nextBin } = await repackGlb(json, bin, {
    drop: [],
    encodeImage: async (data) => ({
      data: await sharp(data)
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 6 })
        .toBuffer(),
      mimeType: 'image/webp',
    }),
  });

  const size_ = writeGlb(to, json, nextBin);
  before += statSync(from).size;
  after += size_;
  console.log(
    `${name.padEnd(20)} ${String(kb(statSync(from).size)).padStart(5)} KB → `
    + `${String(kb(size_)).padStart(4)} KB  ${String(countTriangles(json)).padStart(5)} tris @${size}`,
  );
}

/*
 * The sky.
 *
 * An equirectangular mountain horizon, mapped onto the inside of a sphere. 2:1
 * because that is the projection's own aspect, and 2048 wide because it wraps a
 * full turn — at 1024 the horizon line visibly steps when the aircraft yaws.
 */
const sky = `${OUT}/sky-panorama.webp`;
await sharp(`${CACHE}/sky-panorama.png`)
  .resize({ width: 2048, height: 1024, fit: 'fill' })
  .webp({ quality: 78, effort: 6 })
  .toFile(sky);
before += statSync(`${CACHE}/sky-panorama.png`).size;
after += statSync(sky).size;
console.log(`${'sky-panorama'.padEnd(20)} ${String(kb(statSync(`${CACHE}/sky-panorama.png`).size)).padStart(5)} KB → ${String(kb(statSync(sky).size)).padStart(4)} KB`);

console.log(
  `\ntotal ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(2)} MB`
  + `  (${Math.round((1 - after / before) * 100)}% smaller)`,
);
