/**
 * The valley.
 *
 * This is the part of the reference implementation that matters most, and it is
 * the part that is easiest to lose: the flowers are not scattered on the screen,
 * they are scattered in a *place*. Three functions define that place —
 *
 *   `curve(z)`  where the path is, at depth z. Three sines at incommensurable
 *               frequencies, so it sweeps and bends and never repeats inside the
 *               distance a camera can see.
 *   `slope(z)`  the path's heading, as a finite difference of `curve`. The camera
 *               yaws to follow it, which is what makes travel read as walking a
 *               valley rather than sliding a backdrop sideways.
 *   `ground(x)` the floor. Lowest on the path and rising with a 1.55 power away
 *               from it, so the terrain is a shallow trough with shoulders, plus
 *               two long sines of undulation so no bank is a straight line.
 *
 * Every flower's world position comes out of those three, and every visual
 * property the composition depends on falls out for free: the open centre is the
 * path, the two foreground clusters are the shoulders coming past the camera, the
 * receding midground is the trough ahead. Replace this with random x/y and the
 * picture stops being a space — which is precisely the failure the previous
 * botanical pass shipped.
 *
 * The numbers in `curve`, `slope` and `ground` are the reference's own. The two
 * things adapted for YooLab are in `buildValleyField`: the field is generated
 * over a bounded stretch of z rather than all 690 units of the standalone demo,
 * and `cell` chooses sprites for an ivory page rather than a black one.
 */

import { tileRow } from './atlas';

const TAU = Math.PI * 2;

const fract = (x: number) => x - Math.floor(x);
/** The reference's hash. Deterministic, so the field is the same picture on every
 *  load and on every machine — no seeding, no stored layout. */
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function curve(z: number): number {
  return Math.sin(z * 0.0154) * 6 + Math.sin(z * 0.037) * 2 + Math.sin(z * 0.006) * 1.25;
}

export function slope(z: number): number {
  return curve(z + 0.5) - curve(z - 0.5);
}

export function ground(x: number, z: number): number {
  const d = Math.abs(x - curve(z));
  return -3.6
    + Math.min(3.1, Math.pow(d / 16, 1.55) * 3.1)
    + Math.sin(z * 0.055 + x * 0.16) * 0.34
    + Math.sin(z * 0.013) * 0.3;
}

/**
 * Which sprite a plant gets, from how far off the path it stands.
 *
 * The reference's version sends anything past d = 16 into the two dark rows and
 * anything close to the path into grass, which is right for a night valley lit
 * only by its blooms. On ivory it inverts: the dark rows become the loudest thing
 * in the frame and the field reads as a hedge.
 *
 * So the bands are re-weighted rather than re-invented. The shoulders still get
 * most of the foliage — that is what gives the valley walls their mass and keeps
 * the blooms from spreading into an even confetti — but a third of the outer band
 * stays in flower, the deep-foliage row is a minority inside it, and the dried
 * leaves are a sprinkle. Their ochres are the one thing on the sheet that is
 * already in the page's palette, so they are worth keeping and not worth
 * repeating.
 */
function cell(index: number, dist: number, z: number): number {
  const q = hash(index * 71 + z * 0.03);

  if (dist > 17.5) {
    if (q < 0.28) return 32 + Math.floor(hash(index * 5.2) * 8);   /* grass + daisies */
    if (q < 0.4) return 40 + Math.floor(hash(index * 8.1) * 8);    /* deep foliage    */
    /*
     * Dried leaves, at one plant in twenty-five of the outer band.
     *
     * The first pass gave them seven percent of it and a 1920 capture showed why
     * that is too many: they are the largest silhouettes on the sheet and the
     * only brown ones, so a handful landing together in the near-left corner read
     * as litter rather than as autumn. Rare is what makes them a note.
     */
    if (q < 0.44) return 48 + Math.floor(hash(index * 3.44) * 8);
    return Math.floor(hash(index * 17.9) * 32);
  }
  /* The path's own verge: grass reads as ground cover here and stops the trough
     floor from becoming a bare corridor. */
  if (dist < 8.6 && q < 0.34) return 32 + Math.floor(hash(index * 11.3) * 8);
  return Math.floor(hash(index * 17.9) * 32);
}

export type Flower = {
  x: number;
  y: number;
  z: number;
  tile: number;
  scale: number;
  sway: number;
  /** Per-plant brightness jitter, so a drift of one sprite is not one colour. */
  bright: number;
  /** Precomputed sway phase. Two multiplies in the hot loop instead of a `sin`. */
  sinP: number;
  cosP: number;
  /** Grass and foliage rows, which are drawn taller than they are wide. */
  tall: boolean;
};

export type ValleyFieldOptions = {
  /** Depth the camera starts at. */
  from: number;
  /** How far the camera travels, plus how far it can see, plus margin. */
  span: number;
  count: number;
  /**
   * Closest a plant may stand to the path centre.
   *
   * The reference uses 3.1, which fills the bottom centre of the frame with
   * near-camera blooms — correct for a demo whose whole subject is the flowers.
   * The hero needs that band open: the bee flies down the middle of it and the
   * scroll cue sits at the bottom of it. Pushing the minimum out is what turns
   * "a wall of flowers along the bottom edge" into "two banks with a path
   * between them", and it is the single most load-bearing composition number
   * here.
   */
  clearance: number;
  /** Half-width of the planted band, measured out from `clearance`. */
  spread: number;
  /**
   * Plants per drift.
   *
   * The reference scatters every plant independently, which at its densities
   * produces an even meadow — right for a picture that is nothing but meadow. A
   * hero needs the opposite: real gaps, so that the negative space around the bee
   * reads as composed rather than as a thin patch. So the placement is two-level
   * — a drift centre is scattered through the valley, and its members scatter
   * around *that* — which is what turns a carpet into clumps with ground between
   * them without changing the count.
   */
  perDrift: number;
  /** How far a member strays from its drift centre, in z and in offset. */
  driftZ: number;
  driftSpan: number;
};

export type ValleyField = {
  flowers: Flower[];
  /** Binary search: index of the first flower at or past `z`. */
  lowerBound(z: number): number;
};

export function buildValleyField(options: ValleyFieldOptions): ValleyField {
  const { from, span, count, clearance, spread, perDrift, driftZ, driftSpan } = options;
  const drifts = Math.max(4, Math.round(count / Math.max(2, perDrift)));
  const flowers: Flower[] = new Array(count);

  for (let i = 0; i < count; i += 1) {
    const r2 = hash(i * 4.771 + 7.3);
    const r3 = hash(i * 9.331 + 1.2);
    const r4 = hash(i * 2.771 + 18.8);

    /* Which drift, and where that drift sits. Everything about a drift is hashed
       from its own index, so two members of one clump agree on it exactly. */
    const drift = Math.floor(hash(i * 0.9173 + 4.11) * drifts);
    /*
     * 46/54 rather than an even split.
     *
     * The camera yaws to follow the path, and the path at the hero's stretch bends
     * right — so the whole projection is shifted a little to screen left and an
     * even split leaves the right bank thinner than the left one in frame. This
     * pays that back in the field rather than in the renderer, which is the only
     * place it can be paid without unbalancing the *space*.
     */
    const side = hash(drift * 7.13 + 2.2) < 0.46 ? -1 : 1;
    /*
     * `r ** 0.72` in the reference: mass toward the inside edge of each bank.
     *
     * This was briefly inverted to 1.05, to push the banks out onto the shoulders,
     * and a 1920 capture showed why the reference has it the other way round. The
     * bottom half of the frame is reachable only by plants in the *inner* half of
     * each bank — an outer-bank plant low enough in frame is also past the frame's
     * side edge — so biasing outward emptied the two bottom corners the whole
     * composition is built on and left a single thin ribbon at mid height.
     */
    const driftDist = clearance + Math.pow(hash(drift * 11.91 + 6.4), 0.78) * spread;

    const z = from + span * hash(drift * 3.71 + 0.53) + (r2 - 0.5) * driftZ;
    const dist = Math.max(clearance * 0.82, driftDist + (r3 - 0.5) * driftSpan);
    const x = curve(z) + side * dist + (r4 - 0.5) * 2.5;

    const tile = cell(i, dist, z);
    const tall = tileRow(tile) >= 4;
    const scale = tall
      ? lerp(0.95, 1.95, hash(i * 3.11))
      : lerp(0.8, 1.7, hash(i * 6.17));
    const phase = r4 * TAU + z * 0.014 + drift * 1.7;

    flowers[i] = {
      x,
      y: ground(x, z),
      z,
      tile,
      scale,
      sway: lerp(0.35, 1.15, hash(i * 8.91)),
      bright: lerp(0.9, 1.06, hash(i * 4.15 + 99)),
      sinP: Math.sin(phase),
      cosP: Math.cos(phase),
      tall,
    };
  }

  /* Sorted by depth once, which is what makes the per-frame cost proportional to
     what is *in front of the camera* rather than to the size of the field: the
     draw loop binary-searches both ends of the visible range and never looks at
     a plant outside it. */
  flowers.sort((a, b) => a.z - b.z);

  return {
    flowers,
    lowerBound(z: number) {
      let lo = 0;
      let hi = flowers.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (flowers[mid].z < z) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
  };
}
