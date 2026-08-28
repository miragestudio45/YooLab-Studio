'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { LabPad } from './LabChrome';
import { PracticeIcon } from './PracticeIcons';
import { Autopilot, planCourse, type Waypoint } from '../../lib/drone/autopilot';
import {
  FlightController,
  GRADE_LABEL,
  LIMITS,
  VEHICLE,
  Wind,
  createDroneState,
  gradeLanding,
  mix,
  stepDynamics,
  tiltOf,
  type Sticks,
} from '../../lib/drone/flight';
import { createDownwash, createMotionTrail } from '../../lib/drone/fx';
import {
  COURSE_COLORS,
  createFlightHall,
  hitsObstacle,
  nearestSolid,
} from '../../lib/drone/hall';
import { createDroneRig, updatePropBlur } from '../../lib/drone/rig';
import {
  CAMERA_LABELS,
  CAMERA_MODES,
  DroneCamera,
  interpolatePose,
  rotorLoad,
  type CameraMode,
  type Pose,
} from '../../lib/drone/view';
import { createPracticeRoom } from '../../lib/three/practiceRoom';

/**
 * Lab 02 — the guided drone flight.
 *
 * The physics under this is a real quadrotor: a 6-DOF integrator, motor lag, a
 * control-allocation mixer and a cascaded PID stack, adapted from an MIT flight
 * sandbox (see `lib/drone/flight.ts`). That part was already right. What was
 * wrong with the version this replaces is everything around it — four rings and
 * two painted discs on empty ivory, one camera, a drone made of thirty boxes,
 * and no way to see what a good flight looks like.
 *
 * Each of those is now the thing it should have been:
 *
 *   **the room** is a netted indoor test cage with a marked flight box, gates on
 *   stands, a slalom, obstacle blocks and a wind fan (`lib/drone/hall.ts`). A
 *   course with no walls gives a pilot no sense of speed and nothing to judge
 *   altitude against.
 *   **the aircraft** is a modelled 7-inch quad (`lib/drone/rig.ts`), because the
 *   chase camera sits 1.1 m behind it and the onboard camera is *inside* it.
 *   **the cameras** are the sandbox's four, ported (`lib/drone/view.ts`) — and
 *   the onboard one is the reason a student understands what FPV means.
 *   **the autopilot** flies the course by moving the sticks through the same
 *   controller a human's inputs go through (`lib/drone/autopilot.ts`), so the
 *   panel can print what a good pilot would be doing right now.
 *
 * The lesson on top of it is still deliberately not a simulator. A flight
 * sandbox opens on a tuning panel, three flight modes and a city; a student who
 * has never flown anything reads that as "this is not for me" in two seconds.
 * So the four beats are unchanged — arm, climb, gates, land — and the controls
 * appear as the step that needs them arrives.
 */

const STEPS = [
  { id: 'arm', label: 'Khởi động' },
  { id: 'takeoff', label: 'Cất cánh' },
  { id: 'route', label: 'Bay qua điểm' },
  { id: 'land', label: 'Hạ cánh' },
] as const;

const COPY: { objective: string; hint: string }[] = [
  {
    objective: 'Nhấn Khởi động để bốn động cơ bắt đầu quay.',
    hint: 'Drone chỉ bay khi động cơ đã khởi động. Trong lúc chờ, bạn vẫn kéo được khung hình để nhìn quanh sân bay thử nghiệm.',
  },
  {
    objective: 'Giữ phím R để bay lên, tới khi drone chạm vòng mốc phía trên bãi đỗ.',
    hint: 'Buông tay ra là drone tự giữ nguyên độ cao — nó không rơi. Phím F để hạ xuống thấp lại.',
  },
  {
    objective: 'Bay qua ba vòng mốc màu san hô. W A S D để đi tới, lùi, sang trái, sang phải.',
    hint: 'Vòng đang sáng là vòng tiếp theo. Nếu bay lệch, buông hết phím ra: drone sẽ đứng yên tại chỗ để bạn ngắm lại. Đổi sang góc "Buồng lái" nếu muốn bay như phi công thật.',
  },
  {
    objective: 'Bay tới bãi đáp chữ H và giữ phím F để hạ xuống thật chậm.',
    hint: 'Hạ càng chậm càng tốt. Xuống dưới 0,45 m/s là một cú hạ cánh êm — đó là con số phi công thật cũng theo đuổi.',
  },
];

const KEY_BINDINGS: Record<string, keyof StickState> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyR: 'up', Space: 'up',
  KeyF: 'down', ShiftLeft: 'down', ShiftRight: 'down',
  KeyQ: 'yawLeft',
  KeyE: 'yawRight',
};

type StickState = {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  up: boolean; down: boolean; yawLeft: boolean; yawRight: boolean;
};

const MOVE_PAD = [
  { id: 'forward', glyph: '↑', name: 'Bay tới', area: 'up' },
  { id: 'left', glyph: '←', name: 'Sang trái', area: 'left' },
  { id: 'back', glyph: '↓', name: 'Bay lùi', area: 'down' },
  { id: 'right', glyph: '→', name: 'Sang phải', area: 'right' },
];

const LIFT_PAD = [
  { id: 'up', glyph: '▲', name: 'Bay lên', area: 'up' },
  { id: 'down', glyph: '▼', name: 'Hạ xuống', area: 'down' },
];

/** Fixed physics step. The controller's gains are tuned against this rate. */
const PHYSICS_STEP = 1 / 200;
/** Sink rate past which an arrival is a crash rather than a firm landing. */
const CRASH_SINK = 3.4;
/** Tilt past which the aircraft has arrived on its side. */
const CRASH_TILT = (58 * Math.PI) / 180;
/** Cruise height the autopilot transits at, metres. */
const CRUISE = 3.1;
/**
 * Battery, in seconds of hover.
 *
 * A modelled pack rather than a real discharge curve, and the panel says so.
 * What it is for is the one thing a beginner never thinks about and every real
 * pilot thinks about constantly: flight time is the budget, and hovering spends
 * it as fast as flying does.
 */
const PACK_SECONDS = 240;

type Mode = 'manual' | 'auto';

type Telemetry = {
  altitude: number;
  speed: number;
  climb: number;
  battery: number;
  proximity: number;
  /** Bank and pitch, degrees, for the attitude indicator. */
  roll: number;
  pitch: number;
  heading: number;
  wind: number;
  sticks: Sticks;
  leg: number;
  /** Legs in the loaded plan, so the panel can say "3 of 9" truthfully. */
  legs: number;
};

export function DroneLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const sticksRef = useRef<StickState>({
    forward: false, back: false, left: false, right: false,
    up: false, down: false, yawLeft: false, yawRight: false,
  });
  const commandRef = useRef({ arm: false, reset: false, disarm: false });
  const controlRef = useRef({ mode: 'manual' as Mode, camera: 'chase' as CameraMode, trail: true, stabilized: true });
  const stepRef = useRef(0);

  const [mode, setMode] = useState<Mode>('manual');
  const [camera, setCamera] = useState<CameraMode>('chase');
  const [trail, setTrail] = useState(true);
  const [stabilized, setStabilized] = useState(true);
  const [step, setStep] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [armed, setArmed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [flash, setFlash] = useState<{ text: string; tone: 'success' | 'warn'; key: number } | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    altitude: 0, speed: 0, climb: 0, battery: 100, proximity: 9,
    roll: 0, pitch: 0, heading: 0, wind: 0,
    sticks: { roll: 0, pitch: 0, yaw: 0, climb: 0 }, leg: -1, legs: 0,
  });

  const flashCount = useRef(0);
  const pushFlash = useCallback((text: string, tone: 'success' | 'warn') => {
    flashCount.current += 1;
    setFlash({ text, tone, key: flashCount.current });
  }, []);

  useEffect(() => { controlRef.current.mode = mode; }, [mode]);
  useEffect(() => { controlRef.current.camera = camera; }, [camera]);
  useEffect(() => { controlRef.current.trail = trail; }, [trail]);
  useEffect(() => { controlRef.current.stabilized = stabilized; }, [stabilized]);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;

    const room = createPracticeRoom(host, { mount, span: 40, fov: 40 });
    const { stage } = room;
    /* The hall paints its own floor and the aircraft gets a downwash disc, which
       is a better altitude cue than the shared blob and does not fight it. */
    room.shadow.mesh.visible = false;

    const hall = createFlightHall();
    stage.scene.add(hall.group);

    const rig = createDroneRig();
    stage.scene.add(rig.root);
    const FLOOR = rig.groundClearance;

    const motionTrail = createMotionTrail();
    stage.scene.add(motionTrail.line);
    const downwash = createDownwash();
    stage.scene.add(downwash.mesh);

    const state = createDroneState();
    const controller = new FlightController();
    const wind = new Wind();
    const autopilot = new Autopilot();
    const view = new DroneCamera();

    const sticks: Sticks = { roll: 0, pitch: 0, yaw: 0, climb: 0 };
    const stickState = sticksRef.current;

    /** Where a crash puts the aircraft back — the last thing it cleared. */
    const recovery = { point: new THREE.Vector3(), altitude: hall.takeoffAltitude };
    let clearedCount = 0;
    let airborne = 0;
    let crashHold = 0;
    let finishedRun = false;
    let battery = 1;
    let plan: Waypoint[] = [];

    const previous: Pose = { position: new THREE.Vector3(), orientation: new THREE.Quaternion() };
    const drawn: Pose = { position: new THREE.Vector3(), orientation: new THREE.Quaternion() };

    const goStep = (next: number) => {
      stepRef.current = next;
      setStep(next);
    };

    const seat = () => {
      state.position.set(hall.launchPad.x, FLOOR, hall.launchPad.z);
      state.velocity.set(0, 0, 0);
      state.orientation.identity();
      state.angularVelocity.set(0, 0, 0);
      state.motorOmega.fill(0);
      state.motorAngle.fill(0);
      state.armed = false;
      state.crashed = false;
      previous.position.copy(state.position);
      previous.orientation.copy(state.orientation);
      controller.reset(state);
      view.pivot.copy(state.position).setY(state.position.y + 0.6);
    };

    const resetRun = () => {
      seat();
      clearedCount = 0;
      airborne = 0;
      crashHold = 0;
      finishedRun = false;
      battery = 1;
      recovery.point.set(hall.launchPad.x, 0, hall.launchPad.z);
      recovery.altitude = hall.takeoffAltitude;
      motionTrail.reset();
      hall.takeoffGate.visible = false;
      for (const gate of hall.checkpoints) {
        const material = gate.ring.material as THREE.MeshStandardMaterial;
        material.color.set(COURSE_COLORS.CORAL);
        material.emissiveIntensity = 0.2;
        (gate.glow.material as THREE.MeshBasicMaterial).opacity = 0.12;
      }
      (hall.landingMark.material as THREE.MeshBasicMaterial).color.set(COURSE_COLORS.SAGE);
      rig.setArmed(false);
      setArmed(false);
      setCleared(0);
      setFinished(false);
      setFlash(null);
      goStep(0);
      view.reset(state);
    };

    seat();
    recovery.point.set(hall.launchPad.x, 0, hall.launchPad.z);
    view.reset(state);

    /*
     * A crash is never expensive.
     *
     * The aircraft respawns hovering over the last thing it cleared, which is
     * what "thử lại từ điểm gần nhất" means — the run is not restarted and the
     * last thirty seconds are not taken away. A lab that makes a beginner redo
     * a course because they clipped a pole is a lab they close.
     */
    const recover = () => {
      state.position.set(recovery.point.x, Math.max(recovery.altitude, FLOOR + 0.4), recovery.point.z);
      state.velocity.set(0, 0, 0);
      state.orientation.identity();
      state.angularVelocity.set(0, 0, 0);
      state.crashed = false;
      state.armed = true;
      controller.reset(state, state.position.y);
      motionTrail.reset();
      rig.setArmed(true);
      setArmed(true);
      if (controlRef.current.mode === 'auto') loadPlan();
    };

    const loadPlan = () => {
      plan = planCourse(
        hall.launchPad,
        hall.takeoffAltitude,
        hall.checkpoints,
        hall.landingZone,
        CRUISE,
      );
      autopilot.load(plan, state);
    };

    /* --- input ------------------------------------------------------------- */
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = KEY_BINDINGS[event.code];
      if (!binding) return;
      if (controlRef.current.mode !== 'manual') return;
      event.preventDefault();
      stickState[binding] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const binding = KEY_BINDINGS[event.code];
      if (binding) stickState[binding] = false;
    };
    const onBlur = () => {
      for (const key of Object.keys(stickState) as (keyof StickState)[]) stickState[key] = false;
    };
    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('keyup', onKeyUp);
    host.addEventListener('blur', onBlur);

    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest('button, a, input, label')) return;
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      host.setPointerCapture(event.pointerId);
      host.dataset.grabbing = 'true';
      host.focus();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      /* Dragging always means "look around", so it takes the camera to free
         mode rather than fighting whichever automatic view is running — and it
         inherits the orbit it is currently showing, so the switch is a
         continuation of the drag rather than a cut. */
      if (controlRef.current.camera !== 'free') {
        view.adoptFree();
        setCamera('free');
      }
      view.yaw -= (event.clientX - previousX) * 0.007;
      view.pitch = THREE.MathUtils.clamp(view.pitch + (event.clientY - previousY) * 0.005, -0.1, 1.1);
      previousX = event.clientX;
      previousY = event.clientY;
    };
    const endDrag = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      delete host.dataset.grabbing;
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      view.distance = THREE.MathUtils.clamp(view.distance * (1 + event.deltaY * 0.0012), 1.2, 26);
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('wheel', onWheel, { passive: false });

    /*
     * The "Tự do" button reaches the camera through a DOM event.
     *
     * Everything else the panel commands goes through `controlRef`, which the
     * loop polls — but this one has to happen *before* the next frame reads the
     * new mode, or the free camera has already been placed from its stale orbit
     * and there is nothing left to adopt. A one-shot event on the mount node is
     * the smallest thing that gets the ordering right without exposing the
     * camera object to React.
     */
    const onAdoptFree = () => view.adoptFree();
    mount.addEventListener('adoptfree', onAdoptFree);

    /* --- loop -------------------------------------------------------------- */
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const timer = new THREE.Timer();
    let accumulator = 0;
    let hudElapsed = 0;
    let pulse = 0;
    let fanSpin = 0;

    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      const control = controlRef.current;
      const commands = commandRef.current;

      if (commands.reset) { commands.reset = false; resetRun(); }
      if (commands.disarm) {
        commands.disarm = false;
        state.armed = false;
        rig.setArmed(false);
        setArmed(false);
      }
      if (commands.arm) {
        commands.arm = false;
        if (!state.armed) {
          state.armed = true;
          state.crashed = false;
          controller.reset(state, Math.max(state.position.y, FLOOR + 0.35));
          rig.setArmed(true);
          setArmed(true);
          if (control.mode === 'auto') loadPlan();
          if (stepRef.current === 0) {
            goStep(1);
            hall.takeoffGate.visible = true;
          }
        }
      }

      view.mode = control.camera;
      view.stabilized = control.stabilized;
      motionTrail.setVisible(control.trail);

      /* --- sticks --------------------------------------------------------- */
      let autoLeg = -1;
      if (control.mode === 'auto' && state.armed && !state.crashed) {
        if (!plan.length) loadPlan();
        const status = autopilot.update(state, delta);
        sticks.roll = status.sticks.roll;
        sticks.pitch = status.sticks.pitch;
        sticks.yaw = status.sticks.yaw;
        sticks.climb = 0;
        controller.targetAltitude = autopilot.targetAltitude;
        autoLeg = status.leg;
        if (status.finished && !finishedRun && state.position.y <= FLOOR + 0.3) {
          /* The plan ends 120 mm up; the touchdown handler below finishes it. */
          sticks.climb = -0.35;
        }
      } else {
        /* Opposed keys cancel, which is what a real pair of gimbals does and
           stops a student who is mashing everything from getting a diagonal. */
        sticks.roll = (stickState.right ? 1 : 0) - (stickState.left ? 1 : 0);
        /* Nose-up stick flies backwards, so "forward" is a negative pitch. */
        sticks.pitch = (stickState.back ? 1 : 0) - (stickState.forward ? 1 : 0);
        sticks.yaw = (stickState.yawLeft ? 1 : 0) - (stickState.yawRight ? 1 : 0);
        sticks.climb = (stickState.up ? 1 : 0) - (stickState.down ? 1 : 0);
      }
      if (state.crashed) {
        sticks.roll = 0; sticks.pitch = 0; sticks.yaw = 0; sticks.climb = 0;
      }

      /* --- physics -------------------------------------------------------- */
      previous.position.copy(state.position);
      previous.orientation.copy(state.orientation);

      accumulator = Math.min(accumulator + delta, PHYSICS_STEP * 12);
      while (accumulator >= PHYSICS_STEP) {
        accumulator -= PHYSICS_STEP;
        wind.step(PHYSICS_STEP);
        const demand = controller.update(state, sticks, PHYSICS_STEP);
        stepDynamics(state, mix(demand), wind.velocity(), PHYSICS_STEP);

        if (state.armed) {
          const load = rotorLoad(state);
          battery = Math.max(0, battery - (load / PACK_SECONDS) * PHYSICS_STEP * 4);
        }

        /* --- solids ------------------------------------------------------ */
        if (
          !state.crashed
          && state.position.y > FLOOR + 0.02
          && hitsObstacle(hall.obstacles, state.position, VEHICLE.armLength)
        ) {
          state.crashed = true;
          state.armed = false;
          crashHold = 1.1;
          rig.setArmed(false);
          setArmed(false);
          pushFlash('Va vào chướng ngại vật — đưa drone về điểm gần nhất', 'warn');
        }

        /* --- ground ------------------------------------------------------- */
        if (state.position.y <= FLOOR) {
          const sink = Math.max(0, -state.velocity.y);
          const tilt = tiltOf(state);
          const wasFlying = airborne >= 0.35;
          state.position.y = FLOOR;
          if (state.velocity.y < 0) state.velocity.y = 0;
          state.velocity.x *= 0.86;
          state.velocity.z *= 0.86;
          state.angularVelocity.multiplyScalar(0.82);
          airborne = 0;

          if (wasFlying && !state.crashed) {
            if (sink > CRASH_SINK || tilt > CRASH_TILT) {
              state.crashed = true;
              state.armed = false;
              crashHold = 1.15;
              rig.setArmed(false);
              setArmed(false);
              pushFlash('Va chạm — đưa drone về điểm gần nhất', 'warn');
            } else if (!finishedRun) {
              const grade = gradeLanding(sink, tilt);
              const inZone = Math.hypot(
                state.position.x - hall.landingZone.x,
                state.position.z - hall.landingZone.z,
              ) <= hall.landingRadius;
              if ((stepRef.current === 3 || control.mode === 'auto') && inZone) {
                finishedRun = true;
                state.armed = false;
                rig.setArmed(false);
                setArmed(false);
                setFinished(true);
                (hall.landingMark.material as THREE.MeshBasicMaterial).color.set(COURSE_COLORS.SAGE);
                pushFlash(`${GRADE_LABEL[grade]} — hoàn thành bài bay`, 'success');
              } else if (stepRef.current === 3) {
                pushFlash('Chưa đúng bãi đáp — cất cánh lại và bay tới chữ H', 'warn');
              }
            }
          }
        } else {
          airborne += PHYSICS_STEP;
        }

        /* --- soft walls ---------------------------------------------------
         * A wall the aircraft bounces off would be a punishment; this is a
         * spring that pushes it back, so flying too far is a thing that gets
         * gently corrected rather than a thing that ends the lesson. */
        const { halfLength, halfWidth, ceiling } = hall.bounds;
        if (Math.abs(state.position.x) > halfLength) {
          const over = Math.abs(state.position.x) - halfLength;
          state.velocity.x -= Math.sign(state.position.x) * over * 2.6 * PHYSICS_STEP;
        }
        if (Math.abs(state.position.z) > halfWidth) {
          const over = Math.abs(state.position.z) - halfWidth;
          state.velocity.z -= Math.sign(state.position.z) * over * 2.6 * PHYSICS_STEP;
        }
        if (state.position.y > ceiling) {
          state.velocity.y -= (state.position.y - ceiling) * 3 * PHYSICS_STEP;
        }
      }

      if (crashHold > 0) {
        crashHold -= delta;
        if (crashHold <= 0) recover();
      }

      /* --- progression ---------------------------------------------------- */
      if (stepRef.current === 1 && state.position.y >= hall.takeoffAltitude - 0.35) {
        hall.takeoffGate.visible = false;
        recovery.point.set(hall.launchPad.x, 0, hall.launchPad.z);
        recovery.altitude = hall.takeoffAltitude;
        goStep(2);
        pushFlash('Đã cất cánh — drone đang giữ độ cao', 'success');
      }

      if (stepRef.current >= 1 && clearedCount < hall.checkpoints.length) {
        const next = hall.checkpoints[clearedCount];
        /*
         * Capture at 1.1 × the gate's own radius, not 0.94.
         *
         * The test is a sphere, so its budget is spent on altitude as well as
         * position — and the three gates deliberately sit at three different
         * heights, which is most of what the middle of this lesson teaches. At
         * 0.94 a student who had matched the height to within a metre had barely
         * half a metre of horizontal margin left, and a gate they cannot pass
         * teaches nothing except that they cannot fly.
         */
        if (state.position.distanceTo(next.centre) <= next.radius * 1.1) {
          const material = next.ring.material as THREE.MeshStandardMaterial;
          material.color.set(COURSE_COLORS.SAGE);
          material.emissiveIntensity = 0;
          (next.glow.material as THREE.MeshBasicMaterial).opacity = 0;
          recovery.point.set(next.centre.x, 0, next.centre.z);
          recovery.altitude = next.centre.y;
          clearedCount += 1;
          setCleared(clearedCount);
          if (clearedCount >= hall.checkpoints.length) {
            goStep(3);
            pushFlash('Đủ ba vòng mốc — bay tới bãi đáp', 'success');
          } else {
            pushFlash(`Qua vòng ${clearedCount}/${hall.checkpoints.length}`, 'success');
          }
        }
      }

      /* --- signalling ----------------------------------------------------- */
      pulse += delta;
      const beat = 0.5 + Math.sin(pulse * 3.1) * 0.5;
      if (clearedCount < hall.checkpoints.length && stepRef.current >= 2) {
        const next = hall.checkpoints[clearedCount];
        const material = next.ring.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.24 + beat * 0.5;
        (next.glow.material as THREE.MeshBasicMaterial).opacity = 0.05 + beat * 0.07;
      }
      if (hall.takeoffGate.visible) hall.takeoffGate.scale.setScalar(1 + beat * 0.035);
      (hall.landingMark.material as THREE.MeshBasicMaterial).opacity = stepRef.current === 3
        ? 0.4 + beat * 0.5
        : 0.6;
      rig.beacon.intensity = state.armed ? 0.4 + beat * 0.7 : 0;
      /* The fan spins whether or not anything is flying — it is the room's
         weather, not the aircraft's. */
      fanSpin += delta * 7.4;
      hall.fan.rotation.z = fanSpin;

      /* --- projection ----------------------------------------------------- */
      interpolatePose(previous, state, accumulator / PHYSICS_STEP, drawn);
      rig.root.position.copy(drawn.position);
      rig.root.quaternion.copy(drawn.orientation);
      for (let index = 0; index < 4; index += 1) {
        rig.rotors[index].rotation.y = state.motorAngle[index];
      }
      updatePropBlur(rig.blurs, state.motorOmega);
      const load = rotorLoad(state);
      downwash.update(state, load, 0);
      if (state.armed && !state.crashed) motionTrail.push(state.position);

      /* --- camera ---------------------------------------------------------- */
      /* The free camera's pivot follows the aircraft, so letting go of the drag
         does not leave the pilot looking at where it used to be. */
      view.pivot.lerp(
        drawn.position.clone().setY(drawn.position.y + 0.35),
        1 - Math.exp(-3.4 * delta),
      );
      view.update(stage.camera, state, delta, drawn, rig.gimbal);

      /* --- readout --------------------------------------------------------- */
      hudElapsed += delta;
      if (hudElapsed > 0.12) {
        hudElapsed = 0;
        euler.setFromQuaternion(state.orientation, 'YXZ');
        setTelemetry({
          altitude: Math.max(0, state.position.y - FLOOR),
          speed: Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z),
          climb: state.velocity.y,
          battery: Math.round(battery * 100),
          proximity: nearestSolid(hall.obstacles, hall.bounds, state.position),
          roll: THREE.MathUtils.radToDeg(euler.z),
          pitch: THREE.MathUtils.radToDeg(euler.x),
          heading: THREE.MathUtils.radToDeg(euler.y),
          wind: wind.velocity().length(),
          sticks: { ...sticks },
          leg: autoLeg,
          legs: plan.length,
        });
      }

      stage.noteFrame(delta);
      stage.renderer.render(stage.scene, stage.camera);
    });

    return () => {
      stage.renderer.setAnimationLoop(null);
      host.removeEventListener('keydown', onKeyDown);
      host.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('blur', onBlur);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('wheel', onWheel);
      mount.removeEventListener('adoptfree', onAdoptFree);
      delete host.dataset.grabbing;
      motionTrail.dispose();
      downwash.dispose();
      rig.dispose();
      hall.dispose();
      room.dispose();
    };
  }, [pushFlash]);

  const press = useCallback((id: string) => {
    sticksRef.current[id as keyof StickState] = true;
    hostRef.current?.focus();
  }, []);
  const release = useCallback((id: string) => {
    sticksRef.current[id as keyof StickState] = false;
  }, []);

  const copy = COPY[Math.min(step, COPY.length - 1)];
  const showControls = mode === 'manual' && step >= 1;
  /* Read from the loaded plan rather than recomputed from the gate count: the
     plan interleaves an approach point before each gate and ends with a cruise
     and a descent, and a second expression for its length is a second thing to
     get wrong. */
  const legLabel = telemetry.leg < 0 || !telemetry.legs
    ? 'Hoàn thành lộ trình'
    : `Chặng ${Math.min(telemetry.leg + 1, telemetry.legs)} / ${telemetry.legs}`;

  return (
    <div className="lab lab--panelled lab--drone" ref={hostRef} tabIndex={0} aria-label="Sân bay thử nghiệm drone">
      <div className="lab-stage">
        <div
          ref={viewRef}
          role="img"
          aria-label="Drone bốn cánh trong sân bay thử nghiệm trong nhà"
          className="lab-view"
        />

        <p className={`lab-badge${armed ? ' is-live' : ''}`}>
          <i aria-hidden="true" />
          {armed ? (mode === 'auto' ? 'Đang bay tự động' : 'Đang bay') : finished ? 'Đã hạ cánh' : 'Sẵn sàng'}
        </p>

        <ol className="lab-steps" aria-label="Các bước của bài thực hành">
          {STEPS.map((entry, index) => (
            <li key={entry.id} aria-current={index === step ? 'step' : undefined}>
              <p className={`lab-step${index < step || finished ? ' is-done' : ''}${index === step && !finished ? ' is-current' : ''}`}>
                <b aria-hidden="true">
                  {index < step || finished ? <PracticeIcon name="check" /> : String(index + 1).padStart(2, '0')}
                </b>
                <span>{entry.label}</span>
              </p>
            </li>
          ))}
        </ol>

        <div className="lab-brief">
          <p className="lab-objective">
            {finished
              ? 'Hoàn thành bài bay. Nhấn Làm lại để bay lượt nữa.'
              : mode === 'auto'
                ? 'Chế độ tự động: drone tự bay hết lộ trình. Xem bảng cần lái bên phải để biết một phi công giỏi đang làm gì.'
                : copy.objective}
          </p>
          {hintOpen && <p className="lab-hint">{copy.hint}</p>}
        </div>

        <div className="lab-actions">
          {!armed && !finished && (
            <button
              type="button"
              className="lab-button is-primary"
              onClick={() => { commandRef.current.arm = true; hostRef.current?.focus(); }}
            >
              <span>Khởi động</span>
              <PracticeIcon name="takeoff" />
            </button>
          )}
          <button
            type="button"
            className={`lab-button${hintOpen ? ' is-active' : ''}`}
            aria-pressed={hintOpen}
            onClick={() => setHintOpen((open) => !open)}
          >
            <PracticeIcon name="hint" />
            <span>Gợi ý</span>
          </button>
          <button
            type="button"
            className="lab-button"
            onClick={() => { commandRef.current.reset = true; setHintOpen(false); }}
          >
            <PracticeIcon name="restart" />
            <span>Làm lại</span>
          </button>
        </div>

        {(armed || step > 0) && (
          <div className="lab-readout">
            <b>{telemetry.altitude.toFixed(1)}</b><span>m</span>
            <i aria-hidden="true" />
            <b>{telemetry.speed.toFixed(1)}</b><span>m/s</span>
            <i aria-hidden="true" />
            <b>{cleared}/3</b><span>vòng</span>
          </div>
        )}

        {flash && (
          <p className={`lab-flash lab-flash--${flash.tone}`} key={flash.key} role="status">
            {flash.tone === 'success' && <PracticeIcon name="check" />}
            {flash.text}
          </p>
        )}

        {showControls && (
          <>
            <div className="lab-keys" aria-hidden="true">
              <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Di chuyển</span></p>
              <p><kbd>R</kbd><kbd>F</kbd><span>Lên / xuống</span></p>
              <p><kbd>Q</kbd><kbd>E</kbd><span>Xoay hướng</span></p>
            </div>
            <LabPad label="Điều khiển di chuyển" buttons={MOVE_PAD} onPress={press} onRelease={release} />
            <LabPad
              label="Điều khiển độ cao"
              className="lab-pad--lift"
              buttons={LIFT_PAD}
              onPress={press}
              onRelease={release}
            />
          </>
        )}
      </div>

      {/* The ground station. Same shape as the robot cell's pendant, for the
          same reason: an instrument panel that overlays the scene has to stay
          small enough not to hide it. */}
      <aside className="hmi" aria-label="Bảng điều khiển bay">
        <div className="hmi-modes" role="tablist" aria-label="Chế độ bay">
          {([
            ['manual', 'Tự lái', 'drive'],
            ['auto', 'Tự động', 'auto'],
          ] as const).map(([id, label, glyph]) => (
            <button
              type="button"
              key={id}
              role="tab"
              aria-selected={mode === id}
              className={mode === id ? 'is-active' : ''}
              onClick={() => {
                setMode(id);
                /* Switching mode never touches the aircraft — the sticks simply
                   stop, or start, being written for you. So a mid-flight
                   handover is a handover rather than a reset. */
                if (id === 'auto' && camera === 'free') setCamera('chase');
                for (const key of Object.keys(sticksRef.current) as (keyof StickState)[]) {
                  sticksRef.current[key] = false;
                }
              }}
            >
              <PracticeIcon name={glyph} />
              {label}
            </button>
          ))}
        </div>

        <div className="hmi-body">
          <section className="hmi-group">
            <h4>Góc nhìn</h4>
            <div className="hmi-chips" role="group" aria-label="Chọn góc nhìn">
              {CAMERA_MODES.map((entry) => (
                <button
                  type="button"
                  key={entry}
                  aria-pressed={camera === entry}
                  className={camera === entry ? 'is-active' : ''}
                  onClick={() => {
                    if (entry === 'free') viewRef.current?.dispatchEvent(new Event('adoptfree'));
                    setCamera(entry);
                  }}
                >
                  {CAMERA_LABELS[entry]}
                </button>
              ))}
            </div>
            {camera === 'onboard' && (
              <label className="hmi-check">
                <input
                  type="checkbox"
                  checked={stabilized}
                  onChange={(event) => setStabilized(event.target.checked)}
                />
                <span>Giữ đường chân trời thẳng</span>
              </label>
            )}
          </section>

          {/*
            The attitude indicator.

            An SVG rather than a corner of the 3D scene, because it has to stay
            legible in the onboard view — where there is no horizon on screen to
            read and this is the only thing that says which way is up. Drawn the
            way a real one is: the ground rolls and pitches under a fixed
            aircraft symbol, not the other way round.
          */}
          <section className="hmi-group">
            <h4>Tư thế bay</h4>
            <div className="hmi-attitude">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                  <clipPath id="drone-adi"><circle cx="60" cy="60" r="52" /></clipPath>
                </defs>
                <g clipPath="url(#drone-adi)">
                  <rect x="0" y="0" width="120" height="120" fill="#e9eef4" />
                  <g transform={`rotate(${-telemetry.roll} 60 60) translate(0 ${telemetry.pitch * 1.5})`}>
                    <rect x="-60" y="60" width="240" height="180" fill="#d9c8ad" />
                    <line x1="-60" y1="60" x2="180" y2="60" stroke="#8e8478" strokeWidth="1.5" />
                    {[-30, -15, 15, 30].map((offset) => (
                      <line
                        key={offset}
                        x1={60 - (Math.abs(offset) > 20 ? 10 : 16)}
                        y1={60 + offset}
                        x2={60 + (Math.abs(offset) > 20 ? 10 : 16)}
                        y2={60 + offset}
                        stroke="#a29a8e"
                        strokeWidth="1.1"
                      />
                    ))}
                  </g>
                </g>
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(117,91,70,0.24)" strokeWidth="2" />
                {/* The fixed aircraft symbol. */}
                <path d="M32 60h16l12 7 12-7h16" fill="none" stroke="#c95f52" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="60" cy="60" r="2.2" fill="#c95f52" />
              </svg>
              <dl>
                <div><dt>Nghiêng</dt><dd>{telemetry.roll.toFixed(0)}°</dd></div>
                <div><dt>Chúc</dt><dd>{telemetry.pitch.toFixed(0)}°</dd></div>
                <div><dt>Hướng</dt><dd>{((telemetry.heading + 360) % 360).toFixed(0)}°</dd></div>
              </dl>
            </div>
          </section>

          <section className="hmi-group">
            <h4>Thông số bay</h4>
            <dl className="hmi-readout">
              <div><dt>Độ cao</dt><dd>{telemetry.altitude.toFixed(2)} m</dd></div>
              <div><dt>Tốc độ</dt><dd>{telemetry.speed.toFixed(1)} m/s</dd></div>
              <div>
                <dt>Lên / xuống</dt>
                <dd>{telemetry.climb >= 0 ? '+' : ''}{telemetry.climb.toFixed(2)} m/s</dd>
              </div>
              <div><dt>Cách vật gần nhất</dt><dd>{telemetry.proximity.toFixed(2)} m</dd></div>
            </dl>
            {/*
              `--fill` is a 0–1 ratio rather than a width percentage: the bar is
              a full-width block scaled on X, so a reading that changes eight
              times a second costs a composite rather than a layout pass. See
              `.hmi-bars em`.
            */}
            <div className="hmi-bars">
              <span>
                <b>Pin</b>
                <i><em style={{ '--fill': telemetry.battery / 100 } as CSSProperties} /></i>
                <output>{telemetry.battery}%</output>
              </span>
              <span>
                <b>Gió</b>
                <i><em style={{ '--fill': Math.min(1, telemetry.wind / 2.2) } as CSSProperties} /></i>
                <output>{telemetry.wind.toFixed(1)} m/s</output>
              </span>
            </div>
            <p className="hmi-note">
              Pin và gió là mô hình mô phỏng, không phải số đo thiết bị thật —
              nhưng gió thì thổi thật vào mô hình bay, và quạt trong sân là nguồn của nó.
            </p>
          </section>

          {/*
            The sticks.

            In manual mode this mirrors what the pilot is holding. In automatic
            mode it is the whole reason the automatic mode exists: it shows what
            a good pilot would be doing right now, on the same two gimbals the
            student is about to use.
          */}
          <section className="hmi-group">
            <h4>{mode === 'auto' ? 'Cần lái (tự động)' : 'Cần lái'}</h4>
            <div className="hmi-sticks">
              {([
                ['Trái', telemetry.sticks.yaw, telemetry.sticks.climb],
                ['Phải', telemetry.sticks.roll, -telemetry.sticks.pitch],
              ] as const).map(([label, x, y]) => (
                <span key={label}>
                  <i>
                    <em style={{ left: `${50 + x * 42}%`, top: `${50 - y * 42}%` }} />
                  </i>
                  <b>{label}</b>
                </span>
              ))}
            </div>
            {mode === 'auto' && <p className="hmi-phase"><i aria-hidden="true" data-run={armed ? 'true' : 'false'} />{legLabel}</p>}
          </section>

          <section className="hmi-group hmi-group--status">
            <h4>Lộ trình</h4>
            <div className="hmi-progress hmi-progress--gates" role="img" aria-label={`Đã qua ${cleared} trên 3 vòng mốc`}>
              {[0, 1, 2].map((index) => (
                <span key={index} className={index < cleared ? 'is-filled' : ''} />
              ))}
            </div>
            <div className="hmi-row">
              <button
                type="button"
                className={`hmi-toggle${trail ? ' is-on' : ''}`}
                aria-pressed={trail}
                onClick={() => setTrail((value) => !value)}
              >
                <PracticeIcon name="route" />
                Vết bay
              </button>
              <button
                type="button"
                className="hmi-button"
                onClick={() => { commandRef.current.disarm = true; }}
                disabled={!armed}
              >
                <PracticeIcon name="pause" />
                Tắt động cơ
              </button>
            </div>
          </section>

          <p className="hmi-note hmi-note--limits">
            Giới hạn bài bay: nghiêng tối đa {Math.round((LIMITS.maxTilt * 180) / Math.PI)}°,
            tốc độ {LIMITS.maxSpeed} m/s, lên xuống {LIMITS.maxClimbRate} m/s.
          </p>
        </div>
      </aside>
    </div>
  );
}
