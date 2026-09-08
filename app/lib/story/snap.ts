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
 *
 * The track then continues through the product half: the editor, the Library,
 * Practice, Education, the lesson belt and Pricing. Those last four joined once
 * they became height-responsive, and they are *conditional* — see `measure`,
 * which admits a `[data-snap]` section only while it actually fits the viewport.
 *
 * The run has to stay contiguous, which is why the lesson belt is on it even
 * though nobody asked for it: `targetFor` brackets a position between the two
 * nearest anchors, so a non-anchor section sitting between two anchors is a
 * section the visitor cannot rest in — they get pulled to whichever side the
 * direction bias picks. Practice, Education, belt, Pricing are adjacent in the
 * document, so all four are on the track or the middle two are unrestable.
 */

export type SnapController = { dispose(): void };

/**
 * How long the page must be genuinely STILL before settling begins.
 *
 * Five frames at 60 Hz. It was 120 — two frames more than the eye needs to
 * register that nothing is happening, and those two frames started to matter
 * once the settle stopped opening at full speed: a curve that leads in gently
 * (see `settle`) spends its own first frames barely moving, so any dead time in
 * front of it is dead time the visitor sees. Momentum does not stall for five
 * consecutive frames and then resume, so this is still a genuine stop.
 */
const IDLE_MS = 90;
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
/**
 * How close an end of a restable gap has to be before it pulls, as a fraction
 * of the viewport.
 *
 * 0.2 is about 195 px on a 982-tall laptop — roughly "the heading is nearly in
 * place". Below that the settle reads as tidying up an almost-correct position,
 * which is the only thing a magnetic scroll should do to a document; above it,
 * it reads as the page deciding where you are allowed to stop.
 *
 * Which gaps are restable is `targetFor`'s question, not this constant's.
 */
const CAPTURE = 0.2;

/**
 * How big a mid-glide wheel has to be to count as a person taking the page back.
 *
 * Two thresholds, because a trackpad's momentum tail and a deliberate correction
 * are the same event with different numbers on it. Pushing FURTHER in the
 * direction the glide is already going needs a real shove — a tail routinely
 * delivers 10-20 px of delta that scrolls nothing, and cancelling on those left
 * the page stranded a third of the way between two anchors, which is the exact
 * failure this module exists to prevent. Pushing BACK is unambiguous at any
 * size: nobody reverses direction by accident, and a reversal that is ignored
 * feels like the page has been taken away from you.
 */
const OVERRIDE_WITH = 26;
const OVERRIDE_AGAINST = 6;

/**
 * How far the observed scroll may sit from the position we asked for and still
 * be our own write rather than the visitor's.
 *
 * `jump` writes fractional positions and the browser lands on the nearest
 * DEVICE pixel, so what comes back is never quite what went out. Half a CSS
 * pixel covers the worst case at 2x; 1.5 covers every scale factor with room to
 * spare, and is far below any movement a person can produce.
 */
const SELF_PX = 1.5;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/**
 * How fast the settle is already moving on its first frame, as a multiple of
 * its own average speed.
 *
 * This one number is the difference between a glide and a yank, and it is why
 * the curve below is a Hermite instead of one of the stock eases.
 *
 * A cubic ease-OUT — what this was — leaves the anchor at three times its
 * average speed. A cinematic settle can be two thirds of a viewport, so on a
 * 900-tall laptop the old curve's opening frame moved about 55 px, from a
 * standing stop, in one frame. That is not a fast animation; it is a jump with
 * an animation after it, and no amount of easing at the far end hides the jump.
 *
 * A cubic ease-IN-out fails the other way, and this file has already been
 * through it: leaving at exactly zero spends the first three frames going
 * nowhere, which after an idle wait reads as a pause and then a lunge.
 *
 * 0.6 is neither. The page is moving on frame one — about 11 px on that same
 * laptop, small but unmistakably motion — and it accelerates into a mid-glide
 * peak of 1.35x average rather than decaying from 3x. Same distance, same
 * clock, less than half the peak speed.
 */
const LEAD_IN = 0.6;
/**
 * Cubic Hermite: p(0)=0, p(1)=1, p'(0)=LEAD_IN, p'(1)=0.
 *
 * Monotonic and overshoot-free for any LEAD_IN below 2.5 — the derivative
 * -4.2t^2 + 3.6t + 0.6 has no root strictly inside the interval — which is the
 * property that matters, because this is a settle and not a bounce: a magnetic
 * scroll that sails past its anchor and comes back has moved the page somewhere
 * the visitor never asked to go.
 */
const settle = (t: number) => LEAD_IN * (t * t * t - 2 * t * t + t) + t * t * (3 - 2 * t);

export function createSectionSnap(): SnapController {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /**
   * `assist` is the difference between a filmstrip and a document.
   *
   * A cinematic anchor is magnetic from anywhere in its gap: the Explore
   * chapters ARE a filmstrip, nobody should rest between two of them, and
   * `FORWARD_BIAS` pulling from a third of the way across is the feature.
   *
   * The product half is not that. Practice, Education, the lesson belt and
   * Pricing joined the track when they became height-responsive, and they are
   * adjacent full-height sections — so the same rule made every one of their
   * gaps a full viewport with no resting place in it. A visitor who stopped to
   * read the price cards got hauled to the next section's top. That is what
   * review meant by the scroll not feeling right, and it was caused by the
   * previous round's own change.
   *
   * So a gap with `assist` at BOTH ends is magnetic only within `CAPTURE` of
   * its ends: stop near a boundary and it tidies up, stop in the middle of a
   * section and it leaves you alone. A gap with a cinematic anchor at either end
   * is still a filmstrip and still pulls from anywhere in it.
   *
   * The rule is about the gap rather than the anchor, and `targetFor` is where
   * that distinction is made and where the reason for it is written down.
   */
  type Anchor = { y: number; assist: boolean };
  let anchors: Anchor[] = [];
  /* Set by whatever noticed the layout move, acted on by `step`. See the
     deferral note there. */
  let needsMeasure = false;
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

  /*
   * An anchor is a section that FITS. Measured, not declared.
   *
   * `data-snap` used to mean "settle here" outright, and that was safe only
   * while every marked section was exactly one screen tall by construction —
   * the four Explore panels, the bridge, the editor and the Library all are.
   * DESIGN.md §2b states the rule the hard way: a magnetic anchor on a section
   * whose content continues past the viewport settles the visitor onto a
   * boundary they were scrolling *through*, which is worse than no snap at all.
   * The Library could only join the track once its "related" strip was deleted.
   *
   * Practice, Education, the lesson belt and Pricing are now height-responsive
   * and compose in one screen at desktop sizes — but not at 1024 × 768, and not
   * on a phone, where they deliberately stack. So the qualification is checked
   * here on every measure instead of being promised in the markup, and the same
   * three sections are anchors on a 1512 × 982 laptop and ordinary scrolling
   * document on a tablet, with nothing to keep in sync.
   *
   * **What counts as fitting is the section's content, not its box.** A section
   * is 20-60 px taller than the viewport at these widths purely because of its
   * own trailing padding, and padding below the fold is not content the visitor
   * is being cut off from — it is the gap before the next section. Measured at
   * 1512 × 982: Practice is 1017 px tall and 953 of content, Pricing 1042 and
   * 973. Excluding those over 35 px of bottom padding would have thrown away
   * exactly the case this change exists to serve.
   */
  const measure = () => {
    const found: Anchor[] = [];
    const limit = window.innerHeight + 8;
    for (const el of document.querySelectorAll<HTMLElement>('[data-snap]')) {
      const box = el.getBoundingClientRect();
      const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      if (box.height - padBottom > limit) continue;
      found.push({
        y: Math.round(box.top + window.scrollY),
        assist: el.dataset.snap === 'assist',
      });
    }
    found.sort((a, b) => a.y - b.y);
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
    /*
     * Written unrounded, which it was not.
     *
     * The browser quantises the scroll offset to a device pixel, so on a 1.25x
     * or 2x display a fractional CSS position is a real, distinct position —
     * and rounding to whole CSS pixels threw away most of the resolution this
     * animation has. It showed in the last third of every settle, where the
     * curve covers well under a pixel a frame and integer steps turn a soft
     * landing into a stair.
     *
     * `wrote` therefore holds an intent rather than an observation, and the one
     * place that compares against it allows for the quantisation: `SELF_PX`.
     */
    wrote = top;
    window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
  };

  const stopGlide = () => { glideEnd = 0; };

  const targetFor = (y: number): number | null => {
    if (anchors.length < 2) return null;
    const first = anchors[0].y;
    const last = anchors[anchors.length - 1].y;
    /* Once the visitor has deliberately crossed an outer anchor, release the
       page immediately instead of pulling them back to the first/last chapter. */
    if (direction >= 0 && y > last + DEAD_ZONE_PX) return null;
    if (direction < 0 && y < first - DEAD_ZONE_PX) return null;
    /* Outside the run the page is an ordinary document and behaves like one.
       Half a viewport of margin keeps entry and exit from feeling like a wall. */
    const margin = window.innerHeight * 0.5;
    if (y < first - margin || y > last + margin) return null;

    let index = 0;
    for (let i = 0; i < anchors.length - 1; i += 1) if (y >= anchors[i].y) index = i;
    const lower = anchors[index];
    const upper = anchors[Math.min(anchors.length - 1, index + 1)];
    if (upper.y === lower.y) return lower.y;

    const f = (y - lower.y) / (upper.y - lower.y);
    /* Directional: going down the next chapter wins early, going up the previous
       one does. Nobody is dragged backwards through a transition they were
       deliberately leaving. */
    const chosen = f <= 0 ? lower
      : f >= 1 ? upper
      : direction >= 0 ? (f > FORWARD_BIAS ? upper : lower)
      : (f < 1 - FORWARD_BIAS ? lower : upper);

    /*
     * `CAPTURE` limits a GAP, not an anchor.
     *
     * It was asked of the *chosen* anchor, on the reasoning that the two kinds
     * are neighbours — the Library is cinematic, Practice below it is assist —
     * so the gap between them would be magnetic from the Library's side and
     * capture-limited from Practice's. That is a sound asymmetry to want and the
     * per-anchor test does not produce it, because the direction bias picks the
     * anchor BEFORE this line runs. Scrolling down out of the Library the bias
     * picks Practice; Practice is 290 px away on a 900-tall laptop; `CAPTURE` is
     * 180; the answer is `null`. Measured: a 540 px band, most of the Library,
     * in which nothing settled at all. The Library is a full-height cinematic
     * panel composed to be seen whole, and resting two thirds of the way through
     * it is the exact failure this module exists to prevent.
     *
     * A gap is a place to rest only when BOTH its ends are assist. That keeps
     * the inside of Practice, Proof and Pricing free — which is what `assist`
     * was added for — and puts the Library's exit back on the filmstrip, where
     * the visitor lands on the Library or on Practice and never between them.
     */
    if (lower.assist && upper.assist && Math.abs(chosen.y - y) > window.innerHeight * CAPTURE) return null;
    return chosen.y;
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
      if (Math.abs(y - wrote) > SELF_PX) {
        direction = y > lastY ? 1 : -1;
        lastMoveAt = now;
        if (glideEnd) stopGlide();
      }
      lastY = y;
    }

    if (glideEnd) {
      const t = clamp((now - glideStart) / Math.max(1, glideEnd - glideStart), 0, 1);
      const at = glideFrom + (glideTo - glideFrom) * settle(t);
      /* Land as soon as the remainder drops below what the display can show.
         The tail of the curve is real arithmetic and invisible motion, and
         frames spent on it read as the page still doing something after the
         movement has plainly finished. */
      const done = t >= 1 || Math.abs(glideTo - at) < SELF_PX * 0.5;
      jump(done ? glideTo : at);
      lastY = window.scrollY;
      if (done) stopGlide();
      return;
    }

    /*
     * Anchors are re-measured here, not in whatever noticed the layout move.
     *
     * `measure` reads layout for every marked section, and a ResizeObserver
     * callback runs inside the frame — so a thumbnail resolving or a canvas
     * re-fitting mid-glide bought a forced style recalculation in the middle of
     * the one animation on this page whose entire job is to look smooth. The
     * anchors are read nowhere but below, so deferring costs nothing, and the
     * glide above returns before reaching this line and never pays for it.
     */
    if (needsMeasure) { needsMeasure = false; measure(); }

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
    /*
     * Longer for a longer move, but bounded: a snap approaching a second reads
     * as the page having been taken away from you.
     *
     * Tied harder to distance than the 300-620 this replaces, at both ends. The
     * floor came down because a 40 px tidy-up held across 300 ms is a drift and
     * not a correction — slow enough to sit and watch, which is the one thing a
     * boundary nudge must never be. The ceiling went up because `settle` carries
     * real speed through the middle of a cinematic crossing instead of bleeding
     * it off from the first frame, and speed that large needs room to be given
     * back in.
     */
    const span = Math.abs(distance) / Math.max(1, window.innerHeight);
    glideFrom = y;
    glideTo = to;
    glideStart = now;
    glideEnd = now + clamp(240 + span * 520, 240, 720);
  };

  /** When rAF last ran, so the liveness interval can stay out of its way. */
  let lastFrameAt = -Infinity;
  const tick = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    lastFrameAt = now;
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
    if (!glideEnd) return;
    const delta = event.deltaY;
    const against = Math.sign(delta) !== Math.sign(glideTo - glideFrom);
    if (Math.abs(delta) < (against ? OVERRIDE_AGAINST : OVERRIDE_WITH)) return;
    lastInputAt = performance.now();
    stopGlide();
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
  const onViewportResize = () => { stopGlide(); needsMeasure = true; };
  const onContentResize = () => { needsMeasure = true; };

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
  /*
   * Liveness, and only liveness.
   *
   * The interval exists because rAF is not a reliable heartbeat on this page —
   * measured at roughly once a second under a software rasteriser — so without
   * it a visitor could stop mid-crossing and wait before anything noticed. But
   * it must not *drive* a glide that rAF is already driving: an interval write
   * lands between frames, so the two together stepped the scroll position twice
   * in one composited frame at uneven spacing, which is visible as a stutter in
   * the one animation on this page whose whole job is to feel smooth. It now
   * defers whenever rAF has ticked recently, and takes over within 70 ms of rAF
   * going quiet.
   */
  const heartbeat = setInterval(() => {
    const now = performance.now();
    if (now - lastFrameAt < 70) return;
    step(now);
  }, 100);

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
      anchors: () => anchors.map((a) => a.y),
      assists: () => anchors.filter((a) => a.assist).length,
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
