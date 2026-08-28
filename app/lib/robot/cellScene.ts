import * as THREE from 'three';
import { createSixAxisArm, type SixAxisArm } from './sixAxis';

/**
 * A case-palletising cell, at true scale.
 *
 * The arm that stands in it is the real Open-Industry six-axis (see
 * `sixAxis.ts`), and once a 3 m palletising robot is in the room the rest of the
 * furniture cannot be a suggestion. A 3 m arm over a 1 m table with three
 * 100 mm cubes on it is not a small cell, it is a wrong one — the proportions
 * are the first thing that tells a student what kind of machine they are looking
 * at, and they were the loudest thing wrong with the version this replaces.
 *
 * So everything here is dimensioned from real equipment:
 *
 *   belt conveyor    500 mm belt at 850 mm, the height a European case line runs
 *   pallet           1200 × 800 mm, one Euro pallet
 *   case             400 × 400 × 300 mm, six to a layer on that pallet
 *   pallet racking    2.7 m bays, three beam levels
 *   guard fence       2.0 m mesh panels on 60 mm posts
 *
 * and the cycle those numbers imply — six cases a layer, two layers, twelve
 * picks — is the cycle the lab runs.
 *
 * ## Why this is built rather than loaded
 *
 * The upstream project generates all of this procedurally too: its conveyors,
 * racks, fences and floor markings are Godot tool scripts that build meshes from
 * exported dimensions (`src/Conveyor/belt_conveyor.gd` is 1,700 lines of exactly
 * that). There is no conveyor asset to import. What is imported is the one thing
 * upstream *does* ship as art, and the one thing that cannot be convincingly
 * generated: the arm.
 *
 * ## The room
 *
 * The Library's ivory studio, like every other lab in this section — not the
 * upstream project's grey steel warehouse. That is a house rule and it is worth
 * stating why it survives contact with an industrial subject: a visitor moving
 * from the drone course to this cell should arrive somewhere they recognise. A
 * warehouse shell would also flood the frame with 40 m of corrugated wall to
 * light a 3 m robot, and the robot is the lesson.
 */

/* --------------------------------------------------------------- palette --- */

/*
 * Taken from the upstream part library so a student who meets the real thing
 * recognises it: conveyors are slate blue-grey with near-black belts, racking is
 * dark steel with tan decks, guarding is safety yellow.
 */
const PAINT = {
  frame: 0x3c4552,
  belt: 0x24282e,
  roller: 0x9aa2aa,
  leg: 0x4a525c,
  rackSteel: 0x3f4650,
  rackDeck: 0xbe8a51,
  guard: 0xd6a52c,
  mesh: 0x2f343b,
  pallet: 0xc09760,
  case: 0xc09a6d,
  caseTape: 0xa8804f,
  marking: 0xe0af38,
  concrete: 0xe8e2d6,
} as const;

/* ------------------------------------------------------------ dimensions --- */

/** Case size, metres. Six of these tile one Euro pallet exactly. */
export const CASE = { x: 0.4, y: 0.3, z: 0.4 } as const;

/** Euro pallet, metres. */
const PALLET = { x: 1.2, y: 0.144, z: 0.8 } as const;

/** Belt top height, metres — a standard case-handling line. */
const BELT_TOP = 0.85;

/**
 * Cell layout, in the arm's own frame. +Z is the direction the arm faces at
 * `j1 = 0`; +X is to its right.
 *
 * Every one of these was checked against the arm's reach envelope rather than
 * placed by eye: the analytic solve in `sixAxis.ts` tops out at about 3.15 m of
 * radius at pick height, and a pick point outside that would leave the lab
 * showing a clamped pose while claiming to have reached the case.
 */
const LAYOUT = {
  /** Conveyor runs along X, cases travelling in +X, at this Z. */
  conveyorZ: 2.0,
  conveyorFrom: -4.2,
  conveyorTo: 1.35,
  /** Where a case stops to be picked. */
  pickX: 0.95,
  /**
   * Pallet centre.
   *
   * On the far side of the arm from the conveyor rather than beside it. Sharing
   * the infeed line's Z put the pallet directly *behind* the conveyor from the
   * only camera angle that frames the cell, so the target of the whole cycle was
   * the one thing in the room you could not see. Now the pick is out to the arm's
   * right and the place is out to its left, which is both legible and how a real
   * palletising cell is laid out — the robot turns through most of a right angle
   * between them, which is what makes J1 the joint that matters.
   */
  palletX: -2.25,
  palletZ: -0.6,
  /** Racking runs along Z outside the west guarding, where a forklift can reach it. */
  rackX: -6.4,
} as const;

export const PICK_POINT = new THREE.Vector3(LAYOUT.pickX, BELT_TOP, LAYOUT.conveyorZ);

/**
 * The stacking pattern: three across the pallet's long axis, two across its
 * short one, two layers deep.
 *
 * Generated rather than listed, because the interesting thing about a
 * palletising program is that it is *one* taught motion plus an index — the
 * operator does not teach twelve points, they teach one and the controller
 * offsets it. The lab says so, and this is the function that makes that true.
 */
export const LAYERS = 2;
export const PER_LAYER = 6;
export const CASE_COUNT = LAYERS * PER_LAYER;

export function slotPosition(index: number, out = new THREE.Vector3()): THREE.Vector3 {
  const layer = Math.floor(index / PER_LAYER);
  const within = index % PER_LAYER;
  const column = within % 3;
  const row = Math.floor(within / 3);
  return out.set(
    LAYOUT.palletX + (column - 1) * CASE.x,
    PALLET.y + layer * CASE.y + CASE.y / 2,
    LAYOUT.palletZ + (row - 0.5) * CASE.z,
  );
}

/* ------------------------------------------------------------------ types --- */

export type CellCase = {
  mesh: THREE.Object3D;
  /** −1 while the case is still queued on the belt behind the pick point. */
  slot: number;
  state: 'queued' | 'waiting' | 'held' | 'placed';
};

export type RobotCellScene = {
  group: THREE.Group;
  arm: SixAxisArm;
  cases: CellCase[];
  /** Ring drawn at whatever the current step wants reached. */
  targetMark: THREE.Mesh;
  /** Belt surface, scrolled so the line reads as running. */
  advanceBelt(metres: number): void;
  /** Amber idle, green running, coral fault. */
  setBeacon(state: 'idle' | 'run' | 'fault'): void;
  /** Puts every case back on the belt. */
  reset(): void;
  dispose(): void;
};

/* ------------------------------------------------------------------ build --- */

export async function createRobotCellScene(): Promise<RobotCellScene> {
  const group = new THREE.Group();
  group.name = 'yoolab_palletising_cell';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };
  const box = (x: number, y: number, z: number) => keep(new THREE.BoxGeometry(x, y, z));
  const matte = (color: number, roughness = 0.62, metalness = 0.08) =>
    keep(new THREE.MeshStandardMaterial({ color, roughness, metalness }));

  const frameMat = matte(PAINT.frame, 0.44, 0.34);
  const rollerMat = matte(PAINT.roller, 0.3, 0.72);
  const legMat = matte(PAINT.leg, 0.5, 0.3);
  const rackMat = matte(PAINT.rackSteel, 0.46, 0.36);
  const deckMat = matte(PAINT.rackDeck, 0.72, 0.04);
  const guardMat = matte(PAINT.guard, 0.56, 0.12);
  const palletMat = matte(PAINT.pallet, 0.78, 0.02);
  const caseMat = matte(PAINT.case, 0.82, 0.02);
  const tapeMat = matte(PAINT.caseTape, 0.7, 0.02);

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    parent: THREE.Object3D = group,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /* ---------------------------------------------------------- the arm --- */

  const arm = await createSixAxisArm();
  /*
   * The arm's own shoulder sits at azimuth −90° in its base frame — the model
   * faces world −X at `j1 = 0`. Yawing the whole robot a quarter turn makes
   * `j1 = 0` mean "straight ahead" instead, which matters because J1 is a
   * number on the control panel that a student is asked to read.
   */
  arm.group.rotation.y = Math.PI / 2;
  group.add(arm.group);

  /* ------------------------------------------------------- conveyor --- */

  /*
   * A belt conveyor, built the way one is: two side frames, a belt spanning
   * them, a nose roller at each end, and legs on a bay spacing. The side frames
   * are the part that makes it read as equipment rather than as a plinth — a
   * bare box at belt height is a table.
   */
  const conveyor = new THREE.Group();
  conveyor.position.set(0, 0, LAYOUT.conveyorZ);
  group.add(conveyor);

  const beltLength = LAYOUT.conveyorTo - LAYOUT.conveyorFrom;
  const beltCentre = (LAYOUT.conveyorTo + LAYOUT.conveyorFrom) / 2;
  const BELT_WIDTH = 0.5;
  const FRAME_DEPTH = 0.16;

  /*
   * The belt gets a scrolling texture rather than moving slats.
   *
   * Slats were how the previous cell did it and they cost one object per slat
   * plus a position write each per frame. A repeating stripe on a belt-shaped
   * plane costs one texture offset, and it is also what a real belt looks like:
   * a continuous surface with cleat lines, not a chain of plates.
   */
  const beltTexture = makeBeltTexture();
  beltTexture.wrapS = THREE.RepeatWrapping;
  beltTexture.wrapT = THREE.RepeatWrapping;
  beltTexture.repeat.set(beltLength / 0.25, 1);
  const runningBeltMat = keep(new THREE.MeshStandardMaterial({
    color: PAINT.belt,
    roughness: 0.74,
    metalness: 0.05,
    map: beltTexture,
  }));

  const beltSurface = add(
    box(beltLength, 0.03, BELT_WIDTH),
    runningBeltMat,
    [beltCentre, BELT_TOP - 0.015, 0],
    conveyor,
  );
  beltSurface.castShadow = false;

  for (const side of [-1, 1]) {
    add(
      box(beltLength, FRAME_DEPTH, 0.05),
      frameMat,
      [beltCentre, BELT_TOP - FRAME_DEPTH / 2 - 0.02, side * (BELT_WIDTH / 2 + 0.025)],
      conveyor,
    );
  }

  const noseGeometry = keep(new THREE.CylinderGeometry(0.05, 0.05, BELT_WIDTH + 0.02, 20));
  for (const x of [LAYOUT.conveyorFrom, LAYOUT.conveyorTo]) {
    const nose = add(noseGeometry, rollerMat, [x, BELT_TOP - 0.05, 0], conveyor);
    nose.rotation.x = Math.PI / 2;
  }

  const legGeometry = box(0.06, BELT_TOP - FRAME_DEPTH, 0.06);
  const footGeometry = box(0.16, 0.02, 0.16);
  const braceGeometry = box(0.05, 0.04, BELT_WIDTH);
  for (let x = LAYOUT.conveyorFrom + 0.45; x < LAYOUT.conveyorTo; x += 1.5) {
    for (const side of [-1, 1]) {
      const z = side * (BELT_WIDTH / 2 + 0.02);
      add(legGeometry, legMat, [x, (BELT_TOP - FRAME_DEPTH) / 2, z], conveyor);
      add(footGeometry, legMat, [x, 0.01, z], conveyor);
    }
    add(braceGeometry, legMat, [x, 0.28, 0], conveyor);
  }

  /*
   * The stop. A real line holds the case at the pick point with a blade or a
   * pneumatic stop, and without something visible there the case appears to
   * halt of its own accord in the middle of a moving belt.
   */
  add(box(0.04, 0.14, BELT_WIDTH + 0.08), guardMat, [
    LAYOUT.pickX + CASE.x / 2 + 0.03,
    BELT_TOP + 0.05,
    0,
  ], conveyor);

  /* --------------------------------------------------------- pallet --- */

  const pallet = new THREE.Group();
  pallet.position.set(LAYOUT.palletX, 0, LAYOUT.palletZ);
  group.add(pallet);

  /*
   * A Euro pallet is three bottom boards, nine blocks and five top deck boards.
   * Built out rather than approximated with one slab, because it is the object
   * the whole cycle is aimed at and it sits at eye level in the frame.
   */
  const deckBoard = box(PALLET.x, 0.022, 0.1);
  const bottomBoard = box(PALLET.x, 0.022, 0.145);
  const blockGeometry = box(0.1, 0.1, 0.145);
  for (let index = 0; index < 5; index += 1) {
    add(deckBoard, palletMat, [0, PALLET.y - 0.011, (index - 2) * (PALLET.z / 4.6)], pallet);
  }
  for (const z of [-PALLET.z / 2 + 0.075, 0, PALLET.z / 2 - 0.075]) {
    add(bottomBoard, palletMat, [0, 0.011, z], pallet);
    for (const x of [-PALLET.x / 2 + 0.05, 0, PALLET.x / 2 - 0.05]) {
      add(blockGeometry, palletMat, [x, 0.072, z], pallet);
    }
    add(box(PALLET.x, 0.022, 0.145), palletMat, [0, PALLET.y - 0.033, z], pallet);
  }

  /* ---------------------------------------------------------- racks --- */

  /*
   * Two bays of pallet racking, loaded, *outside* the cell guarding.
   *
   * Not scenery: it is the only thing in the room that gives the arm's height a
   * scale to be read against, because a 3 m robot in an empty room is just a
   * robot at whatever size the camera says. Outside the fence because that is
   * where it goes — racking is served by a forklift, and a forklift does not
   * come inside a live robot cell.
   *
   * Built as a real frame: four corner uprights per bay with end bracing, three
   * beam levels, two deck slats a level. The first version used a single
   * 90 mm × 3.3 m × 1.1 m box for each upright — which is not an upright, it is
   * a 1.1 m deep wall, and two bays of them rendered as a pair of grey slabs
   * that took over the frame.
   */
  const RACK_BAY = 2.7;
  const RACK_LEVELS = 3;
  const RACK_DEPTH = 1.05;
  const RACK_HEIGHT = 3.1;
  const upright = box(0.085, RACK_HEIGHT, 0.085);
  const brace = box(0.04, 0.04, RACK_DEPTH * 1.12);
  const beam = box(RACK_BAY, 0.095, 0.045);
  const deckSlat = box(RACK_BAY - 0.12, 0.028, (RACK_DEPTH - 0.24) / 2);
  const rackCase = box(0.48, 0.36, 0.34);
  const rackPallet = box(1.12, 0.12, 0.76);

  for (const bay of [0, 1]) {
    const rack = new THREE.Group();
    rack.position.set(LAYOUT.rackX, 0, -1.9 + bay * (RACK_BAY + 0.2));
    rack.rotation.y = Math.PI / 2;
    group.add(rack);

    for (const x of [-RACK_BAY / 2, RACK_BAY / 2]) {
      for (const z of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) {
        add(upright, rackMat, [x, RACK_HEIGHT / 2, z], rack);
      }
      /* End bracing: a zig-zag between the two uprights of each frame, which is
         what makes a rack read as a rack and not as four posts. */
      for (let step = 0; step < 5; step += 1) {
        const node = add(brace, rackMat, [x, 0.45 + step * 0.62, 0], rack);
        node.rotation.x = step % 2 === 0 ? 0.55 : -0.55;
      }
    }

    for (let level = 1; level <= RACK_LEVELS; level += 1) {
      const y = level * 0.92;
      for (const z of [-RACK_DEPTH / 2 + 0.03, RACK_DEPTH / 2 - 0.03]) {
        add(beam, rackMat, [0, y, z], rack);
      }
      for (const z of [-RACK_DEPTH / 4 + 0.03, RACK_DEPTH / 4 - 0.03]) {
        add(deckSlat, deckMat, [0, y + 0.06, z], rack);
      }
      /* Two loaded pallets a level, and the top level left empty — a rack that
         is full everywhere reads as a wall rather than as storage. */
      if (level < RACK_LEVELS) {
        for (const x of [-0.66, 0.66]) {
          add(rackPallet, palletMat, [x, y + 0.14, 0], rack);
          /* Four cases to a pallet, individually. One 1.05 m block with a tape
             stripe across it was the other thing that made these read as slabs. */
          for (const dx of [-0.25, 0.25]) {
            for (const dz of [-0.18, 0.18]) {
              add(rackCase, caseMat, [x + dx, y + 0.38, dz], rack);
              add(box(0.49, 0.03, 0.06), tapeMat, [x + dx, y + 0.56, dz], rack);
            }
          }
        }
      }
    }
  }

  /* ----------------------------------------------------- guarding --- */

  /*
   * Mesh guarding on three sides, open where the conveyor enters.
   *
   * The mesh is one instanced vertical bar rather than a texture, because at
   * this distance an alpha-mapped plane shows its own resolution and a guard
   * fence is a thing a student should be able to count the bars of. 12 bars a
   * panel across seven panels is 84 instances in one draw.
   */
  const fence = new THREE.Group();
  group.add(fence);

  const FENCE_HEIGHT = 2.0;
  const post = box(0.06, FENCE_HEIGHT, 0.06);
  const rail = keep(new THREE.BoxGeometry(1, 0.05, 0.03));
  const meshMat = matte(PAINT.mesh, 0.6, 0.3);
  const barGeometry = keep(new THREE.BoxGeometry(0.012, FENCE_HEIGHT - 0.2, 0.012));

  /**
   * Panel runs, as [from, to] in the cell's own plan.
   *
   * A real cell is enclosed with exactly two openings, and both are here:
   *
   *   - a **conveyor penetration** in the west wall, one panel wide, where the
   *     infeed line crosses the guarding. A cell whose whole west side is
   *     missing — which is what the first version drew — is not a guarded cell.
   *   - an **operator approach** in the middle of the north side, which is the
   *     side the camera looks from. On a real line that is a light curtain
   *     rather than a fence, and here it is also what lets the visitor see the
   *     machine they are driving instead of a mesh screen across the frame.
   */
  const PANELS: { from: [number, number]; to: [number, number] }[] = [
    /* East. */
    { from: [2.4, 4.4], to: [2.4, -2.6] },
    /* South. */
    { from: [2.4, -2.6], to: [-4.4, -2.6] },
    /* West, in two runs with the conveyor slot between them. */
    { from: [-4.4, -2.6], to: [-4.4, 1.35] },
    { from: [-4.4, 2.65], to: [-4.4, 4.4] },
    /* North, in two returns with the operator approach between them. */
    { from: [-4.4, 4.4], to: [-2.2, 4.4] },
    { from: [1.0, 4.4], to: [2.4, 4.4] },
  ];

  const bars: THREE.Matrix4[] = [];
  const barMatrix = new THREE.Matrix4();
  for (const panel of PANELS) {
    const start = new THREE.Vector3(panel.from[0], 0, panel.from[1]);
    const end = new THREE.Vector3(panel.to[0], 0, panel.to[1]);
    const span = start.distanceTo(end);
    const angle = Math.atan2(end.x - start.x, end.z - start.z);
    const run = new THREE.Group();
    run.position.copy(start);
    run.rotation.y = angle;
    fence.add(run);

    add(post, guardMat, [0, FENCE_HEIGHT / 2, 0], run);
    add(post, guardMat, [0, FENCE_HEIGHT / 2, span], run);
    for (const y of [0.2, FENCE_HEIGHT - 0.1]) {
      const bar = add(rail, guardMat, [0, y, span / 2], run);
      bar.scale.x = span - 0.06;
      bar.rotation.y = Math.PI / 2;
    }
    const count = Math.max(2, Math.round(span / 0.14));
    for (let index = 1; index < count; index += 1) {
      const z = (index / count) * span;
      barMatrix.makeTranslation(0, FENCE_HEIGHT / 2 + 0.05, z);
      barMatrix.premultiply(new THREE.Matrix4().makeRotationY(angle));
      barMatrix.setPosition(
        start.x + Math.sin(angle) * z,
        FENCE_HEIGHT / 2 + 0.05,
        start.z + Math.cos(angle) * z,
      );
      bars.push(barMatrix.clone());
    }
  }
  const barMesh = new THREE.InstancedMesh(barGeometry, meshMat, bars.length);
  bars.forEach((matrix, index) => barMesh.setMatrixAt(index, matrix));
  barMesh.instanceMatrix.needsUpdate = true;
  barMesh.castShadow = true;
  fence.add(barMesh);

  /* ------------------------------------------------- floor markings --- */

  /*
   * Painted, not modelled: one plane per marking, lifted a couple of
   * millimetres off the floor and depth-write-disabled, which is how every
   * industrial floor decal in a real-time scene is done. Modelled kerbs would
   * fight the room's own grid.
   */
  const markings = new THREE.Group();
  markings.position.y = 0.004;
  group.add(markings);

  const markingMat = keep(new THREE.MeshBasicMaterial({
    color: PAINT.marking,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }));
  const stripeMat = keep(new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  }));

  const stripe = (
    width: number,
    depth: number,
    x: number,
    z: number,
    material: THREE.Material,
    rotation = 0,
  ) => {
    const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(width, depth)), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotation;
    mesh.position.set(x, 0, z);
    mesh.renderOrder = -40;
    markings.add(mesh);
    return mesh;
  };

  /* The robot's own keep-out box. */
  const KEEP_OUT = { x: [-3.0, 2.1] as const, z: [-2.3, 3.6] as const };
  for (const z of KEEP_OUT.z) {
    stripe(KEEP_OUT.x[1] - KEEP_OUT.x[0], 0.1, (KEEP_OUT.x[0] + KEEP_OUT.x[1]) / 2, z, markingMat);
  }
  for (const x of KEEP_OUT.x) {
    stripe(0.1, KEEP_OUT.z[1] - KEEP_OUT.z[0], x, (KEEP_OUT.z[0] + KEEP_OUT.z[1]) / 2, markingMat);
  }

  /* The pallet's drop square, so the target has a painted home. */
  for (const side of [-1, 1]) {
    stripe(PALLET.x + 0.3, 0.07, LAYOUT.palletX, LAYOUT.palletZ + side * (PALLET.z / 2 + 0.16), markingMat);
    stripe(0.07, PALLET.z + 0.3, LAYOUT.palletX + side * (PALLET.x / 2 + 0.16), LAYOUT.palletZ, markingMat);
  }

  /* A walkway outside the guarding. */
  for (let index = 0; index < 14; index += 1) {
    stripe(0.24, 1.1, -4.9 + index * 0.52, 5.1, stripeMat);
  }

  /* ------------------------------------------------------- beacon --- */

  const beaconMat = keep(new THREE.MeshStandardMaterial({
    color: 0xb08a4a,
    emissive: new THREE.Color(0xb08a4a),
    emissiveIntensity: 0.8,
    roughness: 0.4,
  }));
  const beaconPost = new THREE.Group();
  beaconPost.position.set(2.4, 0, 1.1);
  group.add(beaconPost);
  add(box(0.08, 2.3, 0.08), guardMat, [0, 1.15, 0], beaconPost);
  const beaconGeometry = keep(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 20));
  const beacon = add(beaconGeometry, beaconMat, [0, 2.4, 0], beaconPost);
  beacon.castShadow = false;
  add(keep(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 20)), legMat, [0, 2.52, 0], beaconPost);

  /* --------------------------------------------------- target ring --- */

  /*
   * The one piece of pure instruction in the scene.
   *
   * A flat ring rather than a floating arrow or a wireframe box: it lies on
   * whatever surface the step is about, which is the only overlay that survives
   * a free-orbiting camera without ever pointing the wrong way.
   */
  const targetGeometry = keep(new THREE.RingGeometry(0.24, 0.3, 48));
  const targetMaterial = keep(new THREE.MeshBasicMaterial({
    color: 0xe87868,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const targetMark = new THREE.Mesh(targetGeometry, targetMaterial);
  targetMark.rotation.x = -Math.PI / 2;
  targetMark.renderOrder = 8;
  targetMark.visible = false;
  group.add(targetMark);

  /* -------------------------------------------------------- cases --- */

  /*
   * Twelve cases, each its own small group so the tape band stays with the box
   * when the gripper carries it. Built once and re-homed on reset rather than
   * rebuilt, because a reset that reallocates twelve groups mid-frame is a
   * visible hitch for no reason.
   */
  const caseGeometry = box(CASE.x, CASE.y, CASE.z);
  const caseSeam = box(CASE.x + 0.002, 0.035, 0.06);
  const cases: CellCase[] = [];
  for (let index = 0; index < CASE_COUNT; index += 1) {
    const holder = new THREE.Group();
    const body = new THREE.Mesh(caseGeometry, caseMat);
    body.castShadow = true;
    body.receiveShadow = true;
    holder.add(body);
    const seam = new THREE.Mesh(caseSeam, tapeMat);
    seam.position.y = CASE.y / 2 - 0.017;
    holder.add(seam);
    group.add(holder);
    cases.push({ mesh: holder, slot: -1, state: 'queued' });
  }

  /** Puts case `index` back in the belt queue, `index` places behind the stop. */
  const homeCase = (entry: CellCase, index: number) => {
    entry.mesh.position.set(
      LAYOUT.pickX - index * (CASE.x + 0.22),
      BELT_TOP + CASE.y / 2,
      LAYOUT.conveyorZ,
    );
    entry.mesh.rotation.set(0, 0, 0);
    entry.mesh.visible = true;
    entry.slot = -1;
    entry.state = index === 0 ? 'waiting' : 'queued';
  };
  cases.forEach(homeCase);

  return {
    group,
    arm,
    cases,
    targetMark,
    advanceBelt(metres: number) {
      /* One texture offset. The belt is 5.5 m long and the stripe repeats every
         250 mm, so the offset is in repeat units, not metres. */
      beltTexture.offset.x = (beltTexture.offset.x - metres / 0.25) % 1;
    },
    setBeacon(state) {
      const colour = state === 'run' ? 0x5aa05e : state === 'fault' ? 0xd25a4a : 0xb08a4a;
      beaconMat.color.setHex(colour);
      beaconMat.emissive.setHex(colour);
      beaconMat.emissiveIntensity = state === 'idle' ? 0.7 : 1.5;
    },
    reset() {
      cases.forEach(homeCase);
    },
    dispose() {
      arm.dispose();
      for (const value of owned) value.dispose();
      /* The belt texture owns a canvas, so it is disposed explicitly rather
         than through `keep` — which only tracks geometries and materials. */
      beltTexture.dispose();
      barGeometry.dispose();
      barMesh.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * The belt's cleat stripe.
 *
 * A 32 × 4 canvas: one dark band and one darker line, tiled twenty-two times
 * along the belt. It exists so that scrolling the belt is visible at all — a
 * flat black plane with a moving texture offset looks exactly like a flat black
 * plane standing still, and "is the line running" is a question the lab asks the
 * student to answer by looking.
 */
function makeBeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 4;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 32, 4);
    context.fillStyle = '#8e8e8e';
    context.fillRect(0, 0, 3, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
