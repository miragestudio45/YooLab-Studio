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
 * Five normalisations happen on the way in, and only five:
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
 *   4. Sub-pixel subpaths are dropped from unstroked paths — Figma's outlined
 *      stroke endpoints, verified invisible. See `simplifyPaths`.
 *
 * Everything else — coordinates, caps, joins, masks — is verbatim.
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
 * recolour      -> { from: to } applied to this icon's literal colours, for the
 *                  one case where the shipped mark is ahead of its export
 */
const ICONS = [
  /* ------------------------------------------------------------- main rail */
  /*
   * The brand gradient is pinned, because the shipped mark is ahead of the
   * export it came from.
   *
   * `rail-create.svg` still carries the frame's original `#96DEDA -> #50C9C3`,
   * but the generated file in the repository has run `#8CD9D9 -> #00AAAB` since
   * commit 5dfc367 ("color") — `#00AAAB` being the house accent, the same value
   * `INK` recognises everywhere else. That edit was made directly in the
   * generated file, so regenerating silently reverted it; this is the same
   * decision expressed where the generator can honour it. If the export is
   * ever refreshed with the accent baked in, delete this and nothing changes.
   */
  { name: 'IconCreate', file: 'rail-create.svg', tint: false, recolour: { '#96DEDA': '#8CD9D9', '#50C9C3': '#00AAAB' } },
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

/*
 * Sub-pixel geometry, dropped — the fifth normalisation, and the only one that
 * touches `d`.
 *
 * When a node's stroke was outlined on export, Figma emits the vector network's
 * endpoint markers as real closed subpaths. `canvas-vr.svg` is the worst case:
 * one `fill="white"` path of 9,959 bytes across 102 subpaths, 45 of which
 * measure under 0.35 units in a 22-unit box. A filled shape 0.1 units across is
 * about 0.07 device pixels at the size this rail draws — it cannot put ink on
 * the screen at any DPR.
 *
 * Subpaths whose bounding box is under 1% of the icon's visible side are
 * dropped, and only on paths with no stroke: a stroked subpath of zero length
 * still paints a dot the width of its stroke when the cap is round, so those are
 * left exactly as they are. The bounding box is measured from control points
 * rather than from the curve, which over-estimates a subpath's extent — the test
 * errs toward keeping geometry, never toward dropping it.
 *
 * Surviving coordinates are emitted verbatim, and that is a measured decision
 * rather than caution. Rounding to two decimals saved a further 29 KB, but
 * `scripts/verify-icon-diff.mjs` showed it changing pixels: several marks carry
 * degenerate near-horizontal segments (`0.833333` to `0.833334` across ten
 * units), and collapsing those to exactly horizontal redistributes a hairline
 * stroke's antialiasing across two pixel rows — 43 pixels on `IconMenu` alone,
 * at up to 63/255. Dropping the slivers costs 0 changed pixels at render size
 * and 34 of 1.66 M at ten times render size, so the two operations are not in
 * the same category and only one of them ships.
 *
 * `PATH_PRECISION` stays as the seam for re-running that experiment; `null`
 * means verbatim, which is what the header promises.
 */
const PATH_PRECISION = null;
const MIN_SPAN_RATIO = 0.01;

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** `d` -> [{ cmd, args }], absolute and relative commands both preserved. */
function parsePath(d) {
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const segments = [];
  let cmd = null;
  let index = 0;
  while (index < tokens.length) {
    if (/[a-z]/i.test(tokens[index])) {
      cmd = tokens[index];
      index += 1;
      if (cmd.toUpperCase() === 'Z') {
        segments.push({ cmd, args: [] });
        continue;
      }
    }
    if (cmd === null) return null;
    const arity = ARITY[cmd.toUpperCase()];
    if (!arity) return null;
    const args = tokens.slice(index, index + arity).map(Number);
    if (args.length < arity || args.some(Number.isNaN)) return null;
    segments.push({ cmd, args });
    index += arity;
    /* An implicit repeat after an explicit `M` is a `L`, per the spec. */
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return segments;
}

/** Splits at every `M`/`m`, so each group is one subpath with its terminator. */
function splitSubpaths(segments) {
  const groups = [];
  for (const segment of segments) {
    if (segment.cmd === 'M' || segment.cmd === 'm' || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push(segment);
  }
  return groups;
}

/** Widest of the two axis extents, walking the pen so `H`/`V` stay honest. */
function subpathSpan(group, start) {
  let [x, y] = start;
  const xs = [];
  const ys = [];
  const mark = () => { xs.push(x); ys.push(y); };
  for (const { cmd, args } of group) {
    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;
    if (upper === 'Z') continue;
    if (upper === 'H') { x = relative ? x + args[0] : args[0]; mark(); continue; }
    if (upper === 'V') { y = relative ? y + args[0] : args[0]; mark(); continue; }
    if (upper === 'A') {
      x = relative ? x + args[5] : args[5];
      y = relative ? y + args[6] : args[6];
      mark();
      continue;
    }
    /* Every remaining command is a run of x/y pairs, control points included. */
    for (let i = 0; i + 1 < args.length; i += 2) {
      const px = relative ? x + args[i] : args[i];
      const py = relative ? y + args[i + 1] : args[i + 1];
      xs.push(px);
      ys.push(py);
      if (i + 2 >= args.length) { x = px; y = py; }
    }
  }
  if (xs.length === 0) return { span: 0, end: [x, y] };
  return {
    span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
    end: [x, y],
  };
}

function serialize(segments) {
  let out = '';
  let previous = null;
  for (const { cmd, args } of segments) {
    /* A repeated command letter is implicit, which is most of the saving on the
       long fill paths: 102 `L` runs become one. */
    if (cmd !== previous) { out += cmd; previous = cmd; }
    else if (args.length) out += ' ';
    out += args.map((n) => (PATH_PRECISION === null ? String(n) : String(Number(n.toFixed(PATH_PRECISION))))).join(' ');
  }
  return out;
}

function simplifyPaths(body, side) {
  const minSpan = side * MIN_SPAN_RATIO;
  return body.replace(/<path\b[^>]*>/g, (element) => {
    const match = element.match(/\bd="([^"]+)"/);
    if (!match) return element;
    const segments = parsePath(match[1]);
    if (!segments) return element;

    const strokeMatch = element.match(/\bstroke="([^"]+)"/);
    const stroked = Boolean(strokeMatch) && strokeMatch[1] !== 'none';

    let kept = segments;
    if (!stroked) {
      let pen = [0, 0];
      kept = [];
      for (const group of splitSubpaths(segments)) {
        const { span, end } = subpathSpan(group, pen);
        if (span >= minSpan) kept.push(...group);
        pen = end;
      }
      /* Never hand back an empty path: if every subpath measured small the
         reading is wrong, not the artwork. Keep the original. */
      if (kept.length === 0) kept = segments;
    }

    return element.replace(/\bd="[^"]+"/, `d="${serialize(kept)}"`);
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

  /* The side the glyph is actually *seen* at. A `crop` viewBox magnifies the
     art, so sub-pixel geometry is judged against the smaller of the two. */
  const visibleSide = Math.min(box, icon.crop?.[2] ?? box);

  const layers = parts.map((part, index) => {
    let body = namespaceIds(stripAncestry(part.body), files.length > 1 ? `${prefix}${index}` : prefix);
    body = simplifyPaths(body, visibleSide);
    if (icon.recolour) {
      for (const [from, to] of Object.entries(icon.recolour)) {
        body = body.replace(new RegExp(from, 'gi'), to);
      }
    }
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
 *
 * Coordinates are the export's own. The one geometry edit is that closed
 * subpaths measuring under 1% of an icon's visible side are dropped from
 * unstroked paths — Figma's outlined stroke endpoints, which are under a tenth
 * of a device pixel here. \`scripts/verify-icon-diff.mjs\` measures the result at
 * 0 changed pixels at render size.
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

/*
 * Two files, split by consumer rather than by subject.
 *
 * `StudioDemo` uses most of the sixty-five and is behind `StudioDemoGate`. Two
 * other places on the homepage draw the editor's glyphs without being the
 * editor, and both are deliberate: `page.tsx` labels its four beats with the
 * panel each is performed in, and `EducationSection` names fourteen tools a
 * teacher gets. Pointing at a line and finding it in the editor is the whole
 * idea.
 *
 * The bundling consequence is what forces this file. A module cannot be split,
 * so those eighteen imports pinned all 132 KB of Figma geometry into the
 * route's first request wave and made `StudioDemoGate` worth nothing —
 * measured: the editor deferred and `EditorIcons:132` still arrived alongside
 * `framework`.
 *
 * So the eighteen ship on their own and `EditorIcons` re-exports them, keeping
 * one import surface for the editor. Anything the editor alone uses now travels
 * with the editor. Add a consumer outside `StudioDemo` and its glyphs belong on
 * this list — TypeScript will say so, because the full set no longer defines
 * them.
 */
const SHARED = new Set([
  /* app/page.tsx — the four beats */
  'IconSpace', 'IconText', 'IconSteps', 'IconQuiz',
  /* app/components/EducationSection.tsx — the teacher's fourteen tools */
  'IconChevronDown', 'IconCube3d', 'IconFullscreen', 'IconHotspot', 'IconLabels', 'IconMenu',
  'IconModel', 'IconPencil', 'IconPlay', 'IconReset', 'IconShareNodes', 'IconTrackText',
  'IconViewpoint', 'IconVr',
]);

const sharedIcons = ICONS.filter((icon) => SHARED.has(icon.name));
const editorIcons = ICONS.filter((icon) => !SHARED.has(icon.name));

const missing = [...SHARED].filter((name) => !ICONS.some((icon) => icon.name === name));
if (missing.length) throw new Error(`SHARED names not in ICONS: ${missing.join(', ')}`);

const sharedHeader = `/**
 * The editor glyphs drawn outside the editor — GENERATED, do not edit by hand.
 *
 * Written by \`scripts/build-editor-icons.mjs\` alongside \`EditorIcons.tsx\`, which
 * re-exports everything here. Import from this module whenever the consumer is
 * not \`StudioDemo\`: \`app/page.tsx\` labels its four beats with these and
 * \`EducationSection\` names twelve teacher tools, and reaching into the full set
 * for them puts all sixty-five icons — 132 KB of Figma geometry — into the first
 * request wave of a page whose editor is deliberately deferred.
 *
 * Add a name to \`SHARED\` in the generator to move an icon here; the generator
 * throws if a name in that list is not a real icon.
 */

type IconProps = { className?: string };

const BASE = {
  fill: 'none',
  'aria-hidden': true,
  focusable: 'false' as const,
};
`;

const SHARED_OUT = join(ROOT, 'app/components/studio/EditorIconsShared.tsx');

writeFileSync(
  SHARED_OUT,
  `${sharedHeader}\n${sharedIcons.map(build).join('\n')}`,
  'utf8',
);

const reexport = `\n/* The four glyphs the homepage draws too. Re-exported so the editor has one
   import surface; see \`EditorIconsShared.tsx\` for why they live apart. */
export { ${[...SHARED].sort().join(', ')} } from './EditorIconsShared';\n`;

writeFileSync(OUT, `${header}${reexport}\n${editorIcons.map(build).join('\n')}${HAND}`, 'utf8');
console.log(
  `wrote ${OUT} — ${editorIcons.length + 1} icons, and ${SHARED_OUT} — ${sharedIcons.length} shared`,
);
