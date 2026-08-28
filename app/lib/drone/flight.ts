/**
 * Quadrotor flight core — the real thing, cut down to what a beginner needs.
 *
 * Adapted from the MIT-licensed `quadrotor-sandbox` experience in
 * `mintdotgg/mint-playground` (itself an adaptation of `CloudyLo001/quadrotorsim`);
 * see THIRD_PARTY_ASSETS.md. What is kept is the part that cannot be faked: a
 * six-degree-of-freedom rigid-body integrator, first-order motor lag, a real
 * control-allocation mixer and a cascaded PID controller. What is dropped is
 * everything that belongs to a simulator rather than to a lesson — Rapier, the
 * seven-aircraft roster, acro and rate modes, lidar, the tuning panel, the
 * plots — because a student meeting a drone for the first time does not need a
 * gain sweep, and none of it survives contact with a 700 px stage.
 *
 * **No art came across.** The upstream airframe loads Mint CDN artifacts under
 * terms this project has not verified, so the drone in `rig.ts` is built from
 * primitives instead. The physics is code, and the code is MIT.
 *
 * The one substantive change to the model itself is the airframe: this is a
 * slow, forgiving trainer rather than the 10-inch cinelifter the sandbox flies,
 * so the mass, the limits and the outer-loop gains are re-derived below. The
 * inner loops are left exactly as the upstream sweep left them — those numbers
 * were tuned against three scenarios at once, and re-guessing them by eye is
 * how a flight model starts wobbling.
 */

import * as THREE from 'three';

/** Standard gravity, m/s². Acts along world −Y. */
export const GRAVITY = 9.80665;

/* ------------------------------------------------------------- airframe --- */

/** One rotor's mounting position and spin direction in the body frame. */
type Rotor = {
  /** Body-frame X offset, metres. +X is right. */
  x: number;
  /** Body-frame Z offset, metres. −Z is the nose. */
  z: number;
  /** +1 = counter-clockwise seen from above. */
  spin: 1 | -1;
};

/** Motor-to-centre distance, metres. A ~7-inch trainer class. */
export const ARM_LENGTH = 0.19;
/** X-configuration: each motor sits on a diagonal, so this is its X and Z leg. */
const A = ARM_LENGTH / Math.SQRT2;

const MAX_THRUST_PER_ROTOR = 9.4; // N
const MAX_OMEGA = 1080; // rad/s
/** Rotor drag torque per newton of thrust. */
const YAW_DRAG_RATIO = 0.018;

export const VEHICLE = {
  mass: 1.15,
  armLength: ARM_LENGTH,
  inertia: { x: 0.031, y: 0.058, z: 0.031 },
  kf: MAX_THRUST_PER_ROTOR / (MAX_OMEGA * MAX_OMEGA),
  km: (MAX_THRUST_PER_ROTOR / (MAX_OMEGA * MAX_OMEGA)) * YAW_DRAG_RATIO,
  maxRotorOmega: MAX_OMEGA,
  /** First-order motor spin-up time constant, seconds. */
  motorTau: 0.045,
  dragFactor: 0.031,
  angularDragFactor: 0.0013,
  motors: [
    { x: +A, z: -A, spin: -1 }, // 0 front-right
    { x: +A, z: +A, spin: +1 }, // 1 rear-right
    { x: -A, z: +A, spin: -1 }, // 2 rear-left
    { x: -A, z: -A, spin: +1 }, // 3 front-left
  ] as [Rotor, Rotor, Rotor, Rotor],
};

export const MAX_ROTOR_THRUST = VEHICLE.kf * VEHICLE.maxRotorOmega * VEHICLE.maxRotorOmega;
/** Thrust needed to hold altitude level, N. */
export const HOVER_THRUST = VEHICLE.mass * GRAVITY;

/**
 * The envelope, deliberately narrower than the sandbox's.
 *
 * The upstream numbers — 35° of tilt, 14 m/s, 4 m/s of climb — belong to a
 * pilot who has decided to learn to fly. A student meeting WASD for the first
 * time gets an aircraft that cannot run away from them: a third of the speed,
 * two thirds of the bank, and a climb rate slow enough that "up" is something
 * you watch happen rather than something that has already happened.
 */
export const LIMITS = {
  maxTilt: (22 * Math.PI) / 180,
  maxRate: { roll: 8, pitch: 8, yaw: 3.2 },
  maxSpeed: 5.4,
  maxClimbRate: 2.6,
  maxTorque: {
    roll: A * 2 * MAX_THRUST_PER_ROTOR * 0.9,
    pitch: A * 2 * MAX_THRUST_PER_ROTOR * 0.9,
    yaw: YAW_DRAG_RATIO * 2 * MAX_THRUST_PER_ROTOR * 0.9,
  },
} as const;

/* ------------------------------------------------------------------ PID --- */

export type PidGains = { kp: number; ki: number; kd: number };

type PidOptions = {
  integralLimit?: number;
  outputLimit?: number;
  derivativeCutoffHz?: number;
};

function clampSymmetric(value: number, limit: number) {
  return value > limit ? limit : value < -limit ? -limit : value;
}

/**
 * One PID loop, with the two properties a flight controller cannot do without:
 * the derivative is taken on the *measurement* rather than on the error, so a
 * stick step does not punch the motors, and the integrator holds whenever
 * integrating further would push deeper into a limit it is already against.
 */
export class Pid {
  private integral = 0;
  private lastMeasurement = 0;
  private lastDerivative = 0;
  private primed = false;

  constructor(public gains: PidGains, private readonly options: PidOptions = {}) {}

  reset() {
    this.integral = 0;
    this.lastMeasurement = 0;
    this.lastDerivative = 0;
    this.primed = false;
  }

  update(setpoint: number, measurement: number, dt: number): number {
    const { kp, ki, kd } = this.gains;
    const { integralLimit, outputLimit, derivativeCutoffHz } = this.options;
    const error = setpoint - measurement;

    let derivative = 0;
    if (this.primed && dt > 0) {
      const raw = -(measurement - this.lastMeasurement) / dt;
      if (derivativeCutoffHz && derivativeCutoffHz > 0) {
        const rc = 1 / (2 * Math.PI * derivativeCutoffHz);
        const alpha = dt / (rc + dt);
        derivative = this.lastDerivative + alpha * (raw - this.lastDerivative);
      } else {
        derivative = raw;
      }
    }
    this.lastMeasurement = measurement;
    this.lastDerivative = derivative;
    this.primed = true;

    const unsaturated = kp * error + this.integral + kd * derivative;
    if (ki !== 0 && dt > 0) {
      const pushingIntoLimit = outputLimit !== undefined
        && Math.abs(unsaturated) >= outputLimit
        && Math.sign(error) === Math.sign(unsaturated);
      if (!pushingIntoLimit) {
        this.integral += ki * error * dt;
        if (integralLimit !== undefined) this.integral = clampSymmetric(this.integral, integralLimit);
      }
    }

    const output = kp * error + this.integral + kd * derivative;
    return outputLimit === undefined ? output : clampSymmetric(output, outputLimit);
  }
}

/* ---------------------------------------------------------------- mixer --- */

export type MixerDemand = { thrust: number; pitch: number; yaw: number; roll: number };

const YAW_PER_NEWTON = VEHICLE.km / VEHICLE.kf;

/**
 * Turn one collective demand and three body torques into four rotor thrusts,
 * preferring attitude over collective: losing a little altitude authority is
 * recoverable, losing attitude authority is a crash.
 */
export function mix(demand: MixerDemand): [number, number, number, number] {
  const p = demand.pitch / A;
  const r = demand.roll / A;
  const y = -demand.yaw / YAW_PER_NEWTON;

  const offsets: [number, number, number, number] = [
    (+p + r - y) / 4,
    (-p + r + y) / 4,
    (-p - r - y) / 4,
    (+p - r + y) / 4,
  ];

  const spread = Math.max(...offsets) - Math.min(...offsets);
  const scale = spread > MAX_ROTOR_THRUST ? MAX_ROTOR_THRUST / spread : 1;
  const scaled = offsets.map((offset) => offset * scale) as [number, number, number, number];

  let collective = demand.thrust / 4;
  const highest = collective + Math.max(...scaled);
  const lowest = collective + Math.min(...scaled);
  if (highest > MAX_ROTOR_THRUST) collective -= highest - MAX_ROTOR_THRUST;
  if (lowest < 0) collective -= lowest;

  return scaled.map((offset) => {
    const force = collective + offset;
    return force < 0 ? 0 : force > MAX_ROTOR_THRUST ? MAX_ROTOR_THRUST : force;
  }) as [number, number, number, number];
}

/** Invert `thrust = kf · ω²`. */
function thrustToOmega(thrust: number) {
  return thrust <= 0 ? 0 : Math.sqrt(thrust / VEHICLE.kf);
}

/* ---------------------------------------------------------------- state --- */

export type DroneState = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orientation: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  /** Rotor speeds, rad/s, in mixer order. */
  motorOmega: Float64Array;
  /** Accumulated rotor angle for the visual prop spin, radians. */
  motorAngle: Float64Array;
  /** Rotor thrusts from the last step, N. */
  motorThrust: Float64Array;
  armed: boolean;
  /** Set by the ground handler. The controller stops commanding while true. */
  crashed: boolean;
  /** Seconds of simulated time since the last reset. */
  time: number;
};

export function createDroneState(): DroneState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    angularVelocity: new THREE.Vector3(),
    motorOmega: new Float64Array(4),
    motorAngle: new Float64Array(4),
    motorThrust: new Float64Array(4),
    armed: false,
    crashed: false,
    time: 0,
  };
}

/** Cosine of the angle between the aircraft's up axis and world up. */
export function tiltCosine(state: DroneState) {
  const { x, z } = state.orientation;
  return 1 - 2 * (x * x + z * z);
}

/* ------------------------------------------------------------- dynamics --- */

const worldForce = new THREE.Vector3();
const relativeAir = new THREE.Vector3();
const torque = new THREE.Vector3();
const inertiaTimesOmega = new THREE.Vector3();
const gyroscopic = new THREE.Vector3();
const spinQuaternion = new THREE.Quaternion();
const orientationRate = new THREE.Quaternion();

/**
 * Advance the aircraft by `dt` seconds. Scratch vectors are module-level so a
 * 200 Hz loop allocates nothing.
 */
export function stepDynamics(
  state: DroneState,
  targetThrusts: ArrayLike<number>,
  windVelocity: THREE.Vector3,
  dt: number,
) {
  const { mass, kf, km, motors, inertia } = VEHICLE;

  // Motors cannot change speed instantly. This first-order lag is most of what
  // separates a quad that feels like an aircraft from one that feels telepathic.
  const lag = 1 - Math.exp(-dt / VEHICLE.motorTau);
  let totalThrust = 0;
  for (let index = 0; index < 4; index += 1) {
    const target = thrustToOmega(targetThrusts[index]);
    const omega = state.motorOmega[index] + (target - state.motorOmega[index]) * lag;
    state.motorOmega[index] = omega;
    const thrust = kf * omega * omega;
    state.motorThrust[index] = thrust;
    totalThrust += thrust;
    state.motorAngle[index] = (state.motorAngle[index] + omega * dt * motors[index].spin) % (Math.PI * 2);
  }

  worldForce.set(0, totalThrust, 0).applyQuaternion(state.orientation);
  worldForce.y -= mass * GRAVITY;

  // Drag is computed against the air, not the ground, so wind and gusts push
  // the aircraft through exactly the same term.
  relativeAir.copy(windVelocity).sub(state.velocity);
  const airSpeed = relativeAir.length();
  if (airSpeed > 1e-6) worldForce.addScaledVector(relativeAir, VEHICLE.dragFactor * airSpeed);

  // Semi-implicit Euler: velocity first, then position from the new velocity.
  state.velocity.addScaledVector(worldForce, dt / mass);
  state.position.addScaledVector(state.velocity, dt);

  // A rotor thrust f at body offset (x, 0, z) contributes torque (−z·f, 0, x·f),
  // plus a reaction torque about +Y opposing its own spin.
  let tx = 0;
  let ty = 0;
  let tz = 0;
  const yawPerNewton = km / kf;
  for (let index = 0; index < 4; index += 1) {
    const motor = motors[index];
    const force = state.motorThrust[index];
    tx += -motor.z * force;
    tz += motor.x * force;
    ty += -motor.spin * yawPerNewton * force;
  }
  torque.set(tx, ty, tz);

  const omega = state.angularVelocity;
  const rateMagnitude = omega.length();
  if (rateMagnitude > 1e-6) {
    torque.addScaledVector(omega, -VEHICLE.angularDragFactor * rateMagnitude);
  }

  // Euler's equation for a rigid body: I·ω̇ = τ − ω × (I·ω).
  inertiaTimesOmega.set(omega.x * inertia.x, omega.y * inertia.y, omega.z * inertia.z);
  gyroscopic.copy(omega).cross(inertiaTimesOmega);
  omega.x += ((torque.x - gyroscopic.x) / inertia.x) * dt;
  omega.y += ((torque.y - gyroscopic.y) / inertia.y) * dt;
  omega.z += ((torque.z - gyroscopic.z) / inertia.z) * dt;

  // q̇ = ½ q ⊗ ω_body, so the rate quaternion multiplies on the right.
  spinQuaternion.set(omega.x * 0.5 * dt, omega.y * 0.5 * dt, omega.z * 0.5 * dt, 0);
  orientationRate.copy(state.orientation).multiply(spinQuaternion);
  state.orientation.set(
    state.orientation.x + orientationRate.x,
    state.orientation.y + orientationRate.y,
    state.orientation.z + orientationRate.z,
    state.orientation.w + orientationRate.w,
  );
  state.orientation.normalize();

  state.time += dt;
}

/* ------------------------------------------------------------ controller --- */

/**
 * Normalized pilot input.
 *
 * `climb` is self-centring here rather than the sandbox's stateful throttle. A
 * transmitter's throttle stick stays where the pilot left it, which is correct
 * for a transmitter and wrong for a keyboard: a student who lets go of every
 * key expects the aircraft to stop, and a held throttle means letting go is a
 * slow climb into the ceiling.
 */
export type Sticks = { roll: number; pitch: number; yaw: number; climb: number };

/**
 * Gains.
 *
 * The rate loop is the upstream `stable` preset carried across by the inertia
 * ratio the same way upstream carries it — a rate loop's closed-loop bandwidth
 * is kp/I, so a lighter airframe needs proportionally less gain for the same
 * response. The outer loops are upstream's untouched: they were swept against
 * flying a box, holding station in a crosswind and recovering from a shove, all
 * three at once, and every attempt to improve one of those alone regresses
 * another.
 */
const GAINS = {
  rate: {
    roll: { kp: 0.388, ki: 0.08, kd: 0.0204 },
    pitch: { kp: 0.388, ki: 0.08, kd: 0.0204 },
    yaw: { kp: 1.163, ki: 0.2, kd: 0 },
  },
  attitudeKp: 5,
  horizontalVelocity: { kp: 1.2, ki: 0.4, kd: 0.05 },
  positionKp: 1.4,
  verticalVelocity: { kp: 3, ki: 1.6, kd: 0.15 },
  altitudeKp: 2.2,
};

/**
 * Position-hold flight controller — the whole cascade, and only that mode.
 *
 *   position → velocity → acceleration → attitude → body rate → torque
 *
 * The sandbox lets a pilot enter this chain at three different depths, which is
 * a genuinely good lesson about what each outer loop contributes and completely
 * the wrong first thing to show a student. Position hold is the mode where
 * letting go of the keys parks the aircraft where it is, and that one property
 * is what makes a drone learnable in five seconds.
 */
export class FlightController {
  private readonly ratePitch: Pid;
  private readonly rateRoll: Pid;
  private readonly rateYaw: Pid;
  private readonly velocityX: Pid;
  private readonly velocityZ: Pid;
  private readonly climb: Pid;

  private yawSetpoint = 0;
  private readonly holdPosition = new THREE.Vector3();
  private holdAltitude = 0;

  /** True while the aircraft is parking itself rather than following a stick. */
  holding = false;

  /** Whether a stick was held last frame, so the release edge can be caught. */
  private wasCommanding = false;
  /** Unit vector of the last stick command, for projecting the brake anchor. */
  private readonly commandAxis = new THREE.Vector3();

  private readonly desiredUp = new THREE.Vector3();
  private readonly accelCommand = new THREE.Vector3();
  private readonly rateSetpoint = new THREE.Vector3();
  private readonly velocitySetpoint = new THREE.Vector3();
  private readonly noseAxis = new THREE.Vector3();
  private readonly rightAxis = new THREE.Vector3();
  private readonly backAxis = new THREE.Vector3();
  private readonly errorVector = new THREE.Vector3();
  private readonly desiredOrientation = new THREE.Quaternion();
  private readonly orientationError = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly basis = new THREE.Matrix4();

  constructor() {
    const { maxTorque } = LIMITS;
    const rateOptions = (limit: number) => ({
      integralLimit: limit * 0.35,
      outputLimit: limit,
      derivativeCutoffHz: 40,
    });
    this.ratePitch = new Pid(GAINS.rate.pitch, rateOptions(maxTorque.pitch));
    this.rateRoll = new Pid(GAINS.rate.roll, rateOptions(maxTorque.roll));
    this.rateYaw = new Pid(GAINS.rate.yaw, rateOptions(maxTorque.yaw));

    const maxHorizontalAccel = Math.tan(LIMITS.maxTilt) * GRAVITY;
    const horizontal = () => new Pid(GAINS.horizontalVelocity, {
      integralLimit: maxHorizontalAccel * 0.5,
      outputLimit: maxHorizontalAccel,
    });
    this.velocityX = horizontal();
    this.velocityZ = horizontal();
    this.climb = new Pid(GAINS.verticalVelocity, {
      integralLimit: GRAVITY * 0.6,
      outputLimit: GRAVITY * 1.5,
    });
  }

  /**
   * Clear every accumulator and re-anchor the hold targets to the aircraft.
   *
   * `holdAltitude` turns arming into a takeoff: pass one and the altitude loop
   * immediately has somewhere to climb to.
   */
  reset(state: DroneState, holdAltitude?: number) {
    this.ratePitch.reset();
    this.rateRoll.reset();
    this.rateYaw.reset();
    this.velocityX.reset();
    this.velocityZ.reset();
    this.climb.reset();
    this.euler.setFromQuaternion(state.orientation, 'YXZ');
    this.yawSetpoint = this.euler.y;
    this.holdPosition.copy(state.position);
    this.holdAltitude = holdAltitude ?? state.position.y;
    this.wasCommanding = false;
  }

  /** Where the aircraft is currently trying to hold station. */
  get targetAltitude() { return this.holdAltitude; }
  set targetAltitude(value: number) { this.holdAltitude = value; }

  update(state: DroneState, sticks: Sticks, dt: number): MixerDemand {
    if (!state.armed || state.crashed) {
      this.holding = false;
      return { thrust: 0, pitch: 0, yaw: 0, roll: 0 };
    }

    this.yawSetpoint = wrapAngle(this.yawSetpoint + sticks.yaw * LIMITS.maxRate.yaw * dt);

    const sin = Math.sin(this.yawSetpoint);
    const cos = Math.cos(this.yawSetpoint);
    this.noseAxis.set(-sin, 0, -cos);
    this.rightAxis.set(cos, 0, -sin);

    const commanding = Math.hypot(sticks.roll, sticks.pitch) > 0;
    const setpoint = this.velocitySetpoint;
    if (commanding) {
      // Nose-up stick flies backwards, so the forward term is negated.
      setpoint
        .copy(this.rightAxis)
        .multiplyScalar(sticks.roll * LIMITS.maxSpeed)
        .addScaledVector(this.noseAxis, -sticks.pitch * LIMITS.maxSpeed);
      this.commandAxis.copy(setpoint).normalize();
      this.holdPosition.copy(state.position);
    } else if (this.wasCommanding) {
      /*
       * Anchor where it will *stop*, not where the stick was let go.
       *
       * This is the one place this lab deliberately parts company with the
       * sandbox it came from, and it is worth stating why. Re-stamping the
       * anchor on the release frame is the textbook implementation, and it
       * makes an aircraft that flies four metres past the gate and then crawls
       * backwards to a point the pilot cannot see. Every real flight controller
       * with a "brake" mode solves it the same way: from speed v with a
       * deceleration authority of g·tan(maxTilt), the stopping distance is
       * v²/2a, so the anchor goes there. Let go and the drone glides to a stop
       * and stays stopped — which is what the lab's own hint promises, and what
       * a fourteen-year-old expects a hover to mean.
       */
      /*
       * The stopping distance of the loop that will do the stopping.
       *
       * The physical minimum is v²/2a, and anchoring there is what the first
       * version did — but nothing brakes the aircraft at full authority: the
       * outer loop commands `positionKp × error`, which is an exponential
       * approach that covers v/kp before it arrives. Anchoring at the shorter
       * distance means the aircraft sails past its own anchor and is then
       * dragged backwards, which is the artefact this whole branch exists to
       * remove. So the anchor is v/kp, floored at the physical minimum so a
       * future gain change can never ask for a stop the tilt limit cannot make.
       */
      const maxAccel = Math.tan(LIMITS.maxTilt) * GRAVITY;
      /*
       * Along-track only, and never negative.
       *
       * Using the raw velocity vector here was worse than not braking at all.
       * Releasing one stick and pressing another leaves the horizontal loops
       * unwinding an integral that was built up flying the *previous* axis, so
       * for a second or so the aircraft carries a real velocity component
       * pointing backwards along it — and an anchor placed at
       * `position + velocity · t` then commits to that, turning a transient
       * into a deliberate metre and a half of reverse. Flying a diagonal became
       * a crawl: every press advanced its own axis and undid most of the other.
       * Projecting onto the axis the pilot was actually flying keeps the anchor
       * in front of them, and clamping at zero means a stick released while
       * already stopped anchors where it is.
       */
      const along = Math.max(0, state.velocity.dot(this.commandAxis));
      const brakingTime = Math.max(1 / GAINS.positionKp, along / (2 * maxAccel));
      this.holdPosition
        .copy(state.position)
        .addScaledVector(this.commandAxis, along * brakingTime);
      this.holdPosition.y = state.position.y;
      /* The horizontal loops are changing job — following a stick becomes
         holding a point — which is exactly the mode change `Pid.reset` exists
         for. Carrying the stick's integral into the hold is what let the
         windup above become position error in the first place. */
      this.velocityX.reset();
      this.velocityZ.reset();
      setpoint.subVectors(this.holdPosition, state.position).multiplyScalar(GAINS.positionKp);
      setpoint.y = 0;
      if (setpoint.length() > LIMITS.maxSpeed) setpoint.setLength(LIMITS.maxSpeed);
    } else {
      // Position hold: outer P on position error, clamped to a sane speed.
      setpoint.subVectors(this.holdPosition, state.position).multiplyScalar(GAINS.positionKp);
      setpoint.y = 0;
      if (setpoint.length() > LIMITS.maxSpeed) setpoint.setLength(LIMITS.maxSpeed);
    }
    this.wasCommanding = commanding;
    this.holding = !commanding;

    let climbSetpoint: number;
    if (sticks.climb !== 0) {
      climbSetpoint = sticks.climb * LIMITS.maxClimbRate;
      this.holdAltitude = state.position.y;
    } else {
      climbSetpoint = THREE.MathUtils.clamp(
        (this.holdAltitude - state.position.y) * GAINS.altitudeKp,
        -LIMITS.maxClimbRate,
        LIMITS.maxClimbRate,
      );
    }

    this.accelCommand.set(
      this.velocityX.update(setpoint.x, state.velocity.x, dt),
      this.climb.update(climbSetpoint, state.velocity.y, dt),
      this.velocityZ.update(setpoint.z, state.velocity.z, dt),
    );

    // The thrust axis must point along gravity-plus-demanded-acceleration.
    this.desiredUp
      .set(this.accelCommand.x, GRAVITY + this.accelCommand.y, this.accelCommand.z)
      .normalize();

    // Clamp the commanded tilt, so an aggressive velocity error cannot ask for
    // an attitude that trades away all of the lift.
    const minCos = Math.cos(LIMITS.maxTilt);
    if (this.desiredUp.y < minCos) {
      const horizontal = Math.hypot(this.desiredUp.x, this.desiredUp.z);
      if (horizontal > 1e-6) {
        const factor = Math.sin(LIMITS.maxTilt) / horizontal;
        this.desiredUp.x *= factor;
        this.desiredUp.z *= factor;
      }
      this.desiredUp.y = minCos;
      this.desiredUp.normalize();
    }

    this.solveAttitude(state);

    // Vertical acceleration is only achieved along body up, so divide out the
    // current tilt. Floored so an upset attitude cannot demand infinite thrust.
    const lean = Math.max(tiltCosine(state), 0.5);
    const thrust = (VEHICLE.mass * (GRAVITY + this.accelCommand.y)) / lean;

    const omega = state.angularVelocity;
    return {
      thrust,
      pitch: this.ratePitch.update(this.rateSetpoint.x, omega.x, dt),
      yaw: this.rateYaw.update(this.rateSetpoint.y, omega.y, dt),
      roll: this.rateRoll.update(this.rateSetpoint.z, omega.z, dt),
    };
  }

  /**
   * Attitude loop. Builds the desired orientation from the demanded thrust axis
   * plus the yaw setpoint, then converts the quaternion error into a body-rate
   * setpoint — quaternions rather than Euler angles, so the loop stays
   * well-behaved at bank angles where roll/pitch/yaw starts fighting itself.
   */
  private solveAttitude(state: DroneState) {
    const sin = Math.sin(this.yawSetpoint);
    const cos = Math.cos(this.yawSetpoint);
    this.noseAxis.set(-sin, 0, -cos);
    this.backAxis.copy(this.noseAxis).negate();
    this.rightAxis.crossVectors(this.desiredUp, this.backAxis);
    if (this.rightAxis.lengthSq() < 1e-8) this.rightAxis.set(cos, 0, -sin);
    this.rightAxis.normalize();
    this.backAxis.crossVectors(this.rightAxis, this.desiredUp).normalize();

    this.desiredOrientation.setFromRotationMatrix(
      this.basis.makeBasis(this.rightAxis, this.desiredUp, this.backAxis),
    );
    // Error expressed in the body frame: q_err = q_current⁻¹ · q_desired.
    this.orientationError
      .copy(state.orientation)
      .conjugate()
      .multiply(this.desiredOrientation);

    // Take the short way round.
    if (this.orientationError.w < 0) {
      this.orientationError.set(
        -this.orientationError.x,
        -this.orientationError.y,
        -this.orientationError.z,
        -this.orientationError.w,
      );
    }

    const w = THREE.MathUtils.clamp(this.orientationError.w, -1, 1);
    const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
    if (sinHalf < 1e-6) {
      this.errorVector.set(0, 0, 0);
    } else {
      const angle = 2 * Math.acos(w);
      this.errorVector
        .set(this.orientationError.x, this.orientationError.y, this.orientationError.z)
        .multiplyScalar(angle / sinHalf);
    }

    this.rateSetpoint.copy(this.errorVector).multiplyScalar(GAINS.attitudeKp);
    this.rateSetpoint.x = THREE.MathUtils.clamp(this.rateSetpoint.x, -LIMITS.maxRate.pitch, LIMITS.maxRate.pitch);
    this.rateSetpoint.y = THREE.MathUtils.clamp(this.rateSetpoint.y, -LIMITS.maxRate.yaw, LIMITS.maxRate.yaw);
    this.rateSetpoint.z = THREE.MathUtils.clamp(this.rateSetpoint.z, -LIMITS.maxRate.roll, LIMITS.maxRate.roll);
  }
}

function wrapAngle(angle: number) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

/* ----------------------------------------------------------------- wind --- */

/** Small, fast, seedable PRNG, so the same lesson blows the same way twice. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Steady wind plus turbulence, as a fixed sum of sinusoids with incommensurate
 * frequencies rather than sampled noise: smooth, allocation-free and exactly
 * reproducible.
 *
 * Deliberately weak. Wind is here because it is the reason a real drone drifts,
 * and because a student should be able to see the aircraft *working* to hold
 * station — not so the lesson can be lost to a gust.
 */
export class Wind {
  /*
   * Weak, and weaker than the first pass.
   *
   * Position hold anchors where the sticks were *released*; while a stick is
   * held there is no cross-track correction, so a steady breeze integrates into
   * real displacement. At 0.85 m/s a beginner flying one eight-metre leg
   * arrived nearly three metres off the ring and had no way to know why. The
   * air still moves — the aircraft still visibly works to hold station — but it
   * no longer carries a lesson away.
   */
  /** Steady wind speed, m/s. */
  speed = 0.4;
  /** Heading the wind blows toward, radians clockwise from −Z. */
  heading = 0.7;
  /** Turbulence intensity. 0 = still air. */
  gustiness = 0.12;

  private readonly octaves: { frequency: number; phase: number; amplitude: number }[][] = [];
  private readonly scratch = new THREE.Vector3();
  private time = 0;

  constructor(seed = 0x5eed) {
    const random = mulberry32(seed);
    for (let axis = 0; axis < 3; axis += 1) {
      const set = [];
      for (let index = 0; index < 4; index += 1) {
        set.push({
          // Spread from slow swells to quick buffeting.
          frequency: 0.12 * Math.pow(2.37, index) * (0.75 + random() * 0.5),
          phase: random() * Math.PI * 2,
          amplitude: 1 / Math.pow(1.9, index),
        });
      }
      this.octaves.push(set);
    }
  }

  reset() { this.time = 0; }

  step(dt: number) { this.time += dt; }

  /** Wind velocity now, m/s, written into a shared vector. */
  velocity(): THREE.Vector3 {
    const steadyX = Math.sin(this.heading) * this.speed;
    const steadyZ = -Math.cos(this.heading) * this.speed;
    const scale = this.gustiness * (1.5 + this.speed * 0.45);
    this.scratch.set(
      steadyX + this.gust(0) * scale,
      this.gust(1) * scale * 0.5,
      steadyZ + this.gust(2) * scale,
    );
    return this.scratch;
  }

  private gust(axis: number) {
    let sum = 0;
    let norm = 0;
    for (const octave of this.octaves[axis]) {
      sum += Math.sin(this.time * octave.frequency * Math.PI * 2 + octave.phase) * octave.amplitude;
      norm += octave.amplitude;
    }
    return sum / norm;
  }
}

/* -------------------------------------------------------------- landing --- */

export type LandingGrade = 'perfect' | 'good' | 'firm';

/**
 * Sink-rate ceilings for each grade, m/s.
 *
 * Three grades, not the sandbox's four, and the worst of them is still a pass.
 * This lab never tells a beginner their landing was bad — it tells them how
 * softly they put it down, which is the number that gets better with practice.
 */
export const GRADE_SINK: Record<LandingGrade, number> = {
  perfect: 0.45,
  good: 1.1,
  firm: Infinity,
};

export const GRADE_LABEL: Record<LandingGrade, string> = {
  perfect: 'Hạ cánh rất êm',
  good: 'Hạ cánh tốt',
  firm: 'Hạ cánh chắc tay',
};

const bodyUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Angle between the aircraft's up axis and world up, radians. */
export function tiltOf(state: DroneState): number {
  bodyUp.set(0, 1, 0).applyQuaternion(state.orientation);
  return Math.acos(THREE.MathUtils.clamp(bodyUp.dot(WORLD_UP), -1, 1));
}

/**
 * Grade a touchdown from its sink rate, demoted for arriving tilted: setting
 * down at 0.2 m/s while banked 30° is not a soft landing, it is a slow one.
 */
export function gradeLanding(sinkSpeed: number, tilt: number): LandingGrade {
  const order: LandingGrade[] = ['perfect', 'good', 'firm'];
  let index = order.findIndex((grade) => sinkSpeed <= GRADE_SINK[grade]);
  if (index === -1) index = order.length - 1;
  if (tilt > (20 * Math.PI) / 180) index += 1;
  return order[Math.min(index, order.length - 1)];
}
