/**
 * The one clock the land half and the ocean half both read.
 *
 * `ExploreStory` produces a single continuous panel position (0 = hero, 1 =
 * chapter 01, 2 = chapter 02, 3 = chapter 03). Everything below is a pure
 * function of that number — no timers, no one-shot animations, no "has the
 * transition played yet" flag anywhere. That is the whole reason scrolling back
 * up walks the dive in reverse instead of breaking it: there is no state to be
 * out of sync with, only an evaluation.
 *
 * It lives in its own module because two independent renderers need to agree on
 * it to the pixel: the WebGL composite draws the waterline, and the Canvas2D
 * flower field masks itself against the same line. If either derived its own
 * copy of these numbers, the flowers would be cut somewhere other than where the
 * water is.
 */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / Math.max(1e-5, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Where the descent lives on the panel track.
 *
 * It starts inside chapter 01 rather than at its boundary — the brief's "near
 * the END of chapter 01" — and is finished before chapter 02 is centred, so the
 * chapter that has to read as an established reef never opens mid-transition.
 */
export const DIVE_FROM = 1.12;
export const DIVE_TO = 1.9;

/** 0 = flower valley, 1 = Blue Marine. */
export function diveFor(panel: number) {
  return smoothstep(DIVE_FROM, DIVE_TO, panel);
}

/**
 * The water surface, as a height in frame space: 0 is the bottom edge, 1 the
 * top.
 *
 * It travels bottom-to-top because that is what sinking looks like from inside
 * the frame — as the eye passes below the surface, the surface climbs the view
 * and closes over it. It starts and ends outside the frame, which is what makes
 * the boundary appear and disappear without an edge ever popping into existence.
 */
export const WATERLINE_ENTER = 0.16;
export const WATERLINE_EXIT = 0.86;

export function waterlineFor(dive: number) {
  return -0.24 + 1.5 * smoothstep(WATERLINE_ENTER, WATERLINE_EXIT, dive);
}

/**
 * How wide the refractive boundary band is, in frame heights.
 *
 * Widest in the middle of the crossing, where the surface is closest to the eye
 * and the distortion should be at its most physical, and narrow at both ends so
 * the band is never visible arriving or leaving.
 */
export function waterbandFor(dive: number) {
  const life = smoothstep(WATERLINE_ENTER, WATERLINE_ENTER + 0.14, dive)
    * (1 - smoothstep(WATERLINE_EXIT - 0.14, WATERLINE_EXIT, dive));
  return 0.012 + 0.085 * life;
}

/**
 * Creature weights along the panel track.
 *
 * The bee leaves before the water reaches it, the fish is already resolving out
 * of the haze while the surface is still closing overhead, and the jellyfish
 * takes over inside one continuous ocean. The overlaps are deliberate: a weight
 * that reaches zero exactly as the next leaves zero is a slide change.
 */
export function creatureWeights(panel: number) {
  /*
   * The bee leaves late on purpose.
   *
   * An earlier window had it gone by 1.56, and at dive 0.39 — the middle of the
   * crossing — the air half of the frame contained nothing at all. The creature
   * is the only thing above the meadow line, so it is what keeps the world above
   * the water a world right up to the moment the surface closes. It flies up and
   * out along its own exit arc, ahead of the line, and is gone before the
   * composite stops drawing the land half at all.
   */
  const bee = 1 - smoothstep(1.24, 1.74, panel);
  const toJelly = smoothstep(2.16, 2.78, panel);
  const fish = smoothstep(1.44, 1.88, panel) * (1 - toJelly);
  return { bee, fish, jelly: toJelly };
}
