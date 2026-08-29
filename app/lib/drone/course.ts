import * as THREE from 'three';

/**
 * The lesson laid over the city — pads, gates and the marks that say where to go.
 *
 * Everything solid in this lab is now upstream's (see `city.ts`); what is here
 * is the part upstream does not have, because it is a sandbox and this is a
 * lesson. A sandbox opens on a tuning panel, seven aircraft and an open map. A
 * student who has never held a throttle reads that as "this is not for me" in
 * about two seconds, and the most sophisticated flight model in the world does
 * not survive that.
 *
 * So there are four beats, and the course is furniture for them:
 *
 *   01 Khởi động     arm the motors — one button, and the props spin up
 *   02 Cất cánh      climb to the hoop over the pad
 *   03 Bay qua điểm  three gates, in order
 *   04 Hạ cánh       put it down inside the H
 *
 * ## Why the course is small when the city is not
 *
 * The city is 350 m across and the flight envelope is deliberately narrow —
 * 22° of bank, 5.4 m/s, 2.6 m/s of climb — because it belongs to a student
 * meeting WASD for the first time rather than to a pilot. At that speed a leg
 * across two blocks is a forty-second straight line with nothing happening.
 *
 * So the whole course sits inside the plaza and the first ring of streets:
 * legs of 18–28 m, gates 2.4 m across at three different heights. Big enough
 * that the buildings are the backdrop the flight is read against, small enough
 * that every leg is a decision. The rest of the city is there to fly into once
 * the lesson is done, which is what the free-flight mode is for.
 */

const CORAL = 0xe87868;
const CORAL_DEEP = 0xc95f52;
const SAGE = 0x769d74;
const LAVENDER = 0x8d6bcc;

export const COURSE_COLORS = { CORAL, CORAL_DEEP, SAGE, LAVENDER };

/** Gate inner radius, metres. Comfortably wider than the 0.4 m airframe. */
const GATE_RADIUS = 1.2;

/**
 * Three gates, in the plaza and the streets around it.
 *
 * They deliberately sit at three different heights: most of what the middle of
 * this lesson teaches is that the throttle and the sticks are separate controls,
 * and a course that is flat teaches only the sticks.
 */
const GATES: { position: [number, number, number]; yaw: number }[] = [
  { position: [-9, 6.5, 2], yaw: 0.24 },
  { position: [11, 12, -15], yaw: -0.78 },
  { position: [24, 7.5, 3], yaw: -1.52 },
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

export type Course = {
  group: THREE.Group;
  /** Where the aircraft starts and ends its first lesson. */
  launchPad: THREE.Vector3;
  /** Altitude the takeoff step asks for, metres. */
  takeoffAltitude: number;
  /** The hoop over the pad, shown only during the takeoff step. */
  takeoffGate: THREE.Object3D;
  checkpoints: Checkpoint[];
  landingZone: THREE.Vector3;
  /** Radius inside which a touchdown counts as landed. */
  landingRadius: number;
  /** Pad ring, greened on a successful landing. */
  landingMark: THREE.Mesh;
  dispose(): void;
};

export function createCourse(): Course {
  const group = new THREE.Group();
  group.name = 'yoolab_drone_course';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  const graphite = keep(new THREE.MeshStandardMaterial({ color: 0x3c3844, roughness: 0.5, metalness: 0.24 }));
  const coral = keep(new THREE.MeshStandardMaterial({
    color: CORAL,
    roughness: 0.34,
    metalness: 0.06,
    emissive: new THREE.Color(CORAL_DEEP),
    emissiveIntensity: 0.24,
  }));

  const launchPad = new THREE.Vector3(0, 0, 17);
  const landingZone = new THREE.Vector3(17, 0, 18);
  const landingRadius = 2.4;

  /* ------------------------------------------------------------ pads --- */

  /*
   * Painted, not modelled: a disc and a ring per pad, lifted a few centimetres
   * off the plaza with depth-write disabled. A modelled kerb would be invisible
   * from 30 m up, which is where the pilot is when they need to find the pad.
   */
  const padGeometry = keep(new THREE.CircleGeometry(2.6, 56));
  const padMaterial = keep(new THREE.MeshStandardMaterial({
    color: 0x8b8f93,
    roughness: 0.92,
    metalness: 0,
  }));
  const padRingGeometry = keep(new THREE.RingGeometry(2.35, 2.6, 64));

  for (const [centre, colour] of [[launchPad, LAVENDER], [landingZone, SAGE]] as const) {
    const disc = new THREE.Mesh(padGeometry, padMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(centre.x, 0.04, centre.z);
    disc.receiveShadow = true;
    group.add(disc);

    const ring = new THREE.Mesh(
      padRingGeometry,
      keep(new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(centre.x, 0.06, centre.z);
    group.add(ring);
  }

  /* The landing pad's H — the mark a real pad carries. */
  const landingMarkMaterial = keep(new THREE.MeshBasicMaterial({
    color: SAGE,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const landingMark = new THREE.Mesh(keep(new THREE.RingGeometry(1.9, 2.2, 56)), landingMarkMaterial);
  landingMark.rotation.x = -Math.PI / 2;
  landingMark.position.set(landingZone.x, 0.07, landingZone.z);
  group.add(landingMark);

  const flat = (geometry: THREE.BufferGeometry, x: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, landingMarkMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.065, z);
    group.add(mesh);
  };
  const hBar = keep(new THREE.PlaneGeometry(0.3, 2));
  const hCross = keep(new THREE.PlaneGeometry(1.1, 0.3));
  flat(hBar, landingZone.x - 0.55, landingZone.z);
  flat(hBar, landingZone.x + 0.55, landingZone.z);
  flat(hCross, landingZone.x, landingZone.z);

  /* ---------------------------------------------------- takeoff hoop --- */

  /*
   * A takeoff step whose target is a number ("climb to 6 m") asks the student to
   * read a panel while learning a throttle. A hoop asks them to look at the
   * aircraft.
   */
  const takeoffAltitude = 6;
  const takeoffGate = new THREE.Group();
  takeoffGate.position.set(launchPad.x, takeoffAltitude, launchPad.z);
  takeoffGate.visible = false;
  group.add(takeoffGate);
  const hoop = new THREE.Mesh(keep(new THREE.TorusGeometry(1.7, 0.06, 10, 60)), coral);
  hoop.rotation.x = -Math.PI / 2;
  takeoffGate.add(hoop);

  /* --------------------------------------------------------- gates --- */

  const ringGeometry = keep(new THREE.TorusGeometry(GATE_RADIUS, 0.085, 12, 64));
  const glowGeometry = keep(new THREE.CircleGeometry(GATE_RADIUS - 0.04, 48));
  const standGeometry = keep(new THREE.CylinderGeometry(0.07, 0.1, 1, 12));
  const footGeometry = keep(new THREE.BoxGeometry(0.8, 0.09, 0.8));

  const checkpoints: Checkpoint[] = GATES.map((spec) => {
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
     * The glow disc faces the ring's own plane, so it is edge-on from the side.
     * Deliberate: it marks *the hole*, and a disc that turned to face the camera
     * would tell the pilot where the gate is without telling them which way
     * through it.
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

    /* Legs and feet, so the gate is standing on the street rather than hovering
       over it — which is the one thing that puts it in the city. */
    for (const side of [-1, 1]) {
      const height = centre.y - GATE_RADIUS;
      const leg = new THREE.Mesh(standGeometry, graphite);
      leg.scale.y = height;
      leg.position.set(side * GATE_RADIUS * 0.82, -GATE_RADIUS - height / 2, 0);
      leg.castShadow = true;
      gate.add(leg);

      const foot = new THREE.Mesh(footGeometry, graphite);
      foot.position.set(side * GATE_RADIUS * 0.82, -centre.y + 0.05, 0);
      gate.add(foot);
    }

    return { centre, radius: GATE_RADIUS, ring, glow };
  });

  return {
    group,
    launchPad,
    takeoffAltitude,
    takeoffGate,
    checkpoints,
    landingZone,
    landingRadius,
    landingMark,
    dispose() {
      for (const value of owned) value.dispose();
      group.removeFromParent();
    },
  };
}
