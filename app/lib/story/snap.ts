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
 * How much taller than the viewport a gap may be and still be one chapter step.
 *
 * `measure` admits an anchor only while its section FITS, which is right — but
 * a section that is dropped does not stop existing, it stops being *mentioned*,
 * and the two anchors on either side of it become neighbours in a list while
 * staying thousands of pixels apart in the document. Everything below then
 * treats that span as a chapter transition, because a chapter transition is the
 * only thing a gap between adjacent anchors has ever been.
 *
 * Measured on a 390x844 phone, where almost everything stops fitting:
 *
 *     anchors  0, 820, 1640, 2460, 6065, 10419
 *                              └ 3605 ┘└ 4354 ┘
 *
 * The first of those two holds the bridge (1482 px) and the editor (1303 px);
 * the second holds Practice (1751 px) and Education (1759 px). All four are
 * sections a visitor is meant to stop and read, and all four sat inside a gap
 * that was magnetic end to end: `FORWARD_BIAS` of 3605 px is 1154 px, so the
 * first thousand pixels of the bridge dragged backwards and everything past it
 * threw the page 2451 px forward into the Library. There was no resting place
 * anywhere in either span. That is the report — the scroll gets stuck at the
 * Library and Practice — and it is a phone-shaped bug for the plain reason that
 * a phone is where sections stop fitting.
 *
 * 1.35 is one viewport plus room for the padding and rounding that make a real
 * chapter step measure a little over its own height. Above it, the gap is not a
 * transition between two compositions; it is a stretch of document that happens
 * to lie between two anchors, and it gets read like one.
 */
const CHAPTER_GAP = 1.35;

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
/**
 * Movement we did not write that outranks a glide, in CSS px per tick.
 *
 * Separate from `SELF_PX`, which is about the browser's pixel grid. This one is
 * about the browser's *momentum*: a settle now begins while a trackpad fling is
 * still crawling to a halt (see `REST_PER_FRAME`), so for its first frames our
 * writes and the tail's last pixels land on the same scroll offset and the
 * difference is not zero. Cancelling on that took the settle away again on
 * exactly the input it was added for. Six pixels in a tick is far below anything
 * a hand produces, and every deliberate gesture cancels through its own listener
 * long before this backstop is consulted.
 */
const TAKEOVER_PX = 6;
/**
 * The speed at or below which the page counts as stopped, in px per 60 Hz frame.
 *
 * Exact stillness is the wrong test on a Mac, and that is where this was
 * reported. A trackpad fling in Chrome and Safari does not stop, it decays: the
 * last stretch of the tail moves the page well under a pixel a frame for a few
 * hundred milliseconds, and `lastMoveAt`-style bookkeeping treats every one of
 * those as fresh movement. The settle waited out the entire tail and then waited
 * `IDLE_MS` more, which on a hard fling reads as a snap that simply does not
 * come — the complaint this constant exists to answer. A wheel mouse never
 * showed it, because a wheel notch ends in a real stop.
 *
 * 1.2 px is chosen against the thing on the other side of it: taking the page
 * over while the browser is still moving it means two scrollers on one document,
 * which this module exists to avoid. At 1.2 px a frame the fling has around a
 * thousandth of its energy left, so what we take over is not a fight.
 */
const REST_PER_FRAME = 1.2;
const REST_V = REST_PER_FRAME / 16.7;
/** Smoothing for the speed estimate. Long enough to ignore one late frame. */
const SPEED_TAU_MS = 45;
/**
 * A wheel delta big enough to be a person rather than a momentum tail.
 *
 * The tail's own events are what make the speed test safe — they are small, and
 * they are the reason a settle may begin during one. A deliberate notch is not:
 * Windows sends 100 per detent and a trackpad flick opens far above 20.
 */
const WHEEL_DELIBERATE = 20;
/**
 * Quiet time after a deliberate wheel before a settle may begin.
 *
 * Without it a visitor working down the page one notch at a time gets a settle
 * started in each gap between notches and cancelled by the next one, which is a
 * tug rather than a scroll. It has to stay clear of `REST_PER_FRAME`'s job: it
 * is keyed to LARGE deltas only, so a momentum tail never renews it.
 */
const WHEEL_IDLE_MS = 220;

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
  let lastSampleAt = performance.now();
  /**
   * Smoothed scroll speed in px/ms, from movement we did not write.
   *
   * This is the whole answer to "has the visitor stopped", and it replaces
   * asking whether the number changed. See `REST_PER_FRAME`.
   */
  let speed = 0;
  /** When the page last came to rest, or -1 while it is still travelling. */
  let restSince = performance.now();
  let lastInputAt = 0;
  /** Last wheel event large enough to be a person. See `WHEEL_DELIBERATE`. */
  let lastCoarseWheelAt = 0;
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
     *
     * The write is the two-argument form under a forced `scroll-behavior: auto`
     * — see `holdScrollBehavior` for why that is more portable than asking for
     * `behavior: 'instant'`.
     */
    wrote = top;
    window.scrollTo(0, top);
  };

  /*
   * `scroll-behavior: auto`, held for exactly as long as a glide runs.
   *
   * The stylesheet sets `html { scroll-behavior: smooth }`, and a loop that
   * writes a position every frame cannot survive the browser animating each of
   * those writes — the two never converge and the page crawls. That used to be
   * handled by passing `behavior: 'instant'`, which is right where it is
   * understood and is a `TypeError` in the WebKit versions that predate it,
   * thrown once per frame inside the animation loop on the exact platform this
   * was reported broken on. Forcing the computed value instead needs no new
   * enum, works the same on every engine, and lets the write below be the plain
   * two-argument form that has always existed.
   */
  let behaviorHeld = false;
  const holdScrollBehavior = (hold: boolean) => {
    if (hold === behaviorHeld) return;
    behaviorHeld = hold;
    document.documentElement.style.scrollBehavior = hold ? 'auto' : '';
  };

  const stopGlide = () => { glideEnd = 0; holdScrollBehavior(false); };

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
     * `CAPTURE` limits a GAP, not an anchor — and a gap earns filmstrip physics
     * by being one chapter tall, not by being bracketed with anchors.
     *
     * Two questions, and both had to be asked here because both were answered
     * wrong by looking at a single anchor.
     *
     * The first is which anchor the limit applies to. It used to be the *chosen*
     * one, on the reasoning that the two kinds are neighbours — the Library is
     * cinematic, Practice below it is assist — so the gap between them would be
     * magnetic from the Library's side and capture-limited from Practice's. That
     * is a sound asymmetry to want and a per-anchor test does not produce it,
     * because the direction bias picks the anchor BEFORE this line runs.
     * Scrolling down out of the Library the bias picks Practice; Practice is
     * 290 px away on a 900-tall laptop; `CAPTURE` is 180; the answer was `null`,
     * and the measurement was a 540 px band — most of the Library — in which
     * nothing settled at all.
     *
     * The second is whether the gap is a chapter step at all. See
     * `CHAPTER_GAP`: on a phone the sections that do not fit drop out of the
     * anchor list without leaving the document, and the survivors end up
     * thousands of pixels apart with four readable sections stranded between
     * them and no resting place anywhere inside.
     *
     * So a gap is a place to rest when it is longer than a chapter, OR when both
     * its ends are assist. Everything else is the filmstrip, pulling from
     * anywhere: the four Explore panels on every device, and the Library's exit
     * on a viewport where the Library and Practice are still adjacent screens.
     */
    const step = upper.y - lower.y;
    const restable = step > window.innerHeight * CHAPTER_GAP || (lower.assist && upper.assist);
    if (restable && Math.abs(chosen.y - y) > window.innerHeight * CAPTURE) return null;
    return chosen.y;
  };

  let ticks = 0;
  /* Dev-only diagnostic buffer; `taping` is 0 unless `__snap.record()` armed it. */
  const tape: Array<Record<string, number>> = [];
  let taping = 0;

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

    const dt = now - lastSampleAt;
    lastSampleAt = now;

    /*
     * One observation, three answers: which way, how fast, and whose it was.
     *
     * `wrote` is the last value this loop pushed, so anything further from it
     * than the pixel grid allows is the browser, momentum, an anchor link or the
     * visitor. Only that movement sets direction and feeds the speed estimate —
     * our own glide must not be read as the visitor still scrolling, or every
     * settle would extend its own reason to exist.
     *
     * A glide is abandoned only for movement bigger than `TAKEOVER_PX`. Small
     * external movement is the tail of the fling we just took over from, and
     * yielding to it put the page back exactly where it was stuck before.
     */
    const y = window.scrollY;
    let external = 0;
    if (y !== lastY) {
      if (Math.abs(y - wrote) > SELF_PX) {
        external = Math.abs(y - lastY);
        direction = y > lastY ? 1 : -1;
        if (glideEnd && Math.abs(y - wrote) > TAKEOVER_PX) stopGlide();
      }
      lastY = y;
    }
    if (dt > 0) {
      const instant = external / dt;
      speed += (instant - speed) * (1 - Math.exp(-dt / SPEED_TAU_MS));
    }
    if (speed > REST_V) restSince = -1;
    else if (restSince < 0) restSince = now;

    if (taping) {
      if (now > taping) taping = 0;
      else if (tape.length < 900) {
        tape.push({
          t: Math.round(now),
          y: Math.round(y),
          ext: Math.round(external * 10) / 10,
          pxf: Math.round(speed * 16.7 * 100) / 100,
          rest: restSince < 0 ? -1 : Math.round(now - restSince),
          glide: glideEnd ? 1 : 0,
        });
      }
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
    if (restSince < 0 || now - restSince < IDLE_MS) return;
    if (now - lastInputAt < INPUT_IDLE_MS) return;
    if (now - lastCoarseWheelAt < WHEEL_IDLE_MS) return;
    /*
     * Elastic overscroll belongs to the browser.
     *
     * macOS and iOS let the document travel past both ends and spring back, and
     * during that spring `scrollY` is out of range and being animated by the
     * compositor. Writing into it is the two-scrollers failure in its purest
     * form, and the visitor is nowhere near an anchor anyway — they are at the
     * top of the page pulling down.
     */
    const overscroll = document.documentElement.scrollHeight - window.innerHeight;
    if (y < 0 || y > overscroll) return;

    const to = targetFor(y);
    if (to === null) return;
    const distance = to - y;
    if (Math.abs(distance) < DEAD_ZONE_PX) return;

    if (reduced.matches) {
      /* Reduced motion still gets the correctness — you are never left in a
         broken half-state — it just does not get the travel. */
      jump(to);
      lastY = window.scrollY;
      restSince = now;
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
    holdScrollBehavior(true);
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
   * Wheel is the ambiguous one, and it is four different devices.
   *
   * A wheel mouse sends one large delta per detent and nothing between them. A
   * Mac trackpad and a Magic Mouse send a burst and then a decaying momentum
   * tail that can run for a second, and Chromium delivers every frame of it.
   * Firefox measures in lines rather than pixels. Treating all of that as "the
   * visitor is steering again" cancelled every glide the moment it began.
   *
   * So the size is normalised first — a `deltaMode` of 1 is lines and 2 is
   * pages, and 3 lines is not a smaller gesture than 100 pixels — and then it is
   * asked two different questions. Is it big enough to be a person, which holds
   * the settle off for `WHEEL_IDLE_MS` so that notch-by-notch scrolling is never
   * interrupted by one. And, only while a glide is actually running, is it big
   * enough to take the page back.
   *
   * It deliberately does not touch `restSince`: that means "the page is still
   * travelling", which only the observed position can say, and a momentum wheel
   * that scrolls nothing is not movement.
   */
  const onWheel = (event: WheelEvent) => {
    const delta = event.deltaY;
    const size = Math.abs(delta)
      * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    if (size >= WHEEL_DELIBERATE) lastCoarseWheelAt = performance.now();
    if (!glideEnd) return;
    const against = Math.sign(delta) !== Math.sign(glideTo - glideFrom);
    if (size < (against ? OVERRIDE_AGAINST : OVERRIDE_WITH)) return;
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
  /*
   * iOS collapses its browser chrome without firing `resize` on `window`.
   *
   * The panels are sized in `svh`, so that collapse moves every anchor on the
   * page — and it happens on the visitor's first downward swipe, which is
   * precisely when a stale anchor settles them somewhere that no longer exists.
   * `visualViewport` is the event that does fire, on iPad as well as iPhone.
   */
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onViewportResize);
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
        atRest: restSince >= 0,
        sinceRest: restSince < 0 ? -1 : Math.round(performance.now() - restSince),
        sinceInput: Math.round(performance.now() - lastInputAt),
        sinceWheel: Math.round(performance.now() - lastCoarseWheelAt),
        pxPerFrame: Math.round(speed * 16.7 * 100) / 100,
        enabled, lastY, wrote, anchors: anchors.length,
        target: targetFor(window.scrollY),
        ticks,
      }),
      /*
       * A recorder, for the machines this cannot be run on.
       *
       * The input model above is the same code on a Mac trackpad, a wheel mouse
       * and an iPad, but the numbers arriving at it are not, and a device that
       * behaves differently can only be diagnosed with its own numbers. Call
       * `__snap.record()`, scroll the way that felt wrong, then `__snap.tape()`.
       */
      record(ms = 4000) {
        tape.length = 0;
        taping = performance.now() + ms;
      },
      tape: () => tape.slice(),
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
      viewport?.removeEventListener('resize', onViewportResize);
      holdScrollBehavior(false);
      if (process.env.NODE_ENV !== 'production') delete (window as unknown as { __snap?: unknown }).__snap;
    },
  };
}
