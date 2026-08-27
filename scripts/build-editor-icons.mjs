/**
 * Generates `app/components/studio/EditorIcons.tsx` from the SVGs exported out of
 * the YooStudio source frame (Figma `gNiA73XdPHkMVBCyB6dKTH`, node 48976:106200).
 *
 * Why a generator and not hand-drawn icons: the previous set was redrawn by eye on
 * a 24-unit grid because the shipped `/asset/ui/yoolab-editor/*.svg` files did not
 * match the frame. Redrawing by eye is what the last review rejected — "các icon
 * mình thấy bạn đang cố làm theo chứ không lấy từ figma". These are now the real
 * exports, pulled per node through the Figma MCP `get_design_context` tool, so the
 * geometry is the design's own. Re-run after re-exporting:
 *
 *     node scripts/build-editor-icons.mjs
 *
 * Four normalisations happen on the way in, and only four:
 *
 *   0. A node export's ancestry rects are stripped — see `stripAncestry`.
 *
 *   1. `preserveAspectRatio="none"` is dropped. Figma writes it on every export
 *      because it positions each layer absolutely; in an icon slot it stretches
 *      the glyph to the box instead of fitting it.
 *   2. Flat house colours (#5D7E81 rail grey, #1C1C1C, #515151, #AAAAAA, #949494,
 *      white on the dark canvas) become `currentColor`, so the active/hover state
 *      is a colour change rather than a filter chain. Multi-colour marks — the
 *      brand gradient, the two-tone folder, the close button — keep their fills.
 *   3. Stroke widths are scaled by `STROKE_SCALE` — an optical correction for
 *      rendering a 24 px icon at ~15 px, explained where the constant is defined.
 *
 * Everything else — path data, caps, joins, masks — is verbatim.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public/asset/ui/yoolab-editor/figma');
const OUT = join(ROOT, 'app/components/studio/EditorIcons.tsx');

/* Flat colours that are "the icon's ink" and therefore become currentColor. */
const INK = ['#5D7E81', '#1C1C1C', '#515151', '#AAAAAA', '#949494', '#195658', '#195659', '#00AAAB', 'white', 'black'];

/**
 * name          -> exported component name
 * file          -> one file, or [file, file] to stack two layers in one box
 * box           -> square viewBox side; the art is centred in it. Defaults to the
 *                  larger of the source's own width/height.
 * rotate        -> degrees, about the box centre (chevrons ship pointing left)
 * crop          -> [x, y, side]: the glyph's real square inside an export whose
 *                  box was inflated by a drop-shadow filter region. Figma writes
 *                  the filter's bleed into the SVG's own width/height, so three
 *                  of the canvas tools shipped in a ~50-unit box holding a 24-unit
 *                  mark and rendered at half the size of their neighbours. The
 *                  numbers come from the insets in each node's design context.
 * tint          -> false keeps the source fills (gradients, two-tone marks)
 */
const ICONS = [
  /* ------------------------------------------------------------- main rail */
  { name: 'IconCreate', file: 'rail-create.svg', tint: false },
  { name: 'IconTemplates', file: 'rail-templates.svg' },
  { name: 'IconComponents', file: 'rail-components.svg' },
  { name: 'IconProjectInfo', file: 'rail-project-info.svg' },
  { name: 'IconDecor', file: 'rail-decor.svg' },
  { name: 'IconSettings', file: 'rail-settings.svg' },
  { name: 'IconProjects', file: 'rail-projects.svg' },
  { name: 'IconVrLab', file: 'rail-vrlab.svg' },
  { name: 'IconBell', file: ['bell.svg', 'bell-clapper.svg'], box: 24, offsets: [[2.87, 2], [7.28, 19]] },
  { name: 'IconGlobe', file: 'rail-globe.svg' },

  /* ---------------------------------------------------------------- topbar */
  { name: 'IconPencil', file: 'top-edit.svg', box: 24 },
  { name: 'IconCube3d', file: 'top-armr.svg', box: 24 },
  { name: 'IconAi', file: 'top-ai.svg', box: 24 },
  { name: 'IconFullscreen', file: 'top-fullscreen.svg', box: 24 },
  { name: 'IconShare', file: 'top-share.svg', box: 24 },
  { name: 'IconChevronDown', file: 'top-chevron.svg', box: 24, rotate: -90 },

  /* ---------------------------------------------------------------- canvas */
  { name: 'IconMenu', file: 'canvas-menu.svg', box: 20 },
  { name: 'IconSilent', file: 'canvas-silent.svg' },
  { name: 'IconVolume', file: 'canvas-volume.svg' },
  { name: 'IconReset', file: 'canvas-reset.svg' },
  { name: 'IconFrame', file: 'canvas-frame.svg', crop: [12.9, 11.9, 24] },
  { name: 'IconVr', file: 'canvas-vr.svg' },
  { name: 'IconShareNodes', file: 'canvas-share.svg', crop: [13.8, 12.8, 24] },
  { name: 'IconClose', file: 'canvas-close.svg', tint: false, crop: [13.8, 12.8, 24] },
  { name: 'IconUpload', file: 'canvas-upload.svg', tint: false },
  { name: 'IconCamera', file: 'canvas-setview.svg' },

  /* ------------------------------------------------------- timeline column */
  { name: 'IconUndo', file: 'tl-undo.svg' },
  { name: 'IconRedo', file: 'tl-redo.svg' },
  { name: 'IconTrash', file: 'tl-trash.svg' },
  { name: 'IconFitRange', file: 'tl-fit.svg' },
  { name: 'IconCopy', file: 'tl-copy.svg' },
  { name: 'IconDuplicate', file: 'tl-duplicate.svg' },
  { name: 'IconMirror', file: 'tl-mirror.svg' },
  { name: 'IconCollapse', file: 'tl-chevron.svg', box: 24, rotate: -90 },
  { name: 'IconGrip', file: 'tl-grip.svg', box: 24 },

  /* ------------------------------------------------------------- transport */
  { name: 'IconToStart', file: 'tl-to-start.svg', box: 18 },
  { name: 'IconToEnd', file: 'tl-to-end.svg', box: 18 },
  { name: 'IconStepBack', file: 'tl-step-back.svg', box: 18 },
  { name: 'IconStepForward', file: 'tl-step-forward.svg', box: 18 },
  { name: 'IconPlay', file: 'tl-play.svg', box: 14 },
  { name: 'IconClock', file: 'tl-alarm.svg' },
  { name: 'IconGear', file: 'tl-gear.svg' },

  /* ---------------------------------------------------------- track glyphs */
  { name: 'IconModel', file: 'tl-track-model.svg' },
  { name: 'IconTrackText', file: 'tl-track-text.svg' },
  { name: 'IconTrackEffects', file: 'tl-track-effect.svg' },

  /* ------------------------------------------------------------ detail rail */
  /* One composite, not two layers stacked by hand. The frame rotates the second
     tag 34.59 degrees and the generator has no per-layer rotation, so the two
     pieces landed unrotated on top of each other and the icon read as a garbled
     double tag. This export has Figma's own transform already baked into the
     path data. */
  { name: 'IconLabels', file: 'detail-labels.svg' },
  { name: 'IconSpace', file: 'detail-space.svg' },
  { name: 'IconSteps', file: 'detail-steps.svg' },
  { name: 'IconText', file: 'detail-text.svg' },
  { name: 'IconAudio', file: 'detail-audio.svg' },
  { name: 'IconMedia', file: 'detail-media.svg' },
  { name: 'IconHotspot', file: 'detail-hotspot.svg' },
  { name: 'IconInfo', file: 'detail-info.svg' },
  { name: 'IconSticker', file: 'detail-sticker.svg' },
  { name: 'IconEffects', file: 'detail-effects.svg' },
  { name: 'IconQuiz', file: 'detail-quiz.svg' },

  /* ------------------------------------------------------------- properties */
  { name: 'IconPositionAxis', file: 'prop-position-body.svg', box: 16 },
  { name: 'IconRotateAxis', file: 'prop-rotate.svg', box: 16 },
  { name: 'IconScaleAxis', file: 'prop-scale.svg', box: 16 },
  { name: 'IconHeightAxis', file: 'prop-height.svg', box: 16 },
  { name: 'IconWidthAxis', file: 'prop-width.svg', box: 16 },
  { name: 'IconMinus', file: 'prop-minus.svg', box: 12 },
  { name: 'IconPlus', file: 'prop-plus.svg', box: 12 },
  { name: 'IconViewpoint', file: 'prop-viewpoint.svg', box: 20 },
];

const num = (value) => Number.parseFloat(value);

function parse(file) {
  const raw = readFileSync(join(SRC, file), 'utf8');
  const open = raw.match(/<svg\b[^>]*>/);
  if (!open) throw new Error(`no <svg> in ${file}`);
  const width = num(open[0].match(/\bwidth="([^"]+)"/)?.[1] ?? 24);
  const height = num(open[0].match(/\bheight="([^"]+)"/)?.[1] ?? 24);
  const viewBox = (open[0].match(/\bviewBox="([^"]+)"/)?.[1] ?? `0 0 ${width} ${height}`).split(/\s+/).map(num);
  const body = raw.slice(open.index + open[0].length, raw.lastIndexOf('</svg>')).trim();
  return { width, height, viewBox, body };
}

/* Figma reuses `id="Vector"` / `paint0_linear_0_1` in every export. Inlined side
   by side in one document those collide, and a `url(#…)` reference resolves to
   whichever icon rendered first. Prefix every id and every reference to it. */
function namespaceIds(body, prefix) {
  const ids = new Set();
  for (const m of body.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  let out = body;
  for (const id of ids) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\bid="${safe}"`, 'g'), `id="${prefix}-${id}"`);
    out = out.replace(new RegExp(`url\\(#${safe}\\)`, 'g'), `url(#${prefix}-${id})`);
    out = out.replace(new RegExp(`\\b(mask|filter|clip-path|fill|stroke)="url\\(#${safe}\\)"`, 'g'), `$1="url(#${prefix}-${id})"`);
    out = out.replace(new RegExp(`\\b(xlink:href|href)="#${safe}"`, 'g'), `$1="#${prefix}-${id}"`);
  }
  return out;
}

/*
 * Strip the ancestry a node export drags in with it.
 *
 * `download_assets` renders a node with its whole parent chain, so a 24-unit icon
 * arrives behind an opaque 24x24 `#0D0D0D` base plus every ancestor frame's white
 * fill — the slide, the panel, the rail. Clipped to the viewBox they are
 * invisible in isolation, which is exactly why this is easy to ship by accident:
 * the icon simply renders as a black or white square with the glyph lost in it.
 *
 * Only painting rects are removed. Rects inside `<defs>` are left alone, because
 * a `<clipPath>` is defined by one and deleting it would clip the icon to nothing.
 */
function stripAncestry(body) {
  const cut = body.indexOf('<defs');
  const head = cut < 0 ? body : body.slice(0, cut);
  const tail = cut < 0 ? '' : body.slice(cut);
  const cleaned = head
    .replace(/<rect\b[^>]*\btransform="translate\([^)]*\)"[^>]*\/>\s*/g, '')
    .replace(/<rect\b(?=[^>]*\bfill="#0D0D0D")[^>]*\/>\s*/gi, '');
  return cleaned + tail;
}

function tintInk(body) {
  return body
    .split('\n')
    .map((line) => {
      /* `<mask … fill="white">` is a paint instruction for the mask channel, not
         ink — recolouring it makes the mask transparent and the glyph vanishes. */
      if (/^\s*<mask\b/.test(line)) return line;
      let next = line;
      for (const colour of INK) {
        next = next
          .replace(new RegExp(`fill="${colour}"`, 'gi'), 'fill="currentColor"')
          .replace(new RegExp(`stroke="${colour}"`, 'gi'), 'stroke="currentColor"');
      }
      return next;
    })
    .join('\n');
}

/*
 * Optical stroke correction — the one place a number is changed, and why.
 *
 * The frame draws its icons at 24 px with a 1.5 stroke: a ratio of 0.0625, and
 * 1.5 device pixels is wide enough that the renderer gives it soft edges. This
 * editor draws the same 24-unit icon at about 15 px, where that stroke becomes
 * 0.94 px — under one device pixel, so the rasteriser snaps it up to a full
 * crisp line. The ratio comes out ~7% heavier AND loses its antialiased edge, so
 * a rail of sixty icons reads harder than the frame does at the same apparent
 * size. Scaling each stroke by its own factor (rather than clamping every icon
 * to one value) keeps the relative weights inside the set intact.
 *
 * Multi-colour marks are excluded with `tint: false`: their strokes carry brand
 * geometry, not UI weight.
 */
const STROKE_SCALE = 0.84;

function thinStrokes(body) {
  return body.replace(/stroke-width="([\d.]+)"/g, (whole, value) => {
    const next = Number((Number.parseFloat(value) * STROKE_SCALE).toFixed(3));
    return `stroke-width="${next}"`;
  });
}

/* SVG is XML, JSX is not: hyphenated presentation attributes need camelCase. */
function toJsx(body) {
  return body.replace(/\s([a-z]+(?:-[a-z]+)+)="/g, (whole, attr) => {
    if (attr.startsWith('data-') || attr.startsWith('aria-') || attr.startsWith('xlink:')) return whole;
    const camel = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return ` ${camel}="`;
  });
}

function build(icon) {
  const files = Array.isArray(icon.file) ? icon.file : [icon.file];
  const parts = files.map(parse);
  const box = icon.box ?? Math.max(...parts.map((p) => Math.max(p.width, p.height)));
  const prefix = icon.name.replace(/^Icon/, '').toLowerCase();

  const layers = parts.map((part, index) => {
    let body = namespaceIds(stripAncestry(part.body), files.length > 1 ? `${prefix}${index}` : prefix);
    if (icon.tint !== false) body = thinStrokes(tintInk(body));
    body = toJsx(body);

    const [ox, oy] = icon.offsets?.[index] ?? [(box - part.width) / 2, (box - part.height) / 2];
    const round = (n) => Number(n.toFixed(3));
    const dx = round(ox - part.viewBox[0]);
    const dy = round(oy - part.viewBox[1]);
    const indented = body.split('\n').map((line) => `      ${line}`).join('\n');
    return dx === 0 && dy === 0 && files.length === 1
      ? body.split('\n').map((line) => `    ${line}`).join('\n')
      : `    <g transform="translate(${dx} ${dy})">\n${indented}\n    </g>`;
  });

  const inner = icon.rotate ? `    <g transform="rotate(${icon.rotate} ${box / 2} ${box / 2})">\n${layers.join('\n').split('\n').map((l) => `  ${l}`).join('\n')}\n    </g>` : layers.join('\n');

  const view = icon.crop ? `${icon.crop[0]} ${icon.crop[1]} ${icon.crop[2]} ${icon.crop[2]}` : `0 0 ${box} ${box}`;
  return `export const ${icon.name} = ({ className }: IconProps) => (\n  <svg {...BASE} className={className} viewBox="${view}">\n${inner}\n  </svg>\n);\n`;
}

const known = new Set(readdirSync(SRC));
for (const icon of ICONS) {
  for (const file of Array.isArray(icon.file) ? icon.file : [icon.file]) {
    if (!known.has(file)) throw new Error(`missing export: ${file}`);
  }
}

const header = `/**
 * The YooStudio editor icon set — GENERATED, do not edit by hand.
 *
 * Source: the Figma frame this section reproduces (file gNiA73XdPHkMVBCyB6dKTH,
 * node 48976:106200), exported node by node into
 * \`public/asset/ui/yoolab-editor/figma/\` and inlined here by
 * \`scripts/build-editor-icons.mjs\`. Run that script to regenerate.
 *
 * Every path below is the design's own geometry. The only edits the generator
 * makes are dropping Figma's \`preserveAspectRatio="none"\` (which stretches a
 * glyph to its slot instead of fitting it), namespacing the ids Figma reuses
 * across exports, and mapping flat house colours onto \`currentColor\` so state is
 * a colour change. Marks that are genuinely multi-colour keep their fills.
 */

type IconProps = { className?: string };

const BASE = {
  fill: 'none',
  'aria-hidden': true,
  focusable: 'false' as const,
};
`;

/* The one glyph the frame has no export for: Figma ships the transport control as
   a single "Play" variant, so pause is drawn on the same 14-unit grid. */
const HAND = `
/* Not in the source frame: its transport component only carries the Play variant. */
export const IconPause = ({ className }: IconProps) => (
  <svg {...BASE} className={className} viewBox="0 0 14 14">
    <path d="M4.4 2.2h1.9v9.6H4.4zM7.7 2.2h1.9v9.6H7.7z" fill="currentColor" />
  </svg>
);
`;

writeFileSync(OUT, `${header}\n${ICONS.map(build).join('\n')}${HAND}`, 'utf8');
console.log(`wrote ${OUT} — ${ICONS.length + 1} icons`);
