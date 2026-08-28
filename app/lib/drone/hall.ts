import * as THREE from 'three';

/**
 * The flight hall — an indoor drone test cage, and the course inside it.
 *
 * This replaces four rings and two painted discs standing on empty ivory. That
 * version was legible and it was *nothing*: a course with no walls, no
 * obstacles and no equipment gives a pilot no sense of speed, no reason to
 * choose one line through a gate over another, and nothing at all to judge
 * altitude against. Flying it felt like moving a cursor.
 *
 * What is here now is the room drone pilots actually learn in — a netted
 * indoor cage with a marked flight box, racing gates on stands, slalom poles,
 * obstacle blocks, a wind fan and an observation platform. Every one of those
 * exists because it changes how the aircraft has to be flown:
 *
 *   **the net** gives the volume an edge, so "how high am I" has an answer that
 *   is not a number on a panel.
 *   **the gates** are 1.6 m across on 1.2 m stands, so a line through one
 *   commits the pilot to an entry height as well as a heading.
 *   **the poles** make the second leg a slalom rather than a straight run,
 *   which is the first thing that requires coordinating roll with yaw.
 *   **the blocks** put something solid under the flight path, so descending
 *   has a cost.
 *   **the fan** is where the wind comes from. The flight model has had a wind
 *   term the whole time and nothing on screen ever said so.
 *
 * The palette is the Library's, not a hangar's: bone floor, graphite equipment,
 * coral course furniture. Same house rule as the robot cell — a visitor moving
 * between the three labs should arrive somewhere they recognise — and the same
 * practical reason, which is that an ivory room lights a small dark aircraft
 * better than a grey one does.
 */

const INK = 0x2f2b33;
const GRAPHITE = 0x4a4550;
const BONE = 0xece4d8;
const CORAL = 0xe87868;
const CORAL_DEEP = 0xc95f52;
const SAGE = 0x769d74;
const LAVENDER = 0x8d6bcc;

export const COURSE_COLORS = { CORAL, CORAL_DEEP, SAGE, LAVENDER };

/* ----------------------------------------------------------- dimensions --- */

/** The cage, metres. Long enough for a 5.4 m/s aircraft to build speed in. */
export const HALL = {
  length: 34,
  width: 22,
  netHeight: 9,
} as const;

/** Gate inner radius, metres — comfortably wider than the 0.4 m airframe. */
const GATE_RADIUS = 0.8;

/**
 * A four-beat course: up, slalom, through, down.
 *
 * The gates are 1.6 m across and the legs 8–11 m, which are not the numbers a
 * racing course would use — a real gate is barely wider than the aircraft.
 * They are the numbers a *first* course uses. A student who has never held a
 * throttle is learning that the sticks command velocity and that the aircraft
 * keeps moving after they let go; a gate they can miss teaches them nothing
 * except that they cannot fly.
 *
 * The last leg turns back toward the pads, so the landing zone is in shot from
 * the final gate. A course that ends by pointing the pilot at an empty wall is
 * a course whose last step has to be explained in words.
 */
const GATES: { position: [number, number, number]; yaw: number }[] = [
  { position: [-1.2, 2.6, -6.4], yaw: 0.12 },
  { position: [5.6, 3.4, -11.4], yaw: -0.72 },
  { position: [11.4, 2.4, -4.6], yaw: -1.5 },
];

export type Checkpoint = {
  /** Gate centre, world metres. */
  centre: THREE.Vector3;
  /** Inner radius — the hole the aircraft flies through. */
  radius: number;
  /** The torus itself, recoloured as the gate is armed and cleared. */
  ring: THREE.Mesh;
  /** The soft disc inside the ring, shown only while this gate is next. */
  glow: THREE.Mesh;
};

/** A solid the aircraft can hit, as an axis-aligned box. */
export type Obstacle = {
  centre: THREE.Vector3;
  half: THREE.Vector3;
};

export type FlightHall = {
  group: THREE.Group;
  /** Where the aircraft starts and ends its first lesson. */
  launchPad: THREE.Vector3;
  /** Altitude the takeoff step asks for, metres. */
  takeoffAltitude: number;
  /** The gate hovering over the pad, shown only during the takeoff step. */
  takeoffGate: THREE.Object3D;
  checkpoints: Checkpoint[];
  landingZone: THREE.Vector3;
  /** Radius inside which a touchdown counts as landed. */
  landingRadius: number;
  /** Pad ring, greened on a successful landing. */
  landingMark: THREE.Mesh;
  obstacles: Obstacle[];
  /** Where the wind comes from, for the fan's blade spin. */
  fan: THREE.Object3D;
  /** Half-extent of the flyable box, so the lab can nudge a stray drone back. */
  bounds: { halfLength: number; halfWidth: number; ceiling: number };
  dispose(): void;
};

export function createFlightHall(): FlightHall {
  const group = new THREE.Group();
  group.name = 'yoolab_drone_hall';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  const graphite = keep(new THREE.MeshStandardMaterial({ color: GRAPHITE, roughness: 0.5, metalness: 0.24 }));
  const ink = keep(new THREE.MeshStandardMaterial({ color: INK, roughness: 0.62, metalness: 0.12 }));
  const bone = keep(new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.86, metalness: 0 }));
  const coral = keep(new THREE.MeshStandardMaterial({
    color: CORAL,
    roughness: 0.34,
    metalness: 0.06,
    emissive: new THREE.Color(CORAL_DEEP),
    emissiveIntensity: 0.24,
  }));
  const paint = keep(new THREE.MeshBasicMaterial({
    color: LAVENDER,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));

  const obstacles: Obstacle[] = [];

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

  const flat = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotation;
    mesh.position.set(...position);
    mesh.renderOrder = -40;
    group.add(mesh);
    return mesh;
  };

  /* ------------------------------------------------------ flight box --- */

  /*
   * The painted flight box.
   *
   * Four lines and a set of distance ticks, lifted 5 mm and depth-write
   * disabled, which is how a floor decal is done in real time. It does two
   * jobs at once: it says where the cage ends, and the ticks give the pilot a
   * ruler on the floor — the only way to judge how far away something is in a
   * room with no furniture at eye level.
   */
  const halfLength = HALL.length / 2;
  const halfWidth = HALL.width / 2;
  const lineX = keep(new THREE.PlaneGeometry(HALL.length, 0.12));
  const lineZ = keep(new THREE.PlaneGeometry(0.12, HALL.width));
  for (const z of [-halfWidth, halfWidth]) flat(lineX, paint, [0, 0.005, z]);
  for (const x of [-halfLength, halfLength]) flat(lineZ, paint, [x, 0.005, 0]);

  const tick = keep(new THREE.PlaneGeometry(0.1, 0.7));
  for (let x = -halfLength + 2; x < halfLength; x += 2) {
    for (const z of [-halfWidth + 0.42, halfWidth - 0.42]) flat(tick, paint, [x, 0.005, z]);
  }

  /* ------------------------------------------------------------- net --- */

  /*
   * The cage.
   *
   * Posts and two cable runs per side rather than an actual net: an alpha-mapped
   * mesh plane at this size shows its own texel grid from inside, and a real net
   * would hide the room the aircraft is being flown in. What is needed is the
   * *edge* of the volume, and a lit cable at the top of a post gives that.
   */
  const postGeometry = keep(new THREE.CylinderGeometry(0.055, 0.075, HALL.netHeight, 12));
  const capGeometry = keep(new THREE.SphereGeometry(0.075, 12, 8));
  const cableMaterial = keep(new THREE.LineBasicMaterial({
    color: 0x9a939c,
    transparent: true,
    opacity: 0.34,
  }));

  const postPositions: THREE.Vector3[] = [];
  const POST_SPACING = 5.6;
  for (let x = -halfLength; x <= halfLength + 0.01; x += POST_SPACING) {
    postPositions.push(new THREE.Vector3(x, 0, -halfWidth), new THREE.Vector3(x, 0, halfWidth));
  }
  for (const position of postPositions) {
    add(postGeometry, graphite, [position.x, HALL.netHeight / 2, position.z]);
    add(capGeometry, ink, [position.x, HALL.netHeight, position.z]);
  }

  /*
   * The cables are one `LineSegments` for the whole cage rather than a `Line`
   * per run. Seventy short lines is seventy draw calls for something the eye
   * reads as a single wireframe.
   */
  const cablePoints: number[] = [];
  const runRail = (from: THREE.Vector3, to: THREE.Vector3, y: number) => {
    cablePoints.push(from.x, y, from.z, to.x, y, to.z);
  };
  const corners = [
    new THREE.Vector3(-halfLength, 0, -halfWidth),
    new THREE.Vector3(halfLength, 0, -halfWidth),
    new THREE.Vector3(halfLength, 0, halfWidth),
    new THREE.Vector3(-halfLength, 0, halfWidth),
  ];
  for (let index = 0; index < 4; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % 4];
    for (const y of [HALL.netHeight, HALL.netHeight * 0.55]) runRail(from, to, y);
  }
  /* Two roof cables across the short axis, so the ceiling has a height. */
  for (let x = -halfLength; x <= halfLength + 0.01; x += POST_SPACING) {
    cablePoints.push(x, HALL.netHeight, -halfWidth, x, HALL.netHeight, halfWidth);
  }
  const cableGeometry = keep(new THREE.BufferGeometry());
  cableGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cablePoints, 3));
  group.add(new THREE.LineSegments(cableGeometry, cableMaterial));

  /* ------------------------------------------------------------ pads --- */

  const launchPad = new THREE.Vector3(-10.5, 0, 5.4);
  const landingZone = new THREE.Vector3(9.4, 0, 5.8);
  const landingRadius = 1.5;

  const padGeometry = keep(new THREE.CircleGeometry(1.45, 56));
  const padMaterial = keep(new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.9, metalness: 0 }));
  const padRingGeometry = keep(new THREE.RingGeometry(1.32, 1.44, 64));

  for (const [centre, color] of [[launchPad, LAVENDER], [landingZone, SAGE]] as const) {
    const disc = new THREE.Mesh(padGeometry, padMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(centre.x, 0.008, centre.z);
    disc.receiveShadow = true;
    group.add(disc);
    const ring = new THREE.Mesh(
      padRingGeometry,
      keep(new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.44,
        side: THREE.DoubleSide,
      })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(centre.x, 0.012, centre.z);
    group.add(ring);
  }

  /* The landing pad's H, drawn as three bars — the mark a real pad carries. */
  const landingMarkMaterial = keep(new THREE.MeshBasicMaterial({
    color: SAGE,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const landingMark = new THREE.Mesh(keep(new THREE.RingGeometry(1.06, 1.2, 56)), landingMarkMaterial);
  landingMark.rotation.x = -Math.PI / 2;
  landingMark.position.set(landingZone.x, 0.014, landingZone.z);
  group.add(landingMark);

  const hBar = keep(new THREE.PlaneGeometry(0.17, 1.1));
  const hCross = keep(new THREE.PlaneGeometry(0.62, 0.17));
  for (const dx of [-0.31, 0.31]) {
    flat(hBar, landingMarkMaterial, [landingZone.x + dx, 0.013, landingZone.z]);
  }
  flat(hCross, landingMarkMaterial, [landingZone.x, 0.013, landingZone.z]);

  /* ------------------------------------------------------- takeoff gate --- */

  /*
   * A hoop over the launch pad, shown only during the climb step.
   *
   * A takeoff step whose target is a number ("climb to 2.6 m") asks the student
   * to read a panel while learning a throttle. A hoop asks them to look at the
   * aircraft.
   */
  const takeoffAltitude = 2.6;
  const takeoffGate = new THREE.Group();
  takeoffGate.position.set(launchPad.x, takeoffAltitude, launchPad.z);
  takeoffGate.visible = false;
  group.add(takeoffGate);
  const hoop = new THREE.Mesh(keep(new THREE.TorusGeometry(1.05, 0.035, 10, 60)), coral);
  hoop.rotation.x = -Math.PI / 2;
  takeoffGate.add(hoop);

  /* --------------------------------------------------------- the gates --- */

  const ringGeometry = keep(new THREE.TorusGeometry(GATE_RADIUS, 0.055, 12, 64));
  const glowGeometry = keep(new THREE.CircleGeometry(GATE_RADIUS - 0.03, 48));
  const standGeometry = keep(new THREE.CylinderGeometry(0.05, 0.07, 1, 12));
  const footGeometry = keep(new THREE.BoxGeometry(0.6, 0.06, 0.6));

  const checkpoints: Checkpoint[] = checkpointsFrom(GATES);

  function checkpointsFrom(specs: typeof GATES): Checkpoint[] {
    return specs.map((spec) => {
      const centre = new THREE.Vector3(...spec.position);
      const gate = new THREE.Group();
      gate.position.copy(centre);
      gate.rotation.y = spec.yaw;
      group.add(gate);

      const ringMaterial = keep(new THREE.MeshStandardMaterial({
        color: CORAL,
        roughness: 0.34,
        metalness: 0.06,
        emissive: new THREE.Color(CORAL_DEEP),
        emissiveIntensity: 0.2,
      }));
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.castShadow = true;
      gate.add(ring);

      /*
       * The glow disc faces the ring's own plane, which means it is edge-on
       * from the side. That is deliberate: it marks *the hole*, and a disc that
       * turned to face the camera would tell the pilot where the gate is
       * without telling them which way through it.
       */
      const glow = new THREE.Mesh(
        glowGeometry,
        keep(new THREE.MeshBasicMaterial({
          color: CORAL,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        })),
      );
      gate.add(glow);

      /* Two legs and two feet, so the gate is standing on the floor rather than
         hovering over it — which is the one thing that makes the hall a room. */
      for (const side of [-1, 1]) {
        const height = centre.y - GATE_RADIUS;
        const leg = new THREE.Mesh(standGeometry, graphite);
        leg.scale.y = height;
        leg.position.set(side * GATE_RADIUS * 0.82, -GATE_RADIUS - height / 2, 0);
        leg.castShadow = true;
        gate.add(leg);
        const foot = new THREE.Mesh(footGeometry, ink);
        foot.position.set(side * GATE_RADIUS * 0.82, -centre.y + 0.03, 0);
        gate.add(foot);
      }

      return { centre, radius: GATE_RADIUS, ring, glow };
    });
  }

  /* ------------------------------------------------------ slalom poles --- */

  /*
   * Five poles between gate one and gate two, offset alternately so the leg is
   * a weave rather than a straight run. This is the first thing on the course
   * that cannot be flown with one stick.
   */
  const poleGeometry = keep(new THREE.CylinderGeometry(0.045, 0.06, 4.2, 12));
  const poleBandGeometry = keep(new THREE.CylinderGeometry(0.052, 0.052, 0.34, 12));
  for (let index = 0; index < 5; index += 1) {
    const x = -0.6 + index * 1.55;
    const z = -7.6 - index * 0.85 + (index % 2 === 0 ? 1.35 : -1.35);
    add(poleGeometry, graphite, [x, 2.1, z]);
    for (const y of [1.1, 2.1, 3.1]) add(poleBandGeometry, coral, [x, y, z]);
    obstacles.push({
      centre: new THREE.Vector3(x, 2.1, z),
      half: new THREE.Vector3(0.09, 2.1, 0.09),
    });
  }

  /* --------------------------------------------------- obstacle blocks --- */

  /*
   * Three foam blocks under the middle of the course. They are the reason
   * descending has a cost: without something solid below, "lower" is always
   * free and the pilot never learns to hold an altitude.
   */
  const BLOCKS: [number, number, number, number, number][] = [
    [2.6, 0.9, -3.4, 2.2, 1.4],
    [7.8, 0.65, -8.6, 1.6, 1.6],
    [-5.4, 1.15, -2.2, 1.5, 2.6],
  ];
  for (const [x, halfHeight, z, halfX, halfZ] of BLOCKS) {
    const block = add(
      keep(new THREE.BoxGeometry(halfX * 2, halfHeight * 2, halfZ * 2)),
      bone,
      [x, halfHeight, z],
    );
    block.receiveShadow = true;
    /* A coral top edge, so the block's height reads from above — which is the
       angle the pilot is looking from when it matters. */
    const edge = new THREE.Mesh(
      keep(new THREE.BoxGeometry(halfX * 2 + 0.02, 0.05, halfZ * 2 + 0.02)),
      coral,
    );
    edge.position.set(x, halfHeight * 2, z);
    group.add(edge);
    obstacles.push({
      centre: new THREE.Vector3(x, halfHeight, z),
      half: new THREE.Vector3(halfX, halfHeight, halfZ),
    });
  }

  /* ---------------------------------------------------------- the fan --- */

  /*
   * The wind's source.
   *
   * The flight model has carried a seeded sinusoidal wind term since it was
   * adapted, and nothing on screen ever admitted it — so an aircraft drifting
   * on its own read as a bug in the controller. A fan in the corner of the room
   * makes the same drift a fact about the room.
   */
  const fanMount = new THREE.Group();
  fanMount.position.set(-halfLength + 1.4, 2.4, -halfWidth + 1.6);
  fanMount.rotation.y = Math.PI * 0.28;
  group.add(fanMount);
  add(keep(new THREE.CylinderGeometry(0.09, 0.12, 2.4, 12)), graphite, [0, -1.2, 0], fanMount);
  add(keep(new THREE.TorusGeometry(0.82, 0.07, 10, 40)), graphite, [0, 0, 0], fanMount);
  add(keep(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 16)), ink, [0, 0, 0.02], fanMount)
    .rotation.x = Math.PI / 2;

  const fan = new THREE.Group();
  fan.position.z = 0.06;
  fanMount.add(fan);
  const bladeGeometry = keep(new THREE.BoxGeometry(0.68, 0.012, 0.22));
  for (let index = 0; index < 4; index += 1) {
    const blade = new THREE.Mesh(bladeGeometry, ink);
    blade.position.x = 0.36;
    blade.rotation.x = 0.42;
    const arm = new THREE.Group();
    arm.rotation.z = (index / 4) * Math.PI * 2;
    arm.add(blade);
    fan.add(arm);
  }

  /* ------------------------------------------------- observation deck --- */

  /*
   * A pilot stand outside the cage on the near side.
   *
   * It is where the *person* would be, and that is its whole job: a room with
   * no human-scale object in it has no scale at all. A 1.1 m rail and a two-step
   * platform tell the eye how big the 0.4 m aircraft is without a caption.
   */
  const deck = new THREE.Group();
  deck.position.set(2.4, 0, halfWidth + 1.9);
  group.add(deck);
  add(keep(new THREE.BoxGeometry(4.2, 0.12, 2.2)), graphite, [0, 0.4, 0], deck);
  for (const x of [-2, 2]) {
    for (const z of [-1, 1]) add(keep(new THREE.BoxGeometry(0.1, 0.4, 0.1)), ink, [x, 0.2, z], deck);
  }
  add(keep(new THREE.BoxGeometry(4.2, 0.07, 0.07)), graphite, [0, 1.5, -1.05], deck);
  for (const x of [-2, 0, 2]) {
    add(keep(new THREE.BoxGeometry(0.07, 1.1, 0.07)), graphite, [x, 0.95, -1.05], deck);
  }
  /* Two steps up to it. */
  for (let index = 0; index < 2; index += 1) {
    add(
      keep(new THREE.BoxGeometry(1.2, 0.13, 0.34)),
      graphite,
      [-1.4, 0.13 + index * 0.14, 1.32 - index * 0.36],
      deck,
    );
  }

  return {
    group,
    launchPad,
    takeoffAltitude,
    takeoffGate,
    checkpoints,
    landingZone,
    landingRadius,
    landingMark,
    obstacles,
    fan,
    bounds: { halfLength: halfLength - 0.6, halfWidth: halfWidth - 0.6, ceiling: HALL.netHeight - 0.8 },
    dispose() {
      for (const value of owned) value.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * Whether a point is inside any obstacle, with a margin for the airframe.
 *
 * Boxes rather than a physics world, and no response beyond "you hit something":
 * the upstream sandbox runs Rapier for exactly this and it is 1.1 MB of WASM to
 * answer a question that a dozen axis-aligned boxes answer in a dozen
 * comparisons. What the lab does with a hit — respawn hovering over the last
 * gate cleared — needs a boolean, not a contact manifold.
 */
export function hitsObstacle(
  obstacles: Obstacle[],
  point: THREE.Vector3,
  margin: number,
): boolean {
  for (const obstacle of obstacles) {
    if (
      Math.abs(point.x - obstacle.centre.x) < obstacle.half.x + margin
      && Math.abs(point.y - obstacle.centre.y) < obstacle.half.y + margin
      && Math.abs(point.z - obstacle.centre.z) < obstacle.half.z + margin
    ) return true;
  }
  return false;
}

/**
 * Distance from `point` to the nearest solid — obstacle, wall or floor.
 *
 * Feeds the proximity readout on the panel, which is the one instrument on a
 * real drone that a beginner immediately understands. Upstream computes this
 * with a 32-ray lidar sweep and an occupancy grid; a distance to a handful of
 * boxes is the same number for this room, and it is exact rather than sampled.
 */
export function nearestSolid(
  obstacles: Obstacle[],
  bounds: FlightHall['bounds'],
  point: THREE.Vector3,
): number {
  let nearest = Math.min(
    point.y,
    bounds.ceiling - point.y,
    bounds.halfLength - Math.abs(point.x),
    bounds.halfWidth - Math.abs(point.z),
  );
  for (const obstacle of obstacles) {
    const dx = Math.max(0, Math.abs(point.x - obstacle.centre.x) - obstacle.half.x);
    const dy = Math.max(0, Math.abs(point.y - obstacle.centre.y) - obstacle.half.y);
    const dz = Math.max(0, Math.abs(point.z - obstacle.centre.z) - obstacle.half.z);
    nearest = Math.min(nearest, Math.hypot(dx, dy, dz));
  }
  return Math.max(0, nearest);
}
