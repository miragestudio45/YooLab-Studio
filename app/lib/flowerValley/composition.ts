/**
 * How much valley this frame gets, and where it is not allowed to be.
 *
 * The reference implementation composes one picture: a full-bleed valley with a
 * headline floated over it, and every number in `app.js` is tuned for that. The
 * hero is a different picture with the same vocabulary — the flowers are the
 * *third* most important thing in it, after a ruby bee and a proposition — so
 * this file is where the reference's camera and field get re-aimed rather than
 * re-invented.
 *
 * Two mechanisms, and they do different jobs:
 *
 *   `Layout`  a physical camera and field per viewport class. Because the field
 *             is spatial, the only honest way to raise or lower the flower band
 *             in the frame is to move the camera — so the phone does not get the
 *             desktop picture scaled down, it gets a higher, shallower, more
 *             distant valley whose band lands in the one strip of a 390x844 hero
 *             that is neither bee nor copy plate.
 *
 *   `Zone`    soft elliptical attenuation in frame space. The field is allowed to
 *             extend *behind* the headline and the bee — pulling it out would
 *             leave a visible hole where a space should continue — but a plant
 *             that projects into one of these ellipses loses alpha in proportion
 *             to how far in it is. Nothing is culled, so nothing pops.
 *
 * `farOnly` is the whole of the depth story. A zone marked `farOnly` is ignored
 * by plants nearer than `Layout.foreground`, which is what lets a foreground
 * grass at the frame edge cross the bee's wing tip — the brief asks for exactly
 * that much occlusion — while every midground and background plant stays out of
 * the bee's face and body.
 */

export type ViewportClass = 'desktop' | 'laptop' | 'tablet' | 'compact' | 'phone';

export type Zone = {
  /** Centre, in fractions of the frame. `u` right, `v` down. */
  u: number;
  v: number;
  /** Radii, same units. */
  ru: number;
  rv: number;
  /** Alpha removed at the centre, 0 to 1. */
  strength: number;
  /** True: plants nearer than `Layout.foreground` ignore this zone. */
  farOnly?: boolean;
};

export type Layout = {
  /** Eye height above the nominal valley floor. */
  camH: number;
  /**
   * Frame pitch. Positive tips the horizon *down* the frame, which is the one
   * control that decides how much of the hero the flowers are allowed to own.
   */
  pitch: number;
  fov: number;
  /** Camera clip range, in valley units. */
  near: number;
  far: number;
  /** Depth below which a plant is foreground and ignores `farOnly` zones. */
  foreground: number;
  /** Where in the valley this hero sits, and how far it travels on scroll. */
  from: number;
  travel: number;
  /** Field shape. See `ValleyFieldOptions`. */
  clearance: number;
  spread: number;
  /** Plants per unit of z. Multiplied by the quality tier's own factor. */
  density: number;
  /** Drift shape. See `ValleyFieldOptions.perDrift`. */
  perDrift: number;
  driftZ: number;
  driftSpan: number;
  /** Ceiling on plant size, as a fraction of frame height. */
  maxHeight: number;
  /** Global alpha for the whole layer at full presence. */
  opacity: number;
  /** Pointer parallax and repulsion amplitude. */
  interaction: number;
  zones: Zone[];
};

/**
 * The hero, at the width it was composed for.
 *
 * `from: 344` is not arbitrary. Over the 130 units the camera can see from there
 * the path's slope runs +0.12 to +0.08 and `curve` sweeps about 7 units to the
 * right before flattening — a valley that visibly bends, at a heading the camera
 * yaw can follow without the frame ever looking canted. Most of the 690-unit
 * demo is either straighter or bends harder than a hero can carry.
 */
const DESKTOP: Layout = {
  camH: 5,
  pitch: 0.0095,
  fov: 34,
  near: 3.4,
  far: 106,
  foreground: 26,
  from: 344,
  travel: 30,
  clearance: 6.6,
  spread: 17,
  density: 13.6,
  maxHeight: 0.32,
  perDrift: 15,
  driftZ: 7,
  driftSpan: 5.5,
  opacity: 0.9,
  interaction: 0.62,
  zones: [
    /* Headline, lede, CTA. Light: the copy is HTML above this canvas and the
       flower line sits below the last line of type, so this only catches a tall
       grass spiking into the button row. */
    { u: 0.2, v: 0.605, ru: 0.26, rv: 0.17, strength: 0.6 },
    /* The bee. Head, thorax and abdomen, generously — everything except the
       wing tips and the trailing legs, which foreground plants may cross. */
    { u: 0.625, v: 0.5, ru: 0.155, rv: 0.24, strength: 0.94, farOnly: true },
    /* The specimen card, bottom right. */
    { u: 0.872, v: 0.83, ru: 0.118, rv: 0.118, strength: 0.9 },
    /*
     * The clearing under the bee, and the brief's one prohibition.
     *
     * Lowering `clearance` is what gives the frame edges their foreground
     * clusters, and it does it by moving plants closer to the path — which is
     * also directly under the creature and directly over the scroll cue. Left
     * alone that closes the bottom edge into the continuous band this whole pass
     * exists to get rid of.
     *
     * The world cannot express "empty here": the valley floor is a floor all the
     * way across and thinning it everywhere would cost the banks their mass. This
     * is frame-space by necessity, it is the largest single zone on the hero, and
     * it is the reason the composition reads as two clusters with a path between
     * them rather than as a hedge with a bee over it.
     */
    { u: 0.5, v: 1.06, ru: 0.178, rv: 0.34, strength: 0.82 },
  ],
};

/**
 * 1366x768 and 1440x900, which is most of the audience.
 *
 * 768 px of height with a 76 px header is the hardest frame on the page: the
 * headline, the bee and the specimen card are all still present and there is a
 * third less room between them. The valley answers by getting shallower — `far`
 * comes in, which lifts the horizon relative to the band and shortens the
 * depth ramp — and by giving up its outermost shoulder, so the two banks read as
 * clusters rather than as walls.
 */
const LAPTOP: Layout = {
  ...DESKTOP,
  /*
   * A higher eye, not a stronger pitch.
   *
   * The band was reaching 62% of the way up a 768 px frame and printing straight
   * through the specimen card. Pitch is the obvious lever and the wrong one: it
   * drops the far line and the near plants together, so the foreground clusters
   * fall out of frame with the horizon. Raising the camera instead moves the whole
   * ground plane down while leaving every plant the same size, because size is
   * `scale * f / depth` and has no eye-height term in it at all.
   */
  camH: 7,
  pitch: 0.018,
  near: 3.8,
  far: 92,
  foreground: 24,
  travel: 26,
  clearance: 5.9,
  spread: 15.5,
  density: 12.4,
  maxHeight: 0.29,
  perDrift: 14,
  driftZ: 6.6,
  driftSpan: 5.2,
  zones: [
    { u: 0.2, v: 0.645, ru: 0.27, rv: 0.185, strength: 0.66 },
    { u: 0.625, v: 0.51, ru: 0.16, rv: 0.25, strength: 0.94, farOnly: true },
    { u: 0.868, v: 0.845, ru: 0.125, rv: 0.125, strength: 0.9 },
    { u: 0.5, v: 1.06, ru: 0.19, rv: 0.35, strength: 0.82 },
  ],
};

/**
 * 1024x768 landscape.
 *
 * Below 1000 px the hero becomes one column: the bee takes the frame and the copy
 * sits at the bottom on a near-solid ivory plate. 1024 is the last width that
 * keeps the two-column composition, and it keeps it with almost no room, so this
 * is the laptop picture with the field pulled back off the copy column.
 */
const TABLET: Layout = {
  ...LAPTOP,
  camH: 5.4,
  pitch: 0.006,
  fov: 36,
  near: 5.2,
  far: 92,
  foreground: 22,
  travel: 22,
  clearance: 6.8,
  spread: 14,
  density: 12,
  maxHeight: 0.3,
  perDrift: 13,
  driftZ: 6.4,
  driftSpan: 5,
  opacity: 0.9,
  interaction: 0.5,
  zones: [
    { u: 0.24, v: 0.65, ru: 0.3, rv: 0.18, strength: 0.52 },
    { u: 0.6, v: 0.5, ru: 0.19, rv: 0.26, strength: 0.94, farOnly: true },
    { u: 0.87, v: 0.84, ru: 0.145, rv: 0.155, strength: 0.92 },
    { u: 0.5, v: 1.04, ru: 0.22, rv: 0.3, strength: 0.8 },
  ],
};

/**
 * 768x1024 portrait.
 *
 * One column, and a tall one. The copy plate owns the bottom third and the bee
 * owns the middle, which leaves a horizontal strip for the valley and nothing
 * else — so the near plane goes out past every foreground plant and the band
 * becomes purely midground. There is no foreground layer on this frame because
 * there is nowhere to put one.
 */
const COMPACT: Layout = {
  ...TABLET,
  camH: 5,
  pitch: -0.05,
  fov: 40,
  /*
   * `near: 34`, which on this frame is not a clipping decision.
   *
   * Everything closer than about thirty valley units projects below 65% of a
   * 1024-tall portrait frame, and 65% down is where the copy plate starts — a
   * near-solid ivory gradient sized to the copy block. So a foreground layer here
   * would be drawn, composited, and then completely covered. Moving the near
   * plane out past it buys back the whole cost and loses nothing that was ever
   * visible.
   */
  near: 34,
  far: 88,
  foreground: 0,
  travel: 18,
  /*
   * The banks come in, because a portrait frame has almost no horizontal field.
   *
   * The focal length is anchored to frame height — the reference's convention, and
   * the right one, since it is what keeps a plant the same apparent size on any
   * aspect. On a 768x1024 frame that leaves a horizontal half-angle of 15 degrees,
   * so a plant twenty units off the path is off the side of the picture at every
   * depth the camera can see it. Narrowing the planted band is not a density
   * decision here; it is the only way the band is in frame at all.
   */
  clearance: 4.2,
  spread: 10.5,
  density: 14,
  maxHeight: 0.19,
  perDrift: 9,
  driftZ: 6,
  driftSpan: 4.6,
  opacity: 0.86,
  interaction: 0.4,
  zones: [
    /* The creature, which owns the middle of this frame outright. */
    { u: 0.47, v: 0.3, ru: 0.3, rv: 0.14, strength: 0.7 },
    /* The specimen card, which on one column sits at the bottom right of the
       creature's own cell rather than at the bottom of the page. */
    { u: 0.87, v: 0.615, ru: 0.16, rv: 0.075, strength: 0.9 },
  ],
};

/**
 * 390x844.
 *
 * Atmosphere, not a valley. The only job left is that the hero still reads as a
 * bee over a meadow rather than a bee over a gradient, and that costs a thin
 * band of midground blooms behind the creature — which is also all that fits
 * between its wings and the top of the copy plate.
 */
const PHONE: Layout = {
  ...COMPACT,
  /*
   * `pitch: -0.212` is the whole phone composition in one number.
   *
   * A 390x844 hero has the creature in the upper half and a near-solid copy plate
   * over the lower half, and between them a strip about sixty pixels tall. That
   * strip is the only place a flower can be seen at all, so the camera is pitched
   * until the band lands in it: the far edge arrives at 32% of the frame, just
   * under the bee's trailing legs, and the near edge dissolves into the top of the
   * plate. Every earlier value put a perfectly good valley behind that plate.
   */
  pitch: -0.226,
  fov: 44,
  /*
   * 46 to 88. Everything nearer than that projects below the copy plate, and
   * everything further is past the fade — so this is not a clip range, it is the
   * strip itself, expressed in valley units.
   */
  near: 46,
  far: 88,
  travel: 14,
  /* 390 px of width is a horizontal half-angle of ten degrees. See COMPACT. */
  clearance: 3.4,
  spread: 9,
  density: 17,
  maxHeight: 0.1,
  perDrift: 8,
  driftZ: 5.4,
  driftSpan: 4.2,
  opacity: 0.92,
  interaction: 0.26,
  zones: [
    /* The bee, and nothing else — the copy is already on its own ivory plate. */
    { u: 0.5, v: 0.24, ru: 0.34, rv: 0.11, strength: 0.72 },
  ],
};

export function viewportClass(width: number, height: number): ViewportClass {
  if (width < 700) return 'phone';
  /* The CSS one-column switch is at 1000, and a portrait frame under it is a
     different picture from a landscape one at the same width. */
  if (width < 1000) return height > width ? 'compact' : 'tablet';
  if (width < 1000 || height < 620) return 'tablet';
  if (width < 1440) return 'laptop';
  return 'desktop';
}

export function layoutFor(kind: ViewportClass): Layout {
  switch (kind) {
    case 'phone': return PHONE;
    case 'compact': return COMPACT;
    case 'tablet': return TABLET;
    case 'laptop': return LAPTOP;
    default: return DESKTOP;
  }
}

/**
 * Quality tiers, inside a layout.
 *
 * The layout decides the picture; this decides how expensively it is drawn. Both
 * dimensions are needed: dropping the density on a slow 1920 machine keeps the
 * composition and thins it, where handing that machine the phone layout would
 * change the composition to something the frame was never designed for.
 *
 * `areaPixels` is the reference's adaptive render-scale budget — the canvas is
 * rasterised at whatever fraction of CSS pixels keeps its area near this number,
 * so a 4K frame costs about what a 1080 one does and a phone gets sharper rather
 * than cheaper. `stride` is its other lever: `2` visits every second plant in the
 * depth-sorted field, which thins the whole field evenly instead of cutting a
 * band out of it.
 */
export type QualityLevel = 'high' | 'balanced' | 'low';

export type Preset = {
  areaPixels: number;
  stride: number;
  /** Multiplier on `Layout.far`. Nearer far plane, fewer plants, shorter ramp. */
  reach: number;
  /** Multiplier on `Layout.density`. */
  density: number;
  /**
   * Atlas cell size in px — read once, at load, from the *opening* tier only.
   *
   * The other three fields are live: a tier change re-derives the field and the
   * render scale on the spot. This one cannot be, because changing it means
   * re-slicing and re-uploading 56 bitmaps, and paying that hitch is a worse
   * outcome than the thing it would fix (slightly soft sprites on a machine that
   * promoted, slightly more texture memory on one that demoted). So it is
   * effectively a property of `openingQuality`, and it is here rather than on
   * `Layout` because that is where the size of a sprite belongs.
   */
  cell: number;
};

/*
 * `cell: 256` on High, because a foreground plant is allowed to be 345 px tall on
 * a 1080 frame and a 192 px tile drawn at that size is visibly soft — the whole
 * point of using photography is lost if the closest flowers are the blurriest
 * things in the picture. 56 tiles at 256 square is about 14 MB of bitmap, decoded
 * once, which is the same budget the previous pass spent on its atlas.
 */
export const PRESETS: Record<QualityLevel, Preset> = {
  high:     { areaPixels: 2_350_000, stride: 1, reach: 1,    density: 1,    cell: 256 },
  balanced: { areaPixels: 1_750_000, stride: 1, reach: 0.94, density: 0.86, cell: 192 },
  low:      { areaPixels: 1_150_000, stride: 2, reach: 0.86, density: 0.86, cell: 128 },
};

/**
 * Opening quality.
 *
 * `deviceMemory` is a hint, absent on Safari, and is only ever allowed to demote
 * — the same rule the previous botanical pass used, and the right one: a 2 GB
 * Android reporting a 1080-wide viewport is the case it exists for, and no
 * reported number is trustworthy enough to promote on.
 */
export function openingQuality(kind: ViewportClass): QualityLevel {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && memory <= 4) return 'low';
  if (kind === 'phone' || kind === 'compact') return 'balanced';
  return 'high';
}
