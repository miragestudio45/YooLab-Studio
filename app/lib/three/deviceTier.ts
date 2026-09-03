/**
 * How much GPU this machine is allowed to be asked for.
 *
 * ## Why this file exists
 *
 * Every WebGL surface on this page used to pick its own resolution ceiling by
 * hand — `Math.min(devicePixelRatio, 1.75)` in the editor, `1.6` in the explore
 * canvas, `2` in the thumbnail baker, `1.4 / 1.75` in the Library stage — and
 * three of them then wrote their own adaptive downscaler on top, with three
 * different thresholds, three different window lengths and no way back up. Ten
 * numbers, none of them measured, and a report of stutter had no single place to
 * answer it.
 *
 * There are two decisions here and they are deliberately made in different ways:
 *
 * **Resolution is measured.** Nothing can tell you from a user-agent string
 * whether a MacBook has an M3 Max or a 2017 Intel Iris Plus, and guessing wrong
 * either wastes a good GPU or stutters on a weak one. So every surface starts at
 * a conservative ceiling and `createFrameGovernor` moves it — down when frames
 * are slow, *and back up* when they are not. That last part is what the three
 * old downscalers were missing: they were one-way, so a single slow window
 * during model load left the canvas soft for the rest of the session.
 *
 * **Density is signalled, and only on clear evidence.** How many fish are in the
 * reef, how finely the seabed is tessellated and how many dust motes drift
 * through it are decided once, at build time, and cannot be walked back a frame
 * later. So they only step down where the evidence is unambiguous — a coarse
 * pointer with no hover is a phone or a tablet, two cores is two cores — and
 * every ambiguous machine gets the full scene plus a governor that will quietly
 * take its resolution down if the scene turns out to be too much.
 *
 * ## What the numbers are
 *
 * The retina ceilings are the interesting ones, because they are the only place
 * a cap bites at all: on a 1× display `devicePixelRatio` is 1 and every cap here
 * is inert. On a 2× display, a full-viewport cinematic canvas at ratio 2 is four
 * times the fragment work of ratio 1 and about 120 MB of HDR render targets, and
 * the difference between 1.45 and 2 on a soft-shaded 3D scene at arm's length is
 * not something a viewer can point at. 1.45 is where that stops being true for
 * type and hard edges, which is why the panel surfaces — the editor, the Library
 * stage, whose canvases sit next to 11 px labels — are allowed more.
 */

/** A conservative starting ceiling per kind of surface. */
export type SurfaceKind =
  /** Full-viewport, always-on, and usually more than one pass. */
  | 'cinema'
  /** A workspace canvas inside a card, next to real type. */
  | 'panel'
  /** An off-screen bake displayed far smaller than it is rendered. */
  | 'thumb';

type Signals = {
  dpr: number;
  cores: number;
  /** GB, from the Device Memory API. 0 when the browser does not report it. */
  memory: number;
  /** A phone or a tablet: coarse pointer, no hover. */
  handheld: boolean;
};

let signals: Signals | null = null;

function read(): Signals {
  if (signals) return signals;
  const nav = navigator as Navigator & { deviceMemory?: number };
  signals = {
    dpr: window.devicePixelRatio || 1,
    /*
     * `hardwareConcurrency` is a CPU count and this is a GPU budget, so it is
     * only ever read as a floor: a two-core machine does not have a fast GPU
     * attached to it. It is never read as evidence that a machine IS fast.
     */
    cores: nav.hardwareConcurrency || 4,
    memory: nav.deviceMemory ?? 0,
    /*
     * `(hover: none) and (pointer: coarse)` rather than a user-agent test.
     * iPadOS reports itself as a Mac and has done for years, so every string
     * test for "iPad" has been wrong since 2019; the input-capability query is
     * what actually distinguishes a tablet from the laptop it claims to be.
     */
    handheld: window.matchMedia('(hover: none) and (pointer: coarse)').matches,
  };
  return signals;
}

/**
 * True only where the evidence is unambiguous.
 *
 * Read this for decisions that cannot be undone at runtime — how much geometry
 * to build, how many instances to place. Anything that CAN be walked back
 * should be governed by measurement instead; see `createFrameGovernor`.
 */
export function isLeanDevice(): boolean {
  const { cores, memory, handheld } = read();
  if (handheld) return true;
  if (cores <= 4) return true;
  if (memory > 0 && memory <= 4) return true;
  return false;
}

/** The ceiling a surface of this kind should start at on this machine. */
export function pixelRatioCap(kind: SurfaceKind): number {
  const { dpr, handheld } = read();
  const lean = isLeanDevice();

  if (kind === 'thumb') {
    /*
     * A bake is shown at 56–500 px and rendered at 560 × 420. Ratio 2 on top of
     * that was four times the fragment work of ratio 1 for a picture that is
     * then scaled DOWN in every place it appears, and the baker serialises, so
     * those pixels delayed the next chip in the rail rather than costing
     * nothing.
     */
    return Math.min(dpr, lean ? 1 : 1.5);
  }

  if (kind === 'panel') {
    /* Next to 10 px labels, so it keeps the most. */
    if (handheld) return Math.min(dpr, 1.5);
    return Math.min(dpr, lean ? 1.4 : 1.75);
  }

  /* cinema: full viewport, several passes, and two of these run at once during
     the hero. This is the cap that was 1.6 while a 1512 × 982 retina frame was
     drawing five full-viewport passes per frame across two contexts. */
  if (handheld) return Math.min(dpr, 1.15);
  return Math.min(dpr, lean ? 1.25 : 1.45);
}

/* ------------------------------------------------------------------ governor --- */

export type FrameGovernorOptions = {
  /** Where to start. Also the ceiling, unless `ceiling` says otherwise. */
  start: number;
  /** Never go below this, however slow the frames get. */
  floor: number;
  /** Never go above this. Defaults to `start`. */
  ceiling?: number;
  /** Mean frame time (ms) at or above which the window counts as slow. */
  budgetMs?: number;
  /** Mean frame time (ms) below which the window counts as having headroom. */
  comfortMs?: number;
  /** How far one adjustment moves the ratio. */
  step?: number;
  /**
   * The ratio below which the picture stops being merely less supersampled and
   * starts being genuinely soft. Steps that cross it have to prove a larger
   * measured gain. Defaults to 1 — one buffer pixel per CSS pixel.
   */
  crispFloor?: number;
  /** Called with the new ratio whenever it changes. Apply and re-size here. */
  apply: (ratio: number) => void;
};

export type FrameGovernor = {
  /** Feed every rendered frame's delta, in SECONDS (three's `getDelta()`). */
  note(delta: number): void;
  /** The ratio currently in force. */
  ratio(): number;
};

/**
 * One adaptive-resolution governor, measured in both directions.
 *
 * Four things it does that the hand-rolled versions it replaces did not:
 *
 *   - **Windows are time, not frames.** "40 slow frames" is 0.66 s at 60 fps and
 *     2.7 s at 15 fps, so the slower the machine the longer the old code waited
 *     before helping it. Windows here are 700 ms whatever the frame rate.
 *   - **A load stall is not a resolution problem.** A 20-second frame while a
 *     2.6 MB rigged model is parsed and its shaders compile says nothing about
 *     how many pixels the GPU can push, and the old code counted it. Any window
 *     containing a frame over 250 ms is discarded whole.
 *   - **It can go back up.** After four consecutive windows with real headroom
 *     it returns one step, so a canvas that was downscaled during a stall does
 *     not stay soft for the rest of the visit. The hysteresis is deliberately
 *     lopsided — one slow window to drop, four fast ones to recover — because
 *     an oscillating resolution is more visible than a slightly low one.
 *   - **It checks whether the step helped, and gives up if it did not.** This is
 *     the one that matters most, and it was found by measuring rather than by
 *     reasoning. Lowering the pixel ratio only helps a frame that is bound by
 *     FILL RATE. The hero of this page is not: it is a full-viewport WebGL
 *     composite, a Canvas2D flower field and a second transparent WebGL layer,
 *     and on a retina laptop the browser's own compositing of three full-screen
 *     layers is a large part of the frame — a cost proportional to the CSS box,
 *     which no pixel ratio can touch. A one-way governor pointed at that frame
 *     slid all the way to its floor and bought 6 fps for a visibly softer hero.
 *     So a step down is now a HYPOTHESIS: if the next window is not meaningfully
 *     faster, the step is reverted and the governor stops pulling a lever that
 *     is not connected to anything.
 */
export function createFrameGovernor(options: FrameGovernorOptions): FrameGovernor {
  const ceiling = options.ceiling ?? options.start;
  const floor = Math.min(options.floor, ceiling);
  const budget = (options.budgetMs ?? 20) / 1000;
  const comfort = (options.comfortMs ?? 13.6) / 1000;
  const step = options.step ?? 0.2;
  const crispFloor = options.crispFloor ?? 1;

  let ratio = options.start;
  let elapsed = 0;
  let windowTime = 0;
  let windowFrames = 0;
  let windowWorst = 0;
  let comfortable = 0;
  /* The window mean that triggered the step we are currently testing, or -1
     when we are not testing one. */
  let probeFrom = -1;
  /* Set once a step down has been shown not to help. From then on this canvas
     is not fill-rate bound and the ratio stops moving down. */
  let notFillBound = false;
  /* Whether the step being tested went below `crispFloor`, and therefore has to
     clear the higher bar. */
  let probeWasSoftening = false;

  const set = (next: number) => {
    const clamped = Math.min(ceiling, Math.max(floor, Math.round(next * 100) / 100));
    if (Math.abs(clamped - ratio) < 0.005) return false;
    ratio = clamped;
    options.apply(ratio);
    return true;
  };

  return {
    ratio: () => ratio,
    note: (delta) => {
      elapsed += delta;
      /* Warm-up. The first second and a bit is shader compilation, texture
         upload and the first model arriving, and none of it is steady state. */
      if (elapsed < 1.2) return;

      windowTime += delta;
      windowFrames += 1;
      if (delta > windowWorst) windowWorst = delta;
      if (windowTime < 0.7) return;

      const mean = windowTime / windowFrames;
      const stalled = windowWorst > 0.25;
      windowTime = 0;
      windowFrames = 0;
      windowWorst = 0;
      if (stalled) return;

      /*
       * Verdict on the step we took last window.
       *
       * A quarter fewer pixels on a fill-bound frame is a large, obvious
       * improvement; 3% is noise. If the step did not clear that bar, put the
       * pixels back and stop stepping down — whatever this frame is waiting for,
       * it is not the fragment shader.
       */
      if (probeFrom > 0) {
        const gain = (probeFrom - mean) / probeFrom;
        /*
         * Two bars, because the two kinds of step cost different things.
         *
         * Above `crispFloor` a step only spends supersampling, which nobody can
         * see, so a modest 6% is enough to keep it. Below it the step is
         * spending actual sharpness on a full-viewport picture, and that has to
         * buy something a visitor would notice — 10%, which at 60 Hz is about
         * 1.7 ms, the difference between holding a frame and missing it.
         */
        const bar = probeWasSoftening ? 0.1 : 0.06;
        probeFrom = -1;
        probeWasSoftening = false;
        if (gain < bar) {
          notFillBound = true;
          set(ratio + step);
          return;
        }
      }

      if (mean >= budget) {
        comfortable = 0;
        if (notFillBound) return;
        const next = ratio - step;
        if (set(next)) {
          probeFrom = mean;
          probeWasSoftening = next < crispFloor;
        }
        return;
      }
      if (mean <= comfort && ratio < ceiling) {
        comfortable += 1;
        if (comfortable >= 4) {
          comfortable = 0;
          /* Real headroom is also evidence the earlier verdict was about a
             transient, so the downward lever is armed again. */
          notFillBound = false;
          set(ratio + step);
        }
        return;
      }
      comfortable = 0;
    },
  };
}
