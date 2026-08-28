'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PracticeIcon } from './PracticeIcons';
import {
  CASE,
  CASE_COUNT,
  PER_LAYER,
  PICK_POINT,
  createRobotCellScene,
  slotPosition,
  type CellCase,
  type RobotCellScene,
} from '../../lib/robot/cellScene';
import {
  HOME_DEG,
  JOINT_LABELS,
  JOINT_LIMITS_DEG,
  approachJoints,
  clampJointDeg,
  createForwardKinematics,
  maxRadiusAt,
  solveToolDown,
  type JointIndex,
} from '../../lib/robot/sixAxis';
import { createPracticeRoom } from '../../lib/three/practiceRoom';

/**
 * Lab 03 — the palletising cell.
 *
 * The reference is a serious thing: the Open Industry Project, a Godot
 * warehouse simulator that speaks OPC-UA, EtherNet/IP and Modbus to real PLCs.
 * Its arm is now *literally* in this lab (`lib/robot/sixAxis.ts` loads the
 * model and transcribes the rig from its scene file), and having the real
 * machine changed what this lesson can be.
 *
 * The version this replaces gave a beginner four arrow keys and hid the six
 * axes behind an "advanced mode", on the reasoning that you cannot form the
 * intention "put it over the box" in joint space. That reasoning is correct and
 * it was the wrong conclusion, because it answers a question nobody asked: a
 * student who opens a robot lab is not trying to move a box efficiently, they
 * are trying to find out what the six joints *do*. Hiding them made the lab
 * easier to complete and pointless to open.
 *
 * So the control panel is the lab now, and it is the real division of labour on
 * any cell floor:
 *
 *   **THỦ CÔNG** — the pendant. Six joint sliders against the real limit table,
 *   or Cartesian jog with the plate held vertical by an analytic solve. Vacuum
 *   on the operator. This is where a student discovers that J1 swings the whole
 *   machine and J5 only nods the tool.
 *
 *   **TỰ ĐỘNG** — the program. Twelve cases, six to a layer, two layers, and
 *   the cell runs the cycle until the pallet is built. This is where they see
 *   that the twelve picks are *one* taught motion plus an index, which is the
 *   single most useful thing to know about industrial automation and is invisible
 *   from outside a cell.
 *
 * Teaching sits between them: save the pose you drove to, then let the cell go
 * back to it. That is what a teach pendant is, and it is the bridge between the
 * two modes rather than a third one.
 */

/* -------------------------------------------------------------- constants --- */

/** The room is a cell hall: 14 m across, for a 3 m robot. */
const ROOM_SPAN = 14;
/** Joint slew, degrees per second at 100% speed. Upstream's default is 45. */
const JOINT_RATE = 62;
/** Cartesian jog, metres per second. */
const JOG_SPEED = 0.55;
/** Belt speed, metres per second. A real case line runs 0.3–0.6. */
const BELT_SPEED = 0.55;
/** How close the plate has to be to a case's top face to draw it. */
const PICK_TOLERANCE = 0.17;
/** …and to a pallet slot to let go over it. */
const PLACE_TOLERANCE = 0.24;
/** Clearance the cycle lifts to before traversing, metres. */
const CLEARANCE = 0.55;

const STEPS = [
  { id: 'look', label: 'Quan sát' },
  { id: 'jog', label: 'Điều khiển' },
  { id: 'pick', label: 'Gắp & đặt' },
  { id: 'auto', label: 'Chạy tự động' },
] as const;

const COPY: { objective: string; hint: string }[] = [
  {
    objective: 'Kéo để xoay quanh cell và nhìn kỹ sáu khớp của cánh tay.',
    hint: 'Từ chân đế lên: khớp xoay thân, khớp vai, khớp khuỷu, rồi ba khớp cổ tay. Cần đúng sáu khớp để đưa tấm hút tới bất kỳ điểm nào trong tầm với, ở bất kỳ hướng nào.',
  },
  {
    objective: 'Trong bảng điều khiển, kéo thử một thanh khớp — hoặc chuyển sang Tọa độ để chạy theo X, Y, Z.',
    hint: 'Chế độ Khớp ra lệnh cho từng động cơ. Chế độ Tọa độ ra lệnh cho một điểm trong không gian, và bộ điều khiển tự tính sáu góc quay — đó chính là việc một tủ điều khiển robot làm.',
  },
  {
    objective: 'Đưa tấm hút xuống sát mặt trên thùng hàng, bật Hút, rồi mang nó sang pallet và Nhả.',
    hint: 'Vòng tròn chuyển sang xanh khi tấm hút đã đủ gần. Ở chế độ Tọa độ, tấm hút luôn nằm ngang nên bạn chỉ cần hạ đúng độ cao.',
  },
  {
    objective: 'Bật TỰ ĐỘNG rồi nhấn Chạy: cell xếp hết 12 thùng thành hai lớp.',
    hint: 'Mười hai lần gắp không phải mười hai điểm được dạy. Chỉ có một chuyển động được dạy, cộng với một chỉ số ô — đó là lý do một dây chuyền thật đổi được kiểu xếp mà không phải dạy lại.',
  },
];

/** Cycle phases, in order. The panel prints the current one. */
const PHASES = {
  feed: 'Chờ thùng vào vị trí',
  approach: 'Tới trên thùng',
  descend: 'Hạ tấm hút',
  grip: 'Hút chân không',
  lift: 'Nâng thùng',
  traverse: 'Sang pallet',
  lower: 'Hạ vào ô',
  release: 'Nhả chân không',
  retract: 'Rút lên',
  done: 'Hoàn thành pallet',
} as const;

type Phase = keyof typeof PHASES;

type Mode = 'auto' | 'manual';
type ManualKind = 'joint' | 'tcp';

type Waypoint = { name: string; degrees: number[] };

/** What the UI writes and the render loop reads. */
type Control = {
  mode: Mode;
  manual: ManualKind;
  /** Multiplier on `JOINT_RATE`. */
  speed: number;
  running: boolean;
  vacuum: boolean;
  /** Manual joint-mode commanded angles, degrees. */
  jointTargets: number[];
  /** Cartesian jog, held. */
  jog: Record<'xPlus' | 'xMinus' | 'yPlus' | 'yMinus' | 'zPlus' | 'zMinus', boolean>;
};

type Pulse = {
  home: boolean;
  reset: boolean;
  /** Index into the waypoint list, or −1. */
  goTo: number;
  /** Sync `jointTargets` from wherever the arm currently is. */
  sync: boolean;
};

/** Live numbers the panel prints. Kept in one object so one render updates all. */
type Readout = {
  degrees: number[];
  tcp: [number, number, number];
  placed: number;
  holding: boolean;
  phase: Phase;
  cycles: number;
  /** Seconds for the last completed pick-to-place, or 0. */
  cycleTime: number;
  reachable: boolean;
};

const JOG_KEYS: Record<string, keyof Control['jog']> = {
  ArrowUp: 'zPlus', KeyW: 'zPlus',
  ArrowDown: 'zMinus', KeyS: 'zMinus',
  ArrowLeft: 'xMinus', KeyA: 'xMinus',
  ArrowRight: 'xPlus', KeyD: 'xPlus',
  KeyR: 'yPlus', Space: 'yPlus',
  KeyF: 'yMinus', ShiftLeft: 'yMinus', ShiftRight: 'yMinus',
};

export function RobotLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const controlRef = useRef<Control>({
    mode: 'manual',
    manual: 'joint',
    speed: 1,
    running: false,
    vacuum: false,
    jointTargets: [...HOME_DEG],
    jog: { xPlus: false, xMinus: false, yPlus: false, yMinus: false, zPlus: false, zMinus: false },
  });
  const pulseRef = useRef<Pulse>({ home: false, reset: false, goTo: -1, sync: false });
  const waypointsRef = useRef<Waypoint[]>([]);
  const stepRef = useRef(0);

  const [mode, setMode] = useState<Mode>('manual');
  const [manual, setManual] = useState<ManualKind>('joint');
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [vacuum, setVacuum] = useState(false);
  const [jointTargets, setJointTargets] = useState<number[]>([...HOME_DEG]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [step, setStep] = useState(0);
  const [hintOpen, setHintOpen] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [flash, setFlash] = useState<{ text: string; tone: 'success' | 'warn'; key: number } | null>(null);
  const [readout, setReadout] = useState<Readout>({
    degrees: [...HOME_DEG],
    tcp: [0, 0, 0],
    placed: 0,
    holding: false,
    phase: 'feed',
    cycles: 0,
    cycleTime: 0,
    reachable: true,
  });

  const flashCount = useRef(0);
  const pushFlash = useCallback((text: string, tone: 'success' | 'warn') => {
    flashCount.current += 1;
    setFlash({ text, tone, key: flashCount.current });
  }, []);

  /* Mirror the declarative UI state into the loop's ref. Cheaper and clearer
     than threading six setters through the effect's closure. */
  useEffect(() => { controlRef.current.mode = mode; }, [mode]);
  useEffect(() => { controlRef.current.manual = manual; }, [manual]);
  useEffect(() => { controlRef.current.speed = speed; }, [speed]);
  useEffect(() => { controlRef.current.running = running; }, [running]);
  useEffect(() => { controlRef.current.vacuum = vacuum; }, [vacuum]);
  useEffect(() => { controlRef.current.jointTargets = jointTargets; }, [jointTargets]);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;

    let disposed = false;
    const room = createPracticeRoom(host, { mount, span: ROOM_SPAN, fov: 32 });
    const { stage } = room;
    /* The cell paints its own floor markings and everything in it is bolted
       down, so the shared blob shadow would be a smudge under a fixed machine. */
    room.shadow.mesh.visible = false;

    let cell: RobotCellScene | null = null;
    const fk = createForwardKinematics();

    /* --- pose state -------------------------------------------------------- */
    const current = [...HOME_DEG];
    /** Where the arm is being asked to go. Both modes write here. */
    const commanded = [...HOME_DEG];
    /** Cartesian jog target, in the arm's frame. Seeded from the home pose. */
    const tcp = new THREE.Vector3();
    let vacuumOn = false;
    let held: CellCase | null = null;
    let phase: Phase = 'feed';
    let holdTimer = 0;
    let cycles = 0;
    let cycleClock = 0;
    let lastCycleTime = 0;
    let placed = 0;
    let reachable = true;
    let observing = 0;
    let jogged = 0;

    const worldTip = new THREE.Vector3();
    const scratch = new THREE.Vector3();
    const scratchB = new THREE.Vector3();

    /* --- camera ------------------------------------------------------------ */
    let cameraYaw = 0.82;
    /*
     * Looking down *into* the cell, not across it.
     *
     * The guarding is 2 m tall and the camera used to sit at 3.5 m, nine
     * metres out, which put four metres of mesh fence across the bottom of
     * every frame. At this pitch the eye is 4.9 m up and clears it, which is
     * also the angle anyone photographing a real cell shoots from and the
     * only one that shows the pallet pattern being built.
     */
    let cameraPitch = 0.4;
    /* Framed on the working triangle — arm, pick station, pallet — with the
       racking behind it. At 11.2 the two rack bays took the upper third of the
       frame and the arm read as the smallest machine in the room. */
    let cameraDistance = 11.0;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    /* Aimed at the work, not at the machine: the pick station, the pallet and
       the arm's own wrist all sit forward and left of the base. */
    const pivot = new THREE.Vector3(-0.8, 1.1, 0.7);

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
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - previousY) * 0.005, 0.08, 0.9);
      previousX = event.clientX;
      previousY = event.clientY;
      if (stepRef.current === 0) observing += 1.4;
    };
    const endDrag = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      delete host.dataset.grabbing;
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      cameraDistance = THREE.MathUtils.clamp(cameraDistance * (1 + event.deltaY * 0.0012), 3.2, 24);
    };

    /* --- keyboard ---------------------------------------------------------- */
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = JOG_KEYS[event.code];
      if (!binding) return;
      /* Only in Cartesian manual mode. In joint mode the arrows belong to
         whichever slider has focus, and stealing them would break the panel. */
      if (controlRef.current.mode !== 'manual' || controlRef.current.manual !== 'tcp') return;
      event.preventDefault();
      controlRef.current.jog[binding] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const binding = JOG_KEYS[event.code];
      if (binding) controlRef.current.jog[binding] = false;
    };
    const onBlur = () => {
      const jog = controlRef.current.jog;
      for (const key of Object.keys(jog) as (keyof Control['jog'])[]) jog[key] = false;
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('keyup', onKeyUp);
    host.addEventListener('blur', onBlur);

    /* --- vacuum ------------------------------------------------------------ */

    /** Top-face centre of a case — where the suction plate has to be. */
    const graspPoint = (entry: CellCase, out: THREE.Vector3) => {
      entry.mesh.getWorldPosition(out);
      out.y += CASE.y / 2;
      return out;
    };

    /**
     * Draws whatever the plate is over.
     *
     * A distance test rather than the upstream `Area3D` overlap, and the
     * tolerance is deliberately generous: the ring that says "close enough"
     * turns green at `PICK_TOLERANCE`, so anything that *looks* right works.
     * The other way round is the classic teaching-lab betrayal — the student
     * presses the button while the ring is green, the arm drifts a centimetre
     * in the frame it takes the command to land, and the cell tells them they
     * were in the wrong place.
     */
    const draw = () => {
      if (!cell || held) return false;
      arm().toolTip.getWorldPosition(worldTip);
      const candidate = cell.cases.find(
        (entry) => entry.state === 'waiting' && graspPoint(entry, scratch).distanceTo(worldTip) < PICK_TOLERANCE,
      );
      if (!candidate) return false;
      /* `attach` rather than `add`: the case keeps its world transform, so a
         suction pick looks like the plate closing on a box that was already
         there rather than the box jumping to the plate. */
      arm().toolTip.attach(candidate.mesh);
      candidate.state = 'held';
      held = candidate;
      return true;
    };

    /**
     * Lets go — but only over a slot.
     *
     * The honest implementation drops whatever was held wherever it was, and it
     * teaches nothing: a case that falls through the floor reads as a bug, not
     * as a consequence. Refusing the release and saying why keeps the failure
     * inside the lesson.
     */
    const release = () => {
      if (!cell || !held) return false;
      arm().toolTip.getWorldPosition(worldTip);
      const slot = slotPosition(placed, scratchB);
      const top = slot.clone();
      top.y += CASE.y / 2;
      if (top.distanceTo(worldTip) > PLACE_TOLERANCE) return false;
      cell.group.attach(held.mesh);
      held.mesh.position.copy(slot);
      held.mesh.rotation.set(0, 0, 0);
      held.slot = placed;
      held.state = 'placed';
      held = null;
      placed += 1;
      return true;
    };

    /** Non-null after the model resolves; every call site runs inside the loop. */
    const arm = () => cell!.arm;

    const resetAll = () => {
      if (!cell) return;
      if (held) {
        cell.group.attach(held.mesh);
        held = null;
      }
      cell.reset();
      placed = 0;
      cycles = 0;
      cycleClock = 0;
      lastCycleTime = 0;
      phase = 'feed';
      holdTimer = 0;
      vacuumOn = false;
      observing = 0;
      jogged = 0;
      for (let index = 0; index < 6; index += 1) {
        current[index] = HOME_DEG[index];
        commanded[index] = HOME_DEG[index];
      }
      fk.solve(HOME_DEG, tcp);
      setVacuum(false);
      setRunning(false);
      setJointTargets([...HOME_DEG]);
      setStep(0);
      setFlash(null);
    };

    /* --- the cycle --------------------------------------------------------- */

    /**
     * One pass of the palletising program.
     *
     * Written as a phase machine over *poses* rather than as a list of
     * waypoints, because that is what makes the lesson land: every phase asks
     * the same analytic solve for a point in the room, and the only thing that
     * changes between case 1 and case 12 is `slotPosition(placed)`. Twelve
     * picks, one motion, one index.
     */
    const runCycle = (delta: number, step: number) => {
      if (!cell) return;
      const front = cell.cases.find((entry) => entry.state === 'waiting');
      const queued = cell.cases.filter((entry) => entry.state === 'queued');

      if (holdTimer > 0) {
        holdTimer -= delta;
        return;
      }

      const goTo = (point: THREE.Vector3) => {
        const solution = solveToolDown(point);
        reachable = solution.reachable;
        for (let index = 0; index < 6; index += 1) commanded[index] = solution.degrees[index];
        return approachJoints(current, commanded, step);
      };

      switch (phase) {
        case 'feed': {
          if (placed >= CASE_COUNT) { phase = 'done'; return; }
          /* The belt only runs when there is somewhere for a case to go, which
             is what an accumulating line does and is why the stop exists. */
          if (!front) {
            const next = queued[0];
            if (!next) { phase = 'done'; return; }
            cell.advanceBelt(BELT_SPEED * delta);
            for (const entry of queued) entry.mesh.position.x += BELT_SPEED * delta;
            if (next.mesh.position.x >= PICK_POINT.x - 0.001) {
              next.mesh.position.x = PICK_POINT.x;
              next.state = 'waiting';
            }
            return;
          }
          cycleClock = 0;
          phase = 'approach';
          return;
        }
        case 'approach': {
          if (!front) { phase = 'feed'; return; }
          if (goTo(scratch.copy(PICK_POINT).setY(PICK_POINT.y + CASE.y + CLEARANCE))) phase = 'descend';
          return;
        }
        case 'descend': {
          if (goTo(scratch.copy(PICK_POINT).setY(PICK_POINT.y + CASE.y))) {
            phase = 'grip';
            holdTimer = 0.2;
          }
          return;
        }
        case 'grip': {
          vacuumOn = true;
          if (draw()) {
            phase = 'lift';
            holdTimer = 0.25;
          } else {
            /* Nothing under the plate: the belt has not delivered. Back to the
               top rather than stalling on a phase that cannot complete. */
            vacuumOn = false;
            phase = 'feed';
          }
          return;
        }
        case 'lift': {
          if (goTo(scratch.copy(PICK_POINT).setY(PICK_POINT.y + CASE.y + CLEARANCE))) phase = 'traverse';
          return;
        }
        case 'traverse': {
          const slot = slotPosition(placed, scratchB);
          if (goTo(scratch.copy(slot).setY(slot.y + CASE.y / 2 + CLEARANCE))) phase = 'lower';
          return;
        }
        case 'lower': {
          const slot = slotPosition(placed, scratchB);
          if (goTo(scratch.copy(slot).setY(slot.y + CASE.y / 2))) {
            phase = 'release';
            holdTimer = 0.18;
          }
          return;
        }
        case 'release': {
          vacuumOn = false;
          if (release()) {
            cycles += 1;
            lastCycleTime = cycleClock;
            phase = 'retract';
            holdTimer = 0.2;
            if (stepRef.current === 3 && placed >= CASE_COUNT) {
              pushFlash('Đã xếp xong pallet — 12 thùng, 2 lớp', 'success');
            }
          } else {
            phase = 'traverse';
          }
          return;
        }
        case 'retract': {
          const slot = slotPosition(Math.max(0, placed - 1), scratchB);
          if (goTo(scratch.copy(slot).setY(slot.y + CASE.y / 2 + CLEARANCE))) phase = 'feed';
          return;
        }
        case 'done': {
          if (goTo(scratch.set(0.4, 1.9, 1.5))) setRunning(false);
          return;
        }
      }
    };

    /* --- build ------------------------------------------------------------- */
    createRobotCellScene()
      .then((built) => {
        if (disposed) { built.dispose(); return; }
        cell = built;
        stage.scene.add(built.group);
        built.arm.setJoints(current);
        fk.solve(current, tcp);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Robot cell failed to load', error);
        if (!disposed) setStatus('error');
      });

    /* --- loop -------------------------------------------------------------- */
    const cameraTarget = new THREE.Vector3();
    const timer = new THREE.Timer();
    let hudClock = 0;
    let pulseClock = 0;

    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;

      /* The camera runs whether or not the model has arrived, so the room is
         orbitable while the 2 MB arm is still on the wire. */
      cameraTarget.set(
        pivot.x + Math.sin(cameraYaw) * Math.cos(cameraPitch) * cameraDistance,
        pivot.y + Math.sin(cameraPitch) * cameraDistance,
        pivot.z + Math.cos(cameraYaw) * Math.cos(cameraPitch) * cameraDistance,
      );
      stage.camera.position.lerp(cameraTarget, 1 - Math.exp(-9 * delta));
      stage.camera.lookAt(pivot);

      if (cell) {
        const control = controlRef.current;
        const pulse = pulseRef.current;
        const step = JOINT_RATE * control.speed * delta;
        pulseClock += delta;

        if (pulse.reset) { pulse.reset = false; resetAll(); }

        if (pulse.home) {
          pulse.home = false;
          for (let index = 0; index < 6; index += 1) commanded[index] = HOME_DEG[index];
          if (control.mode === 'manual') setJointTargets([...HOME_DEG]);
        }

        if (pulse.goTo >= 0) {
          const waypoint = waypointsRef.current[pulse.goTo];
          pulse.goTo = -1;
          if (waypoint) {
            for (let index = 0; index < 6; index += 1) commanded[index] = waypoint.degrees[index];
            setJointTargets([...waypoint.degrees]);
          }
        }

        if (pulse.sync) {
          pulse.sync = false;
          setJointTargets(current.map((value) => Math.round(value * 10) / 10));
          fk.solve(current, tcp);
        }

        if (control.mode === 'auto') {
          if (control.running) runCycle(delta, step);
          else approachJoints(current, commanded, step);
          if (control.running && phase !== 'feed' && phase !== 'done') cycleClock += delta;
          cell.setBeacon(control.running ? 'run' : 'idle');
        } else {
          /* Manual. Both sub-modes end up writing `commanded`, so the slew
             below is the single place the arm is allowed to move — which is
             what stops a mode switch from teleporting it. */
          if (control.manual === 'joint') {
            for (let index = 0; index < 6; index += 1) {
              commanded[index] = clampJointDeg(index as JointIndex, control.jointTargets[index] ?? 0);
            }
          } else {
            const jog = control.jog;
            const move = JOG_SPEED * delta;
            let moved = false;
            if (jog.xPlus) { tcp.x += move; moved = true; }
            if (jog.xMinus) { tcp.x -= move; moved = true; }
            if (jog.yPlus) { tcp.y += move; moved = true; }
            if (jog.yMinus) { tcp.y -= move; moved = true; }
            if (jog.zPlus) { tcp.z += move; moved = true; }
            if (jog.zMinus) { tcp.z -= move; moved = true; }
            if (moved) {
              tcp.y = Math.max(0.12, tcp.y);
              /* Pull an out-of-envelope ask back onto the boundary here rather
                 than letting the solve clamp it. Otherwise the jog target
                 drifts off into space and the arm stops responding to the key
                 that would bring it home. */
              const radius = Math.hypot(tcp.x, tcp.z);
              const limit = maxRadiusAt(tcp.y);
              if (radius > limit && radius > 1e-6) tcp.multiplyScalar(limit / radius);
              jogged += move;
            }
            const solution = solveToolDown(tcp);
            reachable = solution.reachable;
            for (let index = 0; index < 6; index += 1) commanded[index] = solution.degrees[index];
          }
          approachJoints(current, commanded, step);
          vacuumOn = control.vacuum;
          cell.setBeacon('idle');
        }

        cell.arm.setJoints(current);
        cell.arm.setVacuum(vacuumOn);

        /* Vacuum is a *request*; whether anything is held is a consequence. So
           the draw and the release are evaluated from the flag every frame
           rather than on the button press, which is also how a real gripper
           behaves when the operator switches it off mid-air. */
        if (control.mode === 'manual') {
          if (vacuumOn && !held) draw();
          if (!vacuumOn && held) {
            const dropped = release();
            if (dropped) {
              pushFlash('Đã đặt thùng vào ô trên pallet', 'success');
              if (stepRef.current === 2) setStep(3);
            } else {
              /* Refused: put the request back so the button and the plate agree
                 about what is happening. */
              setVacuum(true);
            }
          }
        }

        /* --- the instruction ring ------------------------------------------ */
        const control2 = controlRef.current;
        if (control2.mode === 'manual' && stepRef.current === 2) {
          const mark = held ? slotPosition(placed, scratchB) : null;
          if (mark) {
            cell.targetMark.position.set(mark.x, mark.y + CASE.y / 2 + 0.01, mark.z);
            cell.targetMark.visible = true;
          } else {
            const waiting = cell.cases.find((entry) => entry.state === 'waiting');
            if (waiting) {
              graspPoint(waiting, scratch);
              cell.targetMark.position.set(scratch.x, scratch.y + 0.01, scratch.z);
              cell.targetMark.visible = true;
            } else {
              cell.targetMark.visible = false;
            }
          }
          arm().toolTip.getWorldPosition(worldTip);
          const distance = cell.targetMark.visible
            ? worldTip.distanceTo(cell.targetMark.position)
            : Infinity;
          const near = distance < (held ? PLACE_TOLERANCE : PICK_TOLERANCE);
          const material = cell.targetMark.material as THREE.MeshBasicMaterial;
          material.color.setHex(near ? 0x5aa05e : 0xe87868);
          cell.targetMark.scale.setScalar(1 + Math.sin(pulseClock * 3.4) * 0.05);
        } else {
          cell.targetMark.visible = false;
        }

        /* --- lesson progression -------------------------------------------- */
        if (stepRef.current === 0) {
          observing += delta;
          if (observing > 5) setStep(1);
        } else if (stepRef.current === 1) {
          const touched = control2.manual === 'tcp'
            ? jogged > 0.22
            : current.some((value, index) => Math.abs(value - HOME_DEG[index]) > 6);
          if (touched) setStep(2);
        } else if (stepRef.current === 3 && control2.mode !== 'auto' && placed === 0) {
          /* nothing to do: step 4 only advances by finishing the pallet */
        }

        /* --- the readout ---------------------------------------------------- */
        hudClock += delta;
        if (hudClock > 0.1) {
          hudClock = 0;
          arm().toolTip.getWorldPosition(worldTip);
          setReadout({
            degrees: current.map((value) => Math.round(value * 10) / 10),
            tcp: [
              Math.round(worldTip.x * 1000),
              Math.round(worldTip.y * 1000),
              Math.round(worldTip.z * 1000),
            ],
            placed,
            holding: Boolean(held),
            phase,
            cycles,
            cycleTime: Math.round(lastCycleTime * 10) / 10,
            reachable,
          });
        }
      }

      stage.noteFrame(delta);
      stage.renderer.render(stage.scene, stage.camera);
    });

    return () => {
      disposed = true;
      stage.renderer.setAnimationLoop(null);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('keydown', onKeyDown);
      host.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('blur', onBlur);
      cell?.dispose();
      room.dispose();
    };
  }, [pushFlash]);

  /* ------------------------------------------------------------------- ui --- */

  const setJoint = useCallback((index: number, value: number) => {
    setJointTargets((previous) => {
      const next = [...previous];
      next[index] = clampJointDeg(index as JointIndex, value);
      return next;
    });
    if (mode !== 'manual') setMode('manual');
    if (manual !== 'joint') setManual('joint');
  }, [manual, mode]);

  const holdJog = useCallback((key: keyof Control['jog'], down: boolean) => {
    controlRef.current.jog[key] = down;
  }, []);

  const teach = useCallback(() => {
    const name = `P${waypoints.length + 1}`;
    setWaypoints((previous) => [...previous, { name, degrees: [...readout.degrees] }]);
    pushFlash(`Đã lưu điểm ${name}`, 'success');
  }, [pushFlash, readout.degrees, waypoints.length]);

  const copy = COPY[Math.min(step, COPY.length - 1)];
  const layer = Math.min(Math.floor(readout.placed / PER_LAYER) + 1, 2);

  return (
    <div className="lab lab--panelled" ref={hostRef} tabIndex={0} aria-label="Cell robot công nghiệp">
      <div className="lab-stage">
        <div className="lab-view" ref={viewRef} />

        {status === 'loading' && (
          <p className="lab-status"><i />Đang tải cánh tay robot…</p>
        )}
        {status === 'error' && (
          <p className="lab-status is-error"><i />Không tải được mô hình robot. Hãy tải lại trang.</p>
        )}

        <p className={`lab-badge${running || step > 0 ? ' is-live' : ''}`}>
          <i aria-hidden="true" />
          {mode === 'auto' ? (running ? 'Đang chạy tự động' : 'Tự động · tạm dừng') : 'Vận hành thủ công'}
        </p>

        <ol className="lab-steps" aria-label="Các bước của bài thực hành">
          {STEPS.map((entry, index) => (
            <li key={entry.id} aria-current={index === step ? 'step' : undefined}>
              <p className={`lab-step${index < step ? ' is-done' : ''}${index === step ? ' is-current' : ''}`}>
                <b aria-hidden="true">
                  {index < step ? <PracticeIcon name="check" /> : String(index + 1).padStart(2, '0')}
                </b>
                <span>{entry.label}</span>
              </p>
            </li>
          ))}
        </ol>

        <div className="lab-brief">
          <p className="lab-objective">{copy.objective}</p>
          {hintOpen && <p className="lab-hint">{copy.hint}</p>}
        </div>

        <div className="lab-actions">
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
            onClick={() => { pulseRef.current.reset = true; setHintOpen(false); }}
          >
            <PracticeIcon name="restart" />
            <span>Làm lại</span>
          </button>
        </div>

        {flash && (
          <p className={`lab-flash lab-flash--${flash.tone}`} key={flash.key} role="status">
            {flash.tone === 'success' && <PracticeIcon name="check" />}
            {flash.text}
          </p>
        )}
      </div>

      {/*
        The pendant.

        Docked rather than floating, and that is the point: a control panel that
        overlays the scene has to stay small enough not to hide it, which is how
        six joint sliders became an "advanced mode" nobody opened. Given its own
        column it can carry the whole machine — six axes against their real
        limits, the tool, the program and the readout — without ever covering the
        thing it drives.
      */}
      <aside className="hmi" aria-label="Bảng điều khiển robot">
        <div className="hmi-modes" role="tablist" aria-label="Chế độ vận hành">
          {([
            ['manual', 'Thủ công', 'joint'],
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
                if (id === 'auto') setVacuum(false);
                /* Entering manual, seed the sliders from wherever the program
                   left the arm — otherwise the first slider touch snaps it. */
                if (id === 'manual') pulseRef.current.sync = true;
                else setRunning(false);
              }}
            >
              <PracticeIcon name={glyph} />
              {label}
            </button>
          ))}
        </div>

        <div className="hmi-body">
          {mode === 'auto' ? (
            <>
              <section className="hmi-group">
                <h4>Chương trình xếp pallet</h4>
                <button
                  type="button"
                  className={`hmi-run${running ? ' is-running' : ''}`}
                  onClick={() => {
                    if (!running && readout.placed >= CASE_COUNT) pulseRef.current.reset = true;
                    setRunning((value) => !value);
                    if (step < 3) setStep(3);
                  }}
                  disabled={status !== 'ready'}
                >
                  <PracticeIcon name={running ? 'pause' : 'play'} />
                  {running ? 'Tạm dừng' : readout.placed >= CASE_COUNT ? 'Chạy lại từ đầu' : 'Chạy'}
                </button>
                <p className="hmi-phase">
                  <i aria-hidden="true" data-run={running ? 'true' : 'false'} />
                  {PHASES[readout.phase]}
                </p>
              </section>

              <section className="hmi-group">
                <h4>Tiến độ</h4>
                <div className="hmi-progress" role="img" aria-label={`Đã xếp ${readout.placed} trên ${CASE_COUNT} thùng`}>
                  {Array.from({ length: CASE_COUNT }, (unused, index) => (
                    <span key={index} className={index < readout.placed ? 'is-filled' : ''} />
                  ))}
                </div>
                <dl className="hmi-readout">
                  <div><dt>Đã xếp</dt><dd>{readout.placed} / {CASE_COUNT}</dd></div>
                  <div><dt>Lớp</dt><dd>{layer} / 2</dd></div>
                  <div><dt>Chu kỳ</dt><dd>{readout.cycleTime ? `${readout.cycleTime.toFixed(1)} s` : '—'}</dd></div>
                  <div><dt>Đã hoàn tất</dt><dd>{readout.cycles}</dd></div>
                </dl>
              </section>
            </>
          ) : (
            <>
              <div className="hmi-subtabs" role="tablist" aria-label="Kiểu điều khiển">
                {([['joint', 'Khớp'], ['tcp', 'Tọa độ']] as const).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    role="tab"
                    aria-selected={manual === id}
                    className={manual === id ? 'is-active' : ''}
                    onClick={() => {
                      setManual(id);
                      pulseRef.current.sync = true;
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {manual === 'joint' ? (
                <section className="hmi-group hmi-group--joints">
                  {JOINT_LABELS.map((joint, index) => {
                    const [min, max] = JOINT_LIMITS_DEG[index];
                    return (
                      <label className="hmi-joint" key={joint.id}>
                        <span className="hmi-joint-head">
                          <b>{joint.id}</b>
                          <em>{joint.name}</em>
                          <output>{(jointTargets[index] ?? 0).toFixed(0)}°</output>
                        </span>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={1}
                          value={jointTargets[index] ?? 0}
                          onChange={(event) => setJoint(index, Number(event.target.value))}
                          aria-label={`${joint.id} — ${joint.name}, ${joint.note}`}
                        />
                        <span className="hmi-joint-scale">
                          <i>{min}°</i>
                          {/* Live pose against commanded pose. The gap between
                              the two is the slew, and showing it is the only way
                              a slider tells the truth about a machine that
                              cannot move instantly. */}
                          <i className="hmi-joint-live">thực {(readout.degrees[index] ?? 0).toFixed(0)}°</i>
                          <i>{max}°</i>
                        </span>
                      </label>
                    );
                  })}
                </section>
              ) : (
                <section className="hmi-group">
                  <h4>Chạy theo trục</h4>
                  <div className="hmi-jog">
                    {([
                      ['zPlus', 'Z+', 'Ra xa'],
                      ['yPlus', 'Y+', 'Lên'],
                      ['xMinus', 'X−', 'Sang trái'],
                      ['zMinus', 'Z−', 'Lại gần'],
                      ['xPlus', 'X+', 'Sang phải'],
                      ['yMinus', 'Y−', 'Xuống'],
                    ] as const).map(([key, glyph, name]) => (
                      <button
                        type="button"
                        key={key}
                        aria-label={name}
                        onPointerDown={(event) => { event.preventDefault(); holdJog(key, true); }}
                        onPointerUp={() => holdJog(key, false)}
                        onPointerCancel={() => holdJog(key, false)}
                        onPointerLeave={() => holdJog(key, false)}
                      >
                        <b>{glyph}</b>
                        <span>{name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="hmi-note">
                    Tấm hút luôn được giữ nằm ngang — bộ điều khiển tự tính sáu góc quay.
                    Bàn phím: W A S D · R nâng · F hạ.
                  </p>
                </section>
              )}

              <section className="hmi-group">
                <h4>Công cụ</h4>
                <div className="hmi-row">
                  <button
                    type="button"
                    className={`hmi-toggle${vacuum ? ' is-on' : ''}`}
                    aria-pressed={vacuum}
                    onClick={() => setVacuum((value) => !value)}
                  >
                    <PracticeIcon name="grip" />
                    {vacuum ? 'Đang hút' : 'Bật hút'}
                  </button>
                  <button
                    type="button"
                    className="hmi-button"
                    onClick={() => { pulseRef.current.home = true; }}
                  >
                    <PracticeIcon name="restart" />
                    Về gốc
                  </button>
                </div>
              </section>

              <section className="hmi-group">
                <h4>Dạy điểm</h4>
                <button type="button" className="hmi-button hmi-button--wide" onClick={teach}>
                  <PracticeIcon name="teach" />
                  Lưu vị trí hiện tại
                </button>
                {waypoints.length > 0 ? (
                  <ul className="hmi-waypoints">
                    {waypoints.map((waypoint, index) => (
                      <li key={waypoint.name}>
                        <b>{waypoint.name}</b>
                        <span>{waypoint.degrees.map((value) => value.toFixed(0)).join(' · ')}</span>
                        <button
                          type="button"
                          onClick={() => { pulseRef.current.goTo = index; }}
                          aria-label={`Đi tới ${waypoint.name}`}
                        >
                          Đi tới
                        </button>
                        <button
                          type="button"
                          onClick={() => setWaypoints((list) => list.filter((entry) => entry !== waypoint))}
                          aria-label={`Xóa ${waypoint.name}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hmi-note">
                    Đây là cách một cánh tay thật được lập trình: người vận hành đưa
                    công cụ tới một điểm rồi lưu lại, không ai gõ góc quay bằng tay.
                  </p>
                )}
              </section>
            </>
          )}

          <section className="hmi-group hmi-group--status">
            <h4>Trạng thái</h4>
            <dl className="hmi-readout hmi-readout--tight">
              <div><dt>TCP X</dt><dd>{readout.tcp[0]} mm</dd></div>
              <div><dt>TCP Y</dt><dd>{readout.tcp[1]} mm</dd></div>
              <div><dt>TCP Z</dt><dd>{readout.tcp[2]} mm</dd></div>
              <div><dt>Chân không</dt><dd>{readout.holding ? 'Đang giữ thùng' : vacuum ? 'Hút, chưa có thùng' : 'Tắt'}</dd></div>
            </dl>
            {!readout.reachable && (
              <p className="hmi-warn">Ngoài tầm với — cánh tay đang giữ ở biên vùng làm việc.</p>
            )}
          </section>

          <label className="hmi-speed">
            <span>Tốc độ <output>{Math.round(speed * 100)}%</output></span>
            <input
              type="range"
              min={30}
              max={160}
              step={5}
              value={Math.round(speed * 100)}
              onChange={(event) => setSpeed(Number(event.target.value) / 100)}
            />
          </label>
        </div>
      </aside>
    </div>
  );
}
