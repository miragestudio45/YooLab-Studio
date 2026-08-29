import * as THREE from 'three';
import { VEHICLE, type DroneState } from './flight';

/**
 * Camera behaviour, kept out of the lab so the render loop keeps one job.
 *
 * Adapted from the upstream sandbox's `view/chase.ts` (MIT), with its four
 * modes kept and its per-vehicle framing table dropped — there is one aircraft
 * here. What is worth keeping is the reasoning behind each mode, because it is
 * not obvious and it took that project a while to arrive at:
 *
 *   **chase** follows the aircraft's *heading* rather than its full
 *   orientation. Inheriting roll and pitch from a quad that is constantly
 *   correcting makes the whole room appear to lurch even when the flight is
 *   perfectly smooth. This is the default and it is the mode a beginner should
 *   fly in, because the sticks and the screen agree: right is right.
 *
 *   **onboard** is bolted to the FPV pod and neither smooths its position nor
 *   uses `lookAt`. Both of those exist to make a *following* camera pleasant,
 *   and either one here makes the aircraft appear to drift around its own camera
 *   mount. It is also the only mode that shows what flying a drone is actually
 *   like, and the only one in which the pod's 22° rake means anything.
 *
 *   **orbit** circles slowly at a fixed radius. For looking at the airframe
 *   rather than flying it.
 *
 *   **free** is the pointer-dragged view, and the only one not in the upstream
 *   set. It exists because this lab is a *course* rather than a sandbox: the
 *   pilot needs to see the gates, the slalom and the distance between them
 *   before touching a key, and no camera framed on the aircraft can show
 *   them. Any drag switches to it, inheriting whatever orbit was on screen.
 */

export type CameraMode = 'chase' | 'onboard' | 'orbit' | 'free';

export const CAMERA_MODES: readonly CameraMode[] = ['chase', 'onboard', 'orbit', 'free'];

export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Theo sau',
  onboard: 'Buồng lái',
  orbit: 'Vòng quanh',
  free: 'Tự do',
};

/** Chase offset in body-heading coordinates, metres. */
const CHASE_OFFSET = new THREE.Vector3(0, 0.34, 1.15);
const ORBIT_RADIUS = 2.6;

/**
 * Where the aircraft is *drawn* this frame.
 *
 * The simulation runs at a fixed 200 Hz and the renderer does not, so the pose
 * shown is the state interpolated across the leftover fraction of a step. It
 * matters enormously for the onboard view: a camera bolted to the airframe has
 * to use the same pose the airframe was drawn at, or the two disagree by up to
 * one step of travel and the picture shakes.
 */
export type Pose = { position: THREE.Vector3; orientation: THREE.Quaternion };

export class DroneCamera {
  /**
   * Chase, not free.
   *
   * The lab opens on a parked aircraft, and the two candidate first frames are
   * "a 0.4 m quad from 1.1 m" and "a 34 m hall from 9 m". The second one shows
   * the course and makes the aircraft a 20 px speck — and the aircraft is what
   * the visitor came to see, is the thing they are about to control, and is the
   * only object in the room whose detail rewards looking at. The hall is one
   * drag away, and dragging is the first thing anyone does.
   */
  mode: CameraMode = 'chase';

  /**
   * Onboard horizon behaviour. Stabilised takes only the aircraft's heading, so
   * the horizon stays flat while the airframe banks beneath it; raw inherits the
   * full attitude, so the room rolls with the aircraft.
   *
   * Stabilised by default, matching the panel's own checkbox: raw is what an FPV
   * feed really looks like and it is also the fastest way to make a first-time
   * pilot lose track of which way is up. The lab writes this every frame, so the
   * panel is the authority and this value is only the pre-mount state.
   */
  stabilized = true;

  /**
   * Free-look state, driven by the pointer.
   *
   * The opening view is deliberately *behind* the launch pad looking down the
   * course rather than a close orbit of the aircraft. A drone lab that opens
   * with the camera three metres from a parked quad shows a parked quad: the
   * room, the gates and the distance to the first one — all of which the pilot
   * needs before touching a key — are off screen. The yaw is the reciprocal of
   * the pad-to-first-gate bearing, so "forward" on screen is forward on the
   * course. `adoptFree` overwrites all three the moment the visitor drags, so
   * these are only the values a programmatic switch to free mode would land on.
   */
  yaw = -0.67;
  pitch = 0.3;
  distance = 8.5;
  /** What the free camera looks at. The lab moves it to follow the aircraft. */
  readonly pivot = new THREE.Vector3(0, 1.1, 0);

  private readonly position = new THREE.Vector3(0, 1.4, 3);
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly heading = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly mount = new THREE.Vector3();
  private readonly tilt = new THREE.Quaternion();
  private orbitAngle = 0;

  /**
   * Takes the free camera's orbit from wherever the view currently is.
   *
   * Called when the visitor drags, or picks "Tự do". Without it, switching out
   * of chase snaps to whatever `yaw`/`pitch`/`distance` were last left at — a
   * jump on the first drag every single time, which reads as the camera fighting
   * the pointer rather than following it.
   */
  adoptFree() {
    const offset = this.position.clone().sub(this.pivot);
    const horizontal = Math.hypot(offset.x, offset.z);
    this.distance = THREE.MathUtils.clamp(offset.length(), 1.2, 26);
    this.yaw = Math.atan2(offset.x, offset.z);
    this.pitch = THREE.MathUtils.clamp(Math.atan2(offset.y, horizontal), -0.1, 1.1);
  }

  /** Re-seats the camera without a sweep, after a reset or a mode change. */
  reset(state: DroneState) {
    this.euler.setFromQuaternion(state.orientation, 'YXZ');
    this.heading.setFromAxisAngle(UP, this.euler.y);
    this.desired.copy(CHASE_OFFSET).applyQuaternion(this.heading).add(state.position);
    this.position.copy(this.desired);
    this.target.copy(state.position);
  }

  update(
    camera: THREE.PerspectiveCamera,
    state: DroneState,
    delta: number,
    pose: Pose,
    gimbal: THREE.Object3D | null,
  ) {
    if (this.mode === 'onboard' && gimbal) {
      /*
       * No smoothing and no `lookAt`. The camera is the pod, so it takes the
       * pod's world transform verbatim — which is also how it inherits the 22°
       * rake without that number being written down twice.
       */
      gimbal.getWorldPosition(this.mount);
      camera.position.copy(this.mount);
      if (this.stabilized) {
        this.euler.setFromQuaternion(pose.orientation, 'YXZ');
        this.heading.setFromAxisAngle(UP, this.euler.y);
        this.tilt.setFromAxisAngle(RIGHT, ONBOARD_RAKE);
        camera.quaternion.copy(this.heading).multiply(this.tilt);
      } else {
        gimbal.getWorldQuaternion(camera.quaternion);
        /* The pod points down its own −Z, which is where a three.js camera
           looks, so no extra turn is needed — only the rake the pod already
           carries. */
      }
      return;
    }

    if (this.mode === 'orbit') {
      this.orbitAngle += delta * 0.34;
      this.desired.set(
        pose.position.x + Math.sin(this.orbitAngle) * ORBIT_RADIUS,
        pose.position.y + 0.9,
        pose.position.z + Math.cos(this.orbitAngle) * ORBIT_RADIUS,
      );
      this.settle(camera, pose.position, delta, 5.5);
      return;
    }

    if (this.mode === 'free') {
      this.desired.set(
        this.pivot.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
        this.pivot.y + Math.sin(this.pitch) * this.distance,
        this.pivot.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
      );
      this.settle(camera, this.pivot, delta, 8);
      return;
    }

    /* Chase. Heading only — see the header. */
    this.euler.setFromQuaternion(pose.orientation, 'YXZ');
    this.heading.setFromAxisAngle(UP, this.euler.y);
    this.desired.copy(CHASE_OFFSET).applyQuaternion(this.heading).add(pose.position);
    /*
     * Lifted look-at: aiming at the aircraft's centre puts it dead centre in
     * frame with the whole course behind it, and a pilot needs to see where they
     * are *going*. Half a metre of lift drops the aircraft into the lower third
     * and opens the frame ahead of it.
     */
    this.target.copy(pose.position).addScaledVector(UP, 0.28);
    this.settle(camera, this.target, delta, 6.5);
  }

  /** Exponential approach to `desired`, then look at `at`. */
  private settle(
    camera: THREE.PerspectiveCamera,
    at: THREE.Vector3,
    delta: number,
    rate: number,
  ) {
    const blend = 1 - Math.exp(-rate * delta);
    this.position.lerp(this.desired, blend);
    camera.position.copy(this.position);
    camera.lookAt(at);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
/** Matches the pod's own cant in `rig.ts`. Stabilised mode has to re-apply it. */
const ONBOARD_RAKE = (-22 * Math.PI) / 180;

/**
 * The interpolated pose, for drawing.
 *
 * `alpha` is the fraction of a physics step left over after the fixed-step loop
 * has run. Without this the aircraft is drawn at up to one step of stale
 * position — 27 mm at 5.4 m/s and a 200 Hz step, which is invisible from the
 * chase camera and violent from the onboard one, half a metre from the nose.
 */
export function interpolatePose(
  previous: Pose,
  current: DroneState,
  alpha: number,
  out: Pose,
): Pose {
  out.position.lerpVectors(previous.position, current.position, alpha);
  out.orientation.copy(previous.orientation).slerp(current.orientation, alpha);
  return out;
}

/** Rotor tip speed as a fraction of maximum — drives blur, sound and dust. */
export function rotorLoad(state: DroneState) {
  let sum = 0;
  for (let index = 0; index < 4; index += 1) sum += state.motorOmega[index];
  return sum / (4 * VEHICLE.maxRotorOmega);
}
