/**
 * Builds the practice section's poster wall from the studio renders.
 *
 * The section shows a still rather than a live renderer (see
 * `PracticeSection.tsx`), so these three files are the section's entire visual
 * budget and they replace what used to be a WebGL context plus eleven GLBs.
 * That only holds if they stay small: the sources are 1448 × 1086 PNGs at
 * ~1.4 MB each, and shipping those would have been worse than the renderer.
 *
 * Two sizes, because the two uses want different crops:
 *
 *   poster  the stage cell, which sits at roughly 1.38:1. The sources are 4:3
 *           (1.333), so this is nearly the whole frame — `object-fit: cover`
 *           trims a few pixels off the sides at most. Encoding at 4:3 rather
 *           than at the stage's exact aspect keeps the file correct when the
 *           stage reflows on a narrow viewport, where the cell goes taller.
 *   thumb   the rail cell, cropped by CSS to 3:2. Kept at 4:3 for the same
 *           reason.
 *
 * Run: node scripts/build-practice-posters.mjs
 */

import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const SRC = 'public/asset/thuc-hanh';
const OUT = 'public/asset/practice/poster';

/** Source file → slug used by `lib/practice/manifest.ts`. */
const POSTERS = [
  ['car.jpg', 'car'],
  ['Drone.jpg', 'drone'],
  ['robot.jpg', 'robot'],
];

mkdirSync(OUT, { recursive: true });
const kb = (path) => Math.round(statSync(path).size / 1024);

for (const [file, slug] of POSTERS) {
  const poster = `${OUT}/${slug}.webp`;
  await sharp(`${SRC}/${file}`)
    .resize({ width: 1400, height: 1050, fit: 'cover', position: 'centre' })
    .webp({ quality: 80, effort: 6 })
    .toFile(poster);

  const thumb = `${OUT}/${slug}-thumb.webp`;
  await sharp(`${SRC}/${file}`)
    .resize({ width: 480, height: 360, fit: 'cover', position: 'centre' })
    .webp({ quality: 80, effort: 6 })
    .toFile(thumb);

  console.log(`${slug}.webp ${kb(poster)} KB   ${slug}-thumb.webp ${kb(thumb)} KB`);
}
