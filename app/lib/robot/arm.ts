import * as THREE from 'three';
import { loadSurface, prepareForAo, type PracticeLoader } from '../practice/gltf';

/**
 * The Open Industry Project's six-axis robot, rebuilt in three.js.
 *
 * This is that project's actual arm — `Six-Axis_01.glb`, nine meshes, its own
 * baked 4K base-colour/normal/ORM set — hung on the node hierarchy its Godot
 * scene declares, with the same six driven pivots and the same joint-limit
 * table. What could not come across is the engine: `SixAxisRobot.tscn` is a
 * Godot scene and this is a web page, so the tree below is transcribed from it
 * rather than imported.
 *
 * Two things about that transcription are worth stating, because both are easy
 * to get wrong and neither is visible until the arm bends the wrong way.
 *
 * **A `Transform3D` in a `.tscn` is written row-major.** The *constructor* takes
 * basis columns, which is what the argument names suggest, but Godot's variant
 * serializer writes `basis[0]`, `basis[1]`, `basis[2]` — and `Basis::operator[]`
 * returns a **row**. Reading the saved numbers as columns transposes every
 * rotation in the arm, and the failure is not obvious: the arm still assembles,
 * still articulates, and simply has its upper arm running along the wrong axis,
 * so the forearm and wrist hang in the air half a metre from the elbow.
 *
 * The check that settles it: read row-major and the rest rotation of every one
 * of the four driven pivots comes out *exactly* equal to that joint's home
 * angle — −45°, +90°, +25°, +75°. Read column-major and none of them do. The
 * scene was saved at its home pose, so that agreement is not a coincidence.
 * Both engines are right-handed and Y-up, so beyond the transpose there is no
 * axis conversion and no sign flip.
 *
 * **Setting `node.rotation.z` in Godot replaces the node's whole rotation**, it
 * does not compose with the rest pose. So a driven pivot's saved basis is only
 * the pose the scene happened to be saved in, and the joint angle is *absolute*
 * in that pivot's frame. Every driven pivot here turns out to have a rest
 * rotation about its own driven axis alone, so the rest rotation is simply
 * dropped and the angle written in its place — which is exactly what the
 * upstream `_update_joints()` does. Their *offsets* are kept; those are the arm.
 */

/** The six driven joints, in the order the upstream controller lists them. */
export type JointAngles = {
  /** Base rotation, about +Y. */
  j1: number;
  /** Shoulder, about local Z. */
  j2: number;
  /** Elbow, about local Z. */
  j3: number;
  /** Forearm roll, about local Y. */
  j4: number;
  /** Wrist pitch, about local Z. */
  j5: number;
  /** Tool roll, about local Y. */
  j6: number;
};

export const JOINT_KEYS: (keyof JointAngles)[] = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];

/**
 * Joint limits in radians, from the upstream degree table
 * (±180 / ±135 / ±160 / ±180 / ±120 / ±360). Not decoration: without J2's limit
 * the shoulder solves itself straight through the pedestal on a low reach.
 */
export const JOINT_LIMITS: [number, number][] = [
  [-Math.PI, Math.PI],
  [(-135 * Math.PI) / 180, (135 * Math.PI) / 180],
  [(-160 * Math.PI) / 180, (160 * Math.PI) / 180],
  [-Math.PI, Math.PI],
  [(-120 * Math.PI) / 180, (120 * Math.PI) / 180],
  [-Math.PI * 2, Math.PI * 2],
];

/**
 * A tighter envelope than the machine's, for the joints the servo drives.
 *
 * The mechanical limits are real and stay real — `JOINT_LIMITS` is what the
 * hardware allows. But a six-axis arm has more than one way to put its tool at
 * a given point, and a differential servo picks whichever branch it happens to
 * walk into: sent from a high ready pose to a low far reach, this one folds its
 * elbow back over its own shoulder and arrives with the tool upside down. That
 * is a legal solution and a machine nobody would build a cell around.
 *
 * So the shoulder and elbow are kept inside the band a working cell actually
 * uses. It costs a little of the workspace nothing in this lab reaches, and it
 * means every pose the student ever sees is one a real cell would hold.
 */
const POSTURE: Partial<Record<keyof JointAngles, [number, number]>> = {
  j2: [(-110 * Math.PI) / 180, (45 * Math.PI) / 180],
  j3: [(12 * Math.PI) / 180, (150 * Math.PI) / 180],
};

/** The upstream scene's own home pose, in degrees. */
export const HOME: JointAngles = {
  j1: 0,
  j2: (-45 * Math.PI) / 180,
  j3: (90 * Math.PI) / 180,
  j4: (25 * Math.PI) / 180,
  j5: (75 * Math.PI) / 180,
  j6: 0,
};

export function cloneAngles(angles: JointAngles): JointAngles {
  return { ...angles };
}

export function clampJoint(angle: number, index: number) {
  const [min, max] = JOINT_LIMITS[index];
  return THREE.MathUtils.clamp(angle, min, max);
}

/** Clamps to the working posture where one is declared, to the machine otherwise. */
export function clampPosture(angle: number, key: keyof JointAngles) {
  const band = POSTURE[key];
  if (band) return THREE.MathUtils.clamp(angle, band[0], band[1]);
  return clampJoint(angle, JOINT_KEYS.indexOf(key));
}

/* ------------------------------------------------------------ transforms --- */

/** A Godot `Transform3D` as a `.tscn` writes it: three basis rows, then the origin. */
type Rest = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
  number, number, number,
];

/**
 * Writes a Godot rest transform onto a node — **decomposed**, not as a matrix.
 *
 * The obvious implementation assigns `object.matrix` and turns
 * `matrixAutoUpdate` off, and it is a trap: three.js recomputes `matrix` from
 * position/quaternion/scale on the next world update, so the moment anything
 * re-enables auto-update — or the node is one whose rotation is driven later,
 * like the two hydraulic anchors — the transform silently reverts to identity.
 * The visible result was the suction tool and its rails floating half a metre
 * above the wrist they belong to, which reads as a modelling error rather than
 * as the framework quietly undoing an assignment.
 *
 * Decomposing keeps the node a normal three.js node: it can be rotated, aimed
 * and re-parented afterwards without losing where it sits.
 */
function applyRest(object: THREE.Object3D, t: Rest) {
  // `Matrix4.set` is row-major, which is the order the scene file wrote them in.
  const matrix = new THREE.Matrix4().set(
    t[0], t[1], t[2], t[9],
    t[3], t[4], t[5], t[10],
    t[6], t[7], t[8], t[11],
    0, 0, 0, 1,
  );
  matrix.decompose(object.position, object.quaternion, object.scale);
}

/** Mesh rest transforms, transcribed from `parts/SixAxisRobot.tscn`. */
const MESH_REST: Record<string, Rest> = {
  Base: [-4.371139e-8, 0, -1, 0, 1, 0, 1, 0, -4.371139e-8, 0, 0, 0],
  Linkage01: [-4.371139e-8, 0, -1, 0, 1, 0, 1, 0, -4.371139e-8, 0, 0.23, 0],
  Linkage02: [1.3113414e-7, 1.0000002, 0, -4.3711385e-8, 0, 1.0000004, 0.99999994, -1.3113419e-7, 4.3711402e-8, 0, 0, 0],
  Linkage03: [-4.3711374e-8, 0.9999999, 4.3711363e-8, 0, -4.3711385e-8, 0.99999946, 0.9999997, 4.3711385e-8, 0, 0, 0, 0],
  Linkage04: [-4.371139e-8, 0.9999999, 4.3711385e-8, 0, -4.3711385e-8, 0.9999999, 1, 4.3711385e-8, 0, 0, 0, 0],
  Linkage05: [-6.117369e-8, -1, 6.1173665e-8, -3.4924597e-8, -6.117369e-8, -0.99999964, 1, -6.117369e-8, -3.492458e-8, 0, 0, 0],
  ToolSuction: [-0.9999999, 1.4901161e-8, 1.0430813e-7, 8.940697e-8, 5.9604645e-8, 0.9999995, 7.450581e-9, 0.9999999, 0, -2.3841858e-7, -0.016534597, 5.9604645e-8],
  Eoat: [-1, 8.742278e-8, 0, -8.742278e-8, -1, 0, 0, 0, 1, 0, 0.009, 0],
  HydraulicBaseAnchor: [-0.015866965, -0.15152939, -0.9883252, 0, 0.98844975, -0.15154845, 0.99987394, -0.0024046146, -0.0156837, 0.31569114, 0.5505995, -0.22799234],
  HydraulicRodAnchor: [0.026497314, -0.80572945, 0.5916905, 0, 0.5918983, 0.80601245, -0.99964875, -0.021357168, 0.015683718, 0.19884515, 0.00020599365, -0.23987292],
};

/** Pivot offsets, in each pivot's parent frame. Rotations come from the angles. */
const PIVOT_OFFSET = {
  shoulder: new THREE.Vector3(0, 0.9, 0),
  upperArm: new THREE.Vector3(-0.72657037, -0.34717786, -0.0024254583),
  elbow: new THREE.Vector3(0.014725149, 1.3262625, -0.00687705),
  forearm: new THREE.Vector3(-0.018255234, 0.018255234, -0.09700517),
  wristRot: new THREE.Vector3(0.11355525, 0.87549424, 0.09818761),
  wristPitch: new THREE.Vector3(0, 0.33123374, 0),
  tool: new THREE.Vector3(0, 0.21365428, 0),
} as const;

/* ------------------------------------------------------------------ rig --- */

export type RobotArm = {
  /** Scene root. Scale this to bring the 3.5 m arm down to a lab bench. */
  root: THREE.Group;
  /**
   * Where the suction cup meets a part. Everything the lab does — picking,
   * placing, the Jacobian jog — is expressed as "put this object there".
   */
  toolTip: THREE.Object3D;
  /** Metres from the base axis the tool can reach, measured from the built rig. */
  maxReach: number;
  /** The wrist-pitch pivot (J5), whose axis the tool is levelled about. */
  wristPitch: THREE.Object3D;
  /** Height of the tool at the home pose, for seeding a jog target. */
  applyAngles(angles: JointAngles): void;
  /** Aims the two hydraulic rams at each other. Call after `applyAngles`. */
  updateHydraulics(): void;
  dispose(): void;
};

export async function createRobotArm(loader: PracticeLoader): Promise<RobotArm> {
  const [armScene, eoatScene, surface] = await Promise.all([
    loader.load('robot/six-axis.glb'),
    loader.load('robot/eoat.glb'),
    loadSurface(loader, {
      baseColor: 'robot/six-axis_basecolor.webp',
      normal: 'robot/six-axis_normal.webp',
      orm: 'robot/six-axis_orm.webp',
    }),
  ]);
  const eoatSurface = await loadSurface(loader, {
    baseColor: 'robot/eoat_baked_basecolor.webp',
    normal: 'robot/eoat_baked_normal.webp',
    orm: 'robot/eoat_baked_orm.webp',
  });

  /*
   * The GLB is a flat bag of nine named meshes, not a hierarchy — Godot's scene
   * is what assembles them. So each one is lifted out by name and re-parented
   * onto the tree below; anything left behind was not part of the arm.
   */
  const meshes = new Map<string, THREE.Object3D>();
  for (const child of [...armScene.children]) {
    meshes.set(child.name.replace(/^Six-Axis_/, ''), child);
  }
  const take = (name: string) => {
    const mesh = meshes.get(name);
    if (!mesh) throw new Error(`six-axis robot: missing mesh "${name}"`);
    mesh.removeFromParent();
    mesh.traverse((object) => {
      const asMesh = object as THREE.Mesh;
      if (asMesh.isMesh) {
        asMesh.material = surface;
        asMesh.castShadow = true;
        asMesh.receiveShadow = true;
      }
    });
    return mesh;
  };

  prepareForAo(armScene);
  prepareForAo(eoatScene);
  eoatScene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.material = eoatSurface;
  });

  const root = new THREE.Group();
  root.name = 'six-axis-robot';

  const base = take('Base');
  applyRest(base, MESH_REST.Base);
  root.add(base);

  const j1 = new THREE.Group();
  root.add(j1);

  const linkage01 = take('Linkage_01');
  applyRest(linkage01, MESH_REST.Linkage01);
  j1.add(linkage01);

  /* The two hydraulic rams. Purely cosmetic, and worth every one of their two
     hundred triangles: an arm whose shoulder ram does not track the shoulder is
     an arm that reads as a toy. */
  const hydraulicBaseAnchor = new THREE.Object3D();
  applyRest(hydraulicBaseAnchor, MESH_REST.HydraulicBaseAnchor);
  j1.add(hydraulicBaseAnchor);
  hydraulicBaseAnchor.add(take('Hydraulic_01'));

  const shoulder = new THREE.Group();
  shoulder.position.copy(PIVOT_OFFSET.shoulder);
  j1.add(shoulder);

  const j2 = new THREE.Group();
  j2.position.copy(PIVOT_OFFSET.upperArm);
  shoulder.add(j2);

  const hydraulicRodAnchor = new THREE.Object3D();
  applyRest(hydraulicRodAnchor, MESH_REST.HydraulicRodAnchor);
  j2.add(hydraulicRodAnchor);
  hydraulicRodAnchor.add(take('Hydraulic_02'));

  const linkage02 = take('Linkage_02');
  applyRest(linkage02, MESH_REST.Linkage02);
  j2.add(linkage02);

  const elbow = new THREE.Group();
  elbow.position.copy(PIVOT_OFFSET.elbow);
  j2.add(elbow);

  const j3 = new THREE.Group();
  j3.position.copy(PIVOT_OFFSET.forearm);
  elbow.add(j3);

  const linkage03 = take('Linkage_03');
  applyRest(linkage03, MESH_REST.Linkage03);
  j3.add(linkage03);

  const j4 = new THREE.Group();
  j4.position.copy(PIVOT_OFFSET.wristRot);
  j3.add(j4);

  const linkage04 = take('Linkage_04');
  applyRest(linkage04, MESH_REST.Linkage04);
  j4.add(linkage04);

  const j5 = new THREE.Group();
  j5.position.copy(PIVOT_OFFSET.wristPitch);
  j4.add(j5);

  const linkage05 = take('Linkage_05');
  applyRest(linkage05, MESH_REST.Linkage05);
  j5.add(linkage05);

  const j6 = new THREE.Group();
  j6.position.copy(PIVOT_OFFSET.tool);
  j5.add(j6);

  const eoat = new THREE.Group();
  applyRest(eoat, MESH_REST.Eoat);
  j6.add(eoat);
  eoat.add(eoatScene);

  const toolSuction = take('Tool_Suction');
  applyRest(toolSuction, MESH_REST.ToolSuction);
  eoat.add(toolSuction);

  /*
   * The tool centre point: the face of the suction plate.
   *
   * Measured from the tool's own geometry rather than guessed. In the EOAT's
   * space the mounting flange is at the origin, the vacuum plate spans
   * y −0.105 … −0.056 and the cup hangs to y −0.053 — so the working face is a
   * shade over a tenth of a metre down its **local −Y**, and that axis is what
   * `levelTool` has to bring round to world-down. Guessing this offset is how
   * an arm ends up holding boxes a hand's width off the belt.
   */
  const toolTip = new THREE.Object3D();
  toolTip.position.set(0, -0.108, 0);
  eoat.add(toolTip);

  const applyAngles = (angles: JointAngles) => {
    j1.rotation.set(0, angles.j1, 0);
    j2.rotation.set(0, 0, angles.j2);
    j3.rotation.set(0, 0, angles.j3);
    j4.rotation.set(0, angles.j4, 0);
    j5.rotation.set(0, 0, angles.j5);
    j6.rotation.set(0, angles.j6, 0);
  };

  /*
   * Aim each ram at the other, upstream's way: Godot's `look_at` with
   * `use_model_front` points the model's **+Z** at the target, while three.js
   * points −Z, so each aim is followed by a half turn.
   */
  const basePoint = new THREE.Vector3();
  const rodPoint = new THREE.Vector3();
  const updateHydraulics = () => {
    root.updateMatrixWorld(true);
    hydraulicBaseAnchor.getWorldPosition(basePoint);
    hydraulicRodAnchor.getWorldPosition(rodPoint);
    if (basePoint.distanceToSquared(rodPoint) < 1e-8) return;
    hydraulicBaseAnchor.lookAt(rodPoint);
    hydraulicBaseAnchor.rotateY(Math.PI);
    hydraulicRodAnchor.lookAt(basePoint);
    hydraulicRodAnchor.rotateY(Math.PI);
  };

  applyAngles(HOME);
  updateHydraulics();
  root.updateMatrixWorld(true);

  /*
   * Reach, swept rather than assumed.
   *
   * The controls clamp their commanded point to this, so getting it wrong is
   * not cosmetic: too small and the arm can never be sent to its own conveyor,
   * because the clamp quietly pulls the target back in every frame and the
   * machine sits at three quarters stretch looking broken. The first version
   * read a single "arms straight out" pose, which for a chain with a 25° wrist
   * offset and a shoulder mounted 0.73 m off the column is not the farthest
   * pose at all.
   *
   * So it is measured the only way that cannot be wrong about this arm: walk
   * the three joints that carry the tool outward over their whole range and
   * keep the largest radius seen. Three thousand evaluations of a nine-node
   * graph, once, at load.
   */
  const probe = cloneAngles(HOME);
  const reachPoint = new THREE.Vector3();
  let maxReach = 0;
  const shoulderBand = POSTURE.j2 ?? JOINT_LIMITS[1];
  const elbowBand = POSTURE.j3 ?? JOINT_LIMITS[2];
  for (let shoulder = shoulderBand[0]; shoulder <= shoulderBand[1]; shoulder += 0.1) {
    for (let elbow = elbowBand[0]; elbow <= elbowBand[1]; elbow += 0.1) {
      for (let wrist = JOINT_LIMITS[4][0]; wrist <= JOINT_LIMITS[4][1]; wrist += 0.3) {
        probe.j2 = shoulder;
        probe.j3 = elbow;
        probe.j5 = wrist;
        applyAngles(probe);
        root.updateMatrixWorld(true);
        toolTip.getWorldPosition(reachPoint);
        // Only poses that could actually hold a box count: a tool at knee height
        // reaching under the conveyor is reach the cell can never use.
        if (reachPoint.y < 0.4) continue;
        maxReach = Math.max(maxReach, Math.hypot(reachPoint.x, reachPoint.z));
      }
    }
  }
  applyAngles(HOME);
  updateHydraulics();

  return {
    root,
    toolTip,
    maxReach,
    wristPitch: j5,
    applyAngles,
    updateHydraulics,
    dispose() { root.clear(); },
  };
}

/* ------------------------------------------------------------- jogging --- */

/**
 * Cartesian jog on a chain nobody solved by hand.
 *
 * The obvious way to move a six-axis arm to a point is closed-form inverse
 * kinematics, and for *this* arm it is a bad trade: its pivots carry skewed rest
 * frames (the wrist sits 25° off the forearm axis, the shoulder 45° off the
 * column), so the algebra is long, easy to get subtly wrong, and impossible to
 * check by eye. What it buys — an exact answer in one step — is not needed by
 * something that moves a few centimetres a frame anyway.
 *
 * So the arm is differentiated instead. Nudge each of the three joints that
 * matter for position by a thousandth of a radian, ask the *actual scene graph*
 * where the tool went, and you have a Jacobian column. Solve the resulting 3×3
 * for the joint deltas that produce the requested motion, damped so that a
 * near-singular pose (arm straight out, or folded through itself) leans rather
 * than explodes.
 *
 * This is exactly as correct as the model — it cannot disagree with the meshes,
 * because it asks them — and it is about forty lines.
 */
export type Jogger = {
  /** Moves the tool by `delta` metres in world space. Returns what it managed. */
  step(angles: JointAngles, delta: THREE.Vector3): void;
  /** Turns the tool back toward straight-down, a little each call. */
  levelTool(angles: JointAngles, rate: number): void;
};

const JOG_JOINTS: (keyof JointAngles)[] = ['j1', 'j2', 'j3'];
const EPSILON = 1e-3;
/**
 * Damping, and a ceiling on how far any one joint may turn in a single step.
 *
 * Both exist for the same reason: near a singular pose the least-squares
 * solution is enormous, and an unbounded step there is exactly the whip that
 * throws the elbow onto the wrong branch. Damped and capped, the arm leans
 * toward an unreachable direction instead of snapping into a new posture.
 */
const LAMBDA = 0.05;
const MAX_JOINT_STEP = 0.05;

export function createJogger(arm: RobotArm): Jogger {
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  const columns = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const down = new THREE.Vector3(0, -1, 0);
  const toolAxis = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const current = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const scratch = new THREE.Vector3();

  const sample = (angles: JointAngles) => {
    arm.applyAngles(angles);
    arm.root.updateMatrixWorld(true);
    return arm.toolTip.getWorldPosition(scratch);
  };

  return {
    step(angles, delta) {
      if (delta.lengthSq() < 1e-12) return;
      before.copy(sample(angles));

      for (let index = 0; index < JOG_JOINTS.length; index += 1) {
        const key = JOG_JOINTS[index];
        const original = angles[key];
        angles[key] = original + EPSILON;
        after.copy(sample(angles));
        angles[key] = original;
        columns[index].subVectors(after, before).divideScalar(EPSILON);
      }

      // Damped least squares on JᵀJ + λI, which for three joints is a 3×3 solve.
      const a: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const b: number[] = [0, 0, 0];
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          a[row][col] = columns[row].dot(columns[col]) + (row === col ? LAMBDA : 0);
        }
        b[row] = columns[row].dot(delta);
      }
      const solution = solve3(a, b);
      if (!solution) {
        arm.applyAngles(angles);
        return;
      }
      for (let index = 0; index < JOG_JOINTS.length; index += 1) {
        const key = JOG_JOINTS[index];
        const bounded = THREE.MathUtils.clamp(solution[index], -MAX_JOINT_STEP, MAX_JOINT_STEP);
        angles[key] = clampPosture(angles[key] + bounded, key);
      }
      arm.applyAngles(angles);
    },

    /*
     * The suction cup has to face the box, and the three position joints do not
     * care about that — so the wrist is corrected separately, and exactly.
     *
     * J5 turns about a single axis, so the correction is a signed angle rather
     * than a search: project both the tool's current axis and straight-down onto
     * the plane perpendicular to that rotation axis, and the angle between the
     * projections *is* the change J5 needs. An earlier version probed one step
     * in each direction and kept whichever reduced the tilt, which works until
     * the arm is in a pose where neither direction helps on the first step —
     * and then the tool simply stays wrong, silently, with the box pointing at
     * the ceiling.
     */
    levelTool(angles, rate) {
      arm.applyAngles(angles);
      arm.root.updateMatrixWorld(true);

      arm.toolTip.getWorldQuaternion(orientation);
      toolAxis.set(0, -1, 0).applyQuaternion(orientation).normalize();
      arm.wristPitch.getWorldQuaternion(orientation);
      axis.set(0, 0, 1).applyQuaternion(orientation).normalize();

      current.copy(toolAxis).addScaledVector(axis, -toolAxis.dot(axis));
      wanted.copy(down).addScaledVector(axis, -down.dot(axis));
      if (current.lengthSq() < 1e-8 || wanted.lengthSq() < 1e-8) return;
      current.normalize();
      wanted.normalize();

      const signed = Math.atan2(
        cross.crossVectors(current, wanted).dot(axis),
        THREE.MathUtils.clamp(current.dot(wanted), -1, 1),
      );
      if (Math.abs(signed) < 1e-4) return;
      angles.j5 = clampJoint(angles.j5 + THREE.MathUtils.clamp(signed, -rate, rate), 4);
      arm.applyAngles(angles);
    },
  };
}

/** Gaussian elimination with partial pivoting on a 3×3. Null when singular. */
function solve3(a: number[][], b: number[]): number[] | null {
  const m = [[...a[0], b[0]], [...a[1], b[1]], [...a[2], b[2]]];
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
    }
    if (Math.abs(m[pivot][column]) < 1e-12) return null;
    [m[column], m[pivot]] = [m[pivot], m[column]];
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = m[row][column] / m[column][column];
      for (let col = column; col < 4; col += 1) m[row][col] -= factor * m[column][col];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/**
 * Move each joint toward a target at a bounded rate, taking the short way round.
 *
 * Upstream's `move_to_position`, which is what an industrial controller does in
 * joint-interpolated mode — and why a real arm's tool traces a curve between two
 * taught points rather than a straight line. It also means the arm can never
 * snap: a student who presses a button sees it *travel*, which is the only way
 * the motion reads as a machine obeying an instruction.
 */
export function approachAngles(current: JointAngles, target: JointAngles, maxStep: number) {
  let settled = true;
  for (const key of JOINT_KEYS) {
    let delta = target[key] - current[key];
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) <= maxStep) {
      current[key] = target[key];
    } else {
      current[key] += Math.sign(delta) * maxStep;
      settled = false;
    }
  }
  return settled;
}
