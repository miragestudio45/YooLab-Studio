import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The Open-Industry six-axis arm, rigged for the browser.
 *
 * This replaces a hand-built arm of boxes and cylinders, and the difference is
 * not decoration. A primitive arm can carry the *kinematics* of a six-axis
 * robot perfectly well — the previous one did — but it cannot carry the thing a
 * student is actually looking at: cast housings, the hydraulic strut that
 * drives the shoulder, cable runs, the bolt circles at every joint face. An arm
 * without those reads as a diagram of a robot, and a diagram is what the rest
 * of this section already is.
 *
 * So the meshes here are the real ones, from the MIT-licensed Open Industry
 * Project (`assets/3DModels/Six-axis/Six-Axis_01.glb` plus its suction tool),
 * and the rig is transcribed from that project's own `parts/SixAxisRobot.tscn`
 * rather than guessed from the silhouette. See `THIRD_PARTY_ASSETS.md`.
 *
 * ## Reading a Godot scene as a three.js rig
 *
 * Two conventions had to be established before any number below could be
 * trusted, and both are easy to get backwards:
 *
 *   1. **`Transform3D(...)`'s nine basis arguments are rows.** Godot's
 *      `Basis(xx, xy, xz, yx, …)` assigns them to `rows[0]`, `rows[1]`,
 *      `rows[2]`, which is exactly the order `THREE.Matrix4.set` takes. So a
 *      basis copies across argument for argument — but the *columns* are the
 *      axis vectors, so reading the first three numbers as "the X axis" gives a
 *      transposed, mirror-imaged arm.
 *
 *      Checked against the file rather than assumed: `UpperArmPivot`'s basis
 *      resolves to a −45° rotation about Z read as rows, and +45° read as
 *      columns. The scene was saved at the home pose and the home pose declares
 *      `j2 = −45°`. Rows. The same check on `WristRotPivot` (+25°, `j4 = 25`)
 *      and `ForearmPivot` (+90°, `j3 = 90`) agrees.
 *
 *   2. **Setting `Node3D.rotation.y` replaces the node's whole rotation**, it
 *      does not compose with it. `six_axis_robot.gd` drives each joint with a
 *      single-component assignment, so a joint pivot's stored basis is *only*
 *      the home angle and carries no information the joint chain needs. Which
 *      is why the pivots below take a position and an axis and nothing else —
 *      and why the home pose is data (`HOME`) rather than a saved transform.
 *
 * The mesh nodes are the opposite case: their bases are never overwritten, so
 * each one is transcribed in full. All of them turn out to be signed axis
 * permutations — the parts were modelled Z-up and mounted Y-up — but they are
 * written as matrices rather than as "rotate −90° about Y" so that a future
 * mesh that is *not* axis-aligned does not need a different mechanism.
 *
 * ## What is not modelled
 *
 * The upstream robot also carries a Godot `Area3D` for vacuum pickup, a CCD IK
 * solver over all six pivots, and OPC-UA / EtherNet-IP / Modbus tag bindings.
 * The pickup test here is a distance check in `cellScene.ts`, the IK is the
 * analytic solve in `cell.ts`, and the fieldbus stack is deliberately absent.
 */

const MODEL = '/asset/practice/robot/six-axis.glb';
const TOOL = '/asset/practice/robot/eoat-suction.glb';
const TEXTURES = {
  armBase: '/asset/practice/robot/six-axis-basecolor.webp',
  armNormal: '/asset/practice/robot/six-axis-normal.webp',
  armOrm: '/asset/practice/robot/six-axis-orm.webp',
  toolBase: '/asset/practice/robot/eoat-basecolor.webp',
  toolNormal: '/asset/practice/robot/eoat-normal.webp',
  toolOrm: '/asset/practice/robot/eoat-orm.webp',
} as const;

/* --------------------------------------------------------------- kinematics --- */

export type JointIndex = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * The joint-limit table, straight from `six_axis_robot.gd`.
 *
 * Not decoration. Without J2's limit the shoulder solves itself down through
 * the pedestal on a low reach, and without J3's the forearm folds back through
 * the upper arm — both of which a real controller refuses and both of which
 * look, on screen, like the model is broken rather than like the pose is
 * illegal.
 */
export const JOINT_LIMITS_DEG: [number, number][] = [
  [-180, 180],
  [-135, 135],
  [-160, 160],
  [-180, 180],
  [-120, 120],
  [-360, 360],
];

/** Upstream's `home_position`. The pose the scene file was saved in. */
export const HOME_DEG: [number, number, number, number, number, number] = [0, -45, 90, 25, 75, 0];

/** Which world axis each joint turns about, from `JOINT_IS_Y_AXIS`. */
const JOINT_AXIS: ('y' | 'z')[] = ['y', 'z', 'z', 'y', 'z', 'y'];

export const JOINT_LABELS = [
  { id: 'J1', name: 'Thân', note: 'Xoay toàn bộ cánh tay quanh trục đứng.' },
  { id: 'J2', name: 'Vai', note: 'Nâng và hạ cánh tay trên.' },
  { id: 'J3', name: 'Khuỷu', note: 'Gập cẳng tay.' },
  { id: 'J4', name: 'Cẳng tay', note: 'Xoay cẳng tay quanh trục của nó.' },
  { id: 'J5', name: 'Cổ tay', note: 'Gật đầu công cụ lên xuống.' },
  { id: 'J6', name: 'Công cụ', note: 'Xoay tấm hút quanh trục của nó.' },
] as const;

export function clampJointDeg(index: JointIndex, degrees: number) {
  const [min, max] = JOINT_LIMITS_DEG[index];
  return THREE.MathUtils.clamp(degrees, min, max);
}

/* ------------------------------------------------------------------- the rig --- */

/**
 * Where each pivot sits relative to its parent, in metres.
 *
 * Transcribed from `SixAxisRobot.tscn`. `shoulder` and `elbow` are *not*
 * joints — they are the fixed offsets between one joint and the next, and the
 * upstream scene keeps them as their own nodes. Flattening them into the joint
 * positions would work and would also lose the one thing this table is for:
 * being diffable against the file it came from.
 */
const PIVOT_POSITION = {
  shoulder: [0, 0.9, 0],
  upperArm: [-0.72657037, -0.34717786, -0.0024254583],
  elbow: [0.014725149, 1.3262625, -0.00687705],
  forearm: [-0.018255234, 0.018255234, -0.09700517],
  wristRot: [0.11355525, 0.87549424, 0.09818761],
  wristPitch: [0, 0.33123374, 0],
  tool: [0, 0.21365428, 0],
  /** The EOAT's own mount, rotated a half turn about Z by the scene. */
  eoat: [0, 0.009, 0],
  hydraulicBase: [0.31569114, 0.5505995, -0.22799234],
  hydraulicRod: [0.19884515, 0.00020599365, -0.23987292],
} as const;

/**
 * Mesh placements, as (basis rows, position).
 *
 * Every basis here is a signed axis permutation with components at ±1 and
 * floating-point dust elsewhere; the dust is dropped rather than transcribed,
 * because `-4.371139e-08` is `sin(-90°)` computed in float32 and writing it
 * down pretends to a precision the model does not have.
 */
type Placement = { basis: number[]; position: [number, number, number] };

const AXIS_YAW_MINUS_90: number[] = [0, 0, -1, 0, 1, 0, 1, 0, 0];
/** X→+Z, Y→+X, Z→+Y. The three long linkages were modelled on their side. */
const AXIS_ZXY: number[] = [0, 1, 0, 0, 0, 1, 1, 0, 0];
/** As above with X mirrored: `Linkage05` is the opposite-hand casting. */
const AXIS_ZXY_FLIP: number[] = [0, -1, 0, 0, 0, -1, 1, 0, 0];
/** X→−X, Y→+Z, Z→+Y. The suction boss faces down the tool axis. */
const AXIS_TOOL: number[] = [-1, 0, 0, 0, 0, 1, 0, 1, 0];

const MESH_PLACEMENT: Record<string, Placement> = {
  Base: { basis: AXIS_YAW_MINUS_90, position: [0, 0, 0] },
  Linkage01: { basis: AXIS_YAW_MINUS_90, position: [0, 0.23, 0] },
  Linkage02: { basis: AXIS_ZXY, position: [0, 0, 0] },
  Linkage03: { basis: AXIS_ZXY, position: [0, 0, 0] },
  Linkage04: { basis: AXIS_ZXY, position: [0, 0, 0] },
  Linkage05: { basis: AXIS_ZXY_FLIP, position: [0, 0, 0] },
  ToolSuction: { basis: AXIS_TOOL, position: [0, -0.016534597, 0] },
  Hydraulic_01: { basis: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] },
  Hydraulic_02: { basis: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] },
};

/**
 * Name in the scene file → name of the *node* in the GLB.
 *
 * Node, not mesh. `GLTFLoader` names each `Object3D` after the glTF node it came
 * from and never after the mesh it points at, and the two disagree here: node
 * `Six-Axis_Base` carries a mesh called `Mesh.012`, left over from whatever the
 * arm was modelled in.
 */
const MESH_SOURCE: Record<string, string> = {
  Base: 'Six-Axis_Base',
  Linkage01: 'Six-Axis_Linkage_01',
  Linkage02: 'Six-Axis_Linkage_02',
  Linkage03: 'Six-Axis_Linkage_03',
  Linkage04: 'Six-Axis_Linkage_04',
  Linkage05: 'Six-Axis_Linkage_05',
  ToolSuction: 'Six-Axis_Tool_Suction',
  Hydraulic_01: 'Six-Axis_Hydraulic_01',
  Hydraulic_02: 'Six-Axis_Hydraulic_02',
};

/**
 * The suction plate's cup grid, from `EOATSuction.tscn`.
 *
 * Five by five at a 100 mm pitch on a 500 mm plate. Upstream generates these
 * from four exported pitch/margin parameters; the plate never resizes here, so
 * the grid is a constant.
 */
const CUP_PITCH = 0.1;
const CUP_ROWS = 5;
const CUP_Y = -0.10347296;
/** Plate-local Y of the vacuum contact point, from the scene's `VacuumArea`. */
export const TOOL_TIP_Y = -0.15;

export type SixAxisArm = {
  /** Root. Stands on the floor at its own origin, +Z forward at `j1 = 0`. */
  group: THREE.Group;
  /**
   * Empty at the vacuum contact point, i.e. where a picked case's top face
   * sits. Read its world matrix for the tool centre point.
   */
  toolTip: THREE.Object3D;
  /** Applies six angles, in degrees, clamped to the upstream limit table. */
  setJoints(degrees: readonly number[]): void;
  /** Lights the suction plate while the vacuum is drawing. */
  setVacuum(on: boolean): void;
  /** Height of the arm's own reach envelope, metres. For camera framing. */
  reach: number;
  dispose(): void;
};

function basisMatrix(rows: number[]) {
  return new THREE.Matrix4().set(
    rows[0], rows[1], rows[2], 0,
    rows[3], rows[4], rows[5], 0,
    rows[6], rows[7], rows[8], 0,
    0, 0, 0, 1,
  );
}

function place(mesh: THREE.Object3D, placement: Placement) {
  const matrix = basisMatrix(placement.basis);
  matrix.setPosition(placement.position[0], placement.position[1], placement.position[2]);
  mesh.applyMatrix4(matrix);
}

/**
 * Loads the arm's textures once and shares them.
 *
 * The 1024² set is 257 kB and the modal can be opened, closed and reopened; a
 * fresh decode each time is a visible stall for no reason. Keyed by URL and
 * never evicted, which is the right trade for six files that the page either
 * needs or never touches.
 */
const textureCache = new Map<string, THREE.Texture>();

function loadTexture(loader: THREE.TextureLoader, url: string, colorSpace: string) {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  return loader.loadAsync(url).then((texture) => {
    texture.colorSpace = colorSpace as THREE.ColorSpace;
    texture.flipY = false; // glTF UV convention, and these UVs came from a GLB.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    textureCache.set(url, texture);
    return texture;
  });
}

export async function createSixAxisArm(): Promise<SixAxisArm> {
  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();

  const [armGltf, toolGltf, armBase, armNormal, armOrm, toolBase, toolNormal, toolOrm] = await Promise.all([
    gltfLoader.loadAsync(MODEL),
    gltfLoader.loadAsync(TOOL),
    loadTexture(textureLoader, TEXTURES.armBase, THREE.SRGBColorSpace),
    loadTexture(textureLoader, TEXTURES.armNormal, THREE.NoColorSpace),
    loadTexture(textureLoader, TEXTURES.armOrm, THREE.NoColorSpace),
    loadTexture(textureLoader, TEXTURES.toolBase, THREE.SRGBColorSpace),
    loadTexture(textureLoader, TEXTURES.toolNormal, THREE.NoColorSpace),
    loadTexture(textureLoader, TEXTURES.toolOrm, THREE.NoColorSpace),
  ]);

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  /*
   * One ORM material per model, exactly as the upstream `.tres` files declare.
   *
   * Godot's `ORMMaterial3D` packs occlusion in R, roughness in G and metallic
   * in B of one texture, which is the glTF convention — so the same
   * `THREE.Texture` goes into `aoMap`, `roughnessMap` and `metalnessMap` and
   * three.js samples the right channel from each. `roughness` and `metalness`
   * must be left at 1: they multiply the map, and the default 0 metalness would
   * cancel the B channel and turn every machined surface into painted plastic.
   */
  const armMaterial = keep(new THREE.MeshStandardMaterial({
    map: armBase,
    normalMap: armNormal,
    aoMap: armOrm,
    roughnessMap: armOrm,
    metalnessMap: armOrm,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.9,
  }));

  const toolMaterial = keep(new THREE.MeshStandardMaterial({
    map: toolBase,
    normalMap: toolNormal,
    aoMap: toolOrm,
    roughnessMap: toolOrm,
    metalnessMap: toolOrm,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.9,
  }));

  /** Pulls a geometry out of a loaded GLB by its mesh name. */
  const geometries = new Map<string, THREE.BufferGeometry>();
  const collect = (gltf: { scene: THREE.Object3D }) => {
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      /*
       * The GLB node's own translation is dropped, and that is deliberate
       * rather than an oversight. Upstream extracted these meshes to standalone
       * `.res` resources and then hand-built a new joint chain around them, so
       * the placement authority is the scene file — the pivot offsets below
       * already account for where each casting sits. `Linkage_05` is the one
       * that makes this visible: its GLB node carries a 210 mm Z offset, and
       * the scene puts an almost identical 214 mm into `ToolPivot` instead.
       */
      geometries.set(node.name, node.geometry);
    });
  };
  collect(armGltf);
  collect(toolGltf);

  const meshFor = (sceneName: string, material: THREE.Material) => {
    const source = MESH_SOURCE[sceneName] ?? sceneName;
    const geometry = geometries.get(source);
    if (!geometry) throw new Error(`six-axis: mesh "${source}" is not in the model`);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = sceneName;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const placement = MESH_PLACEMENT[sceneName];
    if (placement) place(mesh, placement);
    return mesh;
  };

  /* ---------------------------------------------------------- the chain --- */

  const group = new THREE.Group();
  group.name = 'oip_six_axis';

  group.add(meshFor('Base', armMaterial));

  const basePivot = new THREE.Group();
  group.add(basePivot);
  basePivot.add(meshFor('Linkage01', armMaterial));

  const shoulder = new THREE.Group();
  shoulder.position.fromArray(PIVOT_POSITION.shoulder);
  basePivot.add(shoulder);

  const upperArmPivot = new THREE.Group();
  upperArmPivot.position.fromArray(PIVOT_POSITION.upperArm);
  shoulder.add(upperArmPivot);
  upperArmPivot.add(meshFor('Linkage02', armMaterial));

  const elbow = new THREE.Group();
  elbow.position.fromArray(PIVOT_POSITION.elbow);
  upperArmPivot.add(elbow);

  const forearmPivot = new THREE.Group();
  forearmPivot.position.fromArray(PIVOT_POSITION.forearm);
  elbow.add(forearmPivot);
  forearmPivot.add(meshFor('Linkage03', armMaterial));

  const wristRotPivot = new THREE.Group();
  wristRotPivot.position.fromArray(PIVOT_POSITION.wristRot);
  forearmPivot.add(wristRotPivot);
  wristRotPivot.add(meshFor('Linkage04', armMaterial));

  const wristPitchPivot = new THREE.Group();
  wristPitchPivot.position.fromArray(PIVOT_POSITION.wristPitch);
  wristRotPivot.add(wristPitchPivot);
  wristPitchPivot.add(meshFor('Linkage05', armMaterial));

  const toolPivot = new THREE.Group();
  toolPivot.position.fromArray(PIVOT_POSITION.tool);
  wristPitchPivot.add(toolPivot);

  /*
   * The EOAT hangs from `ToolPivot` under a half turn about Z, which is how the
   * upstream scene mounts it. Without the flip the suction plate faces back up
   * the forearm.
   */
  const eoat = new THREE.Group();
  eoat.position.fromArray(PIVOT_POSITION.eoat);
  eoat.rotation.z = Math.PI;
  toolPivot.add(eoat);
  eoat.add(meshFor('ToolSuction', armMaterial));

  /* --------------------------------------------------- the suction plate --- */

  /*
   * The plate is assembled here rather than instanced from a prebuilt group,
   * because the four rails and four corner caps reuse two geometries between
   * them at four different orientations — which is also why the caps are
   * mirrored pairs rather than four copies of one transform.
   */
  const plate = new THREE.Group();
  eoat.add(plate);
  /* `Attachment` is the 190 mm mounting boss; `Plane` is the 500 mm plate face
     it holds. Upstream stretches the latter procedurally to whatever tool size
     is configured — the plate never resizes here, so it is placed as authored. */
  plate.add(meshFor('Attachment', toolMaterial));
  const face = meshFor('Plane', toolMaterial);
  face.position.y = 0.004;
  plate.add(face);

  const railB = ['Rails_01'] as const;
  for (const [x, flip] of [[-0.25, false], [0.25, true]] as const) {
    const rail = meshFor(railB[0], toolMaterial);
    rail.position.set(x, -0.07514775, 0);
    if (flip) rail.rotation.y = Math.PI;
    plate.add(rail);
  }
  for (const [z, flip] of [[-0.25, true], [0.25, false]] as const) {
    const rail = meshFor('Rails_02', toolMaterial);
    rail.position.set(0, -0.07509387, z);
    if (flip) rail.rotation.y = Math.PI;
    plate.add(rail);
  }
  for (const [x, z, cap, flip] of [
    [-0.242, -0.249, 'Cap_02', true],
    [0.242, -0.249, 'Cap_01', true],
    [-0.242, 0.249, 'Cap_01', false],
    [0.242, 0.249, 'Cap_02', false],
  ] as const) {
    const node = meshFor(cap, toolMaterial);
    node.position.set(x, -0.0754, z);
    if (flip) node.rotation.y = Math.PI;
    plate.add(node);
  }

  /*
   * Twenty-five cups, instanced.
   *
   * The cup is 550 triangles, so twenty-five of them as separate meshes is
   * twenty-five draw calls for 2% of the arm's geometry — the exact shape of
   * cost an `InstancedMesh` exists to remove. They never move relative to the
   * plate, so the matrices are written once.
   */
  const cupGeometry = geometries.get('SuctionCup');
  if (cupGeometry) {
    const cups = new THREE.InstancedMesh(cupGeometry, toolMaterial, CUP_ROWS * CUP_ROWS);
    cups.castShadow = true;
    const matrix = new THREE.Matrix4();
    const half = ((CUP_ROWS - 1) * CUP_PITCH) / 2;
    let index = 0;
    for (let row = 0; row < CUP_ROWS; row += 1) {
      for (let column = 0; column < CUP_ROWS; column += 1) {
        matrix.makeTranslation(row * CUP_PITCH - half, CUP_Y, column * CUP_PITCH - half);
        cups.setMatrixAt(index, matrix);
        index += 1;
      }
    }
    cups.instanceMatrix.needsUpdate = true;
    plate.add(cups);
  }

  /*
   * The vacuum indicator.
   *
   * Upstream swaps the suction mesh's material for an emissive green while the
   * vacuum is on. The same signal is needed here and the same trick would ruin
   * it: an emissive green casting on an orange arm in an ivory room is the
   * loudest thing on screen. So the state is carried by a thin disc under the
   * plate instead — present only while drawing, coral to match the room, and
   * where the eye already is when it is watching for a pick.
   */
  const glowGeometry = keep(new THREE.CircleGeometry(0.3, 48));
  const glowMaterial = keep(new THREE.MeshBasicMaterial({
    color: 0x00aaab,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.rotation.x = Math.PI / 2;
  glow.position.y = CUP_Y - 0.012;
  glow.renderOrder = 6;
  plate.add(glow);

  /*
   * The tool tip is parented under the flip, so `-0.15` is measured down the
   * plate's own axis rather than up it. Reading the world position of an empty
   * beats deriving the TCP from six angles: the chain already computed it.
   */
  const toolTip = new THREE.Object3D();
  toolTip.position.y = TOOL_TIP_Y;
  eoat.add(toolTip);

  const pivots: Record<JointIndex, THREE.Object3D> = {
    0: basePivot,
    1: upperArmPivot,
    2: forearmPivot,
    3: wristRotPivot,
    4: wristPitchPivot,
    5: toolPivot,
  };

  /*
   * The shoulder strut.
   *
   * Two halves of a hydraulic cylinder that has to keep pointing at itself
   * while the shoulder moves — the barrel is bolted to the base and the rod to
   * the upper arm, so neither one's own transform can describe it. Upstream
   * solves this with a dedicated `hydraulic_controller.gd` that aims each half
   * at the other every frame; the same two `lookAt` calls happen in
   * `setJoints` below.
   *
   * It is not cosmetic. It is the only part of the arm that visibly *does work*
   * when J2 turns, and without it the shoulder reads as a hinge rather than as
   * something being pushed.
   */
  const hydraulicBase = new THREE.Object3D();
  hydraulicBase.position.fromArray(PIVOT_POSITION.hydraulicBase);
  basePivot.add(hydraulicBase);
  hydraulicBase.add(meshFor('Hydraulic_01', armMaterial));

  const hydraulicRod = new THREE.Object3D();
  hydraulicRod.position.fromArray(PIVOT_POSITION.hydraulicRod);
  upperArmPivot.add(hydraulicRod);
  hydraulicRod.add(meshFor('Hydraulic_02', armMaterial));

  const scratchA = new THREE.Vector3();
  const scratchB = new THREE.Vector3();

  const setJoints = (degrees: readonly number[]) => {
    for (let index = 0; index < 6; index += 1) {
      const pivot = pivots[index as JointIndex];
      const angle = THREE.MathUtils.degToRad(clampJointDeg(index as JointIndex, degrees[index] ?? 0));
      /*
       * Assignment, not `rotateY`. This mirrors the upstream setter exactly:
       * the pivot's rotation *is* the joint angle, and a relative rotate would
       * integrate rounding error into the pose over a few thousand frames.
       */
      if (JOINT_AXIS[index] === 'y') pivot.rotation.set(0, angle, 0);
      else pivot.rotation.set(0, 0, angle);
    }

    /* The strut needs both ends' world positions, so the chain above it has to
       be up to date before either half can be aimed. */
    group.updateMatrixWorld(true);
    hydraulicBase.getWorldPosition(scratchA);
    hydraulicRod.getWorldPosition(scratchB);
    hydraulicBase.lookAt(scratchB);
    hydraulicRod.lookAt(scratchA);
    /*
     * `lookAt` points −Z at the target; the cylinder halves are modelled along
     * +Y, so both need a quarter turn out of the look basis. Applied after
     * `lookAt` rather than folded into the mesh, because the mesh transform is
     * transcribed from the scene file and should stay that way.
     */
    hydraulicBase.rotateX(-Math.PI / 2);
    hydraulicRod.rotateX(-Math.PI / 2);
  };

  setJoints(HOME_DEG);

  /*
   * Measured rather than declared. The camera and the cell layout both need to
   * know how far this arm reaches, and a constant here would silently disagree
   * with the model the day a linkage is swapped.
   */
  const stretched = [...HOME_DEG];
  stretched[1] = 0;
  stretched[2] = 0;
  stretched[4] = 0;
  setJoints(stretched);
  group.updateMatrixWorld(true);
  const reach = toolTip.getWorldPosition(scratchA).length();
  setJoints(HOME_DEG);

  return {
    group,
    toolTip,
    setJoints,
    setVacuum(on: boolean) {
      glowMaterial.opacity = on ? 0.42 : 0;
    },
    reach,
    dispose() {
      /*
       * Geometries come from the two GLBs and are shared with nothing else, so
       * they are disposed here. The textures are not: they live in the module
       * cache so a reopened modal does not decode 257 kB again.
       */
      for (const geometry of geometries.values()) geometry.dispose();
      for (const value of owned) value.dispose();
      armMaterial.dispose();
      toolMaterial.dispose();
      group.removeFromParent();
    },
  };
}

/* ---------------------------------------------------------------------- ik --- */

/**
 * The planar chain, derived from the offset table rather than restated.
 *
 * Measured in the arm's own working plane, where `u` runs outward from the base
 * axis and `y` is up. Because `u = −x`, a rotation of `+θ` about Z in the
 * model's frame is a rotation of `−θ` here — which is the sign flip every angle
 * below carries, and the one thing about this solve that is easy to get wrong.
 *
 * The two link vectors are each a *pair* of offsets from the table, because the
 * upstream scene splits every joint across two nodes (a fixed offset then the
 * pivot). Summing them here rather than writing down two lengths means the
 * lengths cannot drift from the chain the renderer actually uses.
 */
const PLANE = (() => {
  const asPlane = (offset: readonly number[]) => ({ u: -offset[0], y: offset[1] });
  const sum = (a: { u: number; y: number }, b: { u: number; y: number }) => ({ u: a.u + b.u, y: a.y + b.y });

  /** Shoulder → elbow. */
  const link1 = sum(asPlane(PIVOT_POSITION.elbow), asPlane(PIVOT_POSITION.forearm));
  /** Elbow → wrist pitch. */
  const link2 = sum(asPlane(PIVOT_POSITION.wristRot), asPlane(PIVOT_POSITION.wristPitch));

  return {
    /** Upper-arm pivot, in the working plane. */
    originU: -PIVOT_POSITION.upperArm[0],
    originY: PIVOT_POSITION.shoulder[1] + PIVOT_POSITION.upperArm[1],
    a: Math.hypot(link1.u, link1.y),
    aAngle: Math.atan2(link1.y, link1.u),
    b: Math.hypot(link2.u, link2.y),
    bAngle: Math.atan2(link2.y, link2.u),
    /**
     * Wrist pitch pivot → tool tip, with the plate vertical. Three collinear
     * offsets along the tool axis, so a scalar is enough.
     */
    wristToTip: PIVOT_POSITION.tool[1] + PIVOT_POSITION.eoat[1] + Math.abs(TOOL_TIP_Y),
  };
})();

/** Farthest the tool tip can reach from the base axis at `height`, metres. */
export function maxRadiusAt(height: number) {
  const rise = height + PLANE.wristToTip - PLANE.originY;
  const span = PLANE.a + PLANE.b - 0.01;
  if (Math.abs(rise) >= span) return PLANE.originU;
  return PLANE.originU + Math.sqrt(span * span - rise * rise);
}

export type ToolDownSolution = {
  /** Six angles in degrees, ready for `setJoints`. */
  degrees: number[];
  /** False when the ask was outside the envelope and had to be pulled in. */
  reachable: boolean;
};

/**
 * Analytic inverse kinematics for a tool held vertically.
 *
 * Three degrees of freedom are enough because a palletiser only ever asks for a
 * *position*: the suction plate points straight down, which is how every
 * top-pick cell in a real warehouse runs, and it collapses a six-axis solve into
 * a base rotation plus a planar two-link triangle plus one wrist angle.
 *
 * "Plate vertical" is the constraint that closes it. J2, J3 and J5 all turn
 * about the same plane-normal axis, so the plate's tilt is their sum — and the
 * plate hangs straight down exactly when that sum is 180°. So J5 is not solved,
 * it is whatever is left over: `180 − j2 − j3`.
 *
 * Upstream ships a general iterative solver instead (CCD over all six pivots).
 * That is the right tool for an editor where an engineer drags a gizmo to an
 * arbitrary pose. It is the wrong one here: it can converge into a legal pose
 * that looks folded in on itself, and a student watching an arm reach for a case
 * should not see it think.
 *
 * The elbow-up branch is taken unconditionally. Elbow-down is a legal solution
 * across most of this envelope and it puts the forearm through the conveyor.
 */
export function solveToolDown(
  target: THREE.Vector3,
  options: { toolRoll?: number; forearmRoll?: number } = {},
): ToolDownSolution {
  const radius = Math.hypot(target.x, target.z);
  const azimuth = THREE.MathUtils.radToDeg(Math.atan2(target.x, target.z));

  const targetU = radius - PLANE.originU;
  const targetY = target.y + PLANE.wristToTip - PLANE.originY;

  const distance = Math.hypot(targetU, targetY);
  const near = Math.abs(PLANE.a - PLANE.b) + 1e-3;
  const far = PLANE.a + PLANE.b - 1e-3;
  const clamped = THREE.MathUtils.clamp(distance, near, far);
  const reachable = Math.abs(clamped - distance) < 1e-3;

  /* Pull an unreachable ask in along its own direction, so "too far that way"
     becomes "as far that way as I can go" rather than a NaN or a snap to zero. */
  const scale = distance > 1e-9 ? clamped / distance : 0;
  const reachU = targetU * scale;
  const reachY = targetY * scale;

  const cosGap = THREE.MathUtils.clamp(
    (clamped * clamped - PLANE.a * PLANE.a - PLANE.b * PLANE.b) / (2 * PLANE.a * PLANE.b),
    -1,
    1,
  );
  /* Negative: the second link folds *back* across the first, which is the
     elbow-up branch for this arm — its home pose has `j3 = +90`. */
  const gap = -Math.acos(cosGap);
  const toTarget = Math.atan2(reachY, reachU);
  const firstLink = toTarget - Math.atan2(
    PLANE.b * Math.sin(gap),
    PLANE.a + PLANE.b * Math.cos(gap),
  );

  const j2 = THREE.MathUtils.radToDeg(PLANE.aAngle - firstLink);
  const j3 = THREE.MathUtils.radToDeg(PLANE.bAngle - PLANE.aAngle - gap);
  const j5 = 180 - j2 - j3;

  return {
    degrees: [
      clampJointDeg(0, azimuth),
      clampJointDeg(1, j2),
      clampJointDeg(2, j3),
      clampJointDeg(3, options.forearmRoll ?? 0),
      clampJointDeg(4, j5),
      clampJointDeg(5, options.toolRoll ?? 0),
    ],
    reachable,
  };
}

/**
 * Steps each joint toward its target at a bounded rate, in degrees.
 *
 * Every joint is capped at the same angular speed, which is what an industrial
 * controller does in joint-interpolated mode and is why a real arm's tool traces
 * a curve between two taught points rather than a straight line. It also means
 * the arm can never snap: a student who jams a jog key sees the arm *travel*,
 * which is the only way the motion reads as a machine obeying an instruction.
 *
 * Returns true once every joint has arrived.
 */
export function approachJoints(current: number[], target: readonly number[], maxStep: number) {
  let settled = true;
  for (let index = 0; index < 6; index += 1) {
    const delta = target[index] - current[index];
    if (Math.abs(delta) <= maxStep) {
      current[index] = target[index];
    } else {
      current[index] += Math.sign(delta) * maxStep;
      settled = false;
    }
  }
  return settled;
}

/* --------------------------------------------------------------- inspection --- */

/**
 * Forward kinematics for a pose, without touching the live rig.
 *
 * The control panel needs the tool centre point for a pose it has not committed
 * to yet — a slider being dragged, a waypoint being previewed — and driving the
 * real arm to find out would show the visitor every intermediate frame of a
 * pose they may not choose. So this walks a throwaway copy of the chain.
 *
 * It is a *copy of the offsets*, not of the meshes, so it costs nine matrix
 * multiplies and no allocation past the scratch objects.
 */
export function createForwardKinematics() {
  const root = new THREE.Object3D();
  const basePivot = new THREE.Object3D();
  root.add(basePivot);
  const shoulder = new THREE.Object3D();
  shoulder.position.fromArray(PIVOT_POSITION.shoulder);
  basePivot.add(shoulder);
  const upperArm = new THREE.Object3D();
  upperArm.position.fromArray(PIVOT_POSITION.upperArm);
  shoulder.add(upperArm);
  const elbow = new THREE.Object3D();
  elbow.position.fromArray(PIVOT_POSITION.elbow);
  upperArm.add(elbow);
  const forearm = new THREE.Object3D();
  forearm.position.fromArray(PIVOT_POSITION.forearm);
  elbow.add(forearm);
  const wristRot = new THREE.Object3D();
  wristRot.position.fromArray(PIVOT_POSITION.wristRot);
  forearm.add(wristRot);
  const wristPitch = new THREE.Object3D();
  wristPitch.position.fromArray(PIVOT_POSITION.wristPitch);
  wristRot.add(wristPitch);
  const tool = new THREE.Object3D();
  tool.position.fromArray(PIVOT_POSITION.tool);
  wristPitch.add(tool);
  const eoat = new THREE.Object3D();
  eoat.position.fromArray(PIVOT_POSITION.eoat);
  eoat.rotation.z = Math.PI;
  tool.add(eoat);
  const tip = new THREE.Object3D();
  tip.position.y = TOOL_TIP_Y;
  eoat.add(tip);

  const chain: THREE.Object3D[] = [basePivot, upperArm, forearm, wristRot, wristPitch, tool];

  return {
    /** Tool centre point for `degrees`, in the arm's own frame. */
    solve(degrees: readonly number[], out = new THREE.Vector3()) {
      for (let index = 0; index < 6; index += 1) {
        const angle = THREE.MathUtils.degToRad(clampJointDeg(index as JointIndex, degrees[index] ?? 0));
        if (JOINT_AXIS[index] === 'y') chain[index].rotation.set(0, angle, 0);
        else chain[index].rotation.set(0, 0, angle);
      }
      root.updateMatrixWorld(true);
      return tip.getWorldPosition(out);
    },
  };
}
