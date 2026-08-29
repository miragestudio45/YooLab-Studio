import * as THREE from 'three';
import { LIMITS, type DroneState, type Sticks } from './flight';

/**
 * The autopilot — the lab's "chạy tự động" mode.
 *
 * It flies the aircraft by moving the *sticks*, not by writing the state. That
 * choice is the whole point of the thing:
 *
 *   - it goes through the same cascaded PID stack a human's inputs go through,
 *     so the automatic flight is subject to the same tilt limits, the same
 *     motor lag and the same wind. An autopilot that teleported the aircraft
 *     along a spline would look smoother and would be showing the student a
 *     different vehicle from the one they are about to fly.
 *   - it can be watched. The panel prints the stick values it is generating, so
 *     "what would a good pilot be doing right now" is answerable by looking —
 *     which is the only reason a demo mode is worth having in a teaching lab
 *     rather than a video.
 *   - it can be taken over. Because nothing about the aircraft's state is
 *     special while it is running, switching to manual mid-flight just stops
 *     the sticks being written for you.
 *
 * The guidance law is deliberately plain: a proportional term on horizontal
 * position error expressed in the aircraft's own heading frame, an altitude
 * setpoint handed straight to the controller's own hold, and yaw toward the
 * direction of travel. No path smoothing, no feed-forward, no look-ahead. The
 * controller underneath already brakes properly, and a fancier outer loop would
 * be tuning that would only ever be visible as "the demo flies unlike you do".
 */

/** How far past a waypoint counts as arrived, metres. */
const ARRIVAL = 0.75;
/** Position error at which the stick is fully deflected, metres. */
const FULL_STICK = 2.6;
/** Yaw error at which the yaw stick is fully deflected, radians. */
const FULL_YAW = 0.9;
/** Below this speed the autopilot stops trying to point at its own motion. */
const YAW_HOLD_SPEED = 0.7;

export type Waypoint = {
  point: THREE.Vector3;
  /** Seconds to sit on the point once arrived. */
  hold?: number;
  /** Overrides the arrival radius — a gate wants a tighter one than a transit. */
  arrival?: number;
};

export type AutopilotStatus = {
  /** Index of the leg being flown, or −1 when the plan is finished. */
  leg: number;
  /** What the sticks are being driven to right now, for the panel. */
  sticks: Sticks;
  /** Metres to the current waypoint. */
  distance: number;
  finished: boolean;
};

export class Autopilot {
  private plan: Waypoint[] = [];
  private index = 0;
  private dwell = 0;
  /**
   * The autopilot's own copy of the controller's yaw setpoint.
   *
   * The `FlightController` integrates `sticks.yaw * maxRate.yaw * dt` into a
   * private setpoint, and the stick frame is defined by it — so to command a
   * heading, the caller has to track the same integral. Mirroring the exact
   * expression here rather than exposing the controller's field keeps the
   * controller's interface honest: it takes stick inputs, like a radio.
   */
  private yaw = 0;

  private readonly error = new THREE.Vector3();
  private readonly nose = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly sticks: Sticks = { roll: 0, pitch: 0, yaw: 0, climb: 0 };

  /** Altitude the controller should hold. The lab writes it through. */
  targetAltitude = 0;

  load(plan: Waypoint[], state: DroneState) {
    this.plan = plan;
    this.index = 0;
    this.dwell = 0;
    const euler = new THREE.Euler().setFromQuaternion(state.orientation, 'YXZ');
    this.yaw = euler.y;
    this.targetAltitude = plan.length ? plan[0].point.y : state.position.y;
  }

  get finished() {
    return this.index >= this.plan.length;
  }

  get leg() {
    return this.finished ? -1 : this.index;
  }

  /**
   * Produces this frame's stick command.
   *
   * Returns the same mutable `Sticks` object every call — the controller reads
   * it immediately and a 200 Hz loop should not allocate.
   */
  update(state: DroneState, delta: number): AutopilotStatus {
    const sticks = this.sticks;
    sticks.roll = 0;
    sticks.pitch = 0;
    sticks.yaw = 0;
    sticks.climb = 0;

    if (this.finished) {
      return { leg: -1, sticks, distance: 0, finished: true };
    }

    const waypoint = this.plan[this.index];
    this.error.subVectors(waypoint.point, state.position);
    const horizontal = Math.hypot(this.error.x, this.error.z);
    const distance = this.error.length();
    this.targetAltitude = waypoint.point.y;

    /* Arrived? Sit out the dwell, then take the next leg. */
    const arrival = waypoint.arrival ?? ARRIVAL;
    if (distance < arrival) {
      this.dwell += delta;
      if (this.dwell >= (waypoint.hold ?? 0)) {
        this.index += 1;
        this.dwell = 0;
      }
      return { leg: this.index, sticks, distance, finished: this.finished };
    }
    this.dwell = 0;

    /*
     * Into the stick frame.
     *
     * The controller resolves `sticks.roll` along its right axis and
     * `-sticks.pitch` along its nose axis, both derived from the yaw setpoint —
     * so the world-frame error has to be projected onto the same two axes. Get
     * this wrong and the aircraft flies a smooth curve to somewhere else, which
     * is the most confusing possible failure because nothing looks broken.
     */
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.nose.set(-sin, 0, -cos);
    this.right.set(cos, 0, -sin);

    const along = this.error.dot(this.nose);
    const across = this.error.dot(this.right);
    sticks.roll = THREE.MathUtils.clamp(across / FULL_STICK, -1, 1);
    /* Nose-up stick flies backwards, hence the negation — see the controller. */
    sticks.pitch = THREE.MathUtils.clamp(-along / FULL_STICK, -1, 1);

    /*
     * Yaw toward where it is going, not toward the waypoint.
     *
     * Pointing at the target is the obvious rule and it makes the aircraft
     * pirouette on the spot every time a leg changes, because the bearing jumps
     * the instant the waypoint does. Pointing along the *velocity* means the
     * heading follows the flight path, which is both what a pilot does and what
     * makes the onboard view usable — and while nearly stationary there is no
     * meaningful direction of travel, so it holds.
     */
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    if (speed > YAW_HOLD_SPEED || horizontal > 2) {
      const bearing = speed > YAW_HOLD_SPEED
        ? Math.atan2(-state.velocity.x, -state.velocity.z)
        : Math.atan2(-this.error.x, -this.error.z);
      const gap = wrap(bearing - this.yaw);
      sticks.yaw = THREE.MathUtils.clamp(gap / FULL_YAW, -1, 1);
    }

    this.yaw = wrap(this.yaw + sticks.yaw * LIMITS.maxRate.yaw * delta);

    return { leg: this.index, sticks, distance, finished: false };
  }
}

function wrap(angle: number) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/**
 * Builds the demonstration plan for a course.
 *
 * Each gate gets an approach point one and a half metres short of it on the
 * inbound bearing, then the gate itself with a tight arrival radius. Without the
 * approach the aircraft cuts the corner and clips the ring — which is
 * *realistic* and is not what a demonstration is for.
 */
export function planCourse(
  launchPad: THREE.Vector3,
  takeoffAltitude: number,
  gates: { centre: THREE.Vector3 }[],
  landingZone: THREE.Vector3,
  cruiseAltitude: number,
): Waypoint[] {
  const plan: Waypoint[] = [
    { point: new THREE.Vector3(launchPad.x, takeoffAltitude, launchPad.z), hold: 0.6, arrival: 0.45 },
  ];

  let from = new THREE.Vector3(launchPad.x, takeoffAltitude, launchPad.z);
  for (const gate of gates) {
    const inbound = new THREE.Vector3().subVectors(gate.centre, from);
    inbound.y = 0;
    if (inbound.lengthSq() < 1e-6) inbound.set(0, 0, -1);
    inbound.normalize();
    plan.push({
      point: new THREE.Vector3().copy(gate.centre).addScaledVector(inbound, -1.5),
      arrival: 0.6,
    });
    plan.push({ point: gate.centre.clone(), arrival: 0.42 });
    from = gate.centre;
  }

  plan.push({ point: new THREE.Vector3(landingZone.x, cruiseAltitude, landingZone.z), hold: 0.5, arrival: 0.5 });
  /*
   * The last leg descends to just above the skids rather than to the pad.
   *
   * Flying a waypoint into the floor asks the position loop to hold a point it
   * can never reach, and the aircraft sits there at full descent authority
   * grinding into the concrete. Stopping at 0.12 m and letting the lab's own
   * touchdown handler take it from there is both gentler and how a real
   * autoland hands over.
   */
  plan.push({ point: new THREE.Vector3(landingZone.x, 0.12, landingZone.z), arrival: 0.3 });
  return plan;
}
