/**
 * Prepares the closing band's backdrop for the web, at two aspect ratios.
 *
 * The source is one 2172 × 724 PNG (`reference-sources/Section CTA/BG.png`) — a
 * 3 : 1 banner with a product card on the left, a globe on the right, two orbs,
 * two orbit arcs and a wave field along the bottom. At desktop widths that file
 * is the section: `background-size: cover` on a band whose own aspect is close
 * to 3 : 1 crops a sliver off each end and nothing that matters is lost.
 *
 * Below about a thousand pixels that stops being true. A 3 : 1 image `cover`-ed
 * into a portrait box shows only the middle third — which in this composition is
 * empty cream — so the card, the globe and the waves all fall outside the frame
 * and the section arrives as a blank wash. Scaling the whole banner down to fit
 * the width instead keeps everything but renders the card 70 px tall, which is a
 * smudge rather than a picture.
 *
 * So the narrow layout does not use the banner. It uses the banner's *parts*,
 * cut out here with a feathered alpha edge, and positions each one against a CSS
 * gradient authored to the same palette: the globe bleeds off the top-right
 * corner, the card sits at the bottom-left, and the wave field runs the full
 * width along the bottom. Each layer is then free to take a size and a position
 * per breakpoint, which is the thing a single background image cannot do.
 *
 * The feather is what makes that legal. Every cut-out carries the source's own
 * cream ground inside its rectangle, and a hard edge against the CSS gradient
 * beneath would draw four visible seams. A 60–90 px alpha ramp on the sides that
 * face open space dissolves the rectangle; the sides that sit flush against a
 * viewport edge keep their hard edge, because nothing is behind them to seam
 * against.
 *
 * Nothing is written back to `reference-sources/`.
 *
 * Run: node scripts/build-cta-background.mjs
 */

import { mkdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'reference-sources/Section CTA/BG.png';
const OUT = 'public/asset/ui/cta';

/**
 * Where each subject sits in the source, measured off a 100 px grid overlay.
 *
 * `feather` names the sides that get the alpha ramp. A side left out keeps its
 * hard edge because the layout pins it to a viewport edge — the globe's right
 * and every layer's bottom-most edge, for the wave band.
 */
const CROPS = [
  {
    /*
     * The product card, cut tight.
     *
     * The obvious crop is wider — it would take in the orb at x ≈ 130 as well —
     * and it cannot be used. The banner's own left edge carries a teal haze that
     * is still #b2e4e5 at x = 0 and does not clear until about x = 160, so a
     * crop that reaches the orb also drags a cold rectangle into a warm cream
     * field and the ramp is not wide enough to hide it. The orb is a soft teal
     * sphere on a flat ground, so the layout draws it as a radial gradient
     * instead, which also lets it move independently of the card.
     */
    name: 'card',
    left: 125, top: 140, width: 545, height: 520,
    /* Rendered at ~300–420 px wide, so twice that is the retina size and any
       more is bytes nobody sees. */
    resize: 840,
    feather: { left: 46, right: 72, top: 50, bottom: 84 },
  },
  {
    /* The globe, its orbit arc and the small orb above it. The right edge runs
       off the source, which is exactly how it is used: flush to the viewport. */
    name: 'globe',
    left: 1476, top: 10, width: 696, height: 700,
    resize: 900,
    /* The bottom ramp is the widest of the four and starts below the globe's
       own glow. A shorter one ends while the ground is still teal-tinted, and
       against the warm base beneath it that edge reads as a horizontal line. */
    feather: { left: 120, right: 0, top: 90, bottom: 140 },
  },
  {
    /* The wave field. Full width, and cut above the crest line so the ramp has
       somewhere quiet to start. The right end of this strip carries the foot of
       the globe, which is why the globe layer stacks over it. */
    name: 'waves',
    left: 0, top: 470, width: 2172, height: 254,
    resize: 1600,
    feather: { left: 0, right: 0, top: 96, bottom: 0 },
  },
];

/**
 * The whole banner, for the widths where it is used as one image.
 *
 * Full source resolution, and encoded far above the usual quality.
 *
 * The first pass was 1800 px at quality 82, which came to 24 KB and looked it:
 * this layer is stretched to the viewport width — 1920 and 2560 CSS pixels are
 * both ordinary, and a 2× display doubles whichever it is — so it was being
 * upscaled 1.4× to 2.8×, and its whole subject is smooth gradient, which is
 * precisely what a lossy encoder quantises into steps. The upscale then smeared
 * the steps into bands and the section read as a broken JPEG behind the heading.
 *
 * Native width at quality 92 is 149 KB and has no visible banding at 2×.
 * Lossless was measured too, at 1,058 KB — seven times the size for a difference
 * nothing on screen can show — and `nearLossless` is worse still on this image
 * (2 MB), because its whole file is the low-frequency content that mode
 * preserves hardest.
 */
const FULL = { name: 'band', resize: 2172 };

/**
 * A feathered alpha mask, as a raw RGBA buffer to composite with `dest-in`.
 *
 * Written pixel by pixel rather than handed to the SVG rasteriser: at 2172 px
 * the wave band's mask is wider than sharp will rasterise an SVG for a composite
 * and the call fails with "must have same dimensions or smaller", which is a
 * confusing way to be told the renderer clamped.
 *
 * Each side gets its own independent ramp and the pixel takes the *minimum* of
 * the four. Multiplying them instead would ramp every corner twice as fast as
 * the sides that meet there, which pulls the card crop's corners in far enough
 * to clip the orb. `smoothstep` rather than a straight line, so the ramp leaves
 * and arrives with zero slope and there is no Mach band where it ends.
 */
function featherMask(width, height, edges) {
  const data = Buffer.alloc(width * height * 4, 255);
  const ramp = (distance, span) => {
    if (!span || distance >= span) return 1;
    const t = Math.max(0, distance) / span;
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < height; y += 1) {
    const vertical = Math.min(ramp(y, edges.top), ramp(height - 1 - y, edges.bottom));
    for (let x = 0; x < width; x += 1) {
      const alpha = Math.min(vertical, ramp(x, edges.left), ramp(width - 1 - x, edges.right));
      data[(y * width + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

function report(file) {
  const kb = statSync(file).size / 1024;
  console.log(`  ${file}  ${kb.toFixed(0)} KB`);
}

mkdirSync(OUT, { recursive: true });

/* The banner. No alpha — it is a full-bleed layer with nothing behind it. */
{
  const file = `${OUT}/${FULL.name}.webp`;
  await sharp(SRC)
    .resize({ width: FULL.resize, withoutEnlargement: true })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toFile(file);
  report(file);
}

for (const crop of CROPS) {
  const file = `${OUT}/${crop.name}.webp`;

  /*
   * Cut and scale first, then mask at the scaled size.
   *
   * Not one chained pipeline, because sharp runs its stages in a fixed order —
   * resize always happens before composite, whatever order they are called in —
   * so a mask built at the crop's own width is larger than the image by the time
   * it is applied, and the call fails. Scaling the ramps rather than authoring
   * them at the output size would also soften them by a resample nobody asked
   * for.
   */
  const scale = Math.min(1, crop.resize / crop.width);
  const width = Math.round(crop.width * scale);
  const height = Math.round(crop.height * scale);
  const cut = await sharp(SRC)
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .resize({ width, height })
    .ensureAlpha()
    .toBuffer();

  const feather = Object.fromEntries(
    Object.entries(crop.feather).map(([side, span]) => [side, Math.round(span * scale)]),
  );

  await sharp(cut)
    .composite([{
      input: await featherMask(width, height, feather).png().toBuffer(),
      blend: 'dest-in',
    }])
    /* Lossy WebP keeps the alpha channel, and these ramps are smooth enough that
       quality 80 shows no banding in them. */
    .webp({ quality: 90, alphaQuality: 95, effort: 6 })
    .toFile(file);
  report(file);
}
