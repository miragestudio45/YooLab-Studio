import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

// Preserve the supplied artwork; encode a web copy and responsive details.
const source = 'reference-sources/Section CTA/BG 2.png';
const out = 'public/asset/ui/cta';
mkdirSync(out, { recursive: true });
await sharp(source).webp({ quality: 94 }).toFile(`${out}/bg2.webp`);

for (const crop of [
  { name: 'bg2-card', left: 105, top: 245, width: 485, height: 500, edges: [45, 55, 45, 65] },
  { name: 'bg2-globe', left: 1370, top: 100, width: 613, height: 650, edges: [85, 0, 55, 85] },
]) {
  const { name, left, top, width, height, edges } = crop;
  const alpha = Buffer.alloc(width * height * 4, 255);
  const ramp = (distance, span) => {
    const t = span ? Math.min(1, Math.max(0, distance / span)) : 1;
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      alpha[(y * width + x) * 4 + 3] = Math.round(255 * Math.min(
        ramp(x, edges[0]), ramp(width - 1 - x, edges[1]),
        ramp(y, edges[2]), ramp(height - 1 - y, edges[3]),
      ));
    }
  }
  await sharp(source).extract({ left, top, width, height })
    .composite([{ input: alpha, raw: { width, height, channels: 4 }, blend: 'dest-in' }])
    .webp({ quality: 94 }).toFile(`${out}/${name}.webp`);
}
