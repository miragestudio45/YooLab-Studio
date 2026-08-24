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
 *   FPS-driven quality.  Two slow windows step the tier down, four fast ones step
 *     it back up. The tier changes density, reach and render scale — never the
 *     layout, so the composition a viewport was designed for survives a slow GPU.
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

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Where the valley leaves, on the Explore panel axis: 0 is the hero, 1 the bee
 * study, 2 the fish, 3 the jellyfish.
 *
 * This window closed a long way, and a capture is the reason.
 *
 * It started at 1.12 to 1.9 — full presence across the hero, carried through the
 * anatomy chapter on the argument that the chapter is still the same bee and a
 * meadow belongs to it, gone before the underwater fish. The `hero-exit` and
 * `bee-study` captures at 1920 refuted it twice over. Mid-handover, chapter two's
 * headline is already two thirds on screen and the field was at full composition
 * behind it; at the chapter itself the field was printing through the anatomy
 * readout and the three mode buttons.
 *
 * The exclusion zones cannot rescue that, and it is worth being clear about why:
 * they are authored against the *hero* frame — a bee at 62% and a specimen card
 * at 87% — and chapter two puts a full column of copy where the hero has nothing
 * at all. Making them panel-dependent would mean interpolating two sets of
 * ellipses through a hand-over, to keep a meadow behind an anatomy diagram.
 *
 * So the dispersal now starts as soon as the hero is left and is finished before
 * chapter two is centred. This is earlier than "by section three" in any reading
 * of the page's numbering, and it is the only window in which the field never
 * competes with copy it was not composed around.
 */
const FADE_FROM = 0.12;
const FADE_TO = 0.72;

/** Panel distance the camera's travel is spread over. Slightly past the fade so
 *  the valley is still moving as it leaves rather than freezing and dissolving. */
const TRAVEL_SPAN = 0.85;

/** How long the opening growth wave takes. A shade under the bee's 2.6 s entry,
 *  so the field is settled by the time the creature arrives on its mark. */
const GROW_SECONDS = 2.1;

/** The page's hero ivory, for the aerial-perspective wash. */
const HAZE = '252, 247, 240';

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
  if (!context) return { dispose() {} };
  /* Re-bound so the narrowing survives into the closures below, which is the one
     place TypeScript will not carry it for a `const`. */
  const ctx = context;
  host.appendChild(canvas);

  const { progress, reduceMotion } = options;
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

  /* Clock, scroll, pointer. */
  let clock = 0;
  let lastFrame = performance.now();
  let travel = 0;
  let travelTarget = 0;
  let presence = 1;
  let paintedPresence = -1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, sx: -9999, sy: -9999, active: false };

  /* FPS window. */
  let fpsFrames = 0;
  let fpsMark = performance.now();
  let slowSamples = 0;
  let fastSamples = 0;

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
     * The reference yaws 0.86 of the path's own heading, which keeps the camera
     * looking straight down a valley it is walking. At the hero's `from` that is
     * about six degrees, and six degrees is enough to swing the far valley off the
     * right edge and leave the right bank with nothing in it — the frame ends up
     * with one rich cluster and one empty corner instead of the two the
     * composition is built on. Following the path at a third of that keeps both
     * banks in frame; the bend is still visible, it is just no longer chased.
     */
    const yaw = Math.atan(slope(z)) * 0.3 + pointer.x * 0.026 * amount;
    const pitch = layout.pitch + pointer.y * 0.012 * amount;
    const ny = -yaw;
    return {
      z,
      x: curve(z) + pointer.x * 1.45 * amount,
      y: layout.camH + pointer.y * 0.28 * amount,
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
    const line = horizon(cam);
    const top = Math.max(0, line - H * 0.06);
    const bottom = Math.min(H, line + H * 0.24);
    haze = ctx.createLinearGradient(0, top, 0, bottom);
    haze.addColorStop(0, `rgba(${HAZE}, 0.34)`);
    haze.addColorStop(0.4, `rgba(${HAZE}, 0.15)`);
    haze.addColorStop(1, `rgba(${HAZE}, 0)`);
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
    });
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
    if (dz < layout.near || dz > far) return false;

    const rx = dx * cam.cy - dz * cam.sy;
    let rz = dx * cam.sy + dz * cam.cy;
    if (rz < layout.near) return false;

    /* The angle-sum identity that replaces a per-plant `Math.sin`. */
    const wave = sinT * o.cosP + cosT * o.sinP;
    const ry = o.y + wave * o.sway * 0.12 - cam.y;
    const py = ry * cam.cp - rz * cam.sp;
    rz = ry * cam.sp + rz * cam.cp;
    if (rz < layout.near) return false;

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
  function zoneFactor(zones: Zone[], u: number, v: number, foreground: boolean): number {
    let factor = 1;
    for (let i = 0; i < zones.length; i += 1) {
      const zone = zones[i];
      if (foreground && zone.farOnly) continue;
      const du = (u - zone.u) / zone.ru;
      const dv = (v - zone.v) / zone.rv;
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

    const cam = camera();
    const grow = reduceMotion ? 1 : smooth(0, GROW_SECONDS, clock);
    const t = clock * 0.72;
    const sinT = reduceMotion ? 0 : Math.sin(t);
    const cosT = reduceMotion ? 1 : Math.cos(t);

    const tiles = sheet.tiles;
    const zones = layout.zones;
    const stride = preset.stride;
    const nearFade = layout.near + 3.2;
    const fadeIn = far - 40;
    const tallCap = H * layout.maxHeight * 1.16;
    const shortCap = H * layout.maxHeight;
    const foregroundDepth = layout.foreground;
    const push = layout.interaction * 0.62;
    const pointerLive = pointer.active && push > 0.001;

    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const start = valley.lowerBound(cam.z + layout.near);
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
      h *= (0.6 + 0.72 * smooth(92, 18, d)) * grow;
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
        * smooth(layout.near, nearFade, d)
        * smooth(3.5, 10, h);
      if (fade < 0.008) continue;

      const foreground = d < foregroundDepth;
      const factor = zoneFactor(zones, px / W, (py - h * 0.45) / H, foreground);
      if (factor <= 0) continue;

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
    if (now - fpsMark >= 900) {
      const fps = (fpsFrames * 1000) / (now - fpsMark);
      fpsFrames = 0;
      fpsMark = now;
      canvas.dataset.fps = String(Math.round(fps));
      canvas.dataset.visible = String(visible);
      canvas.dataset.quality = quality;
      canvas.dataset.scale = renderScale.toFixed(2);

      if (fps < 48) { slowSamples += 1; fastSamples = 0; }
      else if (fps > 57) { fastSamples += 1; slowSamples = 0; }
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
    presence = 1 - smooth(FADE_FROM, FADE_TO, panel);

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
    const shown = presence < 0.004 ? 0 : presence;
    if (Math.abs(shown - paintedPresence) > 0.002) {
      paintedPresence = shown;
      canvas.style.opacity = (shown * layout.opacity).toFixed(3);
      dirty = true;
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
    dispose() {
      disposed = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      gate.dispose();
      atlas?.dispose();
      atlas = null;
      field = null;
      canvas.remove();
    },
  };
}
