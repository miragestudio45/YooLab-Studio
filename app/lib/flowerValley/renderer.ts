/**
 * The flower valley renderer.
 *
 * A Canvas2D pseudo-3D field, ported from `reference-sources/flower-valley` and
 * re-aimed at the YooLab hero. There is no Three.js here on purpose: the
 * reference's whole performance case is that a photographic flower is a textured
 * quad and a thousand textured quads sorted back-to-front are one `drawImage`
 * loop with zero state changes — cheaper than a thousand meshes, and cheaper than
 * an instanced draw whose fragment cost is the same overdraw plus a shader. The
 * previous pass in this project used the WebGL route and the flowers still looked
 * like stickers, which settles the question: the renderer was never what was
 * wrong, the source material was.
 *
 * ---- what is preserved from the reference, and why each one matters ----
 *
 *   Depth-sorted field + binary-searched range.  The field is sorted by z once at
 *     build. Every frame, two `lowerBound` calls bracket the plants between the
 *     near and far planes and the loop walks that slice backwards, so cost tracks
 *     what is on screen rather than how big the valley is, and painter's-order
 *     overlap is free.
 *
 *   Precomputed sway phase.  Each plant stores `sin(phase)` and `cos(phase)` at
 *     build time, so the per-frame wave is `sinT * cosP + cosT * sinP` — one
 *     angle-sum identity, two multiplies, no `Math.sin` in the hot loop, and no
 *     two plants in step.
 *
 *   No per-flower state changes.  No `save`/`restore`, no `rotate`, no `filter`,
 *     no `shadowBlur`. `globalAlpha` and `drawImage`, and nothing else. This is
 *     the difference between the reference and the V1 it replaced.
 *
 *   Adaptive render scale.  The canvas backing store is sized to hold an area
 *     budget rather than to match `devicePixelRatio`, so a 4K frame costs about
 *     what a 1080 one does.
 *
 *   Adaptive quality — driven by this layer's own draw time, not by achieved FPS.
 *     Two expensive windows step the tier down, four cheap ones step it back up.
 *     The tier changes density, reach and render scale — never the layout, so the
 *     composition a viewport was designed for survives a slow GPU. The reference
 *     used frame rate; that is wrong on a page where a WebGL canvas next door can
 *     starve this loop, because thinning the meadow returns nothing when the
 *     meadow was never what was slow. See `costTotal`.
 *
 *   Pause when hidden.  Document visibility *and* a measured-rect visibility gate,
 *     because an IntersectionObserver alone has been observed on this page to
 *     leave a panel permanently paused. See `lib/three/visibility.ts`.
 *
 * ---- what is new, all of it about sharing a frame with a bee ----
 *
 *   Frame-space zone attenuation, so the field can continue behind the headline
 *   and the creature without printing through either. Depth-gated, so the
 *   foreground layer is still allowed to cross the bee's silhouette.
 *
 *   An aerial-perspective wash, one `source-atop` fill per frame, which is what
 *   separates background from midground on an ivory page where the reference had
 *   darkness doing that job for free.
 *
 *   Scroll presence: the layer's opacity is driven by the Explore panel position
 *   the bee's own camera reads, so the valley leaves with the hero instead of on a
 *   second timeline of its own.
 */

import { loadFlowerAtlas, type FlowerAtlas } from './atlas';
import {
  layoutFor,
  openingQuality,
  PRESETS,
  viewportClass,
  type Layout,
  type QualityLevel,
  type ViewportClass,
  type Zone,
} from './composition';
import { buildValleyField, curve, slope, type Flower, type ValleyField } from './valley';
import { createVisibilityGate } from '../three/visibility';
import { diveFor, waterlineFor } from '../story/clock';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Where the valley leaves — and it is no longer a panel number.
 *
 * The previous window closed at panel 0.72, on the argument that chapter 01 puts
 * a full column of copy where the hero has nothing and the hero's exclusion
 * ellipses could not rescue it. That was the right diagnosis and the wrong fix:
 * the chapter is the same bee in the same meadow, and dissolving the world at
 * its door is the most obvious seam in the story. The zones are per-station now
 * (`Layout.zonesStudy`), so the field can stay.
 *
 * What replaces it is the dive itself. The valley holds at full composition
 * across the hero and the whole anatomy chapter, and then leaves *because it
 * goes under water* — sinking out of frame as the camera drops, cut from below
 * by the same surface the WebGL composite draws, and gone before that surface
 * has closed over the top of the frame. There is no fade window any more, only a
 * crossing.
 */
/*
 * The window is placed against the *surface*, not against taste.
 *
 * `waterlineFor` puts the water at 42% of the frame height by dive 0.48 and past
 * the top by 0.86. A first pass had the field gone by 0.52, and the capture at
 * dive 0.48 showed why that is wrong: the half of the frame still above water
 * was empty pale sky, so the crossing read as a grey dissolve with a reef
 * underneath rather than as a meadow going under. The field now holds until the
 * surface has almost finished climbing — the mask below is already hiding
 * whatever is submerged, so what remains visible is exactly the part still in
 * air, which is the point.
 */
const SINK_FROM = 0.34;
const SINK_TO = 0.76;

/**
 * Dive at which a layout's optional `descent` station has been reached.
 *
 * Before `SINK_FROM` and before `WATERLINE_ENTER`, deliberately: the station
 * exists so the field is already composed where the surface is about to arrive.
 * Overlapping the two ramps would have the meadow moving into place and
 * dissolving at the same time, which reads as a glitch rather than as a
 * crossing.
 */
const DESCENT_TO = 0.3;

/** Panel distance the camera's travel is spread over. Two chapters, plus a
 *  little, so the valley is still moving as it goes under rather than freezing
 *  and dissolving. */
const TRAVEL_SPAN = 1.7;

/** How long the opening growth wave takes. A shade under the bee's 2.6 s entry,
 *  so the field is settled by the time the creature arrives on its mark. */
const GROW_SECONDS = 2.1;

/**
 * The aerial-perspective wash.
 *
 * Ivory at the surface, because that is the page's own ground and distance on an
 * ivory page has to be paid for. As the dive begins it cools toward the same
 * sea-glass the backdrop plate is turning, and it gets stronger — which is the
 * brief's "atmospheric haze increases subtly", done in the one place on this
 * layer where haze already lives rather than as a new overlay.
 */
const HAZE_AIR = [252, 247, 240] as const;
const HAZE_WATER = [186, 214, 224] as const;

export type FlowerValleyOptions = {
  /** Continuous Explore panel position, 0 to 3. A ref, read every frame. */
  progress: { current: number };
  reduceMotion: boolean;
  atlasUrl?: string;
  /** Called once the field is drawing, for the loader state. */
  onReady?: () => void;
  onError?: (error: unknown) => void;
};

export type FlowerValley = {
  /**
   * Retunes the motion budget in place.
   *
   * `prefers-reduced-motion` cannot be known on the server, so the hook that
   * reads it answers `true` for the first render and the truth immediately
   * after — which used to make this value a remount key. Rebuilding the valley
   * meant refetching the 243 KB atlas and re-slicing every tile through
   * `createImageBitmap` a second time, on the main thread, while the hero was
   * still loading. The frame loop reads the flag every frame anyway, so handing
   * it a new value is all the change ever needed to be.
   */
  setReduceMotion(value: boolean): void;
  dispose(): void;
};

type Camera = {
  x: number;
  y: number;
  z: number;
  cy: number;
  sy: number;
  cp: number;
  sp: number;
  f: number;
};

export function createFlowerValley(host: HTMLElement, options: FlowerValleyOptions): FlowerValley {
  const canvas = document.createElement('canvas');
  canvas.className = 'flower-valley-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.opacity = '0';
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) return { setReduceMotion() {}, dispose() {} };
  /* Re-bound so the narrowing survives into the closures below, which is the one
     place TypeScript will not carry it for a `const`. */
  const ctx = context;
  host.appendChild(canvas);

  const { progress } = options;
  /* `let`, not a destructured const: `setReduceMotion` below rebinds it and the
     frame loop reads it fresh on every tick. See `FlowerValley`. */
  let reduceMotion = options.reduceMotion;
  const atlasUrl = options.atlasUrl ?? '/asset/valley/flowers/pool_summer.png';

  let disposed = false;
  let atlas: FlowerAtlas | null = null;
  let field: ValleyField | null = null;

  /* ------------------------------------------------------------ frame state --- */
  let W = 1;
  let H = 1;
  let renderScale = 1;
  let kind: ViewportClass = viewportClass(window.innerWidth, window.innerHeight);
  let layout: Layout = layoutFor(kind);
  let quality: QualityLevel = openingQuality(kind);
  let preset = PRESETS[quality];
  let haze: CanvasGradient | null = null;
  /** Live values, after the quality tier's multipliers. */
  let far = layout.far * preset.reach;
  /** Live near plane. Constant unless the layout has a `descent` station. */
  let near = layout.near;
  /** 0 = the station the chapter mix produced, 1 = `Layout.descent`. */
  let descent = 0;

  /* Clock, scroll, pointer. */
  let clock = 0;
  let lastFrame = performance.now();
  let travel = 0;
  let travelTarget = 0;
  let presence = 1;
  let paintedPresence = -1;
  /** 0 = hero station, 1 = chapter-01 station. Smoothed panel position. */
  let chapter = 0;
  /**
   * The two copy exclusions, derived from where the type actually is.
   *
   * See `measureCopyZones`. Null until the first measurement, and null again if
   * the DOM cannot be read — in which case the authored ellipses stand.
   */
  let heroZones: Zone[] = [];
  let studyZones: Zone[] = [];
  /** 0 = above water, 1 = the surface has closed over the frame. */
  let dive = 0;
  let hazeDive = -1;
  let paintedLine = -9;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, sx: -9999, sy: -9999, active: false };

  /* FPS window. */
  let fpsFrames = 0;
  let fpsMark = performance.now();
  let slowSamples = 0;
  let fastSamples = 0;
  /*
   * This layer's own drawing time, which is what the quality tier is allowed to
   * react to.
   *
   * Achieved frame rate is not the same question. The hero runs a full-viewport
   * WebGL canvas beside this one, and when that canvas is busy — the ocean's
   * first frame compiles 25 shader programs and uploads 57 textures, measured at
   * ~18 s on a 2014 GPU — this loop simply is not given time to run. The old
   * ladder read the resulting 2 FPS as evidence that *this* field was too
   * expensive, dropped High -> Balanced -> Low, and called `rebuildField()` for
   * each step: two visible repopulations of the meadow caused entirely by
   * somebody else's work. Recovery then needed four consecutive windows above
   * 57 FPS, which never arrived, so a transient load-time stall degraded the
   * field permanently.
   *
   * Measuring the cost of the draw itself separates the two: expensive-for-me is
   * actionable, not-given-time is not.
   */
  let costTotal = 0;
  let costFrames = 0;

  /*
   * The budget, in milliseconds of this layer's own draw.
   *
   * A 60 Hz frame is 16.7 ms and this canvas is not the only thing in it — the
   * bee's WebGL pass and the compositor need the rest — so roughly half the
   * frame is the most this field may claim before it is genuinely too dense.
   * The gap between the two numbers is hysteresis in the cost domain, on top of
   * the sample counts below.
   *
   * These were briefly tightened to 5.5 / 3.2 to attack a hot-machine report.
   * Reverted: a tier change calls `rebuildField()`, so making downgrades more
   * frequent makes visible repopulations of the meadow more frequent too, and a
   * repopulation caught mid-chapter-crossing is a real visual defect against a
   * heat saving that was never measured on the machine that was hot. The scroll
   * work now lives where it belongs — see the velocity gate in
   * `contextRegistry.ts`, which is measured and does not touch what is drawn.
   */
  const COST_DOWNGRADE_MS = 9;
  const COST_UPGRADE_MS = 5;

  let documentVisible = document.visibilityState !== 'hidden';
  /** Reduced motion draws on demand; this is what "on demand" means. */
  let dirty = true;

  /* --------------------------------------------------------------- geometry --- */

  /**
   * The camera, at the current point of its travel.
   *
   * The yaw comes from the path's own heading — `atan(slope(z))` — which is the
   * line that makes this a valley rather than a receding plane: as the path bends
   * the frame turns to stay in it, and the banks slide across the frame instead of
   * scaling toward the centre. The pointer terms are the reference's, scaled by
   * the layout's `interaction` so they never compete with the bee's own pointer
   * response.
   */
  function camera(): Camera {
    const z = layout.from + travel * layout.travel;
    const amount = layout.interaction;
    /*
     * Two stations, plus the descent.
     *
     * `chapter` cross-fades the hero's eye height and pitch into the anatomy
     * chapter's, which is how the same world can compose against two completely
     * different copy layouts without the field being rebuilt or cut. `dive` then
     * lifts the eye further and tips it down, so the band falls out of the frame
     * as the water rises rather than simply going transparent — the flowers
     * *descend*, which is what the crossing is supposed to look like.
     */
    /*
     * The dive LOWERS the eye and tips it up-frame; the first pass had both
     * signs the other way.
     *
     * Sinking means the ground rises in view — and it has to, because this field
     * lives in the bottom third of the frame and the water surface also enters
     * from the bottom. Pushing the band *down* as the water came up meant the
     * meadow had already left before the surface reached it, and the capture at
     * dive 0.39 showed the result: an empty grey sky above the waterline and a
     * reef below, with nothing left of the world being left behind. Lowering the
     * eye lifts the band into the frame so the last thing above the surface is a
     * meadow going under, which is the shot the whole crossing exists for.
     */
    /*
     * A layout with a `descent` station replaces the shared dive terms rather
     * than adding to them: the two move the band in opposite directions, and on
     * the one viewport that has a station the shared terms are what put the
     * meadow off the top of the crossing frame. See `Layout.descent`.
     */
    let camH = lerp(layout.camH, layout.camHStudy, chapter);
    let framePitch = lerp(layout.pitch, layout.pitchStudy, chapter);
    if (layout.descent) {
      camH = lerp(camH, layout.descent.camH, descent);
      framePitch = lerp(framePitch, layout.descent.pitch, descent);
    } else {
      camH -= dive * 3.4;
      framePitch -= dive * 0.055;
    }
    /*
     * The reference yaws 0.86 of the path's own heading, which keeps the camera
     * looking straight down a valley it is walking. At the hero's `from` that is
     * about six degrees, and six degrees is enough to swing the far valley off the
     * right edge and leave the right bank with nothing in it — the frame ends up
     * with one rich cluster and one empty corner instead of the two the
     * composition is built on. Following the path at a third of that keeps both
     * banks in frame; the bend is still visible, it is just no longer chased.
     */
    const yaw = Math.atan(slope(z)) * 0.3 + pointer.x * 0.026 * amount;
    const pitch = framePitch + pointer.y * 0.012 * amount;
    const ny = -yaw;
    return {
      z,
      x: curve(z) + pointer.x * 1.45 * amount,
      y: camH + pointer.y * 0.28 * amount,
      cy: Math.cos(ny),
      sy: Math.sin(ny),
      cp: Math.cos(pitch),
      sp: Math.sin(pitch),
      f: (H * 0.5) / Math.tan((layout.fov * Math.PI) / 360),
    };
  }

  /** Screen y of the far plane on the path — where the flower band's top edge
   *  lands, which is what the haze gradient is anchored to. */
  function horizon(cam: Camera): number {
    const ry = -3.6 - cam.y;
    const py = ry * cam.cp - far * cam.sp;
    return H * 0.5 - (py / far) * cam.f;
  }

  function rebuildHaze(cam: Camera) {
    hazeDive = dive;
    const line = horizon(cam);
    const top = Math.max(0, line - H * 0.06);
    const bottom = Math.min(H, line + H * (0.24 + dive * 0.5));
    const tint = `${Math.round(lerp(HAZE_AIR[0], HAZE_WATER[0], dive))}, `
      + `${Math.round(lerp(HAZE_AIR[1], HAZE_WATER[1], dive))}, `
      + `${Math.round(lerp(HAZE_AIR[2], HAZE_WATER[2], dive))}`;
    /*
     * 0.55, not 1.5.
     *
     * The wash is meant to cool the field as the water comes up, and at 1.5 it
     * was doing something else: at dive 0.48 the peak stop reached 0.58 alpha
     * over an ivory-to-sea tint, which is enough to erase the meadow outright.
     * The capture showed a blank grey air half above a waterline — the one thing
     * the crossing cannot afford, because the meadow going under IS the shot.
     */
    const gain = 1 + dive * 0.55;
    haze = ctx.createLinearGradient(0, top, 0, bottom);
    haze.addColorStop(0, `rgba(${tint}, ${(0.12 * gain).toFixed(3)})`);
    haze.addColorStop(0.4, `rgba(${tint}, ${(0.04 * gain).toFixed(3)})`);
    haze.addColorStop(1, `rgba(${tint}, 0)`);
  }

  /* --------------------------------------------------------------- the field --- */

  function rebuildField() {
    const count = Math.round(
      (layout.travel + far + 14) * layout.density * preset.density,
    );
    field = buildValleyField({
      from: layout.from - 6,
      span: layout.travel + far + 14,
      count,
      clearance: layout.clearance,
      spread: layout.spread,
      perDrift: layout.perDrift,
      driftZ: layout.driftZ,
      driftSpan: layout.driftSpan,
      foregroundFill: layout.foregroundFill && {
        ...layout.foregroundFill,
        count: Math.round(layout.foregroundFill.count * preset.density),
        zFrom: layout.from + layout.foregroundFill.depthFrom,
      },
    });
  }

  /* ------------------------------------------------------- measured zones --- */

  /**
   * Where a block of copy is, in this frame's own coordinates.
   *
   * Read from the offset chain rather than from `getBoundingClientRect`, because
   * a rect is scroll-dependent and this runs on resize — at which point the page
   * may be anywhere. Every Explore panel is exactly one stage height tall and the
   * stage is sticky at the top, so a panel's internal offsets and the canvas's
   * frame coordinates are the same numbers whenever that panel is the one on
   * screen, which is the only time its zone is weighted in.
   */
  function blockBox(panel: HTMLElement, selectors: string[]) {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const selector of selectors) {
      const el = panel.querySelector<HTMLElement>(selector);
      if (!el || !el.offsetParent) continue;
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== panel) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      if (!node) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + el.offsetWidth);
      bottom = Math.max(bottom, y + el.offsetHeight);
    }
    if (!Number.isFinite(left) || right <= left || bottom <= top) return null;
    return { left, top, right, bottom };
  }

  /**
   * A boxed zone built from the rectangle it must actually clear.
   *
   * Two earlier versions got this wrong in opposite directions and both were
   * caught by measuring the composited frame rather than by looking at it.
   *
   * The first inflated an ellipse by `1 / 0.537`, so that its soft rim still
   * removed 88% of a plant at the box edge. That is right for the hero, whose
   * copy is roughly square, and badly wrong for chapter 01, whose copy is a
   * full-height column: the inflated ellipse reached 65% across the frame and
   * emptied the right-hand bank of the valley.
   *
   * The second used a rectangular metric sized to the block, which put the
   * *feather* over the corridor instead of past it — plants came back at 18%
   * alpha fifteen pixels under the CTA.
   *
   * So the input here is the rectangle that has to end up empty, and the zone is
   * that rectangle divided by `1 - feather`: full strength covers the cleared
   * rectangle exactly, and the release happens entirely outside it. The margins
   * are per-side because they are not one idea — the sides and the top only have
   * to cover the type, while the bottom is the corridor the brief specifies.
   */
  const FEATHER = 0.3;

  function boxZone(
    box: { left: number; top: number; right: number; bottom: number },
    margin: { x: number; top: number; bottom: number },
    strength: number,
  ): Zone {
    const left = box.left - margin.x;
    const right = box.right + margin.x;
    const top = box.top - margin.top;
    const bottom = box.bottom + margin.bottom;
    const halfW = (right - left) / 2;
    const halfH = (bottom - top) / 2;
    return {
      u: (left + right) / 2 / W,
      v: (top + bottom) / 2 / H,
      ru: halfW / (1 - FEATHER) / W,
      rv: halfH / (1 - FEATHER) / H,
      strength,
      boxed: true,
      feather: FEATHER,
    };
  }

  /** Tight breathing room around the compact specimen note. Plants may return
   * immediately after the last line, but never print through the type itself. */
  const COPY_MARGIN = { x: 18, top: 20, bottom: 28 };
  /* Small blocks — the specimen card and the scroll cue — need to be legible,
     not to open a corridor, so they clear themselves and little else. */
  const LABEL_MARGIN = { x: 18, top: 16, bottom: 18 };

  /**
   * A column that hugs a frame edge clears to that edge.
   *
   * Both copy columns sit against the page gutter, so the strip between the type
   * and the frame edge is one gutter wide and contains nothing. Leaving it
   * planted puts a flower level with the headline — technically outside the
   * block, visually beside it — which is the collision the brief is describing.
   * Nothing is lost by clearing it, because there is no composition out there.
   */
  function bleed(box: { left: number; top: number; right: number; bottom: number } | null | undefined) {
    if (!box) return null;
    return {
      ...box,
      left: box.left < 110 ? -70 : box.left,
      right: box.right > W - 110 ? W + 70 : box.right,
    };
  }

  function measureCopyZones() {
    heroZones = [];
    studyZones = [];
    const hero = document.querySelector<HTMLElement>('.hero');
    const study = document.querySelector<HTMLElement>('.story-panel--bee');
    /* The hero's box is the compact headline-through-CTA composition. */
    const heroBox = bleed(hero && blockBox(hero, ['.hero-copy']));
    if (heroBox) heroZones = [boxZone(heroBox, COPY_MARGIN, 0.94)];
    /*
     * The two small labels on the hero.
     *
     * They were authored as ellipses and survived a sparse field; at 2.4x the
     * density the specimen card sits in a bank of daisies and the scroll cue sits
     * on a poppy. They are DOM blocks like the copy, so they are measured like
     * the copy — which also means they keep working when the type reflows or the
     * card moves at a different breakpoint.
     */
    for (const selector of ['.hero-spec', '.scroll-cue']) {
      const box = hero && blockBox(hero, [selector]);
      if (box) heroZones.push(boxZone(box, LABEL_MARGIN, 0.9));
    }
    const studyBox = bleed(study && blockBox(study, ['.story-copy']));
    if (studyBox) studyZones = [boxZone(studyBox, COPY_MARGIN, 0.92)];
  }

  /**
   * Wide layouts no longer carve the meadow around the Bee or the copy.
   *
   * The Bee now owns a real WebGL foreground pass and the compact copy rail sits
   * above the flower band, so those holes are both unnecessary and visibly
   * artificial. Narrow layouts keep the measured copy reservation because text
   * and specimen necessarily share one column there.
   */
  function withMeasured(authored: Zone[], copy: Zone[]): Zone[] {
    const out: Zone[] = [];
    let usedCopy = false;
    const reserveCopy = W <= 1000;
    for (const zone of authored) {
      if (zone.role === 'copy') {
        if (reserveCopy && copy.length && !usedCopy) {
          out.push(...copy);
          usedCopy = true;
        }
        continue;
      }
      if (zone.role === 'subject') continue;
      out.push(zone);
    }
    if (reserveCopy && !usedCopy && copy.length) out.push(...copy);
    return out;
  }

  /* --------------------------------------------------------------- resizing --- */

  function measure() {
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    const area = W * H;
    const budget = Math.sqrt(preset.areaPixels / area);
    renderScale = clamp(Math.min(window.devicePixelRatio || 1, 1.1, budget), 0.56, 1.1);
    canvas.width = Math.max(1, Math.round(W * renderScale));
    canvas.height = Math.max(1, Math.round(H * renderScale));
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    measureCopyZones();
    rebuildHaze(camera());
    dirty = true;
  }

  /**
   * A resize that crosses a viewport class is a different picture, so the field
   * is regenerated; a resize that does not is the same picture at a new size, and
   * regenerating it there would be both wasteful and visible — a mobile scroll
   * that collapses the URL bar fires a resize.
   */
  function resize() {
    const next = viewportClass(window.innerWidth, window.innerHeight);
    if (next !== kind) {
      kind = next;
      layout = layoutFor(kind);
      far = layout.far * preset.reach;
      rebuildField();
    }
    measure();
  }

  function applyQuality() {
    preset = PRESETS[quality];
    far = layout.far * preset.reach;
    rebuildField();
    measure();
  }

  /* ------------------------------------------------------------- projection --- */

  /**
   * World to frame, and the depth test, in one pass.
   *
   * Order matters and is the reference's: reject on the depth interval before any
   * trigonometry, reject again after yaw and again after pitch, then reject on the
   * frame bounds with a generous margin so a plant whose base is below the frame
   * but whose bloom is inside it still draws. Four early exits, cheapest first.
   */
  function project(o: Flower, cam: Camera, sinT: number, cosT: number, out: number[]): boolean {
    const dx = o.x - cam.x;
    const dz = o.z - cam.z;
    if (dz < near || dz > far) return false;

    const rx = dx * cam.cy - dz * cam.sy;
    let rz = dx * cam.sy + dz * cam.cy;
    if (rz < near) return false;

    /* The angle-sum identity that replaces a per-plant `Math.sin`. */
    const wave = sinT * o.cosP + cosT * o.sinP;
    const ry = o.y + wave * o.sway * 0.12 - cam.y;
    const py = ry * cam.cp - rz * cam.sp;
    rz = ry * cam.sp + rz * cam.cp;
    if (rz < near) return false;

    const x = W * 0.5 + (rx / rz) * cam.f;
    const y = H * 0.5 - (py / rz) * cam.f;
    if (x < -200 || x > W + 200 || y < -H * 0.32 || y > H * 1.24) return false;

    out[0] = x;
    out[1] = y;
    out[2] = rz;
    return true;
  }

  /**
   * Alpha left after the exclusion zones.
   *
   * Measured at the plant's visual centre rather than its base, because a 300 px
   * grass rooted below the frame has all of its mass 150 px higher than the point
   * the projection returns — testing the base would let it grow straight through
   * the bee while its root sat safely outside every zone.
   */
  function zoneFactor(
    zones: Zone[],
    u: number,
    v: number,
    /* The plant's drawn top, in frame fractions. Boxed zones test the whole
       span; elliptical ones keep testing the centre, which is what they were
       authored against. */
    vTop: number,
    foreground: boolean,
  ): number {
    let factor = 1;
    for (let i = 0; i < zones.length; i += 1) {
      const zone = zones[i];
      if (foreground && zone.farOnly) continue;
      const du = (u - zone.u) / zone.ru;
      const dv = (v - zone.v) / zone.rv;
      if (zone.boxed) {
        /*
         * Rectangular, and tested against the plant's whole height.
         *
         * Every other zone here is evaluated at one point — the plant's visual
         * centre — and for a soft ellipse around a creature that is fine. It is
         * not fine for a corridor: a 300px grass whose centre sits comfortably
         * below the copy still draws 150px upward, and a 1920 capture found one
         * doing exactly that eleven pixels under the CTA. So the vertical test
         * uses the closest point of the plant's drawn span to the zone centre,
         * which means any plant that would *paint* into the cleared rectangle is
         * attenuated, not just one whose midpoint lands in it.
         */
        const near = Math.max(vTop, Math.min(v, zone.v));
        const dvBox = (near - zone.v) / zone.rv;
        const r = Math.max(Math.abs(du), Math.abs(dvBox));
        if (r >= 1) continue;
        const rim = zone.feather ?? 0.3;
        factor *= 1 - zone.strength * (1 - smooth(1 - rim, 1, r));
        if (factor < 0.004) return 0;
        continue;
      }
      const r2 = du * du + dv * dv;
      if (r2 >= 1) continue;
      /*
       * `t * (2 - t)`, not `t * t`.
       *
       * The squared falloff is a spike: at 65% of the way to the rim it has
       * already given back 70% of the alpha it removed, so a 0.9-strength zone
       * drawn around the specimen card still let a legible flower sit behind the
       * card's second line. This shape is the complement — near-full removal
       * across most of the ellipse, released only at the edge — which is what an
       * exclusion zone has to be to actually exclude anything.
       */
      const t = 1 - r2;
      factor *= 1 - zone.strength * t * (2 - t);
      if (factor < 0.004) return 0;
    }
    return factor;
  }

  /* -------------------------------------------------------------------- draw --- */

  const projected: number[] = [0, 0, 0];

  function draw(now: number) {
    const sheet = atlas;
    const valley = field;
    if (!sheet || !valley) return;

    /* Everything from here to the quality block at the end of this function is
       this layer's own work, and its duration is the only cost signal the tier
       is allowed to read. See `COST_DOWNGRADE_MS`. */
    const drawStart = performance.now();

    const cam = camera();
    const grow = reduceMotion ? 1 : smooth(0, GROW_SECONDS, clock);
    const t = clock * 0.72;
    const sinT = reduceMotion ? 0 : Math.sin(t);
    const cosT = reduceMotion ? 1 : Math.cos(t);

    const tiles = sheet.tiles;
    /*
     * Two exclusion sets, blended by the same number that blends the camera.
     *
     * Both are evaluated only while the chapter hand-over is actually happening;
     * at either end one of them is skipped entirely, so the settled case costs
     * exactly what it did before.
     */
    const zones = withMeasured(layout.zones, heroZones);
    const zonesStudy = withMeasured(layout.zonesStudy, studyZones);
    const studyMix = chapter;
    const useHero = studyMix < 0.998;
    const useStudy = studyMix > 0.002;
    const stride = preset.stride;
    const nearFade = near + 3.2;
    const fadeIn = far - 40;
    const tallCap = H * layout.maxHeight * 1.16;
    const shortCap = H * layout.maxHeight;
    const foregroundDepth = layout.foreground;
    const push = layout.interaction * 0.62;
    const pointerLive = pointer.active && push > 0.001;

    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const start = valley.lowerBound(cam.z + near);
    const end = valley.lowerBound(cam.z + far + 6);
    const flowers = valley.flowers;
    let visible = 0;

    for (let i = end - 1; i >= start; i -= stride) {
      const o = flowers[i];
      if (!project(o, cam, sinT, cosT, projected)) continue;

      const px = projected[0];
      const py = projected[1];
      const d = projected[2];

      /* Perspective size, then the reference's distance bloom — near plants open
         wider than far ones by more than perspective alone accounts for, which is
         what gives the field a foreground rather than a gradient of sizes. */
      let h = ((o.scale * cam.f) / d) * (o.tall ? 1.45 : 1.16);
      h = clamp(h, 3.2, o.tall ? tallCap : shortCap);
      /*
       * The reference's distance bloom, re-centred as a gain rather than a cut.
       *
       * Its `0.55 + 0.45 * s` tops out at 1 — it only ever shrinks far plants,
       * because in the demo the near ones are already enormous. Here the near
       * plane has to stay out past the frame edges to keep the valley's middle
       * open, so nothing is naturally enormous, and the foreground was reading as
       * "the midground, slightly closer". Letting the term pass 1 at close range
       * is what gives the two corner clusters plants large enough for the frame to
       * crop, which is the whole tell that a foreground exists.
       */
      h *= (0.5 + 1.35 * smooth(110, 22, d)) * grow;
      if (h < 3.6) continue;

      /*
       * Three fades, and the third one is not in the reference.
       *
       * A photographic cut-out drawn six pixels tall is not a distant flower, it
       * is a speck: the first 1920 capture had the far band reading as dust or
       * sensor noise along a hard line where the far plane cut it. On black that
       * line is invisible because the specks were already near-black; on ivory it
       * is the most obvious edge in the frame. So size joins depth as a fade term,
       * and the depth ramp itself is nearly twice as long as the reference's —
       * which is also why the visible count drops without the picture thinning.
       */
      const fade = smooth(far, fadeIn, d)
        * smooth(near, nearFade, d)
        * smooth(3.5, 10, h);
      if (fade < 0.008) continue;

      const foreground = d < foregroundDepth;
      const u = px / W;
      const v = (py - h * 0.45) / H;
      /* `py` is the base and the sprite is drawn `h` tall above it; 0.92 keeps a
         sliver of the very tip out of the test so a single stray blade does not
         push the whole corridor down. */
      const vTop = (py - h * 0.92) / H;
      const heroFactor = useHero ? zoneFactor(zones, u, v, vTop, foreground) : 0;
      const studyFactor = useStudy ? zoneFactor(zonesStudy, u, v, vTop, foreground) : 0;
      const factor = heroFactor + (studyFactor - heroFactor) * studyMix;
      if (factor <= 0.002) continue;

      let ox = 0;
      let oy = 0;
      if (pointerLive) {
        const rx = px - pointer.sx;
        const ry = py - h * 0.38 - pointer.sy;
        const r2 = rx * rx + ry * ry;
        if (r2 < 30_000) {
          const dist = Math.sqrt(Math.max(1, r2));
          const strength = (1 - smooth(0, 173, dist)) * push;
          if (strength > 0.002) {
            ox = (rx / dist) * strength * 34;
            oy = (ry / dist) * strength * 22;
          }
        }
      }

      const alpha = fade * clamp(0.54 + 70 / d, 0.58, 1) * o.bright * factor;
      if (alpha < 0.01) continue;

      ctx.globalAlpha = alpha;
      ctx.drawImage(tiles[o.tile], px + ox - h * 0.5, py + oy - h, h, h);
      visible += 1;
    }

    ctx.globalAlpha = 1;

    /*
     * Aerial perspective, in one fill.
     *
     * `source-atop` composites the wash only where a plant already is and keeps
     * the destination's alpha, so the background band loses contrast against the
     * page without a haze rectangle ever appearing over the page itself. On the
     * reference's black ground the distance dissolve was free; here it has to be
     * paid for, and this is the cheapest honest way to pay.
     */
    if (haze && visible > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ------------------------------------------------------ quality tracking --- */
    /*
     * Not under reduced motion, where the frame rate is deliberately not a frame
     * rate: that path draws on scroll and resize only, so a 900 ms window
     * containing two frames measures 2 FPS and would walk the tier straight down
     * to Low for a picture that is costing nothing. There is no adaptation to do
     * when there is nothing running to adapt.
     */
    if (reduceMotion) return;
    fpsFrames += 1;
    costTotal += performance.now() - drawStart;
    costFrames += 1;
    if (now - fpsMark >= 900) {
      const fps = (fpsFrames * 1000) / (now - fpsMark);
      const cost = costFrames > 0 ? costTotal / costFrames : 0;
      fpsFrames = 0;
      costTotal = 0;
      costFrames = 0;
      fpsMark = now;
      canvas.dataset.fps = String(Math.round(fps));
      /* The number the tier actually decides on, so a future "why is it Low"
         can be answered without re-deriving it. */
      canvas.dataset.cost = cost.toFixed(2);
      canvas.dataset.visible = String(visible);
      canvas.dataset.quality = quality;
      canvas.dataset.scale = renderScale.toFixed(2);
      /* Look-dev readout. The composition depends on five numbers that are not
         visible in a screenshot, and guessing which one moved has cost more time
         than printing them ever will. */
      canvas.dataset.grow = grow.toFixed(3);
      canvas.dataset.chapter = chapter.toFixed(3);
      canvas.dataset.travel = travel.toFixed(3);
      canvas.dataset.camh = cam.y.toFixed(2);
      canvas.dataset.count = String(field?.flowers.length ?? 0);

      /*
       * The tier reacts to `cost`, never to `fps`.
       *
       * `fps` stays in the readout above because it is the useful number when
       * something is wrong; it is simply not evidence about this field. A window
       * at 2 FPS whose draws each took 3 ms means the loop was starved, and
       * thinning the meadow would not have returned a single frame — see the
       * note on `costTotal`.
       */
      if (cost > COST_DOWNGRADE_MS) { slowSamples += 1; fastSamples = 0; }
      else if (cost < COST_UPGRADE_MS) { fastSamples += 1; slowSamples = 0; }
      else { slowSamples = 0; fastSamples = 0; }

      if (slowSamples >= 2) {
        slowSamples = 0;
        if (quality === 'high') { quality = 'balanced'; applyQuality(); }
        else if (quality === 'balanced') { quality = 'low'; applyQuality(); }
      } else if (fastSamples >= 4) {
        fastSamples = 0;
        if (quality === 'low') { quality = 'balanced'; applyQuality(); }
        else if (quality === 'balanced' && W * H <= 2_600_000) { quality = 'high'; applyQuality(); }
      }
    }
  }

  /* -------------------------------------------------------------------- loop --- */

  /* The page's own gate: an IntersectionObserver as a hint and a measured rect as
     the truth, because an observer alone has been seen on this page to leave a
     panel permanently paused. */
  const gate = createVisibilityGate(host, 200);
  let frameHandle = 0;

  function frame(now: number) {
    frameHandle = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    if (!documentVisible || !gate.visible()) return;

    const panel = progress.current;
    travelTarget = clamp(panel / TRAVEL_SPAN, 0, 1);
    /* Damped toward the panel for the same reason the creature crossfade is: a
       wheel flick moves the raw value far enough in one frame to make the two
       stations visibly snap. */
    const chapterTarget = clamp(panel, 0, 1);
    chapter = reduceMotion ? chapterTarget : lerp(chapter, chapterTarget, 1 - Math.pow(0.004, dt));
    if (Math.abs(chapter - chapterTarget) < 0.0015) chapter = chapterTarget;
    dive = diveFor(panel);
    /*
     * How far into the descent station this frame is. Zero on every layout that
     * does not have one, which is what keeps `camera()` and the near plane
     * exactly as they were everywhere but the phone.
     *
     * Plants cross the moving plane through the same `smooth(near, nearFade, d)`
     * term that fades one in when the camera walks up to it, so nothing pops
     * into existence at the bottom of the frame.
     */
    descent = layout.descent ? smooth(0, DESCENT_TO, dive) : 0;
    near = layout.descent ? lerp(layout.near, layout.descent.near, descent) : layout.near;
    presence = 1 - smooth(SINK_FROM, SINK_TO, dive);
    if (Math.abs(dive - hazeDive) > 0.02) rebuildHaze(camera());

    /*
     * The layer's presence is the element's opacity, not a per-plant multiply.
     *
     * A compositor-only property costs nothing to animate and, more usefully,
     * gives the loop a free early exit: once the valley has left there is no
     * reason to keep projecting a field nobody can see, and the hero is a long
     * way up the page by then.
     */
    /* Snapped to exact zero below the threshold the loop bails at. Without the
       snap the last write before the bail is whatever presence happened to be —
       0.001, say — and since nothing after it ever runs, the canvas keeps its
       final painted frame at that opacity for as long as the page is open. */
    /* The painted value is the *final* alpha, not the presence: the two stations
       have different base opacities, so comparing presence alone left the layer
       at the hero's alpha for the whole of chapter 01. */
    const shown = presence < 0.004 ? 0 : presence * lerp(layout.opacity, layout.opacityStudy, chapter);
    if (Math.abs(shown - paintedPresence) > 0.002) {
      paintedPresence = shown;
      canvas.style.opacity = shown.toFixed(3);
      dirty = true;
    }

    /*
     * The water surface, as a mask.
     *
     * This layer is a Canvas2D field composited by the browser *above* the WebGL
     * frame, so the transition shader cannot reach it — and a meadow that keeps
     * printing over water while the shader draws a surface across the same
     * pixels is the one thing that would give the whole crossing away. Clipping
     * it here against `waterlineFor` — the identical function the shader's
     * `uLine` comes from — puts the flowers under the same surface to the pixel,
     * with a short feather so the cut has the softness of a meniscus rather than
     * the hardness of a mask.
     *
     * Written only when the line has actually moved, and removed entirely above
     * water so the settled hero never pays for a mask.
     */
    if (dive <= 0.0005) {
      if (paintedLine !== -9) {
        paintedLine = -9;
        canvas.style.maskImage = '';
        canvas.style.webkitMaskImage = '';
      }
    } else {
      const line = waterlineFor(dive);
      if (Math.abs(line - paintedLine) > 0.002) {
        paintedLine = line;
        const top = clamp((1 - line) * 100, -20, 120);
        const mask = `linear-gradient(to bottom, #000 ${(top - 3.4).toFixed(2)}%, rgba(0,0,0,0) ${(top + 1.6).toFixed(2)}%)`;
        canvas.style.maskImage = mask;
        canvas.style.webkitMaskImage = mask;
      }
    }
    if (shown === 0) return;

    const eased = reduceMotion ? 1 : 1 - Math.pow(0.0006, dt);
    const before = travel;
    travel = reduceMotion ? travelTarget : lerp(travel, travelTarget, eased);
    if (Math.abs(travel - travelTarget) < 0.00015) travel = travelTarget;

    if (!reduceMotion) {
      const ease = 1 - Math.pow(0.001, dt);
      pointer.x = lerp(pointer.x, pointer.tx, ease);
      pointer.y = lerp(pointer.y, pointer.ty, ease);
      clock += dt;
    }

    /*
     * Reduced motion draws only when something the visitor did changed the
     * picture. Everything else about the field is static in that mode — no sway,
     * no camera drift, no pointer — so a per-frame redraw would be a per-frame
     * redraw of an identical image.
     */
    if (reduceMotion) {
      if (!dirty && travel === before) return;
      dirty = false;
    }

    draw(now);
  }

  /* ------------------------------------------------------------------ events --- */

  const onPointerMove = (event: PointerEvent) => {
    if (reduceMotion) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointer.tx = (x / rect.width) * 2 - 1;
    pointer.ty = (y / rect.height) * 2 - 1;
    pointer.sx = x;
    pointer.sy = y;
    pointer.active = true;
  };
  const onPointerLeave = () => { pointer.active = false; };
  const onVisibility = () => {
    documentVisible = document.visibilityState !== 'hidden';
    lastFrame = performance.now();
    dirty = true;
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  /*
   * The copy exclusions have to be re-derived whenever the type reflows, and the
   * type reflows after this file has finished setting up.
   *
   * Two things move it and both land late: the Vietnamese web faces are
   * `display: swap`, so the first layout is a fallback metric and the real one
   * arrives when the font does; and `text-wrap: balance` can re-break the
   * headline when it does. Measuring once at start produced a corridor that was
   * 75px at one width and 16px at another for no reason visible in the code —
   * the zone was simply describing where the copy used to be. Observing the two
   * blocks costs one callback per reflow and makes the measurement true.
   */
  const copyObserver = new ResizeObserver(() => { measureCopyZones(); dirty = true; });
  for (const block of document.querySelectorAll<HTMLElement>('.hero .hero-copy, .story-panel--bee .story-copy')) {
    copyObserver.observe(block);
  }
  void document.fonts?.ready?.then(() => {
    if (disposed) return;
    measureCopyZones();
    dirty = true;
  }).catch(() => {});

  /* ------------------------------------------------------------------- start --- */

  void loadFlowerAtlas(atlasUrl, preset.cell)
    .then((loaded) => {
      if (disposed) { loaded.dispose(); return; }
      atlas = loaded;
      rebuildField();
      measure();
      lastFrame = performance.now();
      fpsMark = lastFrame;
      host.dataset.flowers = 'ready';
      options.onReady?.();
      frameHandle = requestAnimationFrame(frame);
    })
    .catch((error) => {
      if (disposed) return;
      host.dataset.flowers = 'error';
      options.onError?.(error);
      console.error('flower valley atlas failed to load', error);
    });

  return {
    setReduceMotion(value: boolean) {
      reduceMotion = value;
    },
    dispose() {
      disposed = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      copyObserver.disconnect();
      gate.dispose();
      atlas?.dispose();
      atlas = null;
      field = null;
      canvas.remove();
    },
  };
}
