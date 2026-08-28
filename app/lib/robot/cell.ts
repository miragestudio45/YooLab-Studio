import * as THREE from 'three';

/**
 * A six-axis robot cell, web-native.
 *
 * The reference for this is the Open Industry Project's `SixAxisRobot` (MIT) —
 * its joint layout, its joint limits, its shortest-path joint interpolation and
 * its "train a waypoint, replay it" model of automation. None of its code or
 * assets are here: that project is Godot, and a Godot editor cannot be embedded
 * in a Next.js page. What crossed over is the *engineering*, re-authored in
 * three.js:
 *
 *   J1  base yaw          about +Y
 *   J2  shoulder pitch    about local X
 *   J3  elbow pitch       about local X
 *   J4  forearm roll      about local Z    (present, held at 0 in beginner mode)
 *   J5  wrist pitch       about local X
 *   J6  tool roll         about local Z
 *
 * The whole cell is a metre across and lives at true scale, so the numbers on
 * screen are the numbers an actual cell of this class would carry.
 *
 * **What is deliberately not modelled:** PLC scan cycles, OPC-UA tags, ladder
 * logic, EtherNet/IP. The upstream project is a serious industrial simulator
 * and all of that is the point of it. It is also the fastest way to lose a
 * fifteen-year-old in the first ten seconds, and this lab's entire job is the
 * ten seconds before that.
 */

/* --------------------------------------------------------------- palette --- */

const CORAL = 0xe87868;
const CORAL_DEEP = 0xc95f52;
const SAGE = 0x769d74;
const INK = 0x2f2b33;

/* ------------------------------------------------------------- geometry --- */

/**
 * The arm's link lengths, metres. Every solve in this file reads them from
 * here, so a longer forearm is one edit and not a hunt through the kinematics.
 */
export const ARM = {
  /** Pedestal top — where J1 turns. */
  baseHeight: 0.1,
  /** Shoulder pivot, in the arm plane: radius out from the base axis, and height. */
  shoulderRadius: 0.08,
  shoulderHeight: 0.4,
  /** J2 → J3. */
  upperArm: 0.46,
  /** J3 → J5. */
  forearm: 0.42,
  /** J5 → the point between the gripper fingers, with the tool pointing down. */
  tool: 0.17,
} as const;

/** Farthest the tool centre point can reach from the base axis, metres. */
export const MAX_RADIUS = ARM.shoulderRadius + (ARM.upperArm + ARM.forearm) * 0.97;

/**
 * Joint limits in radians, carried over from the reference cell's degree table
 * (±180 / ±135 / ±160 / ±180 / ±120 / ±360). They are not decoration: without
 * J2's limit the shoulder solves itself through the pedestal on a low reach.
 */
export const JOINT_LIMITS: [number, number][] = [
  [-Math.PI, Math.PI],
  [(-135 * Math.PI) / 180, (135 * Math.PI) / 180],
  [(-160 * Math.PI) / 180, (160 * Math.PI) / 180],
  [-Math.PI, Math.PI],
  [(-120 * Math.PI) / 180, (120 * Math.PI) / 180],
  [-Math.PI * 2, Math.PI * 2],
];

/* ---------------------------------------------------------- the solution --- */

export type JointAngles = {
  /** Base yaw. */
  j1: number;
  /** Shoulder elevation, measured from horizontal, positive = up. */
  j2: number;
  /** Elbow, as the *relative* bend applied after the upper arm. */
  j3: number;
  /** Forearm roll. Unused by the beginner controls; kept for advanced mode. */
  j4: number;
  /** Wrist pitch, relative, chosen so the tool hangs vertically. */
  j5: number;
  /** Tool roll. */
  j6: number;
};

export type IkSolution = {
  angles: JointAngles;
  /** False when the target was outside the workspace and had to be pulled in. */
  reachable: boolean;
  /** The point actually solved for, after any clamping. */
  resolved: THREE.Vector3;
};

const solveScratch = new THREE.Vector3();

/**
 * Analytic inverse kinematics for a tool held vertically.
 *
 * Three degrees of freedom are enough because the beginner controls only ever
 * ask for a *position*: the gripper always points straight down, which is how
 * every top-pick cell in a warehouse actually runs, and it collapses a six-axis
 * solve into a base rotation plus a planar two-link triangle. The reference
 * project ships a general iterative solver (CCD over all six pivots) — correct,
 * but it can converge into a pose that looks folded in on itself, and a student
 * watching an arm reach for a box does not need to see it think.
 *
 * The elbow-up branch is chosen unconditionally. Elbow-down is a legal solution
 * for most of this workspace and it puts the forearm through the table.
 */
export function solveArm(target: THREE.Vector3, toolRoll = 0): IkSolution {
  const radius = Math.hypot(target.x, target.z);
  const j1 = Math.atan2(target.x, target.z);

  // Into the arm plane: (r, y), with the wrist pivot one tool-length above the
  // requested grip point because the tool hangs vertically.
  const wristRadius = radius - ARM.shoulderRadius;
  const wristHeight = target.y + ARM.tool - ARM.shoulderHeight;

  const reach = Math.hypot(wristRadius, wristHeight);
  const minReach = Math.abs(ARM.upperArm - ARM.forearm) + 0.02;
  const maxReach = ARM.upperArm + ARM.forearm - 0.015;
  const clamped = THREE.MathUtils.clamp(reach, minReach, maxReach);
  const reachable = Math.abs(clamped - reach) < 1e-6 && radius >= ARM.shoulderRadius - 0.02;

  // Rebuild the wrist target at the clamped distance, so an out-of-reach ask
  // becomes "as far that way as I can go" rather than a NaN or a snap to zero.
  const scale = reach > 1e-6 ? clamped / reach : 0;
  const planarRadius = wristRadius * scale;
  const planarHeight = wristHeight * scale;

  const elevation = Math.atan2(planarHeight, planarRadius);
  const shoulderOffset = Math.acos(THREE.MathUtils.clamp(
    (ARM.upperArm * ARM.upperArm + clamped * clamped - ARM.forearm * ARM.forearm)
      / (2 * ARM.upperArm * clamped),
    -1,
    1,
  ));
  const interior = Math.acos(THREE.MathUtils.clamp(
    (ARM.upperArm * ARM.upperArm + ARM.forearm * ARM.forearm - clamped * clamped)
      / (2 * ARM.upperArm * ARM.forearm),
    -1,
    1,
  ));

  /** Absolute angle of the upper arm from horizontal, elbow-up branch. */
  const upperAbsolute = elevation + shoulderOffset;
  /** Absolute angle of the forearm from horizontal. */
  const forearmAbsolute = upperAbsolute - (Math.PI - interior);

  const angles: JointAngles = {
    j1: clampJoint(j1, 0),
    j2: clampJoint(upperAbsolute, 1),
    j3: clampJoint(forearmAbsolute - upperAbsolute, 2),
    j4: 0,
    // The tool must finish pointing at −Y, which is an absolute −π/2.
    j5: clampJoint(-Math.PI / 2 - forearmAbsolute, 4),
    j6: toolRoll,
  };

  const resolvedRadius = ARM.shoulderRadius + planarRadius;
  solveScratch.set(
    Math.sin(j1) * resolvedRadius,
    ARM.shoulderHeight + planarHeight - ARM.tool,
    Math.cos(j1) * resolvedRadius,
  );

  return { angles, reachable, resolved: solveScratch.clone() };
}

function clampJoint(angle: number, index: number) {
  const [min, max] = JOINT_LIMITS[index];
  return THREE.MathUtils.clamp(angle, min, max);
}

/** Forward kinematics: where the tool centre point ends up for a set of angles. */
export function toolPoint(angles: JointAngles, out = new THREE.Vector3()): THREE.Vector3 {
  const upper = angles.j2;
  const fore = angles.j2 + angles.j3;
  const wrist = fore + angles.j5;
  const radius = ARM.shoulderRadius
    + Math.cos(upper) * ARM.upperArm
    + Math.cos(fore) * ARM.forearm
    + Math.cos(wrist) * ARM.tool;
  const height = ARM.shoulderHeight
    + Math.sin(upper) * ARM.upperArm
    + Math.sin(fore) * ARM.forearm
    + Math.sin(wrist) * ARM.tool;
  return out.set(Math.sin(angles.j1) * radius, height, Math.cos(angles.j1) * radius);
}

/**
 * Move each joint toward its target at a bounded rate.
 *
 * Every joint is capped at the same angular speed, which is what an industrial
 * controller does in joint-interpolated mode and is why a real arm's tool
 * traces a curve between two taught points rather than a straight line. It also
 * means the arm can never snap: a beginner who jams a key sees the arm travel,
 * which is the only way the motion reads as a machine obeying an instruction.
 */
export function approachAngles(current: JointAngles, target: JointAngles, maxStep: number) {
  const keys: (keyof JointAngles)[] = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
  let settled = true;
  for (const key of keys) {
    const delta = shortestAngle(target[key] - current[key]);
    if (Math.abs(delta) <= maxStep) {
      current[key] = target[key];
    } else {
      current[key] += Math.sign(delta) * maxStep;
      settled = false;
    }
  }
  return settled;
}

function shortestAngle(delta: number) {
  let value = delta;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/* ------------------------------------------------------------------ cell --- */

export type CellPart = {
  id: string;
  mesh: THREE.Mesh;
  /** Where it started, so Reset puts it back rather than rebuilding the scene. */
  home: THREE.Vector3;
  /** Index of the target slot it belongs in, once placed. */
  slot: number;
  placed: boolean;
  /** True while the gripper is carrying it. */
  held: boolean;
};

export type RobotCell = {
  group: THREE.Group;
  /** Joint pivots, outermost last: J1 … J6. */
  pivots: THREE.Object3D[];
  /** The two gripper fingers, opened and closed by the lab. */
  fingers: [THREE.Object3D, THREE.Object3D];
  /** Empty at the tool centre point; parts are parented here while carried. */
  toolCentre: THREE.Object3D;
  parts: CellPart[];
  /** Where each part is picked from, tool-centre coordinates. */
  pickPoints: THREE.Vector3[];
  /** Where each part is placed, tool-centre coordinates. */
  placePoints: THREE.Vector3[];
  /** Ring drawn around whatever the current step wants the student to reach. */
  targetMark: THREE.Mesh;
  /** Belt slats, scrolled every frame so the line reads as running. */
  slats: THREE.Object3D[];
  /** Status beacon on the cell fence: amber idle, green on success. */
  beaconMaterial: THREE.MeshStandardMaterial;
  applyAngles(angles: JointAngles): void;
  setGrip(closed: number): void;
  dispose(): void;
};

/** Edge length of a workpiece, metres. */
export const PART_SIZE = 0.1;

/** Belt top, and the height a part's centre rides at. */
const BELT_TOP = 0.3;
const PICK_X = 0.66;
const PICK_Z = 0.46;
const TRAY_X = -0.66;
const TRAY_Z = 0.46;
const TRAY_TOP = 0.3;

export function createRobotCell(): RobotCell {
  const group = new THREE.Group();
  group.name = 'yoolab_robot_cell';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  const enamel = keep(new THREE.MeshStandardMaterial({ color: 0xf1ebe1, roughness: 0.4, metalness: 0.08 }));
  const joint = keep(new THREE.MeshStandardMaterial({ color: 0x3b353f, roughness: 0.34, metalness: 0.38 }));
  const accent = keep(new THREE.MeshStandardMaterial({
    color: CORAL,
    roughness: 0.34,
    metalness: 0.1,
    emissive: new THREE.Color(CORAL_DEEP),
    emissiveIntensity: 0.22,
  }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xb9b2ae, roughness: 0.3, metalness: 0.6 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x2c282f, roughness: 0.9, metalness: 0 }));

  /* --- pedestal and column ---------------------------------------------- */
  const plinthGeometry = keep(new THREE.CylinderGeometry(0.26, 0.3, ARM.baseHeight, 34));
  const plinth = new THREE.Mesh(plinthGeometry, joint);
  plinth.position.y = ARM.baseHeight / 2;
  group.add(plinth);

  const j1 = new THREE.Group();
  j1.position.y = ARM.baseHeight;
  group.add(j1);

  const columnGeometry = keep(new THREE.CylinderGeometry(0.17, 0.21, ARM.shoulderHeight - ARM.baseHeight, 28));
  const column = new THREE.Mesh(columnGeometry, enamel);
  column.position.y = (ARM.shoulderHeight - ARM.baseHeight) / 2;
  j1.add(column);

  const collarGeometry = keep(new THREE.TorusGeometry(0.175, 0.014, 8, 28));
  const collar = new THREE.Mesh(collarGeometry, accent);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = (ARM.shoulderHeight - ARM.baseHeight) * 0.72;
  j1.add(collar);

  /* --- shoulder, upper arm ---------------------------------------------- */
  const j2 = new THREE.Group();
  j2.position.set(0, ARM.shoulderHeight - ARM.baseHeight, ARM.shoulderRadius);
  j1.add(j2);

  const shoulderGeometry = keep(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 22));
  const shoulderCap = new THREE.Mesh(shoulderGeometry, joint);
  shoulderCap.rotation.z = Math.PI / 2;
  j2.add(shoulderCap);

  const upperGeometry = keep(new THREE.BoxGeometry(0.11, 0.115, ARM.upperArm));
  const upperArm = new THREE.Mesh(upperGeometry, enamel);
  upperArm.position.z = ARM.upperArm / 2;
  upperArm.castShadow = true;
  j2.add(upperArm);

  /* --- elbow, forearm ---------------------------------------------------- */
  const j3 = new THREE.Group();
  j3.position.z = ARM.upperArm;
  j2.add(j3);

  const elbowGeometry = keep(new THREE.CylinderGeometry(0.072, 0.072, 0.17, 20));
  const elbowCap = new THREE.Mesh(elbowGeometry, joint);
  elbowCap.rotation.z = Math.PI / 2;
  j3.add(elbowCap);

  const foreGeometry = keep(new THREE.BoxGeometry(0.088, 0.092, ARM.forearm));
  const forearm = new THREE.Mesh(foreGeometry, enamel);
  forearm.position.z = ARM.forearm / 2;
  forearm.castShadow = true;
  j3.add(forearm);

  /* --- forearm roll, wrist ----------------------------------------------- */
  const j4 = new THREE.Group();
  j4.position.z = ARM.forearm;
  j3.add(j4);

  const j5 = new THREE.Group();
  j4.add(j5);

  const wristGeometry = keep(new THREE.CylinderGeometry(0.056, 0.056, 0.13, 18));
  const wristCap = new THREE.Mesh(wristGeometry, joint);
  wristCap.rotation.z = Math.PI / 2;
  j5.add(wristCap);

  const j6 = new THREE.Group();
  j6.position.z = 0.05;
  j5.add(j6);

  /* --- the gripper -------------------------------------------------------
   * A two-finger parallel gripper rather than the reference cell's vacuum
   * array. A suction pad picking a box is a box that jumps; two jaws closing on
   * it is the moment the student is being asked to cause, and it has to be
   * visible.
   */
  const wristPlateGeometry = keep(new THREE.CylinderGeometry(0.048, 0.052, 0.03, 18));
  const plate = new THREE.Mesh(wristPlateGeometry, steel);
  plate.rotation.x = Math.PI / 2;
  j6.add(plate);

  const gripBodyGeometry = keep(new THREE.BoxGeometry(0.11, 0.055, 0.055));
  const gripBody = new THREE.Mesh(gripBodyGeometry, steel);
  gripBody.position.z = 0.05;
  j6.add(gripBody);

  const fingerGeometry = keep(new THREE.BoxGeometry(0.018, 0.05, 0.088));
  const padGeometry = keep(new THREE.BoxGeometry(0.01, 0.046, 0.07));
  const fingers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const finger = new THREE.Group();
    finger.position.set(side * 0.055, 0, 0.05);
    const bone = new THREE.Mesh(fingerGeometry, steel);
    bone.position.z = 0.055;
    finger.add(bone);
    const pad = new THREE.Mesh(padGeometry, rubber);
    pad.position.set(-side * 0.013, 0, 0.055);
    finger.add(pad);
    j6.add(finger);
    fingers.push(finger);
  }

  // The tool centre point, one tool-length out from J5 along the tool axis.
  const toolCentre = new THREE.Object3D();
  toolCentre.position.z = ARM.tool - 0.05;
  j6.add(toolCentre);

  /* --- the line: conveyor, pick station, tray ---------------------------- */
  const frameGeometry = keep(new THREE.BoxGeometry(1.5, 0.055, 0.4));
  const frameMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xdfd6c9, roughness: 0.6, metalness: 0.12 }));
  const conveyor = new THREE.Mesh(frameGeometry, frameMaterial);
  conveyor.position.set(PICK_X + 0.62, BELT_TOP - 0.028, PICK_Z);
  group.add(conveyor);

  const legGeometry = keep(new THREE.BoxGeometry(0.05, BELT_TOP - 0.055, 0.05));
  for (const offset of [-0.62, 0.62]) {
    for (const side of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(legGeometry, frameMaterial);
      leg.position.set(PICK_X + 0.62 + offset, (BELT_TOP - 0.055) / 2, PICK_Z + side);
      group.add(leg);
    }
  }

  /*
   * The belt, as fourteen slats rather than a scrolling texture.
   *
   * A UV-scrolled belt needs a texture, and a texture here would be the only
   * bitmap in three otherwise entirely procedural scenes. Slats that translate
   * and wrap cost fourteen boxes, read correctly at any zoom, and — the part
   * that matters — are the actual mechanism, so the belt's direction and speed
   * are legible instead of implied.
   */
  const slatGeometry = keep(new THREE.BoxGeometry(0.07, 0.016, 0.36));
  const slatMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x6e6570, roughness: 0.72, metalness: 0.05 }));
  const slats: THREE.Object3D[] = [];
  for (let index = 0; index < 14; index += 1) {
    const slat = new THREE.Mesh(slatGeometry, slatMaterial);
    slat.position.set(PICK_X - 0.1 + index * 0.1, BELT_TOP - 0.006, PICK_Z);
    group.add(slat);
    slats.push(slat);
  }

  // Pick station: a coral outline printed on the belt where parts come to rest.
  const stationGeometry = keep(new THREE.RingGeometry(0.085, 0.105, 4, 1, Math.PI / 4));
  const stationMaterial = keep(new THREE.MeshBasicMaterial({
    color: CORAL,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  }));
  const station = new THREE.Mesh(stationGeometry, stationMaterial);
  station.rotation.x = -Math.PI / 2;
  station.position.set(PICK_X, BELT_TOP + 0.005, PICK_Z);
  group.add(station);

  // Target tray: a shallow pan on a stand, with three printed slots.
  const trayGeometry = keep(new THREE.BoxGeometry(0.46, 0.026, 0.4));
  const trayMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xe6dccd, roughness: 0.62, metalness: 0.08 }));
  const tray = new THREE.Mesh(trayGeometry, trayMaterial);
  tray.position.set(TRAY_X, TRAY_TOP - 0.013, TRAY_Z);
  tray.receiveShadow = true;
  group.add(tray);

  const trayLegGeometry = keep(new THREE.BoxGeometry(0.045, TRAY_TOP - 0.026, 0.045));
  for (const cornerX of [-0.18, 0.18]) {
    for (const cornerZ of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(trayLegGeometry, frameMaterial);
      leg.position.set(TRAY_X + cornerX, (TRAY_TOP - 0.026) / 2, TRAY_Z + cornerZ);
      group.add(leg);
    }
  }

  const slotGeometry = keep(new THREE.RingGeometry(0.062, 0.076, 4, 1, Math.PI / 4));
  const slotMaterial = keep(new THREE.MeshBasicMaterial({
    color: 0x8d6bcc,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  }));
  const placePoints: THREE.Vector3[] = [];
  for (let index = 0; index < 3; index += 1) {
    const offsetZ = (index - 1) * 0.12;
    const slot = new THREE.Mesh(slotGeometry, slotMaterial);
    slot.rotation.x = -Math.PI / 2;
    slot.position.set(TRAY_X, TRAY_TOP + 0.004, TRAY_Z + offsetZ);
    group.add(slot);
    placePoints.push(new THREE.Vector3(TRAY_X, TRAY_TOP + PART_SIZE * 0.5, TRAY_Z + offsetZ));
  }

  /* --- three workpieces --------------------------------------------------- */
  const partGeometry = keep(new THREE.BoxGeometry(PART_SIZE, PART_SIZE, PART_SIZE));
  const partColors = [0xe8a06a, 0x8fb6c9, 0xb9a0d6];
  const parts: CellPart[] = [];
  const pickPoints: THREE.Vector3[] = [];
  for (let index = 0; index < 3; index += 1) {
    const material = keep(new THREE.MeshStandardMaterial({
      color: partColors[index],
      roughness: 0.52,
      metalness: 0.05,
      emissive: new THREE.Color(CORAL),
      emissiveIntensity: 0,
    }));
    const mesh = new THREE.Mesh(partGeometry, material);
    // Queued along the belt, the next one at the pick station.
    const home = new THREE.Vector3(PICK_X + index * 0.24, BELT_TOP + PART_SIZE * 0.5, PICK_Z);
    mesh.position.copy(home);
    mesh.castShadow = true;
    group.add(mesh);
    parts.push({ id: `part-${index}`, mesh, home: home.clone(), slot: index, placed: false, held: false });
    pickPoints.push(new THREE.Vector3(PICK_X, BELT_TOP + PART_SIZE * 0.5, PICK_Z));
  }

  /* --- the target ring ---------------------------------------------------- */
  const markGeometry = keep(new THREE.TorusGeometry(0.115, 0.011, 8, 40));
  const markMaterial = keep(new THREE.MeshBasicMaterial({
    color: CORAL,
    transparent: true,
    opacity: 0,
    depthTest: false,
  }));
  const targetMark = new THREE.Mesh(markGeometry, markMaterial);
  targetMark.rotation.x = -Math.PI / 2;
  targetMark.renderOrder = 900;
  targetMark.visible = false;
  group.add(targetMark);

  /* --- cell furniture -----------------------------------------------------
   *
   * Two objects, and both of them are doing a job that a HUD chip would do
   * worse. The painted floor zone is the single fastest way to say "this is an
   * industrial cell and not a desk toy" — every real robot in a factory stands
   * inside one — and it also fills the empty ivory that a 1 m machine leaves in
   * a 900 px frame. The stack light reports the cell's state the way a cell
   * actually reports it: amber while it is waiting for a person, green while it
   * runs its own program.
   */
  const zoneMaterial = keep(new THREE.MeshBasicMaterial({
    color: CORAL,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  }));
  const zone = { x: 0.45, z: 0.1, width: 3.0, depth: 1.94, stripe: 0.045 };
  const zoneLongGeometry = keep(new THREE.PlaneGeometry(zone.width, zone.stripe));
  const zoneShortGeometry = keep(new THREE.PlaneGeometry(zone.stripe, zone.depth));
  for (const offset of [-zone.depth / 2, zone.depth / 2]) {
    const stripe = new THREE.Mesh(zoneLongGeometry, zoneMaterial);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(zone.x, 0.003, zone.z + offset);
    group.add(stripe);
  }
  for (const offset of [-zone.width / 2, zone.width / 2]) {
    const stripe = new THREE.Mesh(zoneShortGeometry, zoneMaterial);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(zone.x + offset, 0.003, zone.z);
    group.add(stripe);
  }

  /* Short. At 1.05 m the post ran off the top of the frame and the beacon —
     the only part of it that says anything — was never in shot. */
  const postGeometry = keep(new THREE.CylinderGeometry(0.018, 0.022, 0.66, 12));
  const post = new THREE.Mesh(postGeometry, frameMaterial);
  post.position.set(-0.58, 0.33, -0.6);
  group.add(post);

  const beaconGeometry = keep(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 16));
  const beaconMaterial = keep(new THREE.MeshStandardMaterial({
    color: 0xdcc39a,
    roughness: 0.3,
    metalness: 0,
    emissive: new THREE.Color(0xb08a4a),
    emissiveIntensity: 0.5,
  }));
  const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
  beacon.position.set(-0.58, 0.7, -0.6);
  group.add(beacon);

  const pivots = [j1, j2, j3, j4, j5, j6];

  const applyAngles = (angles: JointAngles) => {
    j1.rotation.y = angles.j1;
    j2.rotation.x = -angles.j2;
    j3.rotation.x = -angles.j3;
    j4.rotation.z = angles.j4;
    j5.rotation.x = -angles.j5;
    j6.rotation.z = angles.j6;
  };

  const setGrip = (closed: number) => {
    const travel = THREE.MathUtils.lerp(0.055, 0.028, THREE.MathUtils.clamp(closed, 0, 1));
    fingers[0].position.x = -travel;
    fingers[1].position.x = travel;
  };

  return {
    group,
    pivots,
    fingers: fingers as [THREE.Object3D, THREE.Object3D],
    toolCentre,
    parts,
    pickPoints,
    placePoints,
    targetMark,
    slats,
    beaconMaterial,
    applyAngles,
    setGrip,
    dispose() {
      for (const resource of owned) resource.dispose();
      group.clear();
    },
  };
}

/** Belt geometry the lab needs for the slat scroll and the queue. */
export const LINE = {
  beltTop: BELT_TOP,
  pickX: PICK_X,
  pickZ: PICK_Z,
  trayX: TRAY_X,
  trayZ: TRAY_Z,
  trayTop: TRAY_TOP,
  /** Belt speed, m/s. Slow: this is a teaching cell, not a packing line. */
  beltSpeed: 0.22,
} as const;

export const CELL_COLORS = { CORAL, CORAL_DEEP, SAGE, INK };
