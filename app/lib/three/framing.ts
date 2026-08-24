import * as THREE from 'three';

/**
 * Camera framing and orbit for the Library's specimen viewers.
 *
 * The old viewer fitted the subject's *bounding sphere* to the *vertical* field
 * of view:
 *
 *     distance = radius / tan(fov / 2) * zoom
 *
 * That is wrong in two ways at once for a long, thin, horizontal subject. The
 * sphere radius is half the wingspan, so a bee fitted on the vertical axis threw
 * away most of the frame — it occupied about a third of the viewer's width and a
 * fifth of its height, floating in emptiness. And because only the vertical axis
 * was consulted, a *wider* viewport made the subject relatively *smaller*, which
 * is the opposite of what a resize should do.
 *
 * The fit below projects the eight corners of the world-space bounding box onto
 * the camera basis and solves both axes, taking whichever distance is larger so
 * nothing is cropped. `fill` is then a real quantity — the fraction of the frame
 * the subject spans — and it means the same thing on a 340px phone panel as on a
 * 1000px desktop one. That is also why the fit has to be re-run on every resize
 * rather than baked once at load: see `createSubjectFit`.
 */

export type FitResult = {
  distance: number;
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  /**
   * Clip planes for this subject.
   *
   * The stage camera is built once with a fixed 0.05 / 200, and the Library's
   * models arrive in whatever units their author used — a bee normalised to
   * three units and a bacterial cell wall whose raw mesh is hundreds across sit
   * in the same viewer. The wall's fitted distance ran past the far plane and
   * the panel rendered nothing at all: no error, no loading block, an empty
   * viewer beside a knowledge panel full of text about it. Carrying the planes
   * with the fit means a subject of any size is simply in frame.
   */
  near: number;
  far: number;
};

export type FitOptions = {
  /** Camera azimuth in radians. */
  yaw: number;
  /** Camera elevation in radians. */
  pitch: number;
  /** Fraction of the frame the subject should span, 0–1. */
  fill?: number;
  /** Vertical aim as a fraction of the box height, 0 = bottom, 1 = top. */
  targetY?: number;
};

/** Default frame occupancy. Leaves a hair of air on the tighter axis. */
const DEFAULT_FILL = 0.82;

/** Zoom clamps, as multiples of the fitted distance. */
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 2.6;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * The direction from the aim point to the camera, for a yaw/pitch pair. Matches
 * the orbit rig below, so a fit and the camera it is fitting for cannot drift
 * apart.
 */
export function orbitDirection(yaw: number, pitch: number, out = new THREE.Vector3()) {
  return out.set(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).normalize();
}

export function subjectBox(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

export function fitBox(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  options: FitOptions,
): FitResult {
  const centre = box.getCenter(new THREE.Vector3());
  const target = centre.clone();
  if (options.targetY !== undefined) {
    target.y = box.min.y + (box.max.y - box.min.y) * options.targetY;
  }

  // Camera basis, built the way three's own lookAt does: z points back along the
  // view direction, x is right, y is the corrected up.
  const back = orbitDirection(options.yaw, options.pitch);
  const right = new THREE.Vector3().crossVectors(WORLD_UP, back);
  // Straight up or straight down leaves the cross product undefined. The orbit
  // rig clamps pitch well short of that, but a manifest can ask for anything.
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(back, right).normalize();

  const fill = THREE.MathUtils.clamp(options.fill ?? DEFAULT_FILL, 0.2, 1);
  const halfV = THREE.MathUtils.degToRad(camera.fov) * 0.5;
  const halfH = Math.atan(Math.tan(halfV) * Math.max(camera.aspect, 1e-3));
  const spanH = Math.tan(halfH) * fill;
  const spanV = Math.tan(halfV) * fill;

  /*
   * Perspective-exact, corner by corner.
   *
   * Two earlier versions of this got it wrong in opposite directions, and both
   * failures came from treating the subject as flat.
   *
   * The first solved the silhouette at the *target's* depth and then added the
   * half-depth to the distance as a fudge. For a roughly cubic subject the depth
   * is the same order as the height, so that pushed the camera about 30% too far
   * back: a cell authored at `fill: 0.96` actually spanned 0.6 of the frame, and
   * every specimen in the Library was a third smaller than its manifest claimed.
   * Dropping the fudge fixed the cell and immediately cropped the muscle fibre —
   * a 9.4 × 2.4 subject seen at 40°, whose near end sits four units closer to the
   * camera than its centre and therefore projects far wider than a flat fit
   * predicts.
   *
   * There is no need to choose. A corner at camera-space offset (u, v, w) — u
   * along the frame's right, v along its up, w back towards the camera — is
   * `d − w` in front of the lens when the camera is at distance d, so the frame
   * is `(d − w)·tan(half-angle)` wide there. Requiring |u| to fit inside `fill`
   * of that width solves for d directly:
   *
   *     d ≥ w + |u| / (fill · tan halfH)
   *
   * and likewise for v. The largest requirement across the eight corners is the
   * answer: exact, closed-form, and it means `fill` is finally the fraction of
   * the frame the subject really spans, on both axes and at any depth.
   */
  const corner = new THREE.Vector3();

  /*
   * Clamp the aim so it cannot quietly shrink the subject.
   *
   * `targetY` moves the point the camera looks at; the frame stays symmetric
   * about it, so an aim 20% above the centre of a 3.6-unit subject makes the
   * *farthest* corner 2.52 units away instead of 1.8, and the corner solve below
   * — which exists precisely to crop nothing — obediently backs the camera off
   * by 40%. That is how the jellyfish ended up spanning 0.45 of the viewer while
   * its manifest asked for 0.78: two fields that both look like framing knobs
   * were silently multiplying.
   *
   * `fill` is the promise, so it wins. The slack a fill of f leaves on a
   * half-extent h is h·(1/f − 1) — the margin between the subject's edge and the
   * frame's — and the aim may use all of it and no more. Below the clamp
   * `targetY` behaves exactly as authored; above it, it saturates instead of
   * eating the subject. Depth is not clamped: moving the aim along the view axis
   * cannot push anything out of frame.
   */
  let spreadU = 0;
  let spreadV = 0;
  for (let index = 0; index < 8; index += 1) {
    corner.set(
      index & 1 ? box.max.x : box.min.x,
      index & 2 ? box.max.y : box.min.y,
      index & 4 ? box.max.z : box.min.z,
    ).sub(centre);
    spreadU = Math.max(spreadU, Math.abs(corner.dot(right)));
    spreadV = Math.max(spreadV, Math.abs(corner.dot(up)));
  }
  const slack = 1 / fill - 1;
  const aim = target.clone().sub(centre);
  target.copy(centre)
    .addScaledVector(right, THREE.MathUtils.clamp(aim.dot(right), -spreadU * slack, spreadU * slack))
    .addScaledVector(up, THREE.MathUtils.clamp(aim.dot(up), -spreadV * slack, spreadV * slack))
    .addScaledVector(back, aim.dot(back));

  let halfDepth = 0;
  let distance = 0;
  for (let index = 0; index < 8; index += 1) {
    corner.set(
      index & 1 ? box.max.x : box.min.x,
      index & 2 ? box.max.y : box.min.y,
      index & 4 ? box.max.z : box.min.z,
    ).sub(target);
    const u = Math.abs(corner.dot(right));
    const v = Math.abs(corner.dot(up));
    const w = corner.dot(back);
    halfDepth = Math.max(halfDepth, Math.abs(w));
    distance = Math.max(distance, w + u / spanH, w + v / spanV);
  }
  // Floor: never inside the subject, never through the near plane. With the
  // corner solution above this practically never binds — it is here so a
  // degenerate box (a single plane, a zero-size subject) cannot produce a
  // camera at the origin.
  distance = Math.max(distance, halfDepth * 1.08 + camera.near * 4);

  // Generous both ways: the visitor can zoom to MIN_ZOOM of this distance and
  // orbit to any angle, so the planes have to hold for the whole reachable
  // range rather than for this one shot.
  const reach = Math.max(halfDepth, box.getSize(new THREE.Vector3()).length() * 0.5);
  return {
    distance,
    target,
    minDistance: distance * MIN_ZOOM,
    maxDistance: distance * MAX_ZOOM,
    near: Math.max(0.01, distance * MIN_ZOOM - reach * 1.2),
    far: distance * MAX_ZOOM + reach * 3,
  };
}

export function fitObject(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  options: FitOptions,
): FitResult {
  return fitBox(subjectBox(object), camera, options);
}

export type SubjectFit = {
  /** World-space bounding box captured when the fit was created. */
  box: THREE.Box3;
  /** Result of the most recent fit. */
  current: FitResult;
  /**
   * Re-solves for the camera's current aspect ratio and field of view. The
   * viewer is resizable, and a 340px-wide panel needs a different distance from
   * a 1000px one — which is the whole reason a fixed multiplier could not work.
   */
  refit(): FitResult;
};

export function createSubjectFit(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  options: FitOptions,
): SubjectFit {
  // Captured once, on purpose. The caller re-centres the subject on the aim
  // point straight after this call, and later frames may be mid-animation; both
  // would move a live box and make the framing breathe.
  const box = subjectBox(object);
  const fit: SubjectFit = {
    box,
    current: fitBox(box, camera, options),
    refit: () => {
      fit.current = fitBox(box, camera, options);
      return fit.current;
    },
  };
  return fit;
}

/* -------------------------------------------------------------------------- */

export type OrbitOptions = {
  yaw: number;
  pitch: number;
  /** Frame tilt in radians, applied after the aim. */
  roll?: number;
  /** Idle turn in radians per second. */
  spinSpeed?: number;
  /** Whether the idle turn starts running. */
  spinning?: boolean;
  /** Fires when a drag cancels the idle turn, so the UI toggle can follow. */
  onSpinChange?: (spinning: boolean) => void;
};

export type OrbitRig = {
  /** Damps toward the targets and writes the camera transform. */
  apply(camera: THREE.PerspectiveCamera, delta: number): void;
  /** Adopts a new fitted distance and its zoom clamps. */
  setFit(fit: FitResult): void;
  /** Discrete quarter-turn style nudge, for the on-screen rotate control. */
  nudgeYaw(amount: number): void;
  /** Multiplies the zoom target, clamped to the fit. */
  zoomBy(factor: number): void;
  /** Back to the framing the manifest asked for. */
  reset(): void;
  setSpinning(value: boolean): void;
  dispose(): void;
};

/**
 * Pointer-drag orbit around the origin.
 *
 * Around the *origin*, not around an arbitrary aim: both stages translate the
 * subject so its aim point sits at 0,0,0 before handing control over, which
 * keeps the orbit turning around the interesting part of the specimen rather
 * than around the centroid of a long tail of tentacles.
 */
export function createOrbitRig(host: HTMLElement, options: OrbitOptions): OrbitRig {
  const homeYaw = options.yaw;
  const homePitch = options.pitch;
  const roll = options.roll ?? 0;
  const spinSpeed = options.spinSpeed ?? 0.16;

  let yaw = homeYaw;
  let pitch = homePitch;
  let yawTarget = homeYaw;
  let pitchTarget = homePitch;
  let distance = 0;
  let distanceTarget = 0;
  let homeDistance = 0;
  let minDistance = 0;
  let maxDistance = Infinity;
  let near = 0;
  let far = 0;
  let spinning = options.spinning ?? false;

  const setSpinning = (value: boolean) => {
    if (spinning === value) return;
    spinning = value;
    options.onSpinChange?.(value);
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    // The control rail lives inside the stage, so a press on a button would
    // otherwise also start an orbit drag and nudge the camera off its mark.
    if ((event.target as Element | null)?.closest('button, a, input, label, select')) return;
    dragging = true;
    // A drag is a takeover: the visitor is now framing the specimen, and an
    // idle turn fighting the hand is the most annoying thing a viewer can do.
    setSpinning(false);
    lastX = event.clientX;
    lastY = event.clientY;
    host.setPointerCapture(event.pointerId);
    host.dataset.grabbing = 'true';
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    yawTarget -= (event.clientX - lastX) * 0.008;
    pitchTarget = THREE.MathUtils.clamp(pitchTarget + (event.clientY - lastY) * 0.006, -1.2, 1.2);
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const endDrag = (event: PointerEvent) => {
    dragging = false;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    delete host.dataset.grabbing;
  };
  const onWheel = (event: WheelEvent) => {
    // Only claims the wheel once the pointer is over the stage *and* the
    // gesture is clearly a zoom, so the page still scrolls past the viewer.
    if (Math.abs(event.deltaY) < 2) return;
    event.preventDefault();
    distanceTarget = THREE.MathUtils.clamp(
      distanceTarget * (1 + event.deltaY * 0.0012),
      minDistance,
      maxDistance,
    );
  };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  host.addEventListener('wheel', onWheel, { passive: false });

  return {
    apply: (camera, delta) => {
      if (near > 0 && (camera.near !== near || camera.far !== far)) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      if (spinning) yawTarget += delta * spinSpeed;
      const ease = 1 - Math.pow(0.002, delta);
      yaw += (yawTarget - yaw) * ease;
      pitch += (pitchTarget - pitch) * ease;
      distance += (distanceTarget - distance) * ease;
      const horizontal = Math.cos(pitch) * distance;
      camera.position.set(
        Math.sin(yaw) * horizontal,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * horizontal,
      );
      camera.lookAt(0, 0, 0);
      // Frame tilt, applied after the aim — the same trick the hero uses to turn
      // a very tall subject into a diagonal that fits one screen.
      if (Math.abs(roll) > 1e-4) camera.rotateZ(roll);
    },
    setFit: (fit) => {
      near = fit.near;
      far = fit.far;
      // A resize must not undo a zoom the visitor chose, so the target is
      // carried across as a ratio of the previous fit rather than reset.
      const ratio = homeDistance > 0 ? distanceTarget / homeDistance : 1;
      homeDistance = fit.distance;
      minDistance = fit.minDistance;
      maxDistance = fit.maxDistance;
      distanceTarget = THREE.MathUtils.clamp(fit.distance * ratio, minDistance, maxDistance);
      // First fit lands the camera rather than gliding in from zero.
      if (distance <= 0) distance = distanceTarget;
    },
    nudgeYaw: (amount) => {
      setSpinning(false);
      yawTarget += amount;
    },
    zoomBy: (factor) => {
      distanceTarget = THREE.MathUtils.clamp(distanceTarget * factor, minDistance, maxDistance);
    },
    reset: () => {
      setSpinning(false);
      yawTarget = homeYaw;
      pitchTarget = homePitch;
      distanceTarget = homeDistance;
    },
    setSpinning,
    dispose: () => {
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('wheel', onWheel);
      delete host.dataset.grabbing;
    },
  };
}
