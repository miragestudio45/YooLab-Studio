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
  /**
   * `copy` marks the ellipse that keeps the field off a block of type.
   *
   * The renderer replaces it with one derived from where that block ACTUALLY is
   * (see `measureCopyZones` in `renderer.ts`). The authored values stay as the
   * fallback for a frame where the DOM cannot be read, and as documentation of
   * the intent — but they are not what ships, because an ellipse authored in
   * frame fractions cannot track type whose position in the frame moves with
   * viewport height. Measured on the composited frame at four desktop sizes, one
   * authored zone left 111px of corridor under the hero CTA at 1920x1080 and
   * 29px at 1366x768; the brief asks for 40-60 at both.
   *
   * `subject` is the same argument for the creature, and it is worse there,
   * because the creature actually moves: hover bob, entry arc, pointer parallax
   * and the chapter hand-over all shift it, and a static ellipse tracks none of
   * them. It is replaced by the bee's projected bounding box — see `subjectRect`.
   */
  role?: 'copy' | 'subject';
  /**
   * Rectangular metric plus an explicit rim, instead of an ellipse.
   *
   * The authored zones are ellipses because they are aimed at *shapes* — a bee,
   * a card, the open ground under the creature. A block of type is a rectangle,
   * and covering a rectangle with an ellipse whose falloff releases from the rim
   * inward costs an enormous amount of surrounding frame: the measured
   * chapter-01 column, expressed as an ellipse, excluded 65% of the frame width
   * and emptied the right half of the valley.
   *
   * With `boxed`, distance is `max(|du|, |dv|)` — so the zone IS the block — and
   * `feather` is the fraction of the radius over which alpha is given back, so
   * the interior is cleared outright and the edge is still soft.
   */
  boxed?: boolean;
  /** Fraction of the radius used as the release rim. Requires `boxed`. */
  feather?: number;
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
  /**
   * A third station, reached during the descent. Optional, and absent on every
   * landscape layout — those keep the shared dive terms in `renderer.ts`, which
   * lower the eye and tip it up-frame so a band already sitting in the bottom
   * third rises to meet the water.
   *
   * A 390x844 frame cannot use those terms, because its band does not sit in the
   * bottom third: the phone camera is pitched hard up to place a thin strip of
   * blooms between the creature and the copy plate, which is the only gap a
   * portrait hero has. Lifting that strip further pushes it off the top of the
   * frame, and the capture of the crossing showed the result — the copy scrolled
   * away, the water had not arrived, and the whole lower half was flat page
   * grey with the meadow still up behind the type.
   *
   * So the phone gets a station instead of a nudge. Where `zonesStudy` re-frames
   * the same world for the anatomy chapter, this re-frames it once more for the
   * crossing: the pitch comes back to level, which walks the band down into the
   * half the copy has vacated, and `near` follows it in because the plane was
   * parked at 46 to skip everything that would have drawn behind the plate.
   *
   * It is reached well before the surface arrives and then held, so what the
   * visitor sees is a meadow that settles into the lower frame and is then taken
   * by the water, rather than two ramps moving at once.
   */
  descent?: {
    /** Eye height at the end of the sweep. */
    camH: number;
    /** Frame pitch at the end of the sweep. Level is 0. */
    pitch: number;
    /** Near plane at the end of the sweep. */
    near: number;
  };
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
  /** Optional authored drift used to close a specific foreground gap without
   * changing the density or rhythm of the whole valley. */
  foregroundFill?: {
    side: -1 | 1;
    count: number;
    depthFrom: number;
    depthSpan: number;
    offsetFrom: number;
    offsetSpan: number;
  };
  /** Ceiling on plant size, as a fraction of frame height. */
  maxHeight: number;
  /** Global alpha for the whole layer at full presence. */
  opacity: number;
  /** Pointer parallax and repulsion amplitude. */
  interaction: number;
  zones: Zone[];

  /*
   * The chapter-01 station.
   *
   * The valley does not end at the hero any more — the anatomy chapter is the
   * same bee in the same meadow, and cutting the world at the chapter boundary
   * was the single most obvious break in the story. But chapter 01 is a
   * different *picture*: the copy moves from the left half to a full column on
   * the right, the bee doubles in size and moves left, and three annotations
   * appear down the left edge. So the field keeps its world and changes its
   * framing — a higher, more steeply pitched camera drops the band into the
   * lower third where none of that lives, and a second exclusion set is
   * cross-faded in over the first as the chapter arrives.
   *
   * Both stations are interpolated continuously, so there is no boundary at
   * which anything switches.
   */
  camHStudy: number;
  pitchStudy: number;
  opacityStudy: number;
  zonesStudy: Zone[];
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
  /*
   * Unchanged, and a capture is why.
   *
   * These were briefly raised to 6.2 / 0.038 on the theory that a higher, more
   * pitched camera brings the near band into frame. It does the opposite. A
   * plant's base lands at `H/2 + (camH + 3.6) * f / d + sin(pitch) * f`, so both
   * terms push the *near* cut-off further out: at 5 / 0.0095 the closest plant
   * still inside the frame is about 29 units away, and at 6.2 / 0.038 it is 37 —
   * which trades away exactly the large foreground plants the field was short
   * of. The corridor under the copy is bought by lifting the copy and by the
   * exclusion zone below, not by re-aiming a camera that was already right.
   */
  camH: 5,
  pitch: 0.0095,
  fov: 34,
  near: 3.4,
  far: 106,
  /*
   * 34, up from 26.
   *
   * `foreground` is the depth under which a plant is allowed to cross the
   * creature. At 26 nothing qualified — the nearest plant the hero frame can
   * actually contain is about 29 units out — so the "foreground pass" the
   * layering depends on was empty and every plant was treated as background.
   * At 42 a real slice of the field qualifies and may clip the bee's periphery,
   * which is what makes the creature sit IN the valley rather than in front of a
   * flat picture of one. A capture at 34 still showed nothing crossing it.
   */
  foreground: 42,
  from: 344,
  /* Travel now spans two chapters rather than one, so the camera keeps moving
     through the anatomy chapter instead of parking at its end. */
  travel: 46,
  /*
   * 5.4, down from 6.6.
   *
   * Clearance is what holds the middle of the valley open, and it was set when
   * the copy sat low enough that the corridor had to be wide. With the copy
   * lifted (see `.hero-copy` in globals.css) the corridor's job is smaller, and
   * pulling the banks in is what lets the two foreground corners actually fill:
   * the plants that reach the bottom of the frame are the ones nearest the path.
   */
  clearance: 5.2,
  spread: 20,
  /*
   * 24, up from 13.6 — a 76% denser field.
   *
   * A 1920 capture of the old value showed about three hundred plants on screen
   * spread over the whole lower third, which reads as a scattering rather than a
   * meadow. The cost is bounded by the things that were already here and did not
   * change: the field is depth-sorted once and binary-searched per frame, so the
   * loop still only visits what is between the near and far planes, and the
   * quality tiers still thin it evenly by `stride` on a machine that cannot hold
   * the frame rate.
   */
  /*
   * 32, from the reference's 13.6 — the field is 2.35x denser.
   *
   * Density is the honest lever here and the only one that adds material.
   * Raising it is safe because none of the machinery that keeps this cheap
   * depends on the count: the field is depth-sorted once at build, two binary
   * searches bracket the visible slice every frame, and the quality tiers thin
   * whatever is left by `stride` rather than by cutting a band out of it.
   */
  density: 32,
  /* A foreground plant is allowed to be 38% of the frame tall. At 0.32 the
     nearest ones were being clamped to the same size as the midground, which is
     the ceiling that was flattening the field into one layer. */
  maxHeight: 0.38,
  /*
   * Fewer plants per drift, at a much higher density.
   *
   * These two move together on purpose. Raising density alone fattens each
   * existing clump and leaves the gaps between them exactly where they were,
   * which produces a lumpier field rather than a richer one. Cutting the drift
   * size at the same time scatters more, smaller clumps — which is what layers
   * the field into foreground, midground and distance instead of banding it.
   */
  perDrift: 9,
  driftZ: 8.5,
  driftSpan: 6.4,
  /* A near-left drift fills the exposed foreground under the copy. It travels
     out of frame before chapter 01, so the study composition stays untouched. */
  foregroundFill: {
    side: -1,
    count: 96,
    depthFrom: 22,
    depthSpan: 16,
    offsetFrom: 7.5,
    offsetSpan: 11,
  },
  opacity: 0.96,
  interaction: 0.62,
  camHStudy: 7.6,
  pitchStudy: 0.062,
  opacityStudy: 0.92,
  zones: [
    /*
     * Headline, lede, CTA — and now the whole copy column, strongly.
     *
     * It used to be a light touch at `v: 0.605` on the argument that the flower
     * line sat below the last line of type. That was true of a sparse field and
     * a copy block that ended near the bottom of the frame; it is true of
     * neither now. The copy has moved up and the field has nearly doubled, so
     * this is the corridor that keeps the two apart, and it is authored to leave
     * roughly a tenth of the frame height clear under the CTA before the falloff
     * even starts giving alpha back.
     */
    /*
     * Sized against a measurement, not against a look.
     *
     * `qa/gap.mjs` reads the flower layer's own alpha and reports how many CSS
     * pixels sit between the bottom of the CTA row and the first plant above a
     * visibility threshold. At rv 0.28 that number was 27px on a 1920 frame and
     * zero on 1536 and 1440 — the two short-and-wide desktops where the copy sits
     * lowest relative to the band. This ellipse reaches to v = 0.79, which puts
     * the released edge of the falloff below the CTA on every desktop class.
     */
    { u: 0.17, v: 0.46, ru: 0.36, rv: 0.33, strength: 0.96, role: 'copy' },
    /* The bee. Head, thorax and abdomen, generously — everything except the
       wing tips and the trailing legs, which foreground plants may cross. */
    { u: 0.625, v: 0.5, ru: 0.155, rv: 0.24, strength: 0.94, farOnly: true, role: 'subject' },
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
    /* Weaker and shallower than it was: the corridor's other job — keeping the
       band off the CTA — now belongs to the copy zone above and to `--hero-lift`,
       so all this still has to do is stop the bottom edge closing into a hedge
       under the creature. */
    { u: 0.5, v: 1.06, ru: 0.16, rv: 0.24, strength: 0.5 },
  ],
  /*
   * Chapter 01. Copy is a full column on the right, the bee owns the left half,
   * and three annotations run down the far left edge.
   */
  zonesStudy: [
    /* The copy column, twelfths 7–12. */
    { u: 0.79, v: 0.5, ru: 0.28, rv: 0.46, strength: 0.94, role: 'copy' },
    /* The bee, which at this station fills most of the left half. Far-only, so
       a foreground grass at the frame edge may still cross a trailing leg —
       which is the whole reason the chapter reads as the same world. */
    { u: 0.3, v: 0.48, ru: 0.2, rv: 0.32, strength: 0.9, farOnly: true, role: 'subject' },
    /* The three annotation labels. */
    { u: 0.1, v: 0.5, ru: 0.15, rv: 0.46, strength: 0.5 },
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
  foreground: 38,
  travel: 40,
  clearance: 4.7,
  spread: 18,
  density: 29,
  maxHeight: 0.35,
  perDrift: 9,
  driftZ: 8,
  driftSpan: 6,
  camHStudy: 9.2,
  pitchStudy: 0.072,
  opacityStudy: 0.9,
  zones: [
    { u: 0.18, v: 0.5, ru: 0.35, rv: 0.33, strength: 0.96, role: 'copy' },
    { u: 0.625, v: 0.51, ru: 0.16, rv: 0.25, strength: 0.94, farOnly: true, role: 'subject' },
    { u: 0.5, v: 1.06, ru: 0.17, rv: 0.26, strength: 0.5 },
  ],
  zonesStudy: [
    { u: 0.78, v: 0.5, ru: 0.29, rv: 0.47, strength: 0.94, role: 'copy' },
    { u: 0.3, v: 0.48, ru: 0.21, rv: 0.33, strength: 0.9, farOnly: true, role: 'subject' },
    { u: 0.1, v: 0.5, ru: 0.16, rv: 0.46, strength: 0.5 },
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
  foregroundFill: undefined,
  camH: 5.4,
  pitch: 0.006,
  fov: 36,
  near: 5.2,
  far: 92,
  foreground: 22,
  travel: 34,
  clearance: 5.8,
  spread: 16,
  density: 25,
  maxHeight: 0.3,
  perDrift: 9,
  driftZ: 7.4,
  driftSpan: 5.6,
  opacity: 0.94,
  interaction: 0.5,
  camHStudy: 7.4,
  pitchStudy: 0.044,
  opacityStudy: 0.88,
  zonesStudy: [
    { u: 0.76, v: 0.5, ru: 0.3, rv: 0.44, strength: 0.94, role: 'copy' },
    { u: 0.3, v: 0.48, ru: 0.24, rv: 0.34, strength: 0.9, farOnly: true, role: 'subject' },
  ],
  zones: [
    { u: 0.24, v: 0.55, ru: 0.32, rv: 0.26, strength: 0.88, role: 'copy' },
    { u: 0.6, v: 0.5, ru: 0.19, rv: 0.26, strength: 0.94, farOnly: true, role: 'subject' },
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
  travel: 27,
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
  clearance: 4.0,
  spread: 11.5,
  density: 21,
  maxHeight: 0.19,
  perDrift: 7,
  driftZ: 6.6,
  driftSpan: 5,
  opacity: 0.92,
  interaction: 0.4,
  /* One column, so the chapter frame differs from the hero only in that the copy
     plate is taller and the creature has moved. The band just goes down. */
  camHStudy: 6.2,
  pitchStudy: -0.03,
  opacityStudy: 0.88,
  zones: [
    /* The creature, which owns the middle of this frame outright. */
    { u: 0.47, v: 0.3, ru: 0.3, rv: 0.14, strength: 0.7 },
  ],
  zonesStudy: [
    { u: 0.47, v: 0.3, ru: 0.32, rv: 0.16, strength: 0.72 },
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
  travel: 21,
  /* 390 px of width is a horizontal half-angle of ten degrees. See COMPACT. */
  clearance: 3.2,
  spread: 9.5,
  /*
   * The densest tier on the page, for the thinnest band on the page.
   *
   * A 390x844 capture shows about sixty pixels of visible strip between the
   * creature's trailing legs and the top of the copy plate, and at that distance
   * a plant is forty pixels tall — so the only lever that adds material here is
   * count. Everything else about this layout is already at its geometric limit;
   * pulling the near plane in would only plant flowers behind the plate.
   */
  density: 31,
  maxHeight: 0.13,
  perDrift: 6,
  driftZ: 5.8,
  driftSpan: 4.4,
  opacity: 1,
  interaction: 0.26,
  camHStudy: 5.4,
  pitchStudy: -0.244,
  opacityStudy: 0.84,
  /*
   * Every number here is read off the projection rather than chosen by eye.
   *
   * A plant's base lands at `0.5 + sin(pitch) * f/H + (camH + 3.6) * f/(d * H)`
   * of the frame, and on this viewport `f/H` is 1.237. Level pitch therefore
   * puts the far end of the band at 60% down and 25 units out at 88%, which is
   * the lower third the copy has just left — where the phone's crossing frame
   * was empty.
   *
   * `camH: 4.8` is the eye dropping about half a metre through the sweep, which
   * is the only part of "sinking" this frame can express geometrically; the rest
   * is the water climbing over the result.
   *
   * `near: 21` is a floor, not a preference. The field is planted 3.2 to 9.5
   * units either side of the path and the horizontal half-angle here is 10.6
   * degrees, so nothing closer than about 17 units is inside the picture at any
   * height — pulling the plane in past that would cost projection work for
   * plants that are all off the sides of the frame.
   */
  descent: { camH: 4.8, pitch: 0, near: 21 },
  zones: [
    /* The bee, and nothing else — the copy is already on its own ivory plate. */
    { u: 0.5, v: 0.24, ru: 0.34, rv: 0.11, strength: 0.72 },
  ],
  zonesStudy: [
    { u: 0.5, v: 0.26, ru: 0.36, rv: 0.13, strength: 0.74 },
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
