import * as THREE from 'three';
import { OCEAN_CAMERA, oceanFrameHalfHeight, oceanFramePoint } from './camera';

/**
 * Where each educational subject is allowed to exist, and what the reef must
 * give up so that it can.
 *
 * The reef is Blue Marine's own instance layout — 45 rocks and 149 corals with
 * real transforms — and it was composed for a scene with nothing in the
 * foreground. Dropping a fish into it at five units put the animal inside a
 * boulder, and the jellyfish's tentacles through another; both are visible in
 * the annotated captures. Moving the subject until it happens to miss is not a
 * fix, because it is only true for one pose of an animated model at one aspect
 * ratio.
 *
 * So each subject declares a VOLUME rather than a point:
 *
 *   - an ellipsoid in world space, sized from the model's own normalised bounds
 *     plus a margin, centred on the mark;
 *   - a floor, because the seabed is at y = -1.48 and a subject whose lower half
 *     is below that is buried in sand no matter what the reef does.
 *
 * Reef instances that intersect the volume are not drawn. That is a data-level
 * edit to a data-level layout, it happens once at build, and it costs one sphere
 * test per instance — as opposed to moving the camera, which would break the
 * approved frame, or nudging the animal, which would break again the next time
 * anything moved.
 */

export type SubjectStage = {
  /** Camera-local placement: right, up, and forward distance. */
  x: number;
  y: number;
  distance: number;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Longest-axis size of the normalised model, before `scale`. */
  span: number;
  /** Model height as a fraction of `span`, for the seabed check. */
  aspect: number;
  /** Extra world units of clearance demanded around the model. */
  margin: number;
  /**
   * True when the subject is transmissive.
   *
   * An opaque animal HIDES whatever is behind it, so reef behind it is free
   * depth. A jellyfish does not: it refracts, so a boulder two units behind the
   * bell is visible straight through the animal and reads as clutter inside it.
   * The view test uses this to decide how much of the water behind the subject
   * also has to be clear.
   */
  seeThrough?: boolean;
};

/** The seabed sits at -1.48 plus a little noise; keep well clear of it. */
export const SEABED_Y = -1.48;
const SEABED_CLEARANCE = 0.3;

/**
 * The fish reads across the frame, so its volume is wide and shallow; the
 * jellyfish reads down it, so its volume is narrow and tall. Giving them the
 * same anchor — which the first pass did — is what put a vertical animal into
 * the floor while a horizontal one fitted.
 */
export const SUBJECT_STAGES: Record<'fish' | 'jelly', SubjectStage> = {
  fish: {
    distance: 5.4,
    x: -1.6,
    y: 0.52,
    scale: 1.34,
    yaw: 2.62,
    pitch: 0.05,
    roll: -0.02,
    span: 3.15,
    aspect: 0.62,
    margin: 0.85,
  },
  jelly: {
    distance: 5.9,
    x: 1.62,
    y: 0.72,
    /*
     * Smaller than the fish's, and that is a consequence rather than a taste.
     *
     * The bell must stay inside the frame while the tentacles stay above the
     * sand, and those two pull in opposite directions on a model whose height IS
     * its longest axis. At 1.28 there was no value of `y` that satisfied both.
     */
    scale: 1.02,
    yaw: 0.24,
    pitch: -0.04,
    roll: -0.04,
    span: 3.42,
    aspect: 1,
    margin: 0.95,
    seeThrough: true,
  },
};

/**
 * Where each subject sits in the PICTURE, rather than in the world.
 *
 * The marks above are world coordinates, and world coordinates only compose one
 * frame. The desktop captures are what settled this: at 16:9 the fish was
 * running off the left edge of the picture while the same numbers at 390x844
 * produced a well-centred animal, because a fixed world offset is a different
 * fraction of the frame at every aspect ratio and a fixed world size is a
 * different fraction again.
 *
 * So the composition is authored as fractions of the frame at the subject's own
 * depth, and the world numbers are derived from them. `width` and `height` are
 * ceilings — the model takes whichever binds — so a wide animal cannot run off
 * the sides of a narrow frame and a tall one cannot run off the top of a short
 * one. `cx`/`cy` are the model's centre, with 0 at the middle of the frame and
 * ±0.5 at its edges.
 *
 * Two sets, because portrait is a different picture and not a squeezed copy of
 * the landscape one: with the copy underneath rather than beside the animal, the
 * subject belongs on the centre line and higher up.
 */
export type SubjectFraming = {
  /** Longest model axis, as a fraction of frame width. */
  width: number;
  /** Model height, as a fraction of frame height. */
  height: number;
  /** Model centre, in fractions of the whole frame. */
  cx: number;
  cy: number;
};

export const SUBJECT_FRAMING: Record<'fish' | 'jelly', { wide: SubjectFraming; tall: SubjectFraming }> = {
  /*
   * The fish reads along the frame, so width binds and the copy column decides
   * the offset: chapter 02 puts type in twelfths 7-12, so the animal is centred
   * a fifth of the frame left of middle and given a little under half the width.
   * That leaves a clear third of picture between the tail and the first line of
   * type at every landscape aspect, which is what the annotated capture asked
   * for and what a fixed world offset could not hold.
   */
  fish: {
    wide: { width: 0.44, height: 0.42, cx: -0.175, cy: 0.055 },
    /*
     * `cx` is not zero on a centred composition, and the model is why.
     *
     * The fish is yawed 150 degrees on its mark, so its bounding box sits about
     * four tenths of a world unit right of the node that carries it. On a
     * landscape frame six and a half units wide that is six per cent and
     * invisible; on a 390x844 frame two and a half units wide it is sixteen, and
     * the measured box ran off the right edge. The correction is expressed here
     * rather than hidden in the placement code because it is a property of this
     * pose of this asset.
     */
    tall: { width: 0.7, height: 0.28, cx: -0.135, cy: 0.2 },
  },
  /*
   * The jellyfish reads DOWN the frame, so height binds. It gets more of the
   * frame's height than the fish gets of its width — a bell with no tentacles
   * under it is not the subject the chapter is about — and it sits right of
   * centre because chapter 03 puts its copy in twelfths 1-5.
   */
  jelly: {
    wide: { width: 0.34, height: 0.66, cx: 0.2, cy: 0.11 },
    tall: { width: 0.72, height: 0.5, cx: 0.02, cy: 0.17 },
  },
};

/** The aspect below which the portrait composition takes over. */
export const PORTRAIT_ASPECT = 1;

export type SubjectPlacement = { scale: number; x: number; y: number };

/**
 * The world placement a subject needs to hit its authored fraction of the frame.
 *
 * The seabed clamp is applied here rather than by the caller, because it is the
 * one constraint that can override the composition: a jellyfish whose tentacles
 * are authored to reach 44% down the frame still has to stop above the sand, and
 * on a short frame those two disagree.
 */
export function frameSubject(
  key: 'fish' | 'jelly',
  aspect: number,
  fov: number,
): SubjectPlacement {
  const stage = SUBJECT_STAGES[key];
  const framing = SUBJECT_FRAMING[key][aspect >= PORTRAIT_ASPECT ? 'wide' : 'tall'];
  const frameH = 2 * oceanFrameHalfHeight(stage.distance, fov);
  const frameW = frameH * aspect;
  const scale = Math.min(
    (frameW * framing.width) / stage.span,
    (frameH * framing.height) / (stage.span * stage.aspect),
  );
  const x = framing.cx * frameW;
  const y = framing.cy * frameH;
  const height = stage.span * scale * stage.aspect;
  const probe = oceanFramePoint(stage.distance, x, y);
  const bottom = probe.y - height / 2;
  const wanted = SEABED_Y + SEABED_CLEARANCE;
  return { scale, x, y: bottom >= wanted ? y : y + (wanted - bottom) };
}

export type Clearance = {
  centre: THREE.Vector3;
  /** Ellipsoid radii. */
  radii: THREE.Vector3;
  /** How far past the subject the water must also stay clear, in radii. */
  behind: number;
};

/** World-space centre of a subject's mark. */
export function stageCentre(stage: SubjectStage, out = new THREE.Vector3()) {
  return oceanFramePoint(stage.distance, stage.x, stage.y, out);
}

/**
 * The volume the reef must leave empty.
 *
 * Half-extents come from the model's own normalised span: `span * scale` is the
 * longest axis and `aspect` turns that into a height, so a re-exported asset or
 * a re-scaled mark carries its clearance with it instead of needing a second
 * hand-tuned number somewhere else.
 */
export function stageClearance(stage: SubjectStage): Clearance {
  const length = stage.span * stage.scale;
  const height = length * stage.aspect;
  /*
   * `0.72` of the longest axis, not all of it.
   *
   * `span` normalises the LONGEST dimension, and for the fish that is its
   * length — but the animal is about a quarter as thick as it is long, so a
   * clearance sphere built from the full span reaches almost three units behind
   * the fish and deletes the reef bank it is supposed to be swimming in front
   * of. A capture with the full span removed 64 of 194 instances and left a bare
   * sand plain. The horizontal radius is therefore the silhouette's radius, not
   * the model's longest reach.
   */
  const half = (length / 2) * 0.72 + stage.margin;
  const halfY = height / 2 + stage.margin;
  return {
    centre: stageCentre(stage),
    radii: new THREE.Vector3(half, halfY, half),
    /* An opaque subject only needs its own footprint clear; a transmissive one
       needs the water immediately behind it clear too, or the reef is visible
       inside it. 1.1 radii, not 2.4 — at 2.4 the cull reached 110 instances of
       194 and hollowed the reef out into a scatter. */
    behind: stage.seeThrough ? 1.1 : 0.35,
  };
}

/**
 * Does a reef instance collide with a subject, from the approved camera?
 *
 * The first two attempts at this used a plain sphere overlap, and both removed
 * far too much reef — 64 instances of 194, which left the fish floating over a
 * bare sand plain. The mistake was treating every nearby rock as a problem. It
 * is not: the camera is a constant, so a rock BEHIND the subject is simply
 * occluded by it, and deleting it costs the frame a reef bank and buys nothing.
 *
 * What actually reads as a collision is a rock that overlaps the subject in view
 * and is not behind it. So the test is a view cone from the approved eye:
 *
 *   - anything wholly further away than the subject's far edge is kept, whatever
 *     its size;
 *   - anything else is dropped only if its angular disc overlaps the subject's.
 *
 * Plus a short-range proximity check, so a rock that genuinely interpenetrates
 * the model goes even when the angular test is marginal.
 */
const eyeToInstance = new THREE.Vector3();
const eyeToSubject = new THREE.Vector3();
/** Dev-only tally, so the cull can be tuned against a number. */
export const reasons = { physical: 0, view: 0 };

export function intersectsClearance(
  position: THREE.Vector3,
  radius: number,
  clearances: Clearance[],
) {
  for (const clearance of clearances) {
    /* The subject's bounding radius, from the largest axis of its ellipsoid. */
    const subjectRadius = Math.max(clearance.radii.x, clearance.radii.y, clearance.radii.z);
    eyeToInstance.copy(position).sub(OCEAN_CAMERA.position);
    eyeToSubject.copy(clearance.centre).sub(OCEAN_CAMERA.position);
    const di = eyeToInstance.length();
    const ds = eyeToSubject.length();
    if (di < 1e-4 || ds < 1e-4) continue;

    /*
     * Centre inside the subject's volume — always a collision.
     *
     * Deliberately does NOT grow the ellipsoid by the instance's own bounding
     * radius. A boulder's bounding sphere is several units across and mostly
     * empty water, so adding it turned this into a five-unit exclusion that
     * removed a third of the reef on its own. Overlap that is not a centre-hit
     * is handled by the view test below, where occlusion can be taken into
     * account.
     */
    const dx = (position.x - clearance.centre.x) / clearance.radii.x;
    const dy = (position.y - clearance.centre.y) / clearance.radii.y;
    const dz = (position.z - clearance.centre.z) / clearance.radii.z;
    if (dx * dx + dy * dy + dz * dz <= 1) { reasons.physical += 1; return true; }

    /*
     * Behind the subject's centre: occluded, and therefore harmless.
     *
     * "Wholly behind" — clear of the subject's far edge AND its own radius — was
     * too strict to be useful. The subject is large and close, so it subtends
     * more than fifty degrees; requiring a rock to clear all of that removed the
     * entire near reef bank, which is the thing framing the shot. The animal is
     * opaque, so a rock whose centre is past it is hidden by it whether or not
     * its bounding sphere technically overlaps.
     */
    if (di > ds + subjectRadius * clearance.behind) continue;

    const cos = eyeToInstance.dot(eyeToSubject) / (di * ds);
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
    const angleInstance = Math.asin(Math.min(1, radius / di));
    const angleSubject = Math.asin(Math.min(1, subjectRadius / ds));
    if (angle < angleInstance + angleSubject) { reasons.view += 1; return true; }
  }
  return false;
}

/**
 * How far a subject's mark must be raised so the model clears the seabed.
 *
 * Returns the corrected camera-local `y`. The approved camera is very slightly
 * tilted, so this uses the real basis rather than assuming world-up equals
 * camera-up — a half-degree of pitch is a couple of centimetres of error at this
 * distance, which is exactly the margin between "floating" and "buried".
 */
export function seabedSafeY(stage: SubjectStage) {
  const probe = oceanFramePoint(stage.distance, stage.x, stage.y);
  const height = stage.span * stage.scale * stage.aspect;
  const bottom = probe.y - height / 2;
  const wanted = SEABED_Y + SEABED_CLEARANCE;
  if (bottom >= wanted) return stage.y;
  return stage.y + (wanted - bottom);
}

/** Does the model fit inside the approved frame at its mark? */
export function fitsFrame(stage: SubjectStage) {
  const half = oceanFrameHalfHeight(stage.distance);
  const height = stage.span * stage.scale * stage.aspect;
  return Math.abs(stage.y) + height / 2 <= half;
}

export const OCEAN_EYE = OCEAN_CAMERA.position;
