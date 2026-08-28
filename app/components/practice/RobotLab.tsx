'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { LabChrome, LabPad, type LabFlash, type LabStep } from './LabChrome';
import { PracticeIcon } from './PracticeIcons';
import {
  ARM,
  CELL_COLORS,
  JOINT_LIMITS,
  LINE,
  MAX_RADIUS,
  approachAngles,
  createRobotCell,
  solveArm,
  toolPoint,
  type JointAngles,
} from '../../lib/robot/cell';
import { createPracticeRoom } from '../../lib/three/practiceRoom';

/**
 * Lab 03 — the industrial robot cell.
 *
 * The reference for this is a serious thing: the Open Industry Project, a Godot
 * warehouse simulator that speaks OPC-UA, EtherNet/IP and Modbus to real PLCs.
 * Almost none of that belongs in a student's first ten seconds with a robot
 * arm, and the part that does is the part nobody teaches: an industrial arm is
 * not programmed by typing joint angles, it is *taught* — an operator walks the
 * tool to a point, saves it, walks it to the next one, and then the cell repeats
 * what it was shown, forever, at speed.
 *
 * So this lab is that, in five beats:
 *
 *   01 Quan sát     turn the cell over and look at it
 *   02 Điều khiển   jog the gripper with four arrows and two lift keys
 *   03 Gắp vật      put the gripper on a box and close the jaws
 *   04 Đặt vật      carry it to its slot and open them
 *   05 Chạy tự động the cell repeats that motion for the two remaining boxes
 *
 * The controls are Cartesian, never joint angles: ← → is left and right in the
 * *room*, and an analytic three-link solve turns that into six joint commands
 * (`lib/robot/cell.ts`). Six raw sliders would be a truthful interface to a
 * six-axis arm and a completely useless one to a beginner — you cannot form the
 * intention "put it over the blue box" in joint space. They are still here,
 * behind "Chế độ nâng cao", because once a student has moved the tool around
 * for a minute, *that* is the moment the six axes become interesting.
 */

const STEPS: LabStep[] = [
  { id: 'look', label: 'Quan sát' },
  { id: 'jog', label: 'Điều khiển' },
  { id: 'pick', label: 'Gắp vật' },
  { id: 'place', label: 'Đặt vật' },
  { id: 'auto', label: 'Chạy tự động' },
];

const COPY: { objective: string; hint: string }[] = [
  {
    objective: 'Kéo để xoay quanh cánh tay robot và nhìn kỹ sáu khớp của nó.',
    hint: 'Từ chân đế lên: khớp xoay thân, khớp vai, khớp khuỷu, rồi ba khớp cổ tay. Sáu khớp là đủ để đưa kẹp tới bất kỳ điểm nào trong tầm với, ở bất kỳ hướng nào.',
  },
  {
    objective: 'Dùng ← → ↑ ↓ để đưa kẹp đi, và Nâng / Hạ để lên xuống.',
    hint: 'Bạn đang ra lệnh cho một điểm trong không gian, không phải cho từng khớp. Bộ điều khiển tự tính xem sáu khớp phải quay bao nhiêu — đó chính là việc một tủ điều khiển robot làm.',
  },
  {
    objective: 'Đưa kẹp xuống ngay trên khối hàng đang sáng, rồi nhấn Đóng kẹp.',
    hint: 'Vòng tròn dưới kẹp chuyển sang màu xanh khi vị trí đã đúng. Hạ kẹp xuống thấp ngang khối hàng trước khi đóng.',
  },
  {
    objective: 'Mang khối hàng sang ô trống trên khay, rồi nhấn Mở kẹp.',
    hint: 'Nâng khối hàng lên cao hơn thành khay trước khi đi ngang, nếu không kẹp sẽ va vào mép khay — đúng như thật.',
  },
  {
    objective: 'Nhấn Chạy tự động: robot lặp lại đúng thao tác bạn vừa dạy cho hai khối còn lại.',
    hint: 'Đây là cách một dây chuyền thật hoạt động: người vận hành dạy một lần, cell lặp lại hàng nghìn lần mà không lệch.',
  },
];

type JogState = {
  left: boolean; right: boolean; forward: boolean; back: boolean;
  up: boolean; down: boolean; turnLeft: boolean; turnRight: boolean;
};

const KEY_BINDINGS: Record<string, keyof JogState> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'forward', KeyW: 'forward',
  ArrowDown: 'back', KeyS: 'back',
  KeyR: 'up', Space: 'up',
  KeyF: 'down', ShiftLeft: 'down', ShiftRight: 'down',
  KeyQ: 'turnLeft',
  KeyE: 'turnRight',
};

const MOVE_PAD = [
  { id: 'forward', glyph: '↑', name: 'Đưa kẹp ra xa', area: 'up' },
  { id: 'left', glyph: '←', name: 'Đưa kẹp sang trái', area: 'left' },
  { id: 'back', glyph: '↓', name: 'Kéo kẹp lại gần', area: 'down' },
  { id: 'right', glyph: '→', name: 'Đưa kẹp sang phải', area: 'right' },
];

const LIFT_PAD = [
  { id: 'up', glyph: '▲', name: 'Nâng kẹp', area: 'up' },
  { id: 'down', glyph: '▼', name: 'Hạ kẹp', area: 'down' },
];

const JOINT_LABELS = ['J1 · Thân', 'J2 · Vai', 'J3 · Khuỷu', 'J4 · Cẳng tay', 'J5 · Cổ tay', 'J6 · Kẹp'];
const JOINT_KEYS: (keyof JointAngles)[] = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];

/** The room is a cell, not a hall: three metres across. */
const ROOM_SPAN = 4.2;
/** Tool jog speed, m/s. Slow enough to aim, fast enough not to be a chore. */
const JOG_SPEED = 0.42;
/** Joint slew rate, rad/s. */
const JOINT_RATE = 2.2;
/** How close the tool has to be to a target before the cell says "yes". */
const SNAP_RADIUS = 0.055;
/**
 * How close it has to be for the jaws to actually close on something.
 *
 * Deliberately *looser* than the indicator, and the order matters: the ring
 * turns green at `SNAP_RADIUS` and the grip is accepted out to here, so
 * anything that looks right works. The other way round is the classic teaching
 * -lab betrayal — a student presses the button while the ring is green, the arm
 * drifts two centimetres further in the frame it takes the command to land, and
 * the cell tells them they were in the wrong place. The margin is a third of a
 * box, so it can never be mistaken for "close enough to anything".
 */
const GRAB_RADIUS = SNAP_RADIUS * 1.7;

/* Out and up rather than tucked in: at a 0.57 m radius the elbow folds back on
   itself and the arm reads as a pile of white blocks instead of a linkage. */
const HOME_TARGET = new THREE.Vector3(0.46, 0.78, 0.5);

export function RobotLab({ startSignal }: { startSignal: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const jogRef = useRef<JogState>({
    left: false, right: false, forward: false, back: false,
    up: false, down: false, turnLeft: false, turnRight: false,
  });
  const commandRef = useRef({ grip: false, reset: false, auto: false, advance: false });
  const advancedRef = useRef<{ on: boolean; angles: JointAngles }>({
    on: false,
    angles: { j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 },
  });
  const stepRef = useRef(0);

  const [step, setStep] = useState(0);
  /* Keyed on the step rather than a boolean — see the note in `DroneLab`. */
  const [hintFor, setHintFor] = useState<number | null>(null);
  const [flash, setFlash] = useState<LabFlash | null>(null);
  const [gripClosed, setGripClosed] = useState(false);
  const [inRange, setInRange] = useState(false);
  const [placedCount, setPlacedCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [jointReadout, setJointReadout] = useState<JointAngles>({ j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 });

  const flashCount = useRef(0);
  const pushFlash = useCallback((text: string, tone: 'success' | 'warn') => {
    flashCount.current += 1;
    setFlash({ text, tone, key: flashCount.current });
  }, []);

  useEffect(() => {
    if (startSignal <= 0) return;
    commandRef.current.advance = true;
    hostRef.current?.focus();
  }, [startSignal]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;

    const room = createPracticeRoom(host, { mount, span: ROOM_SPAN, fov: 34 });
    const { stage } = room;
    // The cell has its own floor markings and three shadow-casting objects; the
    // shared blob would be a fourth, floating under an arm that is bolted down.
    room.shadow.mesh.visible = false;

    const cell = createRobotCell();
    stage.scene.add(cell.group);

    const angles: JointAngles = { j1: 0, j2: 0.9, j3: -1.7, j4: 0, j5: 0, j6: 0 };
    const target = HOME_TARGET.clone();
    let toolRoll = 0;
    let grip = 0;
    let gripTarget = 0;
    let jogged = 0;
    let dragged = false;
    /*
     * Seconds the *current* run has spent on the observe step.
     *
     * Separate from the animation clock, which is what this used to read. That
     * clock never resets — it drives the pulse of the target ring and the stack
     * light and has to be monotonic — so once the lab had been on screen for
     * nine seconds, pressing "Làm lại" put the visitor back on step 01 and
     * immediately advanced them off it again. The first step of the lesson was
     * unreachable for anybody on their second run.
     */
    let observing = 0;

    const tip = new THREE.Vector3();
    const worldTip = new THREE.Vector3();
    const carryOffset = new THREE.Vector3();

    const goStep = (next: number) => {
      stepRef.current = next;
      setStep(next);
    };

    /* --- the taught program ------------------------------------------------
     * Generated from the same pick and place points the student drove to by
     * hand, which is exactly what a teach pendant stores: an approach above the
     * part, a descent, a grip, a lift, a traverse, a descent, a release, a lift.
     * The two remaining parts run it unchanged. */
    const APPROACH = 0.18;
    type Waypoint = { point: THREE.Vector3; grip?: number; hold?: number };
    const buildProgram = (index: number): Waypoint[] => {
      const pick = cell.pickPoints[index];
      const place = cell.placePoints[index];
      return [
        { point: new THREE.Vector3(pick.x, pick.y + APPROACH, pick.z) },
        { point: pick.clone(), hold: 0.18 },
        { point: pick.clone(), grip: 1, hold: 0.4 },
        { point: new THREE.Vector3(pick.x, pick.y + APPROACH, pick.z) },
        { point: new THREE.Vector3(place.x, place.y + APPROACH, place.z) },
        { point: place.clone(), hold: 0.18 },
        { point: place.clone(), grip: 0, hold: 0.4 },
        { point: new THREE.Vector3(place.x, place.y + APPROACH, place.z) },
      ];
    };

    let program: Waypoint[] = [];
    let programIndex = 0;
    let programPart = -1;
    let holdTimer = 0;
    let autoRunning = false;
    let finishedRun = false;

    /* --- helpers ---------------------------------------------------------- */
    const nextPart = () => cell.parts.find((part) => !part.placed && !part.held) ?? null;
    const heldPart = () => cell.parts.find((part) => part.held) ?? null;

    const closeGrip = () => {
      const candidate = nextPart();
      if (!candidate) return false;
      const pick = cell.pickPoints[0];
      toolPoint(angles, tip);
      const near = Math.hypot(tip.x - candidate.mesh.position.x, tip.z - candidate.mesh.position.z) < GRAB_RADIUS
        && Math.abs(tip.y - candidate.mesh.position.y) < GRAB_RADIUS + 0.03
        && Math.hypot(candidate.mesh.position.x - pick.x, candidate.mesh.position.z - pick.z) < 0.03;
      gripTarget = 1;
      if (!near) return false;
      candidate.held = true;
      // Re-parenting rather than copying a world position every frame: the part
      // then inherits the tool's roll for free, which is the whole reason J6
      // exists.
      cell.toolCentre.getWorldPosition(worldTip);
      carryOffset.copy(candidate.mesh.position).sub(worldTip);
      return true;
    };

    /*
     * Opening the jaws is refused while the part is over nowhere.
     *
     * The obvious implementation — open, and drop whatever was held — models a
     * real gripper honestly and teaches nothing: a box that falls through the
     * floor is a bug to a student, not a consequence. Refusing the release and
     * saying why keeps the failure inside the lesson.
     */
    const openGrip = () => {
      const carried = heldPart();
      if (!carried) {
        gripTarget = 0;
        return true;
      }
      toolPoint(angles, tip);
      const slot = cell.placePoints[carried.slot];
      const near = Math.hypot(tip.x - slot.x, tip.z - slot.z) < GRAB_RADIUS
        && Math.abs(tip.y - slot.y) < GRAB_RADIUS + 0.06;
      if (!near) return false;
      gripTarget = 0;
      carried.held = false;
      carried.placed = true;
      carried.mesh.position.copy(slot);
      (carried.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      return true;
    };

    const resetCell = () => {
      angles.j1 = 0; angles.j2 = 0.9; angles.j3 = -1.7; angles.j4 = 0; angles.j5 = 0; angles.j6 = 0;
      target.copy(HOME_TARGET);
      toolRoll = 0;
      grip = 0;
      gripTarget = 0;
      jogged = 0;
      dragged = false;
      observing = 0;
      autoRunning = false;
      finishedRun = false;
      program = [];
      programIndex = 0;
      programPart = -1;
      for (const part of cell.parts) {
        part.held = false;
        part.placed = false;
        part.mesh.position.copy(part.home);
        (part.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      }
      cell.targetMark.visible = false;
      goStep(0);
      setGripClosed(false);
      setPlacedCount(0);
      setRunning(false);
      setFinished(false);
      setFlash(null);
      setAdvanced(false);
      advancedRef.current.on = false;
    };

    /* --- input ------------------------------------------------------------- */
    const jog = jogRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyG' || event.code === 'Enter') {
        event.preventDefault();
        commandRef.current.grip = true;
        return;
      }
      const binding = KEY_BINDINGS[event.code];
      if (!binding) return;
      event.preventDefault();
      jog[binding] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const binding = KEY_BINDINGS[event.code];
      if (binding) jog[binding] = false;
    };
    const onBlur = () => {
      for (const key of Object.keys(jog) as (keyof JogState)[]) jog[key] = false;
    };
    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('keyup', onKeyUp);
    host.addEventListener('blur', onBlur);

    /* --- camera ------------------------------------------------------------ */
    let cameraYaw = 0.52;
    let cameraPitch = 0.38;
    /* The cell is 2.5 m across from the tray to the far end of the conveyor;
       at 2.75 the stack light's post ran off the top of the frame and the arm
       filled it edge to edge. */
    let cameraDistance = 3.3;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    /* Aimed at the work, not at the machine: the trays and the pick station are
       all in front of the base, so the frame's centre belongs there too. */
    const pivot = new THREE.Vector3(0.4, 0.44, 0.3);
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
      cameraYaw -= (event.clientX - previousX) * 0.007;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - previousY) * 0.005, -0.05, 0.92);
      previousX = event.clientX;
      previousY = event.clientY;
      dragged = true;
    };
    const endDrag = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      delete host.dataset.grabbing;
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      cameraDistance = THREE.MathUtils.clamp(cameraDistance * (1 + event.deltaY * 0.0012), 1.6, 6.4);
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('wheel', onWheel, { passive: false });

    /* --- loop --------------------------------------------------------------- */
    const cameraTarget = new THREE.Vector3();
    const solved: JointAngles = { j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 };
    let hudElapsed = 0;
    let pulse = 0;
    const timer = new THREE.Timer();

    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      const commands = commandRef.current;
      const phase = stepRef.current;

      if (commands.reset) { commands.reset = false; resetCell(); }

      if (commands.advance) {
        commands.advance = false;
        if (stepRef.current === 0) goStep(1);
      }

      if (commands.auto) {
        commands.auto = false;
        if (!autoRunning) {
          const candidate = nextPart();
          if (candidate) {
            programPart = cell.parts.indexOf(candidate);
            program = buildProgram(programPart);
            programIndex = 0;
            holdTimer = 0;
            autoRunning = true;
            setRunning(true);
          }
        }
      }

      if (commands.grip) {
        commands.grip = false;
        if (!autoRunning) {
          if (gripTarget > 0.5 || heldPart()) {
            const released = openGrip();
            if (released) {
              setGripClosed(false);
              const done = cell.parts.filter((part) => part.placed).length;
              setPlacedCount(done);
              if (done > 0) {
                pushFlash('Đã đặt vật vào đúng ô', 'success');
                if (stepRef.current === 3) goStep(4);
              }
            } else {
              pushFlash('Chưa tới ô trống trên khay', 'warn');
            }
          } else {
            const grabbed = closeGrip();
            setGripClosed(true);
            if (grabbed) {
              pushFlash('Đã gắp vật', 'success');
              if (stepRef.current === 2) goStep(3);
            } else {
              pushFlash('Kẹp chưa đúng vị trí khối hàng', 'warn');
            }
          }
        }
      }

      /* --- what the student is being asked to reach --------------------- */
      const carried = heldPart();
      const pending = nextPart();
      let mark: THREE.Vector3 | null = null;
      if (!autoRunning && phase === 2 && pending) mark = cell.pickPoints[0];
      if (!autoRunning && phase === 3 && carried) mark = cell.placePoints[carried.slot];

      /* --- driving the arm ----------------------------------------------- */
      if (autoRunning) {
        const waypoint = program[programIndex];
        if (waypoint) {
          target.copy(waypoint.point);
          if (waypoint.grip !== undefined) gripTarget = waypoint.grip;
          toolPoint(angles, tip);
          const arrived = tip.distanceTo(waypoint.point) < 0.028
            && Math.abs(grip - gripTarget) < 0.05;
          if (arrived) {
            holdTimer += delta;
            if (holdTimer >= (waypoint.hold ?? 0)) {
              holdTimer = 0;
              // Grip transitions are where the part actually changes hands.
              if (waypoint.grip === 1) {
                const part = cell.parts[programPart];
                if (part && !part.held && !part.placed) {
                  part.held = true;
                  cell.toolCentre.getWorldPosition(worldTip);
                  carryOffset.copy(part.mesh.position).sub(worldTip);
                }
              } else if (waypoint.grip === 0) {
                const part = cell.parts[programPart];
                if (part && part.held) {
                  part.held = false;
                  part.placed = true;
                  part.mesh.position.copy(cell.placePoints[part.slot]);
                  (part.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                  setPlacedCount(cell.parts.filter((entry) => entry.placed).length);
                }
              }
              programIndex += 1;
              if (programIndex >= program.length) {
                const remaining = nextPart();
                if (remaining) {
                  programPart = cell.parts.indexOf(remaining);
                  program = buildProgram(programPart);
                  programIndex = 0;
                } else {
                  autoRunning = false;
                  finishedRun = true;
                  setRunning(false);
                  setFinished(true);
                  target.copy(HOME_TARGET);
                  pushFlash('Cell đã xếp xong cả ba khối hàng', 'success');
                }
              }
            }
          } else {
            holdTimer = 0;
          }
        }
      } else if (!advancedRef.current.on) {
        const dx = (jog.right ? 1 : 0) - (jog.left ? 1 : 0);
        const dz = (jog.forward ? 1 : 0) - (jog.back ? 1 : 0);
        const dy = (jog.up ? 1 : 0) - (jog.down ? 1 : 0);
        const turn = (jog.turnLeft ? 1 : 0) - (jog.turnRight ? 1 : 0);
        if (dx || dz || dy) {
          const move = JOG_SPEED * delta;
          target.x += dx * move;
          target.z += dz * move;
          target.y += dy * move;
          jogged += Math.abs(dx) * move + Math.abs(dz) * move + Math.abs(dy) * move;
        }
        toolRoll = THREE.MathUtils.clamp(toolRoll + turn * delta * 1.6, -Math.PI, Math.PI);

        /*
         * The workspace, enforced on the *target* rather than on the arm.
         *
         * Clamping the solved angles instead would let the student drive the
         * commanded point out to infinity while the arm sat still at full
         * stretch — and then nothing would move for several seconds when they
         * came back. Holding the target inside the envelope means the tool is
         * always somewhere the arm can actually be.
         */
        const radius = Math.hypot(target.x, target.z);
        if (radius > MAX_RADIUS) {
          target.x *= MAX_RADIUS / radius;
          target.z *= MAX_RADIUS / radius;
        }
        if (radius < 0.24) {
          const scale = radius > 1e-4 ? 0.24 / radius : 0;
          target.x *= scale;
          target.z *= scale;
        }
        target.y = THREE.MathUtils.clamp(target.y, 0.12, ARM.shoulderHeight + ARM.upperArm + 0.28);
      }

      if (advancedRef.current.on && !autoRunning) {
        for (const key of JOINT_KEYS) angles[key] = advancedRef.current.angles[key];
        toolPoint(angles, tip);
        target.copy(tip);
      } else {
        const solution = solveArm(target, toolRoll);
        solved.j1 = solution.angles.j1;
        solved.j2 = solution.angles.j2;
        solved.j3 = solution.angles.j3;
        solved.j4 = solution.angles.j4;
        solved.j5 = solution.angles.j5;
        solved.j6 = solution.angles.j6;
        approachAngles(angles, solved, JOINT_RATE * delta);
      }
      cell.applyAngles(angles);

      grip += (gripTarget - grip) * Math.min(1, delta * 7);
      cell.setGrip(grip);

      /* --- the belt, and the queue ---------------------------------------- */
      for (const slat of cell.slats) {
        slat.position.x -= LINE.beltSpeed * delta;
        if (slat.position.x < LINE.pickX - 0.1) slat.position.x += 1.4;
      }
      let queue = 0;
      for (const part of cell.parts) {
        if (part.placed || part.held) continue;
        const wantedX = LINE.pickX + queue * 0.24;
        part.mesh.position.x += (wantedX - part.mesh.position.x)
          * Math.min(1, delta * LINE.beltSpeed * 12);
        part.mesh.position.y = LINE.beltTop + 0.05;
        part.mesh.position.z = LINE.pickZ;
        queue += 1;
      }
      // The carried part rides the tool centre, so it inherits J6's roll.
      if (carried) {
        cell.toolCentre.getWorldPosition(worldTip);
        carried.mesh.position.copy(worldTip).add(carryOffset);
        carried.mesh.rotation.y = angles.j1 + angles.j6;
      }

      /* --- signalling ------------------------------------------------------ */
      pulse += delta;
      const beat = 0.5 + Math.sin(pulse * 3.4) * 0.5;
      toolPoint(angles, tip);

      let near = false;
      if (mark) {
        near = Math.hypot(tip.x - mark.x, tip.z - mark.z) < SNAP_RADIUS
          && Math.abs(tip.y - mark.y) < SNAP_RADIUS + (phase === 3 ? 0.05 : 0.02);
        cell.targetMark.visible = true;
        cell.targetMark.position.set(mark.x, mark.y - 0.045, mark.z);
        const material = cell.targetMark.material as THREE.MeshBasicMaterial;
        material.color.set(near ? CELL_COLORS.SAGE : CELL_COLORS.CORAL);
        material.opacity = near ? 0.95 : 0.35 + beat * 0.4;
        cell.targetMark.scale.setScalar(near ? 1 : 1 + beat * 0.12);
      } else {
        cell.targetMark.visible = false;
      }

      for (const part of cell.parts) {
        const material = part.mesh.material as THREE.MeshStandardMaterial;
        const highlight = !autoRunning && phase === 2 && part === pending;
        material.emissiveIntensity = highlight ? 0.12 + beat * 0.3 : 0;
      }

      // The stack light: amber while the cell waits for a person, green while
      // it runs its own program, and green-held once the job is done.
      const done = cell.parts.every((part) => part.placed);
      cell.beaconMaterial.color.set(autoRunning || done ? 0xcfe0c8 : 0xdcc39a);
      cell.beaconMaterial.emissive.set(autoRunning || done ? CELL_COLORS.SAGE : 0xb08a4a);
      cell.beaconMaterial.emissiveIntensity = autoRunning ? 0.4 + beat * 0.7 : done ? 0.9 : 0.5;

      /* --- progression ------------------------------------------------------ */
      if (phase === 0) observing += delta;
      if (phase === 0 && (dragged || observing > 9)) goStep(1);
      if (phase === 1 && jogged > 0.3) {
        goStep(2);
        pushFlash('Tốt — giờ đưa kẹp tới khối hàng đang sáng', 'success');
      }
      // A student who works out the pick-and-place before reaching the auto step
      // has done the whole lesson; the cell should say so rather than wait for a
      // button that has nothing left to run.
      if (done && !autoRunning && !finishedRun) {
        finishedRun = true;
        goStep(STEPS.length - 1);
        setRunning(false);
        setFinished(true);
        pushFlash('Cell đã xếp xong cả ba khối hàng', 'success');
      }

      /* --- camera ------------------------------------------------------------ */
      const horizontal = Math.cos(cameraPitch) * cameraDistance;
      cameraTarget.set(
        pivot.x + Math.sin(cameraYaw) * horizontal,
        pivot.y + Math.sin(cameraPitch) * cameraDistance,
        pivot.z + Math.cos(cameraYaw) * horizontal,
      );
      if (!stage.reduceMotion && !dragging && phase === 0) cameraYaw += delta * 0.12;
      stage.camera.position.lerp(cameraTarget, 1 - Math.pow(0.002, delta));
      stage.camera.lookAt(pivot);

      hudElapsed += delta;
      if (hudElapsed > 0.16) {
        hudElapsed = 0;
        setInRange(near);
        setJointReadout({ ...angles });
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
      cell.group.removeFromParent();
      cell.dispose();
      room.dispose();
    };
  }, [pushFlash]);

  const press = useCallback((id: string) => {
    jogRef.current[id as keyof JogState] = true;
    hostRef.current?.focus();
  }, []);
  const release = useCallback((id: string) => {
    jogRef.current[id as keyof JogState] = false;
  }, []);

  const toggleAdvanced = useCallback(() => {
    setAdvanced((current) => {
      const next = !current;
      // Seed the sliders from where the arm actually is, so switching modes
      // never moves it. Coming back out, the IK target is re-derived from the
      // same angles by the loop.
      advancedRef.current.angles = { ...jointReadout };
      advancedRef.current.on = next;
      return next;
    });
  }, [jointReadout]);

  const setJoint = useCallback((key: keyof JointAngles, value: number) => {
    advancedRef.current.angles = { ...advancedRef.current.angles, [key]: value };
    setJointReadout((current) => ({ ...current, [key]: value }));
  }, []);

  const copy = COPY[step];

  return (
    <div className="lab lab--robot" data-state="ready" ref={hostRef} tabIndex={0}>
      <div ref={viewRef} role="img" aria-label="Cánh tay robot công nghiệp sáu trục trong một ô sản xuất 3D" className="lab-view" />

      <LabChrome
        live={running || placedCount > 0}
        steps={STEPS}
        activeStep={finished ? -1 : step}
        completedSteps={finished ? STEPS.length : step}
        objective={finished ? 'Cả ba khối hàng đã vào khay. Nhấn Làm lại để dạy robot lượt nữa.' : copy.objective}
        hint={copy.hint}
        hintOpen={hintFor === step}
        onHint={() => setHintFor((current) => (current === step ? null : step))}
        onReset={() => { commandRef.current.reset = true; }}
        flash={flash}
        readout={
          step >= 1 ? (
            <>
              <b>{placedCount}/3</b><span>khối</span>
              <i aria-hidden="true" />
              <b>{gripClosed ? 'Đóng' : 'Mở'}</b><span>kẹp</span>
              {inRange && !running && (<><i aria-hidden="true" /><b className="is-ok">Đúng vị trí</b></>)}
            </>
          ) : undefined
        }
        actions={
          <>
            {step === 0 && (
              <button
                type="button"
                className="lab-button is-primary"
                onClick={() => { commandRef.current.advance = true; hostRef.current?.focus(); }}
              >
                <span>Bắt đầu điều khiển</span>
                <PracticeIcon name="joint" />
              </button>
            )}
            {(step === 2 || step === 3) && (
              <button
                type="button"
                className="lab-button is-primary"
                onClick={() => { commandRef.current.grip = true; hostRef.current?.focus(); }}
              >
                <span>{gripClosed ? 'Mở kẹp' : 'Đóng kẹp'}</span>
                <PracticeIcon name="grip" />
              </button>
            )}
            {step === 4 && !finished && (
              <button
                type="button"
                className="lab-button is-primary"
                disabled={running}
                onClick={() => { commandRef.current.auto = true; }}
              >
                <span>{running ? 'Đang chạy…' : 'Chạy tự động'}</span>
                <PracticeIcon name="auto" />
              </button>
            )}
          </>
        }
      >
        {step >= 1 && !running && (
          <>
            <div className="lab-keys" aria-hidden="true">
              <p><kbd>←</kbd><kbd>→</kbd><span>Trái / phải</span></p>
              <p><kbd>↑</kbd><kbd>↓</kbd><span>Tiến / lùi</span></p>
              <p><kbd>R</kbd><kbd>F</kbd><span>Nâng / hạ</span></p>
              <p><kbd>Q</kbd><kbd>E</kbd><span>Xoay kẹp</span></p>
            </div>
            <LabPad label="Di chuyển kẹp" buttons={MOVE_PAD} onPress={press} onRelease={release} />
            <LabPad
              label="Nâng hạ kẹp"
              className="lab-pad--lift"
              buttons={LIFT_PAD}
              onPress={press}
              onRelease={release}
            />
          </>
        )}

        {step >= 1 && (
          <div className={`lab-advanced${advanced ? ' is-open' : ''}`}>
            <button type="button" aria-expanded={advanced} onClick={toggleAdvanced}>
              <PracticeIcon name="joint" />
              <span>Chế độ nâng cao</span>
            </button>
            {advanced && (
              <div className="lab-joints">
                {JOINT_KEYS.map((key, index) => (
                  <label key={key}>
                    <span>{JOINT_LABELS[index]}</span>
                    <input
                      type="range"
                      min={JOINT_LIMITS[index][0]}
                      max={JOINT_LIMITS[index][1]}
                      step={0.01}
                      value={jointReadout[key]}
                      onChange={(event) => setJoint(key, Number(event.target.value))}
                    />
                    <b>{Math.round((jointReadout[key] * 180) / Math.PI)}°</b>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </LabChrome>
    </div>
  );
}
