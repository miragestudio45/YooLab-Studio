/**
 * Adaptive quality as a measured ladder.
 *
 * ## Why this replaces the device test
 *
 * The first version of this project's quality control decided how much scene to
 * build from `isLeanDevice()` — a coarse pointer, a core count, a memory hint.
 * That is a guess about a GPU made from facts about a CPU, and the machine it
 * gets most wrong is the one that was actually reported as stuttering: a 13-inch
 * MacBook Air reports eight cores, eight gigabytes and a fine pointer, so every
 * signal says "desktop" and it is handed the full reef. Meanwhile an M3 Max
 * reports the same thing and would be penalised by any test tuned to catch the
 * Air.
 *
 * There is no string that separates them. There is a number: how long a frame
 * takes. So the signals now only choose a **starting rung** — so a phone does
 * not have to discover its own limits over the first three seconds — and the
 * measurement is the authority in both directions, including all the way back
 * to full quality on a machine that turns out to be fast.
 *
 * ## The ladder
 *
 * Rungs are ordered by what they cost the *picture*, cheapest first, and the
 * ladder stops descending the moment the frame budget is met — so the quality
 * given up is only ever what it took to hold the budget:
 *
 *   1. **Pixel ratio, down to 1:1.** Supersampling is the only thing on this
 *      page a viewer genuinely cannot see. On a 1× display there is none to
 *      spend, so a 1× machine gets no rungs here at all and goes straight to
 *      the density levers — which is correct, and is why the rung list is built
 *      from the device's own ceiling rather than written as a constant.
 *   2. **Particles.** Suspended dust and the god-ray quads: large, additive,
 *      overdraw-heavy, and decoration by construction.
 *   3. **Bubbles.** Same class, and they are a crossing effect rather than a
 *      permanent feature of the reef.
 *   4. **Reef density.** Instance counts on the coral and rock fields.
 *   5. **Secondary fauna.** The schools, then the megafauna that cross the
 *      background. The specimen the chapter is about is never touched.
 *   6. **Pixel ratio below 1:1**, last, because this is the first rung that
 *      spends real sharpness rather than surplus.
 *
 * ## Hysteresis, and the guard that matters more
 *
 * Descending takes one slow window; climbing back takes several consecutive
 * comfortable ones, and the number required **doubles every time a descent
 * follows a climb** (5 → 10 → 20 → 40 windows). A page that sits on the edge of
 * its budget therefore settles instead of pumping.
 *
 * "Follows a climb" is the part that had to be measured to get right. The first
 * version doubled on every descent, including the ones that are just the initial
 * search for a level, and an emulated phone showed the consequence: it began at
 * rung 4, needed rung 6 for the hero, and then required forty consecutive
 * comfortable windows — twenty-eight seconds, uninterrupted — to climb a single
 * rung, so it spent the rest of the visit two rungs below what it could hold at
 * a locked 60 fps. Searching downward is not oscillating. Only a descent that
 * undoes a previous climb is evidence that the last climb was wrong.
 *
 * The more important guard is that **descending is a hypothesis**. Lowering
 * resolution and thinning geometry only help a frame that is GPU-bound, and the
 * hero of this page is substantially bound by the browser compositing three
 * full-screen layers — a cost proportional to the CSS box that no rung here can
 * reach. So after three consecutive rungs the ladder checks whether the frame
 * time actually improved; if it has not moved by 8%, it climbs straight back to
 * where the descent started and refuses to descend again for a cooldown. That
 * was measured, not reasoned: a one-way governor pointed at this page's hero
 * slid to its floor and bought 6 fps for a visibly softer picture.
 */

export type QualityRung = {
  /** Human-readable, for the dev-only readout. */
  readonly label: string;
  /** Pixel-ratio ceiling in force at this rung. */
  readonly dpr: number;
  /** Fraction of the authored suspended-particle and god-ray count. */
  readonly particles: number;
  /** Fraction of the authored bubble count. */
  readonly bubbles: number;
  /** Fraction of the authored reef instance count. */
  readonly reef: number;
  /** Fraction of the authored school size; 0 also removes the megafauna. */
  readonly fauna: number;
};

export type QualityLadder = {
  /** Feed every rendered frame's delta, in SECONDS. */
  note(delta: number): void;
  /** The rung currently in force. */
  current(): QualityRung;
  /** Index of the current rung; 0 is full quality. */
  level(): number;
  /** Total rungs, for a readout. */
  depth(): number;
  /** Dev-only: what the ladder has decided and why. */
  report(): {
    level: number;
    label: string;
    meanMs: number;
    windows: number;
    upAfter: number;
    verdict: string;
  };
};

export type QualityLadderOptions = {
  /** The device's pixel-ratio ceiling. Rung 0 sits here. */
  dprCeiling: number;
  /**
   * The lowest pixel ratio the last-resort rung may use. Above 1 this
   * effectively disables the final rung, which is the right behaviour for a
   * surface that must stay crisp.
   */
  dprFloor: number;
  /** Rung to start on, from cheap signals. Clamped into range. */
  start?: number;
  /** Mean frame time (ms) at or above which a window counts as over budget. */
  budgetMs?: number;
  /** Mean frame time (ms) below which a window counts as having headroom. */
  comfortMs?: number;
  /** Called whenever the rung changes, and once on construction. */
  apply: (rung: QualityRung, level: number) => void;
};

/** Ignore everything before this: model parse and shader compile, not steady state. */
const WARMUP_MS = 1500;
/** Window length. Time, not a frame count — 40 frames is 0.66 s at 60 fps and 2.7 s at 15. */
const WINDOW_MS = 700;
/**
 * A frame this long is not a frame rate — it is a hitch — and the window that
 * contains one is discarded rather than counted.
 *
 * 100 ms, down from 250. At 250 the threshold only caught catastrophic stalls,
 * and a window containing a handful of 40–150 ms frames from a model arriving
 * or a shader compiling had a mean over budget with no single frame big enough
 * to be discarded. The ladder read that as "this GPU cannot keep up" and started
 * spending the picture on it: a screenshot pass caught the jellyfish chapter
 * running with a visibly thinned reef on a machine that holds 60 fps at full
 * density. Load is not a resolution problem, and this is where that gets said.
 */
const STALL_MS = 100;
/**
 * Consecutive over-budget windows required before descending.
 *
 * Two, not one. A genuine GPU limit produces slow windows continuously, so it
 * costs 1.4 s of extra patience to reach; a transient produces one. Combined
 * with the tighter stall threshold above, this is what stops the ladder reacting
 * to the page's own loading.
 */
const DOWN_WINDOWS = 2;
/** Minimum time on a rung before it may change again. */
const DWELL_MS = 900;
/** Consecutive comfortable windows needed to climb, before any doubling. */
const UP_WINDOWS = 5;
/** Cap on the doubling, so a settled page still recovers eventually. */
const UP_WINDOWS_MAX = 40;
/** How many rungs to try before asking whether descending is helping at all. */
const PROBE_RUNGS = 3;
/** Total improvement a probe must show, or the descent is abandoned. */
const PROBE_GAIN = 0.08;
/** How long to refuse descending after a failed probe. */
const COOLDOWN_MS = 30_000;

/**
 * Builds the rung list for one device.
 *
 * The density fractions are authored; the pixel-ratio rungs are derived, so a
 * machine with no supersampling to give up does not waste three rungs
 * discovering that.
 */
function buildRungs(ceiling: number, floor: number): QualityRung[] {
  const full: QualityRung = {
    label: 'full',
    dpr: ceiling,
    particles: 1,
    bubbles: 1,
    reef: 1,
    fauna: 1,
  };
  const rungs: QualityRung[] = [full];
  const crisp = Math.max(1, floor);
  const push = (label: string, over: Partial<QualityRung>) => {
    rungs.push({ ...rungs[rungs.length - 1], label, ...over });
  };

  /* 1. Surplus resolution, in 0.2 steps, down to one buffer pixel per CSS pixel. */
  let ratio = ceiling;
  while (ratio - 0.2 > crisp + 1e-6) {
    ratio = Math.round((ratio - 0.2) * 100) / 100;
    push(`dpr ${ratio.toFixed(2)}`, { dpr: ratio });
  }
  if (ceiling > crisp + 1e-6) push(`dpr ${crisp.toFixed(2)}`, { dpr: crisp });

  /* 2-5. The density levers, in the order they cost the picture least. */
  push('particles 50%', { particles: 0.5 });
  push('bubbles 45%', { particles: 0.35, bubbles: 0.45 });
  push('reef 55%', { reef: 0.55 });
  push('fauna 45%', { particles: 0.3, bubbles: 0.3, reef: 0.45, fauna: 0.45 });

  /* 6. Last resort: below one buffer pixel per CSS pixel. */
  if (floor < crisp - 1e-6) push(`dpr ${floor.toFixed(2)}`, { dpr: floor, fauna: 0 });

  return rungs;
}

export function createQualityLadder(options: QualityLadderOptions): QualityLadder {
  const rungs = buildRungs(options.dprCeiling, options.dprFloor);
  const budget = (options.budgetMs ?? 20) / 1000;
  const comfort = (options.comfortMs ?? 13.6) / 1000;

  let level = Math.min(rungs.length - 1, Math.max(0, Math.round(options.start ?? 0)));
  let elapsed = 0;
  let sinceChange = Infinity;
  let windowTime = 0;
  let windowFrames = 0;
  let windowWorst = 0;
  let lastMean = 0;
  let windows = 0;

  let comfortable = 0;
  let slow = 0;
  let upWindows = UP_WINDOWS;
  /* Whether the ladder has climbed since the last descent. Only a descent that
     undoes a climb makes recovery harder to earn. */
  let climbedSinceDescent = false;
  /* Descent bookkeeping: where this descent began, and how far it has gone. */
  let probeFrom = -1;
  let probeLevel = -1;
  let probeRungs = 0;
  let cooldown = 0;
  let verdict = 'warming up';

  const move = (next: number) => {
    const clamped = Math.min(rungs.length - 1, Math.max(0, next));
    if (clamped === level) return false;
    level = clamped;
    sinceChange = 0;
    options.apply(rungs[level], level);
    return true;
  };

  options.apply(rungs[level], level);

  return {
    current: () => rungs[level],
    level: () => level,
    depth: () => rungs.length,
    report: () => ({
      level,
      label: rungs[level].label,
      meanMs: Math.round(lastMean * 10000) / 10,
      windows,
      upAfter: upWindows,
      verdict,
    }),
    note: (delta) => {
      elapsed += delta * 1000;
      sinceChange += delta * 1000;
      if (cooldown > 0) cooldown -= delta * 1000;
      if (elapsed < WARMUP_MS) return;

      windowTime += delta;
      windowFrames += 1;
      if (delta > windowWorst) windowWorst = delta;
      if (windowTime * 1000 < WINDOW_MS) return;

      const mean = windowTime / windowFrames;
      const stalled = windowWorst * 1000 > STALL_MS;
      windowTime = 0;
      windowFrames = 0;
      windowWorst = 0;
      if (stalled) { verdict = 'stall ignored'; return; }
      lastMean = mean;
      windows += 1;

      /* Is the descent we are in the middle of actually working? */
      if (probeFrom > 0 && probeRungs >= PROBE_RUNGS) {
        const gain = (probeFrom - mean) / probeFrom;
        const started = probeLevel;
        probeFrom = -1;
        probeLevel = -1;
        probeRungs = 0;
        if (gain < PROBE_GAIN) {
          /*
           * Three rungs bought less than 8%. Whatever this frame is waiting
           * for, it is not the fragment shader or the draw call count, so put
           * the picture back and stop pulling levers that are not connected.
           */
          verdict = `not gpu-bound (${Math.round(gain * 100)}% over ${PROBE_RUNGS} rungs)`;
          cooldown = COOLDOWN_MS;
          comfortable = 0;
          move(started);
          return;
        }
        verdict = `descending helped (${Math.round(gain * 100)}%)`;
      }

      if (sinceChange < DWELL_MS) return;

      if (mean >= budget) {
        comfortable = 0;
        slow += 1;
        if (slow < DOWN_WINDOWS) { verdict = `over budget ${slow}/${DOWN_WINDOWS}`; return; }
        slow = 0;
        if (cooldown > 0) { verdict = 'over budget, cooling down'; return; }
        if (level >= rungs.length - 1) { verdict = 'over budget at floor'; return; }
        if (probeFrom < 0) { probeFrom = mean; probeLevel = level; probeRungs = 0; }
        probeRungs += 1;
        /* A round TRIP makes recovery harder to earn, which is what stops a page
           sitting on the edge of its budget from pumping. A descent that is
           still the initial search costs nothing extra. */
        if (climbedSinceDescent) {
          upWindows = Math.min(UP_WINDOWS_MAX, upWindows * 2);
          climbedSinceDescent = false;
        }
        verdict = `over budget, ${rungs[level + 1].label}`;
        move(level + 1);
        return;
      }

      slow = 0;
      if (mean <= comfort && level > 0) {
        comfortable += 1;
        if (comfortable >= upWindows) {
          comfortable = 0;
          climbedSinceDescent = true;
          verdict = `headroom, back to ${rungs[level - 1].label}`;
          move(level - 1);
        } else {
          verdict = `headroom ${comfortable}/${upWindows}`;
        }
        return;
      }

      comfortable = 0;
      slow = 0;
      verdict = 'in budget';
    },
  };
}
