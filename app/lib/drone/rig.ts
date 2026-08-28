import * as THREE from 'three';
import { VEHICLE } from './flight';

/**
 * The airframe and the course it flies, both built from primitives.
 *
 * There is no drone GLB in this repository and there deliberately is not one.
 * The upstream sandbox this lab's physics comes from loads its aircraft from
 * Mint CDN artifacts whose redistribution terms this project has not verified,
 * and THIRD_PARTY_ASSETS.md is a record of files whose licence *was* checked —
 * adding an unverified mesh to make a page look finished is the one thing that
 * file exists to prevent. So the quad is thirty primitives, which at the size a
 * 700 px stage renders it is not a compromise: a 5-inch airframe seen from six
 * metres is a dark cross with four bright discs, and that is exactly what a
 * dark cross with four bright discs looks like.
 *
 * Everything is positioned from `VEHICLE.motors`, so the art is fitted to the
 * physics and never the other way round: move a rotor in the flight model and
 * the propeller follows it.
 */

/* --------------------------------------------------------------- palette --- */

/*
 * Warm ivory room, coral accent — the Library's palette, not the sandbox's.
 *
 * The upstream experience is a night city with neon telemetry. Dropping that
 * into this page would have been the exact failure the brief names: three labs
 * that each look like the project they were borrowed from. The drone is
 * graphite and bone so it reads against ivory, and every signal colour below is
 * one of YooLab's own tokens.
 */
const INK = 0x2f2b33;
const SHELL = 0xf3ede4;
const CORAL = 0xe87868;
const CORAL_DEEP = 0xc95f52;
const SAGE = 0x769d74;
const LAVENDER = 0x8d6bcc;

/* ------------------------------------------------------------------- rig --- */

export type DroneRig = {
  /** Body root. Driven from the canonical simulation state every frame. */
  root: THREE.Group;
  /** The four rotor groups, in mixer order. */
  rotors: THREE.Group[];
  /** Per-rotor blur discs, faded in with rotor speed. */
  blurs: THREE.Mesh[];
  /** Nose light, brightened while armed. */
  beacon: THREE.PointLight;
  /**
   * Distance from the body origin down to the lowest point of the airframe.
   * Measured from the assembled rig rather than assumed, so the aircraft rests
   * on its skids instead of floating above or sinking into the pad.
   */
  groundClearance: number;
  dispose(): void;
};

/** Rotor disc diameter, metres. A 7-inch prop on this airframe. */
const PROP_DIAMETER = 0.178;
const PROP_HEIGHT = 0.032;

export function createDroneRig(): DroneRig {
  const root = new THREE.Group();
  root.name = 'yoolab_drone';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  const shell = keep(new THREE.MeshStandardMaterial({ color: SHELL, roughness: 0.44, metalness: 0.06 }));
  const carbon = keep(new THREE.MeshStandardMaterial({ color: INK, roughness: 0.38, metalness: 0.25 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x453f49, roughness: 0.86, metalness: 0 }));
  const accent = keep(new THREE.MeshStandardMaterial({
    color: CORAL,
    roughness: 0.3,
    metalness: 0.1,
    emissive: new THREE.Color(CORAL_DEEP),
    emissiveIntensity: 0.5,
  }));
  const bladeMaterial = keep(new THREE.MeshStandardMaterial({
    color: 0x3a3440,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
  }));
  const blurMaterial = keep(new THREE.MeshBasicMaterial({
    color: 0xbfb4c6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));

  // --- fuselage ------------------------------------------------------------
  const bodyGeometry = keep(new THREE.BoxGeometry(0.15, 0.048, 0.21));
  const body = new THREE.Mesh(bodyGeometry, shell);
  body.castShadow = true;
  root.add(body);

  const canopyGeometry = keep(new THREE.BoxGeometry(0.108, 0.036, 0.13));
  const canopy = new THREE.Mesh(canopyGeometry, carbon);
  canopy.position.y = 0.036;
  root.add(canopy);

  // A single coral stripe down the spine. One accent, so "which way is the
  // nose" is answerable at a glance from any angle the chase camera reaches.
  const stripeGeometry = keep(new THREE.BoxGeometry(0.026, 0.006, 0.2));
  const stripe = new THREE.Mesh(stripeGeometry, accent);
  stripe.position.y = 0.055;
  root.add(stripe);

  // --- arms, motors, rotors ------------------------------------------------
  const armGeometry = keep(new THREE.BoxGeometry(VEHICLE.armLength * 0.94, 0.016, 0.026));
  const motorGeometry = keep(new THREE.CylinderGeometry(0.019, 0.022, 0.03, 14));
  const hubGeometry = keep(new THREE.CylinderGeometry(0.011, 0.011, 0.014, 12));
  const bladeGeometry = keep(new THREE.BoxGeometry(PROP_DIAMETER * 0.48, 0.0022, 0.019));
  const blurGeometry = keep(new THREE.CircleGeometry(PROP_DIAMETER * 0.5, 28));
  const skidGeometry = keep(new THREE.CylinderGeometry(0.006, 0.006, 0.062, 8));
  const footGeometry = keep(new THREE.SphereGeometry(0.011, 10, 8));

  const rotors: THREE.Group[] = [];
  const blurs: THREE.Mesh[] = [];

  for (let index = 0; index < 4; index += 1) {
    const motor = VEHICLE.motors[index];

    const arm = new THREE.Mesh(armGeometry, carbon);
    arm.position.set(motor.x * 0.5, 0.004, motor.z * 0.5);
    arm.rotation.y = Math.atan2(motor.x, motor.z) - Math.PI / 2;
    arm.castShadow = true;
    root.add(arm);

    const can = new THREE.Mesh(motorGeometry, carbon);
    can.position.set(motor.x, 0.016, motor.z);
    root.add(can);

    const rotor = new THREE.Group();
    rotor.position.set(motor.x, PROP_HEIGHT, motor.z);
    const hub = new THREE.Mesh(hubGeometry, accent);
    rotor.add(hub);
    for (let blade = 0; blade < 2; blade += 1) {
      const mesh = new THREE.Mesh(bladeGeometry, bladeMaterial);
      mesh.position.x = (blade === 0 ? 1 : -1) * PROP_DIAMETER * 0.24;
      mesh.rotation.z = (blade === 0 ? 1 : -1) * 0.16;
      rotor.add(mesh);
    }
    root.add(rotor);
    rotors.push(rotor);

    /*
     * The blur disc, not motion blur.
     *
     * Two blades turning at 900 rad/s under a 60 Hz render loop is a strobe:
     * the propeller appears to stand still, or to turn slowly backwards, which
     * makes an aircraft under full power look switched off. A translucent disc
     * faded in with rotor speed is what the eye actually sees at those rates,
     * and it costs one alpha quad per rotor rather than a post-process pass.
     */
    const blur = new THREE.Mesh(blurGeometry, blurMaterial.clone());
    keep(blur.material as THREE.Material);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(motor.x, PROP_HEIGHT + 0.002, motor.z);
    root.add(blur);
    blurs.push(blur);

    const skid = new THREE.Mesh(skidGeometry, rubber);
    skid.position.set(motor.x * 0.7, -0.035, motor.z * 0.7);
    root.add(skid);
    const foot = new THREE.Mesh(footGeometry, rubber);
    foot.position.set(motor.x * 0.7, -0.066, motor.z * 0.7);
    root.add(foot);
  }

  // --- camera pod and beacon ----------------------------------------------
  const podGeometry = keep(new THREE.BoxGeometry(0.05, 0.034, 0.038));
  const pod = new THREE.Mesh(podGeometry, carbon);
  pod.position.set(0, -0.012, -0.096);
  root.add(pod);

  const lensGeometry = keep(new THREE.CylinderGeometry(0.011, 0.013, 0.012, 14));
  const lensMaterial = keep(new THREE.MeshStandardMaterial({
    color: 0x1b2a3a,
    roughness: 0.12,
    metalness: 0.6,
  }));
  const lens = new THREE.Mesh(lensGeometry, lensMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.012, -0.118);
  root.add(lens);

  const beacon = new THREE.PointLight(CORAL, 0, 1.6, 2);
  beacon.position.set(0, -0.01, -0.13);
  root.add(beacon);

  const bounds = new THREE.Box3().setFromObject(root);

  return {
    root,
    rotors,
    blurs,
    beacon,
    groundClearance: Math.max(0, -bounds.min.y),
    dispose() {
      for (const resource of owned) resource.dispose();
      root.clear();
    },
  };
}

/* ---------------------------------------------------------------- course --- */

export type Checkpoint = {
  /** Ring centre, world metres. */
  centre: THREE.Vector3;
  /** Inner radius — the hole the aircraft flies through. */
  radius: number;
  /** The torus itself, recoloured as the ring is armed and cleared. */
  ring: THREE.Mesh;
  /** The soft disc inside the ring, shown only while this ring is next. */
  glow: THREE.Mesh;
};

export type DroneCourse = {
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
  /** Half-extent of the flyable box, so the lab can nudge a stray drone back. */
  bounds: { radius: number; ceiling: number };
  dispose(): void;
};

/**
 * A four-beat course: up, through, around, down.
 *
 * The legs are 7–9 m and the rings are 1.5 m across, which are not the numbers
 * a drone course would use — a real gate is barely wider than the aircraft. They
 * are the numbers a *first* course uses. A student who has never held a
 * throttle is learning that the sticks command velocity and that the aircraft
 * keeps moving after they let go; a gate they can miss teaches them nothing
 * except that they cannot fly.
 *
 * The last leg turns back toward the start, so the landing pad is visible from
 * the third ring. A course that ends by pointing the pilot at empty ivory is a
 * course whose final step has to be explained in words.
 */
const COURSE_RINGS: { position: [number, number, number]; yaw: number }[] = [
  { position: [0, 3.1, -8], yaw: 0 },
  { position: [7.4, 3.9, -14.2], yaw: -0.7 },
  { position: [14.6, 2.7, -7.4], yaw: -1.5 },
];

export function createDroneCourse(): DroneCourse {
  const group = new THREE.Group();
  group.name = 'yoolab_drone_course';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  const launchPad = new THREE.Vector3(0, 0, 0);
  const landingZone = new THREE.Vector3(13.6, 0, 1.4);
  const landingRadius = 1.5;

  /* --- the two pads ----------------------------------------------------- */
  const padGeometry = keep(new THREE.CircleGeometry(1.35, 56));
  const padMaterial = keep(new THREE.MeshStandardMaterial({
    color: 0xece4d8,
    roughness: 0.9,
    metalness: 0,
  }));
  const launchDisc = new THREE.Mesh(padGeometry, padMaterial);
  launchDisc.rotation.x = -Math.PI / 2;
  launchDisc.position.copy(launchPad).setY(0.006);
  launchDisc.receiveShadow = true;
  group.add(launchDisc);

  const launchRingGeometry = keep(new THREE.RingGeometry(1.24, 1.34, 64));
  const launchRingMaterial = keep(new THREE.MeshBasicMaterial({
    color: LAVENDER,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  }));
  const launchRing = new THREE.Mesh(launchRingGeometry, launchRingMaterial);
  launchRing.rotation.x = -Math.PI / 2;
  launchRing.position.copy(launchPad).setY(0.012);
  group.add(launchRing);

  const landingDisc = new THREE.Mesh(padGeometry, padMaterial);
  landingDisc.rotation.x = -Math.PI / 2;
  landingDisc.position.copy(landingZone).setY(0.006);
  landingDisc.receiveShadow = true;
  group.add(landingDisc);

  const landingMarkGeometry = keep(new THREE.RingGeometry(1.18, 1.42, 64));
  const landingMarkMaterial = keep(new THREE.MeshBasicMaterial({
    color: CORAL,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  }));
  const landingMark = new THREE.Mesh(landingMarkGeometry, landingMarkMaterial);
  landingMark.rotation.x = -Math.PI / 2;
  landingMark.position.copy(landingZone).setY(0.014);
  group.add(landingMark);

  // The H. Two bars and a crossbar, drawn in the pad's own accent, because a
  // marked circle on ivory is a circle and a marked H is a helipad.
  const barGeometry = keep(new THREE.PlaneGeometry(0.16, 0.86));
  const crossGeometry = keep(new THREE.PlaneGeometry(0.46, 0.15));
  const markMaterial = keep(new THREE.MeshBasicMaterial({
    color: CORAL_DEEP,
    transparent: true,
    opacity: 0.5,
  }));
  for (const offset of [-0.3, 0.3]) {
    const bar = new THREE.Mesh(barGeometry, markMaterial);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(landingZone.x + offset, 0.013, landingZone.z);
    group.add(bar);
  }
  const cross = new THREE.Mesh(crossGeometry, markMaterial);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(landingZone.x, 0.013, landingZone.z);
  group.add(cross);

  /* --- the takeoff gate ------------------------------------------------- */
  const takeoffAltitude = 2.6;
  const takeoffGate = new THREE.Group();
  const gateRingGeometry = keep(new THREE.TorusGeometry(1.15, 0.028, 10, 72));
  const gateMaterial = keep(new THREE.MeshStandardMaterial({
    color: CORAL,
    roughness: 0.42,
    metalness: 0.05,
    emissive: new THREE.Color(CORAL),
    emissiveIntensity: 0.28,
  }));
  const gateRing = new THREE.Mesh(gateRingGeometry, gateMaterial);
  gateRing.rotation.x = -Math.PI / 2;
  takeoffGate.add(gateRing);
  takeoffGate.position.set(launchPad.x, takeoffAltitude, launchPad.z);
  takeoffGate.visible = false;
  group.add(takeoffGate);

  /* --- the three rings -------------------------------------------------- */
  const ringRadius = 1.5;
  const torusGeometry = keep(new THREE.TorusGeometry(ringRadius, 0.052, 12, 88));
  const glowGeometry = keep(new THREE.CircleGeometry(ringRadius * 0.96, 48));
  const postGeometry = keep(new THREE.CylinderGeometry(0.026, 0.034, 1, 10));
  const postMaterial = keep(new THREE.MeshStandardMaterial({
    color: 0xd9cfc2,
    roughness: 0.78,
    metalness: 0,
  }));

  const checkpoints: Checkpoint[] = [];
  for (const spec of COURSE_RINGS) {
    const [x, y, z] = spec.position;

    const material = keep(new THREE.MeshStandardMaterial({
      color: 0xd6cabc,
      roughness: 0.46,
      metalness: 0.04,
      emissive: new THREE.Color(CORAL),
      emissiveIntensity: 0,
    }));
    const ring = new THREE.Mesh(torusGeometry, material);
    ring.position.set(x, y, z);
    ring.rotation.y = spec.yaw;
    ring.castShadow = true;
    group.add(ring);

    const glowMaterial = keep(new THREE.MeshBasicMaterial({
      color: CORAL,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(x, y, z);
    glow.rotation.y = spec.yaw;
    group.add(glow);

    // A stand, so a ring reads as standing in a place rather than floating in
    // one. It also gives the eye the ring's ground position, which is most of
    // how a pilot judges how far away it is.
    const post = new THREE.Mesh(postGeometry, postMaterial);
    const postHeight = Math.max(0.1, y - ringRadius);
    post.scale.y = postHeight;
    post.position.set(x, postHeight / 2, z);
    post.castShadow = true;
    group.add(post);

    checkpoints.push({
      centre: new THREE.Vector3(x, y, z),
      radius: ringRadius,
      ring,
      glow,
    });
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
    bounds: { radius: 30, ceiling: 15 },
    dispose() {
      for (const resource of owned) resource.dispose();
      group.clear();
    },
  };
}

/** Ring and pad colours, shared with the lab so state is coloured in one place. */
export const COURSE_COLORS = { CORAL, CORAL_DEEP, SAGE, LAVENDER };
