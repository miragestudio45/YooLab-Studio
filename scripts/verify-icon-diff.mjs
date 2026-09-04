/**
 * Pixel-diff two revisions of the generated editor icon set.
 *
 * `build-editor-icons.mjs` now rounds path data and drops Figma's outlined
 * stroke endpoints, and the claim behind both is that neither is visible at the
 * size the set is drawn. That claim is testable rather than arguable: rasterise
 * every icon from both revisions at 160 px — an order of magnitude larger than
 * the ~15 px the rail actually uses — and count the pixels that differ.
 *
 *     node scripts/verify-icon-diff.mjs <before.tsx> <after.tsx> <outdir>
 *
 * Writes `icons.json` and `index.html` into `outdir`. Serve that directory and
 * read `window.__diff` for the table.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [beforePath, afterPath, outDir] = process.argv.slice(2);
if (!beforePath || !afterPath || !outDir) {
  console.error('usage: node scripts/verify-icon-diff.mjs <before.tsx> <after.tsx> <outdir>');
  process.exit(1);
}

/* JSX back to SVG: the generator camelCased every hyphenated presentation
   attribute on the way in, and `{...BASE}` stood in for `fill="none"`. */
function toSvgMarkup(body) {
  return body
    .replace(/\{\.\.\.BASE\}/g, 'fill="none" aria-hidden="true" focusable="false"')
    .replace(/\bclassName=\{className\}/g, '')
    .replace(/\b(strokeWidth|strokeLinecap|strokeLinejoin|strokeMiterlimit|strokeDasharray|strokeOpacity|fillOpacity|fillRule|clipRule|clipPath|stopColor|stopOpacity|gradientUnits|gradientTransform|maskUnits|patternUnits|markerWidth|markerHeight|preserveAspectRatio|colorInterpolationFilters|floodColor|floodOpacity|stdDeviation)=/g,
      (_, attr) => `${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}=`);
}

function extract(path) {
  const source = readFileSync(path, 'utf8');
  const icons = {};
  const pattern = /export const (Icon\w+) = \(\{ className \}: IconProps\) => \(\s*([\s\S]*?)\s*\);\n/g;
  for (const match of source.matchAll(pattern)) {
    icons[match[1]] = toSvgMarkup(match[2]);
  }
  return icons;
}

const before = extract(beforePath);
const after = extract(afterPath);
const names = Object.keys(before).filter((name) => name in after);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icons.json'), JSON.stringify({ names, before, after }), 'utf8');

writeFileSync(join(outDir, 'index.html'), `<!doctype html>
<meta charset="utf-8">
<title>icon diff</title>
<body style="font:12px monospace;background:#fff">
<div id="log">running…</div>
<script>
const SIZE = 160;

function rasterise(markup) {
  return new Promise((resolve, reject) => {
    const svg = markup.replace(/<svg/, '<svg width="' + SIZE + '" height="' + SIZE + '" xmlns="http://www.w3.org/2000/svg"');
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      /* currentColor has to resolve to something opaque, and the editor draws
         these on both light and dark chrome — black on white is the harsher
         test because the dropped slivers were all fill="white". */
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(image, 0, 0, SIZE, SIZE);
      resolve(ctx.getImageData(0, 0, SIZE, SIZE).data);
    };
    image.onerror = () => reject(new Error('raster failed'));
    image.src = url;
  });
}

(async () => {
  const { names, before, after } = await (await fetch('icons.json')).json();
  const rows = [];
  for (const name of names) {
    try {
      const [a, b] = await Promise.all([rasterise(before[name]), rasterise(after[name])]);
      let changed = 0, worst = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i]-b[i]), Math.abs(a[i+1]-b[i+1]), Math.abs(a[i+2]-b[i+2]), Math.abs(a[i+3]-b[i+3]));
        if (d > 8) changed++;
        if (d > worst) worst = d;
      }
      rows.push({ name, changed, pct: +(100*changed/(SIZE*SIZE)).toFixed(3), worst });
    } catch (e) {
      rows.push({ name, error: String(e) });
    }
  }
  rows.sort((x, y) => (y.changed||0) - (x.changed||0));
  window.__diff = { size: SIZE, total: rows.length, rows };
  document.getElementById('log').textContent = JSON.stringify(window.__diff.rows.slice(0, 12), null, 1);
})();
</script>
</body>
`, 'utf8');

console.log(`wrote ${names.length} icon pairs to ${outDir}`);
