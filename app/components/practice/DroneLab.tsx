'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { LabChrome, LabPad, type LabFlash, type LabStep } from './LabChrome';
import { PracticeIcon } from './PracticeIcons';
import {
  FlightController,
  GRADE_LABEL,
  Wind,
  createDroneState,
  gradeLanding,
  mix,
  stepDynamics,
  tiltOf,
  type Sticks,
} from '../../lib/drone/flight';
import { COURSE_COLORS, createDroneCourse, createDroneRig } from '../../lib/drone/rig';
import { createPracticeRoom, trackShadow } from '../../lib/three/practiceRoom';

/**
 * Lab 02 — the guided drone flight.
 *
 * The physics under this is a real quadrotor: a 6-DOF integrator, motor lag, a
 * control-allocation mixer and a cascaded PID stack, adapted from an MIT flight
 * sandbox (see `lib/drone/flight.ts`). The lesson on top of it is deliberately
 * not a simulator.
 *
 * A flight sandbox opens on a tuning panel, three flight modes and a city. A
 * student who has never flown anything reads that as "this is not for me" in
 * about two seconds, and the most sophisticated flight model in the world does
 * not survive that. So this lab shows exactly one thing at a time:
 *
 *   01 Khởi động   arm the motors — one button, and the props spin up
 *   02 Cất cánh    climb to a marked ring over the pad
 *   03 Bay qua điểm three large rings, in order
 *   04 Hạ cánh     put it down inside the H
 *
 * The controls appear as the step that needs them arrives, never before. And
 * failure is never expensive: a hard arrival respawns the aircraft hovering
 * over the last thing it cleared, which is what "thử lại từ điểm gần nhất"
 * means — the run is not restarted, the last thirty seconds are not taken away.
 */

const STEPS: LabStep[] = [
  { id: 'arm', label: 'Khởi động' },
  { id: 'takeoff', label: 'Cất cánh' },
  { id: 'route', label: 'Bay qua điểm' },
  { id: 'land', label: 'Hạ cánh' },
];

const COPY: { objective: string; hint: string }[] = [
  {
    objective: 'Nhấn Khởi động để bốn động cơ bắt đầu quay.',
    hint: 'Drone chỉ bay khi động cơ đã khởi động. Trong lúc chờ, bạn vẫn kéo được khung hình để nhìn quanh bãi đỗ.',
  },
  {
    objective: 'Giữ phím R để bay lên, tới khi drone chạm vòng mốc phía trên bãi đỗ.',
    hint: 'Buông tay ra là drone tự giữ nguyên độ cao — nó không rơi. Phím F để hạ xuống thấp lại.',
  },
  {
    objective: 'Bay qua ba vòng mốc màu san hô. W A S D để đi tới, lùi, sang trái, sang phải.',
    hint: 'Vòng đang sáng là vòng tiếp theo. Nếu bay lệch, buông hết phím ra: drone sẽ đứng yên tại chỗ để bạn ngắm lại.',
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

/** How far the room extends. Wide enough that the course never meets an edge. */
const ROOM_SPAN = 46;
/** Fixed physics step. The controller's gains are tuned against this rate. */
const PHYSICS_STEP = 1 / 200;
/** Sink rate past which an arrival is a crash rather than a firm landing. */
const CRASH_SINK = 3.4;
/** Tilt past which the aircraft has arrived on its side. */
const CRASH_TILT = (58 * Math.PI) / 180;

export function DroneLab({ startSignal }: { startSignal: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const sticksRef = useRef<StickState>({
    forward: false, back: false, left: false, right: false,
    up: false, down: false, yawLeft: false, yawRight: false,
  });
  const commandRef = useRef<{ arm: boolean; reset: boolean }>({ arm: false, reset: false });
  const stepRef = useRef(0);

  const [step, setStep] = useState(0);
  const [cleared, setCleared] = useState(0);
  /*
   * Which step's hint is open, rather than a boolean.
   *
   * A boolean needs an effect to clear it when the step changes, and a setState
   * inside an effect is a cascading render — the lint rule that catches it is
   * right. Keyed on the step, "is the hint open" is derived and the hint is
   * spent automatically the moment the step it answered is over.
   */
  const [hintFor, setHintFor] = useState<number | null>(null);
  const [flash, setFlash] = useState<LabFlash | null>(null);
  const [telemetry, setTelemetry] = useState({ altitude: 0, speed: 0 });
  const [armed, setArmed] = useState(false);
  const [finished, setFinished] = useState(false);

  const flashCount = useRef(0);
  const pushFlash = useCallback((text: string, tone: 'success' | 'warn') => {
    flashCount.current += 1;
    setFlash({ text, tone, key: flashCount.current });
  }, []);

  // The brief column's CTA lives outside this component, so it arrives as a
  // counter rather than as a callback: a number that only ever goes up is the
  // one shape of "do it again" that cannot be missed or double-fired.
  useEffect(() => {
    if (startSignal <= 0) return;
    commandRef.current.arm = true;
    hostRef.current?.focus();
  }, [startSignal]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;

    const room = createPracticeRoom(host, { mount, span: ROOM_SPAN, fov: 34 });
    const { stage } = room;

    const rig = createDroneRig();
    const course = createDroneCourse();
    stage.scene.add(rig.root);
    stage.scene.add(course.group);

    const state = createDroneState();
    const controller = new FlightController();
    const wind = new Wind();
    const sticks: Sticks = { roll: 0, pitch: 0, yaw: 0, climb: 0 };

    const FLOOR = rig.groundClearance;
    const spawn = new THREE.Vector3(course.launchPad.x, FLOOR, course.launchPad.z);
    state.position.copy(spawn);

    /** Where a hard arrival puts the aircraft back. Updated at every ring. */
    const recovery = { point: spawn.clone(), altitude: 0 };

    let clearedCount = 0;
    let airborne = 0;
    let crashHold = 0;
    let finishedRun = false;

    /*
     * Step changes write the ref *and* the state, in that order.
     *
     * The render loop reads `stepRef` several times a frame and React does not
     * commit until after the frame, so a loop that only called `setStep` would
     * see the old value on the next frame too — and fire the same transition,
     * and the same success message, twice. The ref is the loop's truth; the
     * state is the chrome's copy of it.
     */
    const goStep = (next: number) => {
      stepRef.current = next;
      setStep(next);
    };

    const resetRun = () => {
      state.position.copy(spawn);
      state.velocity.set(0, 0, 0);
      state.orientation.identity();
      state.angularVelocity.set(0, 0, 0);
      state.motorOmega.fill(0);
      state.motorThrust.fill(0);
      state.motorAngle.fill(0);
      state.armed = false;
      state.crashed = false;
      state.time = 0;
      controller.reset(state);
      wind.reset();
      clearedCount = 0;
      airborne = 0;
      crashHold = 0;
      finishedRun = false;
      recovery.point.copy(spawn);
      recovery.altitude = 0;
      for (const checkpoint of course.checkpoints) {
        const material = checkpoint.ring.material as THREE.MeshStandardMaterial;
        material.color.set(0xd6cabc);
        material.emissiveIntensity = 0;
        (checkpoint.glow.material as THREE.MeshBasicMaterial).opacity = 0;
      }
      (course.landingMark.material as THREE.MeshBasicMaterial).color.set(COURSE_COLORS.CORAL);
      course.takeoffGate.visible = false;
      setCleared(0);
      goStep(0);
      setArmed(false);
      setFinished(false);
      setFlash(null);
    };

    /** Put the aircraft back in the air over the last thing it got right. */
    const recover = () => {
      state.position.set(recovery.point.x, Math.max(recovery.altitude, FLOOR), recovery.point.z);
      state.velocity.set(0, 0, 0);
      state.orientation.identity();
      state.angularVelocity.set(0, 0, 0);
      state.crashed = false;
      state.armed = recovery.altitude > FLOOR + 0.2;
      controller.reset(state, state.position.y);
      airborne = 0;
      crashHold = 0;
      setArmed(state.armed);
    };

    /* --- input ------------------------------------------------------------ */
    const stickState = sticksRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = KEY_BINDINGS[event.code];
      if (!binding) return;
      event.preventDefault();
      stickState[binding] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const binding = KEY_BINDINGS[event.code];
      if (!binding) return;
      stickState[binding] = false;
    };
    const onBlur = () => {
      for (const key of Object.keys(stickState) as (keyof StickState)[]) stickState[key] = false;
    };
    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('keyup', onKeyUp);
    host.addEventListener('blur', onBlur);

    /* --- camera ----------------------------------------------------------- */
    let cameraYaw = 0;
    let cameraPitch = 0.26;
    /*
     * Close, because the aircraft is half a metre across.
     *
     * The physics is a real 7-inch quad at true scale, and at the six metres a
     * chase camera would normally sit that is forty pixels of drone on a 900 px
     * stage — a dot moving over a grid. Two and a bit metres is close enough
     * that the propellers, the skids and the coral nose stripe are all legible,
     * which is what makes the aircraft's attitude readable, which is the whole
     * skill this lab teaches.
     */
    let cameraDistance = 2.9;
    let dragging = false;
    let userAimed = 0;
    let previousX = 0;
    let previousY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest('button, a')) return;
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      host.setPointerCapture(event.pointerId);
      host.dataset.grabbing = 'true';
      host.focus();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      cameraYaw -= (event.clientX - previousX) * 0.006;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - previousY) * 0.004, 0.02, 0.85);
      previousX = event.clientX;
      previousY = event.clientY;
      // A drag is a takeover: stop chasing the nose for a few seconds so the
      // camera does not fight the hand that just aimed it.
      userAimed = 4;
    };
    const endDrag = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      delete host.dataset.grabbing;
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      cameraDistance = THREE.MathUtils.clamp(cameraDistance * (1 + event.deltaY * 0.0012), 1.7, 14);
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('wheel', onWheel, { passive: false });

    /* --- loop ------------------------------------------------------------- */
    const heading = new THREE.Euler(0, 0, 0, 'YXZ');
    const cameraTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const shadowPoint = new THREE.Vector3();
    let accumulator = 0;
    let hudElapsed = 0;
    let pulse = 0;
    const timer = new THREE.Timer();

    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;

      if (commandRef.current.reset) {
        commandRef.current.reset = false;
        resetRun();
      }
      if (commandRef.current.arm) {
        commandRef.current.arm = false;
        if (!state.armed) {
          state.armed = true;
          state.crashed = false;
          controller.reset(state, Math.max(state.position.y, FLOOR + 0.35));
          setArmed(true);
          if (stepRef.current === 0) {
            goStep(1);
            course.takeoffGate.visible = true;
          }
        }
      }

      // Sticks. Opposed keys cancel, which is what a real pair of gimbals does
      // and stops a student who is mashing everything from getting a diagonal.
      sticks.roll = (stickState.right ? 1 : 0) - (stickState.left ? 1 : 0);
      // Nose-up stick flies backwards, so "forward" is a negative pitch.
      sticks.pitch = (stickState.back ? 1 : 0) - (stickState.forward ? 1 : 0);
      sticks.yaw = (stickState.yawLeft ? 1 : 0) - (stickState.yawRight ? 1 : 0);
      sticks.climb = (stickState.up ? 1 : 0) - (stickState.down ? 1 : 0);
      if (state.crashed) {
        sticks.roll = 0; sticks.pitch = 0; sticks.yaw = 0; sticks.climb = 0;
      }

      accumulator = Math.min(accumulator + delta, PHYSICS_STEP * 12);
      while (accumulator >= PHYSICS_STEP) {
        accumulator -= PHYSICS_STEP;
        wind.step(PHYSICS_STEP);
        const demand = controller.update(state, sticks, PHYSICS_STEP);
        stepDynamics(state, mix(demand), wind.velocity(), PHYSICS_STEP);

        /* --- ground ----------------------------------------------------- */
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
              setArmed(false);
              pushFlash('Va chạm — đưa drone về điểm gần nhất', 'warn');
            } else if (!finishedRun) {
              const grade = gradeLanding(sink, tilt);
              const inZone = Math.hypot(
                state.position.x - course.landingZone.x,
                state.position.z - course.landingZone.z,
              ) <= course.landingRadius;
              if (stepRef.current === 3 && inZone) {
                finishedRun = true;
                state.armed = false;
                setArmed(false);
                setFinished(true);
                (course.landingMark.material as THREE.MeshBasicMaterial).color.set(COURSE_COLORS.SAGE);
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
        const radius = Math.hypot(state.position.x, state.position.z);
        if (radius > course.bounds.radius) {
          const pull = (radius - course.bounds.radius) * 2.4;
          state.velocity.x -= (state.position.x / radius) * pull * PHYSICS_STEP;
          state.velocity.z -= (state.position.z / radius) * pull * PHYSICS_STEP;
        }
        if (state.position.y > course.bounds.ceiling) {
          state.velocity.y -= (state.position.y - course.bounds.ceiling) * 3 * PHYSICS_STEP;
        }
      }

      if (crashHold > 0) {
        crashHold -= delta;
        if (crashHold <= 0) recover();
      }

      /* --- progression --------------------------------------------------- */
      if (stepRef.current === 1 && state.position.y >= course.takeoffAltitude - 0.35) {
        course.takeoffGate.visible = false;
        recovery.point.set(course.launchPad.x, 0, course.launchPad.z);
        recovery.altitude = course.takeoffAltitude;
        goStep(2);
        pushFlash('Đã cất cánh — drone đang giữ độ cao', 'success');
      }

      if (stepRef.current === 2 && clearedCount < course.checkpoints.length) {
        const next = course.checkpoints[clearedCount];
        /*
         * Capture at 1.1 × the ring's own radius, not 0.94.
         *
         * The test is a sphere, so its budget is spent on altitude as well as on
         * position — and the three rings deliberately sit at three different
         * heights, which is most of what the middle of this lesson teaches. At
         * 0.94 a student who had matched the height to within a metre had barely
         * half a metre of horizontal margin left, and a gate they cannot pass
         * teaches nothing except that they cannot fly. Slightly wider than the
         * rim is the right side to err on for a first flight: it still requires
         * flying at the ring rather than near it.
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
          if (clearedCount >= course.checkpoints.length) {
            goStep(3);
            pushFlash('Đủ ba vòng mốc — bay tới bãi đáp', 'success');
          } else {
            pushFlash(`Qua vòng ${clearedCount}/${course.checkpoints.length}`, 'success');
          }
        }
      }

      /* --- signalling ----------------------------------------------------- */
      pulse += delta;
      const beat = 0.5 + Math.sin(pulse * 3.1) * 0.5;
      if (stepRef.current === 2 && clearedCount < course.checkpoints.length) {
        const next = course.checkpoints[clearedCount];
        const material = next.ring.material as THREE.MeshStandardMaterial;
        material.color.set(COURSE_COLORS.CORAL);
        material.emissiveIntensity = 0.24 + beat * 0.5;
        (next.glow.material as THREE.MeshBasicMaterial).opacity = 0.05 + beat * 0.07;
      }
      if (course.takeoffGate.visible) {
        course.takeoffGate.scale.setScalar(1 + beat * 0.035);
      }
      (course.landingMark.material as THREE.MeshBasicMaterial).opacity = stepRef.current === 3
        ? 0.4 + beat * 0.5
        : 0.6;
      rig.beacon.intensity = state.armed ? 0.5 + beat * 0.9 : 0;

      /* --- projection ------------------------------------------------------ */
      rig.root.position.copy(state.position);
      rig.root.quaternion.copy(state.orientation);
      for (let index = 0; index < 4; index += 1) {
        rig.rotors[index].rotation.y = state.motorAngle[index];
        const spinFraction = Math.min(state.motorOmega[index] / 420, 1);
        (rig.blurs[index].material as THREE.MeshBasicMaterial).opacity = spinFraction * 0.34;
      }
      shadowPoint.copy(state.position);
      trackShadow(room.shadow, shadowPoint, 0.42, 0, 9);

      /* --- camera ---------------------------------------------------------- */
      if (userAimed > 0) userAimed -= delta;
      if (!dragging && userAimed <= 0) {
        heading.setFromQuaternion(state.orientation, 'YXZ');
        // Chase the nose, but lazily: a camera that locks to the airframe makes
        // every gust look like the world lurching rather than the aircraft.
        const wanted = heading.y;
        let difference = wanted - cameraYaw;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        cameraYaw += difference * Math.min(1, delta * 1.1);
      }
      const horizontal = Math.cos(cameraPitch) * cameraDistance;
      cameraTarget.set(
        state.position.x + Math.sin(cameraYaw) * horizontal,
        state.position.y + Math.sin(cameraPitch) * cameraDistance + 0.28,
        state.position.z + Math.cos(cameraYaw) * horizontal,
      );
      stage.camera.position.lerp(cameraTarget, 1 - Math.pow(0.0009, delta));
      lookTarget.set(state.position.x, state.position.y + 0.1, state.position.z);
      stage.camera.lookAt(lookTarget);

      hudElapsed += delta;
      if (hudElapsed > 0.14) {
        hudElapsed = 0;
        setTelemetry({
          altitude: Math.max(0, state.position.y - FLOOR),
          speed: Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z),
        });
      }

      stage.renderer.render(stage.scene, stage.camera);
      stage.noteFrame(delta);
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
      delete host.dataset.grabbing;
      rig.root.removeFromParent();
      course.group.removeFromParent();
      rig.dispose();
      course.dispose();
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

  const copy = COPY[step];
  const showControls = step >= 1;

  return (
    <div className="lab lab--drone" data-state="ready" ref={hostRef} tabIndex={0}>
      <div ref={viewRef} role="img" aria-label="Drone bốn cánh trong sân bay thử nghiệm 3D" className="lab-view" />

      <LabChrome
        live={armed || finished}
        steps={STEPS}
        activeStep={finished ? -1 : step}
        completedSteps={finished ? STEPS.length : step}
        objective={finished ? 'Hoàn thành bài bay. Nhấn Làm lại để bay lượt nữa.' : copy.objective}
        hint={copy.hint}
        hintOpen={hintFor === step}
        onHint={() => setHintFor((current) => (current === step ? null : step))}
        onReset={() => { commandRef.current.reset = true; }}
        flash={flash}
        readout={
          armed || step > 0 ? (
            <>
              <b>{telemetry.altitude.toFixed(1)}</b><span>m</span>
              <i aria-hidden="true" />
              <b>{telemetry.speed.toFixed(1)}</b><span>m/s</span>
              {step === 2 && (<><i aria-hidden="true" /><b>{cleared}/3</b><span>vòng</span></>)}
            </>
          ) : undefined
        }
        actions={
          !armed && !finished ? (
            <button
              type="button"
              className="lab-button is-primary"
              onClick={() => { commandRef.current.arm = true; hostRef.current?.focus(); }}
            >
              <span>Khởi động</span>
              <PracticeIcon name="takeoff" />
            </button>
          ) : null
        }
      >
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
      </LabChrome>
    </div>
  );
}
