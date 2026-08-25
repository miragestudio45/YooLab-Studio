import * as THREE from 'three';

/**
 * The approved underwater camera.
 *
 * These six numbers and the field of view were tuned by hand in the Blue Marine
 * camera-tuner build (`reference-sources/BlueMarine`, v3.2 — press `C` to copy
 * position/target/FOV) and signed off as the final ocean composition. They are
 * constants, not defaults: chapters 02 and 03 share this exact frame, and
 * nothing in the render loop is allowed to orbit, pan, dolly or re-fov it once
 * the dive has landed.
 *
 * `OCEAN_CAMERA_LOCK_AT` is the point on the dive where the approach finishes.
 * Above it the pose is bit-for-bit the values below; below it the descent eases
 * in from a slightly higher, further-back station so the camera *arrives* rather
 * than cutting. The ease is a pure function of the dive, so scrolling back up
 * walks the same approach in reverse.
 */
export const OCEAN_CAMERA = {
  position: new THREE.Vector3(0.8529, -0.1144, -7.8725),
  /*
   * Aimed 6 degrees above level, and the seabed is the reason.
   *
   * The eye sits 1.37 units above a sand plain that runs to the horizon. Level,
   * the bottom of the frame is sand less than four units away — so the floor
   * takes the bottom two fifths of every ocean frame, at the highest value in
   * the picture, and the chapter reads as a wide flat band of sand under a wide
   * flat band of rock. That is the "squat" the annotated captures are pointing
   * at, and no amount of grading fixes it while the geometry is that close to
   * the lens.
   *
   * Six degrees up moves the near sand edge from 3.8 units to about 6.6, which
   * halves the floor's share of the frame and hands the difference to open
   * water. The subjects do not move with it — every mark is camera-local, so
   * they are carried by the same rotation — and the reef bank drops to where a
   * reef bank belongs, below the animal rather than behind it.
   */
  target: new THREE.Vector3(0, 0.72, -15.8),
  /**
   * The VERTICAL field of view at the reference 16:9 frame. Live frames derive
   * theirs from `oceanFovFor`; this is what that function returns at 16:9 and
   * what every mark in `stage.ts` is composed against.
   */
  fov: 38,
} as const;

/**
 * The lens, and why it is specified horizontally.
 *
 * The chapter was framed with a fixed 54 degree vertical field, which on a phone
 * is a 26 degree horizontal one and on a 16:9 desktop is an 84 degree one — a
 * 12mm-equivalent ultra-wide. That is the whole of the "everything looks flat
 * and stretched" defect in the desktop captures: at 84 degrees the frame edges
 * are smeared horizontally, so the reef bank fans into a wide low band, the
 * seabed opens out across the bottom of the picture, and the fish — which sits
 * a third of the way out from centre — is drawn stretched and cropped. The same
 * scene at portrait had none of it, because the narrow aspect was hiding the
 * lens behind a 26 degree crop.
 *
 * Fixing the HORIZONTAL angle instead makes the lens a property of the picture
 * rather than of the window: 63 degrees is a 33mm-equivalent, which is the range
 * an underwater documentary actually uses for a subject at five metres, and it
 * is within a couple of degrees of what the reference capture in
 * `reference-audit/har/peachweb.io.har` uses for the same job (a 40 degree
 * vertical field on a landscape frame).
 *
 * The vertical field is then clamped, because the same horizontal angle on a
 * 390x844 frame would ask for 105 degrees vertically. Portrait keeps the wide
 * vertical field it always had and simply stops inheriting the desktop's
 * distortion.
 */
export const OCEAN_HFOV = 63;
export const OCEAN_FOV_MIN = 34;
export const OCEAN_FOV_MAX = 56;

const DEG = 180 / Math.PI;

export function oceanFovFor(aspect: number) {
  const half = Math.tan((OCEAN_HFOV * Math.PI) / 360);
  const vertical = 2 * Math.atan(half / Math.max(0.2, aspect)) * DEG;
  return Math.min(OCEAN_FOV_MAX, Math.max(OCEAN_FOV_MIN, vertical));
}

/** Dive value at which the camera is exactly `OCEAN_CAMERA` and stays there. */
export const OCEAN_CAMERA_LOCK_AT = 0.8;

/** Where the descent starts from, as an offset added to the approved station. */
/*
 * Small, and aimed UP rather than down.
 *
 * Two captures set these. A large offset (1.62 up, 2.05 back) made the descent
 * more legible in the abstract and worse in the frame: from that station the
 * camera looks down at the seabed, so the first half of the crossing was a pale
 * expanse of sand. Levelling it out did not fix it either, because mid-crossing
 * the water surface is halfway up the frame and the only ocean visible is the
 * BOTTOM of the ocean frame — which is, by construction, the seabed.
 *
 * So the approach aims high and settles down onto the mark. The eye enters the
 * water looking out into the water column, and the reef floor comes up into the
 * frame as the shot arrives, which is both what descending looks like and the
 * only version of it in which the first underwater frames are blue.
 */
export const OCEAN_CAMERA_APPROACH = {
  position: new THREE.Vector3(0, 0.34, 1.15),
  /*
   * 0.35, down from 1.24, because the mark itself now aims up.
   *
   * The offset exists so the eye enters the water looking out into the column
   * rather than down at the sand, and it was sized against a target that sat
   * fractionally BELOW level. With the settled aim raised to +0.72 the old
   * offset stacked on top of it and had the descent looking at open blue with
   * no reef in it at all. 0.35 restores the same absolute approach aim the
   * crossing was tuned with.
   */
  target: new THREE.Vector3(0, 0.35, 0),
} as const;

export function createOceanCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(oceanFovFor(aspect), aspect, 0.05, 320);
  camera.position.copy(OCEAN_CAMERA.position);
  camera.lookAt(OCEAN_CAMERA.target);
  camera.updateProjectionMatrix();
  return camera;
}

const approachPosition = new THREE.Vector3();
const approachTarget = new THREE.Vector3();

/**
 * Places the ocean camera for a given dive.
 *
 * Written so the locked case is not "the ease happens to be zero" but an
 * explicit early return that copies the constants: a rounding error in a
 * smoothstep must never be able to move an approved frame.
 */
export function placeOceanCamera(camera: THREE.PerspectiveCamera, dive: number) {
  const fov = oceanFovFor(camera.aspect);
  if (Math.abs(camera.fov - fov) > 1e-4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  if (dive >= OCEAN_CAMERA_LOCK_AT) {
    camera.position.copy(OCEAN_CAMERA.position);
    camera.lookAt(OCEAN_CAMERA.target);
    return;
  }
  const t = Math.min(1, Math.max(0, (dive - 0.16) / (OCEAN_CAMERA_LOCK_AT - 0.16)));
  const ease = 1 - t * t * (3 - 2 * t);
  approachPosition.copy(OCEAN_CAMERA.position).addScaledVector(OCEAN_CAMERA_APPROACH.position, ease);
  approachTarget.copy(OCEAN_CAMERA.target).addScaledVector(OCEAN_CAMERA_APPROACH.target, ease);
  camera.position.copy(approachPosition);
  camera.lookAt(approachTarget);
}

/* ---------------------------------------------------------- framing helpers --- */

/**
 * The approved camera's basis, precomputed.
 *
 * Subject marks are expressed against this rather than against the live camera
 * on purpose: during the descent the live camera is still easing in, and a mark
 * derived from it would slide the fish around while the frame settles. The marks
 * belong to the *approved* composition, which is a constant.
 */
const FORWARD = OCEAN_CAMERA.target.clone().sub(OCEAN_CAMERA.position).normalize();
const RIGHT = FORWARD.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
const UP = RIGHT.clone().cross(FORWARD).normalize();

export const OCEAN_BASIS = { forward: FORWARD, right: RIGHT, up: UP } as const;

/**
 * A world point `distance` in front of the approved camera, offset by `sx` right
 * and `sy` up in that camera's own plane. Both offsets are in world units, so a
 * mark reads the same on any aspect ratio; the frame is `2 * distance *
 * tan(fov/2)` tall, which is what the callers size against.
 */
export function oceanFramePoint(distance: number, sx: number, sy: number, out = new THREE.Vector3()) {
  return out
    .copy(OCEAN_CAMERA.position)
    .addScaledVector(FORWARD, distance)
    .addScaledVector(RIGHT, sx)
    .addScaledVector(UP, sy);
}

/**
 * Half-height of the frame at `distance`, in world units.
 *
 * `fov` defaults to the 16:9 reference field so callers that are describing the
 * composition rather than a live frame keep reading the number the marks were
 * authored against; anything measuring what is actually on screen — the subject
 * fit, the megafauna crowding test — passes the live camera's own.
 */
export function oceanFrameHalfHeight(distance: number, fov: number = OCEAN_CAMERA.fov) {
  return distance * Math.tan((fov * Math.PI) / 360);
}
