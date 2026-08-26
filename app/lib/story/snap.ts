/**
 * Chapter snapping — one owner, one loop.
 *
 * The cinematic half of this page is five stacked full-height panels whose scroll
 * position IS the animation clock, and the failure that produces is specific:
 * the visitor can stop anywhere, including halfway through the water crossing,
 * where half a meadow and half a reef are both on screen and neither is a
 * composition. Intermediate states are correct *during* motion and wrong as
 * resting places.
 *
 * ---- why not `scroll-snap-type` ----
 *
 * CSS scroll snapping snaps on every gesture including small ones, cannot be
 * given a direction bias, fights momentum on touch, and re-targets during the
 * browser's own smooth scroll — which makes anchor links inside the story land
 * in the wrong chapter. What is wanted is magnetic settling, not a scroll
 * container.
 *
 * ---- why one loop ----
 *
 * The first version of this file used an idle `setTimeout`, a `driving` flag and
 * then a watchdog to catch the case where that flag latched. Each was added to
 * patch a symptom of one underlying problem: three mechanisms had to agree about
 * whether the page was moving, and under real input — momentum wheels that
 * scroll nothing, a rasteriser that drops frames — they disagreed. The page
 * stranded between anchors, and every fix moved the failure instead of removing
 * it.
 *
 * So there is now exactly one rAF loop and no flags that can go stale. It
 * observes the scroll position, decides, and animates; it never has to be told
 * what happened, because it can see. If frames stop, nothing latches — when they
 * resume the loop looks again. If anything else moves the page mid-glide, the
 * loop notices the position is not the one it wrote, and yields.
 *
 * ---- the one-owner rule ----
 *
 * This module is the only thing on the page that writes scroll position.
 * `ExploreStory` samples `window.scrollY` and never sets it; there is no GSAP,
 * no ScrollTrigger and no smooth-scroll library in the project.
 *
 * ---- anchors ----
 *
 * Major chapters only. Each Explore panel is exactly one viewport tall and its
 * document top is, by construction, the scroll position at which that chapter's
 * clock reads a whole number — so the anchors are the panel tops, plus the
 * bridge, which is the exit.
 */

export type SnapController = { dispose(): void };

/** How long the page must be genuinely STILL before settling begins. */
const IDLE_MS = 150;
/** How long after deliberate input before settling may begin. */
const INPUT_IDLE_MS = 170;
/** Below this, we are already there. */
const DEAD_ZONE_PX = 6;
/**
 * How far into a gap a downward scroll must be before the next chapter wins.
 *
 * Asymmetric on purpose: the visitor is moving somewhere, and dragging them back
 * because they only got a third of the way is the most annoying thing a magnetic
 * scroll can do.
 */
const FORWARD_BIAS = 0.32;
/** A wheel this big, mid-glide, is a person taking the page back. */
const OVERRIDE_DELTA = 8;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Cubic in-out. No overshoot: this is a settle, not a bounce. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createSectionSnap(): SnapController {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let anchors: number[] = [];
  let disposed = false;
  let frame = 0;

  /* Observation. */
  let lastY = window.scrollY;
  let lastMoveAt = performance.now();
  let lastInputAt = 0;
  let direction = 1;

  /* Animation. "Is a glide running" is `glideEnd > 0` — derived, never stored,
     so there is no flag to be left true. */
  let glideFrom = 0;
  let glideTo = 0;
  let glideStart = 0;
  let glideEnd = 0;
  /** The last position WE wrote, so our own writes are not read as movement. */
  let wrote = -1;

  let enabled = true;

  const measure = () => {
    const found: number[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-snap]')) {
      found.push(Math.round(el.getBoundingClientRect().top + window.scrollY));
    }
    found.sort((a, b) => a - b);
    anchors = found;
  };

  /*
   * `behavior: 'instant'`, and it is not optional.
   *
   * The stylesheet sets `html { scroll-behavior: smooth }` — right for anchor
   * navigation — which makes a bare `window.scrollTo` start a BROWSER-owned
   * smooth scroll instead of moving the page. This loop writes a position every
   * frame, so each write restarted that scroller from scratch; the two never
   * converged and the page crawled a few dozen pixels and stopped. It presented
   * as "the snap does not fire", and it was two scroll systems fighting — the
   * one thing this module exists to avoid.
   */
  const jump = (top: number) => {
    const value = Math.round(top);
    wrote = value;
    window.scrollTo({ top: value, left: 0, behavior: 'instant' as ScrollBehavior });
  };

  const stopGlide = () => { glideEnd = 0; };

  const targetFor = (y: number): number | null => {
    if (anchors.length < 2) return null;
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    /* Once the visitor has deliberately crossed an outer anchor, release the
       page immediately instead of pulling them back to the first/last chapter. */
    if (direction >= 0 && y > last + DEAD_ZONE_PX) return null;
    if (direction < 0 && y < first - DEAD_ZONE_PX) return null;
    /* Outside the cinematic run the page is an ordinary document and behaves
       like one. Half a viewport of margin keeps entry and exit from feeling
       like a wall. */
    const margin = window.innerHeight * 0.5;
    if (y < first - margin || y > last + margin) return null;

    let index = 0;
    for (let i = 0; i < anchors.length - 1; i += 1) if (y >= anchors[i]) index = i;
    const lower = anchors[index];
    const upper = anchors[Math.min(anchors.length - 1, index + 1)];
    if (upper === lower) return lower;

    const f = (y - lower) / (upper - lower);
    if (f <= 0) return lower;
    if (f >= 1) return upper;
    /* Directional: going down the next chapter wins early, going up the previous
       one does. Nobody is dragged backwards through a transition they were
       deliberately leaving. */
    return direction >= 0
      ? (f > FORWARD_BIAS ? upper : lower)
      : (f < 1 - FORWARD_BIAS ? lower : upper);
  };

  let ticks = 0;

  /*
   * One state machine, two clocks.
   *
   * `step` is the whole controller: it observes, decides and animates, and it
   * derives everything from `performance.now()` and the observed scroll
   * position, so calling it more often only makes the animation smoother and
   * calling it less often only makes it coarser. Nothing about it depends on
   * being called at a particular rate.
   *
   * That matters because rAF is not a reliable heartbeat on this page. Measured
   * under a software rasteriser with the WebGL scene running, the loop ticked
   * about once a second — so the visitor could stop mid-crossing and wait a full
   * second before anything even noticed. A real GPU does not behave that way,
   * but a loaded low-end device can, and "the snap sometimes takes a second to
   * react" is exactly the kind of jank this feature exists to remove.
   *
   * So rAF drives the smooth case and a 100ms interval guarantees liveness. They
   * feed the same function; there is still one owner and one state machine.
   */
  const step = (now: number) => {
    if (disposed) return;
    ticks += 1;
    if (document.visibilityState === 'hidden') return;

    const y = window.scrollY;
    if (y !== lastY) {
      /*
       * Movement we did not cause ends any glide in progress.
       *
       * `wrote` is the last value this loop pushed; anything else is the
       * browser, momentum, an anchor link or the visitor — and all four outrank
       * us.
       */
      if (y !== wrote) {
        direction = y > lastY ? 1 : -1;
        lastMoveAt = now;
        if (glideEnd) stopGlide();
      }
      lastY = y;
    }

    if (glideEnd) {
      const t = clamp((now - glideStart) / Math.max(1, glideEnd - glideStart), 0, 1);
      jump(glideFrom + (glideTo - glideFrom) * ease(t));
      lastY = window.scrollY;
      if (t >= 1) stopGlide();
      return;
    }

    if (!enabled) return;
    if (now - lastMoveAt < IDLE_MS) return;
    if (now - lastInputAt < INPUT_IDLE_MS) return;

    const to = targetFor(y);
    if (to === null) return;
    const distance = to - y;
    if (Math.abs(distance) < DEAD_ZONE_PX) return;

    if (reduced.matches) {
      /* Reduced motion still gets the correctness — you are never left in a
         broken half-state — it just does not get the travel. */
      jump(to);
      lastY = window.scrollY;
      lastMoveAt = now;
      return;
    }
    /* Longer for a longer move, but bounded: a snap approaching a second reads
       as the page having been taken away from you. */
    const span = Math.abs(distance) / Math.max(1, window.innerHeight);
    glideFrom = y;
    glideTo = to;
    glideStart = now;
    glideEnd = now + clamp(420 + span * 420, 420, 800);
  };

  const tick = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    step(now);
  };

  /* Unambiguous new gestures always take the page back immediately. */
  const onInput = () => {
    lastInputAt = performance.now();
    stopGlide();
  };

  /*
   * Wheel is the ambiguous one.
   *
   * Chromium keeps delivering wheel events through a trackpad's momentum tail,
   * and treating those as "the visitor is steering again" cancelled every glide
   * the moment it began. A deliberate override is a real delta arriving while a
   * glide is actually running; the tail is not. It deliberately does not touch
   * `lastMoveAt` — that means "the page is still travelling", which only the
   * observed position can say, and a momentum wheel that scrolls nothing is not
   * movement.
   */
  const onWheel = (event: WheelEvent) => {
    if (glideEnd && Math.abs(event.deltaY) >= OVERRIDE_DELTA) {
      lastInputAt = performance.now();
      stopGlide();
    }
  };

  const onKey = (event: KeyboardEvent) => {
    /* Only the keys that scroll: a visitor tabbing through the navigation must
       not trigger a chapter settle. */
    if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(event.key)) return;
    onInput();
  };

  /* A genuine viewport change invalidates an in-flight glide: the anchor it is
     travelling to has moved. The content observer only re-measures — the anchor
     elements change size for reasons that have nothing to do with the visitor (a
     thumbnail resolving, a reveal transition, a canvas re-fitting), and
     cancelling on those stranded the page a few pixels off an anchor. */
  const onViewportResize = () => { stopGlide(); measure(); };
  const onContentResize = () => { measure(); };

  measure();
  /* Panels are sized in `svh`, so the anchors move when mobile browser chrome
     collapses — exactly when a stale anchor would settle to the wrong place. */
  const observer = new ResizeObserver(onContentResize);
  for (const el of document.querySelectorAll<HTMLElement>('[data-snap]')) observer.observe(el);

  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onInput, { passive: true });
  window.addEventListener('touchmove', onInput, { passive: true });
  window.addEventListener('pointerdown', onInput, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onViewportResize, { passive: true });
  frame = requestAnimationFrame(tick);
  const heartbeat = setInterval(() => step(performance.now()), 100);

  if (process.env.NODE_ENV !== 'production') {
    /*
     * A test seam, and a necessary one: look-dev has to hold the page at a
     * deliberately intermediate position — the middle of the water crossing is a
     * frame that must be inspected precisely because nobody should rest there.
     */
    const seam = {
      get enabled() { return enabled; },
      disable() { enabled = false; stopGlide(); },
      enable() { enabled = true; },
      anchors: () => anchors.slice(),
      state: () => ({ y: window.scrollY, gliding: glideEnd > 0, to: glideTo, direction }),
      debug: () => ({
        now: Math.round(performance.now()),
        sinceMove: Math.round(performance.now() - lastMoveAt),
        sinceInput: Math.round(performance.now() - lastInputAt),
        enabled, lastY, wrote, anchors: anchors.length,
        target: targetFor(window.scrollY),
        ticks,
      }),
    };
    (window as unknown as { __snap?: typeof seam }).__snap = seam;
  }

  return {
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      clearInterval(heartbeat);
      observer.disconnect();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onInput);
      window.removeEventListener('touchmove', onInput);
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onViewportResize);
      if (process.env.NODE_ENV !== 'production') delete (window as unknown as { __snap?: unknown }).__snap;
    },
  };
}
