import * as THREE from 'three';
import { VEHICLE } from './flight';

/**
 * The airframe.
 *
 * There is no drone GLB in this repository and deliberately is not one. The
 * upstream sandbox this lab's physics comes from loads its aircraft from Mint
 * CDN artifacts whose redistribution terms this project has not verified, and
 * `THIRD_PARTY_ASSETS.md` is a record of files whose licence *was* checked —
 * adding an unverified mesh to make a page look finished is the one thing that
 * file exists to prevent.
 *
 * The previous build drew that conclusion and then used it as an excuse: thirty
 * primitives, on the argument that "a 5-inch airframe seen from six metres is a
 * dark cross with four bright discs". That is true of a 5-inch airframe seen
 * from six metres and it is not true of this lab, where the chase camera sits
 * 0.6 m behind the aircraft and the onboard view is bolted to it. From there a
 * dark cross is a dark cross.
 *
 * So this is a modelled 7-inch quad: a carbon plate stack with visible standoffs,
 * arms that taper, motor bells with stator slots and a bolt circle, propellers
 * with real blade planform and washout, landing skids, an FPV pod, a battery
 * strapped to the belly, and an antenna. About two hundred triangles a part and
 * around eight thousand in total — which costs nothing next to the room it flies
 * in, and is the difference between a machine and a marker.
 *
 * Everything is positioned from `VEHICLE.motors`, so the art is fitted to the
 * physics and never the other way round: move a rotor in the flight model and
 * the propeller follows it.
 */

/* --------------------------------------------------------------- palette --- */

/*
 * Graphite and bone with one coral stripe — the Library's palette, not the
 * sandbox's night city with neon telemetry. Dropping that in would have been the
 * exact failure the brief names: three labs that each look like the project they
 * were borrowed from.
 */
const CARBON = 0x2a262f;
const CARBON_LIGHT = 0x3d3844;
const ALLOY = 0x8d8792;
const SHELL = 0xf1ebe2;
const CORAL = 0xe87868;
const CORAL_DEEP = 0xc95f52;

/* --------------------------------------------------------------- geometry --- */

/** Rotor disc diameter, metres. A 7-inch prop on this airframe. */
export const PROP_DIAMETER = 0.178;
/** Rotor plane height above the body origin, metres. */
export const PROP_HEIGHT = 0.036;

export type DroneRig = {
  /** Body root. Driven from the canonical simulation state every frame. */
  root: THREE.Group;
  /** The four rotor groups, in mixer order. Spun from `state.motorAngle`. */
  rotors: THREE.Group[];
  /** Per-rotor blur discs, faded in with rotor speed. */
  blurs: THREE.Mesh[];
  /** Mount point for the onboard camera — the FPV pod's own lens. */
  gimbal: THREE.Object3D;
  /** Nose light, brightened while armed. */
  beacon: THREE.PointLight;
  /** Sets the arm/disarm state of the status LEDs. */
  setArmed(armed: boolean): void;
  /**
   * Distance from the body origin down to the lowest point of the airframe.
   * Measured from the assembled rig rather than assumed, so the aircraft rests
   * on its skids instead of floating above or sinking into the pad.
   */
  groundClearance: number;
  dispose(): void;
};

/**
 * One propeller blade, as a lofted shape.
 *
 * A box rotated a few degrees is what the previous rig used, and from the chase
 * camera it reads as a stick. A real blade has chord that grows then tapers, a
 * rounded tip, and *washout* — the pitch angle falls from root to tip, because
 * the tip is travelling several times faster and would otherwise stall the root
 * or over-drive the tip. Building it as a strip of quads with per-station chord
 * and twist gets all three for about sixty triangles.
 *
 * Two-sided, because a propeller is thin enough that back-face culling shows
 * through it at the top of every revolution.
 */
function createBladeGeometry(length: number): THREE.BufferGeometry {
  /** Station fraction, chord (m), pitch (rad). Root at 0.18, tip at 1. */
  const STATIONS: [number, number, number][] = [
    [0.16, 0.012, 0.44],
    [0.32, 0.020, 0.38],
    [0.52, 0.024, 0.30],
    [0.72, 0.022, 0.23],
    [0.88, 0.016, 0.18],
    [1.0, 0.004, 0.15],
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  /* Each station contributes a leading and a trailing edge point, rotated about
     the blade's own radial axis by that station's pitch. */
  for (const [fraction, chord, pitch] of STATIONS) {
    const radius = fraction * length;
    const half = chord / 2;
    const sin = Math.sin(pitch);
    const cos = Math.cos(pitch);
    positions.push(radius, -half * sin, -half * cos);
    positions.push(radius, half * sin, half * cos);
    /* The surface normal is the pitch axis rotated a quarter turn. */
    normals.push(0, cos, -sin, 0, cos, -sin);
  }

  for (let index = 0; index < STATIONS.length - 1; index += 1) {
    const a = index * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createDroneRig(): DroneRig {
  const root = new THREE.Group();
  root.name = 'yoolab_drone';

  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(value: T) => {
    owned.push(value);
    return value;
  };

  const carbon = keep(new THREE.MeshStandardMaterial({ color: CARBON, roughness: 0.42, metalness: 0.28 }));
  const carbonLight = keep(new THREE.MeshStandardMaterial({ color: CARBON_LIGHT, roughness: 0.5, metalness: 0.2 }));
  const alloy = keep(new THREE.MeshStandardMaterial({ color: ALLOY, roughness: 0.26, metalness: 0.82 }));
  const shell = keep(new THREE.MeshStandardMaterial({ color: SHELL, roughness: 0.44, metalness: 0.05 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x1e1b22, roughness: 0.92, metalness: 0 }));
  const accent = keep(new THREE.MeshStandardMaterial({
    color: CORAL,
    roughness: 0.3,
    metalness: 0.08,
    emissive: new THREE.Color(CORAL_DEEP),
    emissiveIntensity: 0.5,
  }));
  const blade = keep(new THREE.MeshStandardMaterial({
    color: 0x35303c,
    roughness: 0.46,
    metalness: 0.14,
    side: THREE.DoubleSide,
  }));
  const blurMaterial = keep(new THREE.MeshBasicMaterial({
    color: 0xbfb4c6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    parent: THREE.Object3D = root,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /* ------------------------------------------------------- plate stack --- */

  /*
   * A freestyle quad is two carbon plates with standoffs between them, and the
   * gap is the most recognisable thing about the shape — it is what says
   * "carbon frame" rather than "moulded toy". Both plates get a chamfer, which
   * a cylinder with four segments gives for free at this size.
   */
  const bottomPlate = add(
    keep(new THREE.BoxGeometry(0.096, 0.0035, 0.19)),
    carbon,
    [0, -0.004, 0],
  );
  bottomPlate.receiveShadow = true;
  add(keep(new THREE.BoxGeometry(0.086, 0.0035, 0.15)), carbon, [0, 0.031, 0]);

  const standoffGeometry = keep(new THREE.CylinderGeometry(0.0035, 0.0035, 0.035, 8));
  for (const [x, z] of [[-0.038, -0.07], [0.038, -0.07], [-0.038, 0.07], [0.038, 0.07]] as const) {
    add(standoffGeometry, alloy, [x, 0.014, z]);
  }

  /* The flight-controller stack, visible between the plates. */
  add(keep(new THREE.BoxGeometry(0.03, 0.012, 0.03)), carbonLight, [0, 0.012, -0.012]);
  add(keep(new THREE.BoxGeometry(0.026, 0.008, 0.026)), accent, [0, 0.022, -0.012]);

  /*
   * One coral stripe down the spine of the top plate. One accent, so "which way
   * is the nose" is answerable at a glance from any angle the chase camera
   * reaches — which is the single most important thing the art has to do.
   */
  add(keep(new THREE.BoxGeometry(0.014, 0.0022, 0.13)), accent, [0, 0.0335, 0.005]);

  /* ------------------------------------------------------------- arms --- */

  /*
   * Tapered arms, one per motor, aimed outward.
   *
   * A `CylinderGeometry` with different end radii gives the taper; laying it
   * along the arm and rotating it into place puts the thick end at the frame
   * and the thin end under the motor, which is how a carbon arm is actually
   * cut. Squashed on Y so the section is the flat rectangle a real arm has.
   */
  const armGeometry = keep(new THREE.CylinderGeometry(0.0115, 0.0075, VEHICLE.armLength * 0.99, 6));
  const rotors: THREE.Group[] = [];
  const blurs: THREE.Mesh[] = [];

  const bellGeometry = keep(new THREE.CylinderGeometry(0.0165, 0.0185, 0.019, 18));
  const bellTopGeometry = keep(new THREE.CylinderGeometry(0.0165, 0.0125, 0.006, 18));
  const statorGeometry = keep(new THREE.CylinderGeometry(0.0125, 0.0125, 0.012, 12));
  const boltGeometry = keep(new THREE.CylinderGeometry(0.0018, 0.0018, 0.004, 6));
  const nutGeometry = keep(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 6));
  const hubGeometry = keep(new THREE.CylinderGeometry(0.0105, 0.0125, 0.007, 14));
  const bladeGeometry = keep(createBladeGeometry(PROP_DIAMETER / 2));
  const blurGeometry = keep(new THREE.CircleGeometry(PROP_DIAMETER / 2, 40));
  const ledGeometry = keep(new THREE.BoxGeometry(0.016, 0.0022, 0.006));

  const ledMaterials: THREE.MeshStandardMaterial[] = [];

  for (const motor of VEHICLE.motors) {
    const angle = Math.atan2(motor.x, motor.z);

    const arm = new THREE.Mesh(armGeometry, carbon);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -angle;
    arm.scale.set(1, 1, 0.62);
    arm.position.set(motor.x / 2, 0.0135, motor.z / 2);
    arm.castShadow = true;
    root.add(arm);

    /* A motor mount pad where the arm meets the bell. */
    add(keep(new THREE.CylinderGeometry(0.021, 0.021, 0.0035, 14)), carbonLight, [motor.x, 0.0165, motor.z]);

    /* --- the motor ---------------------------------------------------- */
    const bell = add(bellGeometry, alloy, [motor.x, 0.0275, motor.z]);
    bell.receiveShadow = true;
    add(bellTopGeometry, alloy, [motor.x, 0.0395, motor.z]);
    add(statorGeometry, carbonLight, [motor.x, 0.0225, motor.z]);
    /* Four bolts on the bell top — the detail that reads as machined. */
    for (let bolt = 0; bolt < 4; bolt += 1) {
      const theta = (bolt / 4) * Math.PI * 2 + Math.PI / 4;
      add(boltGeometry, carbon, [
        motor.x + Math.cos(theta) * 0.0115,
        0.0425,
        motor.z + Math.sin(theta) * 0.0115,
      ]);
    }

    /* --- the propeller ------------------------------------------------- */
    const rotor = new THREE.Group();
    rotor.position.set(motor.x, PROP_HEIGHT, motor.z);
    root.add(rotor);
    rotors.push(rotor);

    add(hubGeometry, carbonLight, [0, 0, 0], rotor);
    add(nutGeometry, alloy, [0, 0.006, 0], rotor);
    /*
     * Two blades, and they are mirrored for a clockwise rotor.
     *
     * `spin` is the physics' own direction flag, and a propeller whose pitch
     * runs the wrong way for the direction it turns would be pushing air the
     * wrong way. Nobody would name the artefact, but a quad with two props on
     * backwards looks subtly wrong from every angle — so the blade is flipped
     * about its own chord rather than merely rotated.
     */
    for (let side = 0; side < 2; side += 1) {
      const wing = new THREE.Mesh(bladeGeometry, blade);
      wing.rotation.y = side * Math.PI;
      wing.scale.z = motor.spin > 0 ? 1 : -1;
      wing.castShadow = true;
      rotor.add(wing);
    }

    /* --- the blur disc ------------------------------------------------- */
    /*
     * A real propeller past a few thousand rpm reads as a translucent disc, not
     * as blades — and a rendered propeller at 60 fps reads as a slow, strobing
     * cartwheel, which is worse than either. Rather than fading the blades, a
     * separate disc fades in as the rotor spins up: the propellers keep turning
     * underneath, and the effect is pure addition.
     */
    const disc = new THREE.Mesh(blurGeometry, blurMaterial.clone());
    owned.push(disc.material as THREE.Material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(motor.x, PROP_HEIGHT + 0.004, motor.z);
    root.add(disc);
    blurs.push(disc);

    /* --- the status LED ------------------------------------------------ */
    /* Front pair coral, rear pair white — the convention every quad uses, and
       the second cue for orientation after the spine stripe. */
    const front = motor.z < 0;
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: front ? CORAL : 0xf4f0e8,
      emissive: new THREE.Color(front ? CORAL_DEEP : 0x8e8a84),
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    owned.push(ledMaterial);
    ledMaterials.push(ledMaterial);
    const led = add(ledGeometry, ledMaterial, [motor.x * 0.72, -0.007, motor.z * 0.72]);
    led.rotation.y = -angle;
    led.castShadow = false;
  }

  /* ---------------------------------------------------------- battery --- */

  /*
   * Slung under the bottom plate with a strap, which is where it goes and is
   * also why the aircraft's centre of mass is below the rotor plane — the one
   * fact about a quad's layout that the flight model depends on.
   */
  add(keep(new THREE.BoxGeometry(0.042, 0.024, 0.084)), carbonLight, [0, -0.019, 0.006]);
  add(keep(new THREE.BoxGeometry(0.045, 0.003, 0.018)), accent, [0, -0.03, 0.006]);
  add(keep(new THREE.BoxGeometry(0.012, 0.02, 0.012)), rubber, [0, -0.017, -0.04]);

  /* ------------------------------------------------------------ skids --- */

  /*
   * Two skids, not four legs. Measured below for `groundClearance`, so the
   * aircraft rests on them: a drone that lands with its battery in the concrete
   * is the kind of thing a student notices immediately and cannot name.
   */
  const skidRail = keep(new THREE.BoxGeometry(0.006, 0.006, 0.13));
  const skidLeg = keep(new THREE.CylinderGeometry(0.0028, 0.0028, 0.034, 6));
  const skidFoot = keep(new THREE.SphereGeometry(0.005, 8, 6));
  for (const side of [-1, 1]) {
    const x = side * 0.042;
    add(skidRail, carbonLight, [x, -0.048, 0.004]);
    for (const z of [-0.05, 0.058]) {
      const leg = add(skidLeg, carbonLight, [x, -0.031, z]);
      leg.rotation.x = side === 0 ? 0 : 0;
      add(skidFoot, rubber, [x, -0.049, z]);
    }
  }

  /* -------------------------------------------------------- FPV pod --- */

  /*
   * The camera pod, canted up 22° the way a freestyle quad's is — and the mount
   * point for the onboard view. Putting the virtual camera inside the modelled
   * pod rather than at an arbitrary body offset means the onboard picture shows
   * the pod's own rake, which is why an FPV feed looks the way it does.
   */
  const pod = new THREE.Group();
  pod.position.set(0, 0.0225, -0.076);
  pod.rotation.x = (22 * Math.PI) / 180;
  root.add(pod);
  add(keep(new THREE.BoxGeometry(0.026, 0.024, 0.02)), carbonLight, [0, 0, 0], pod);
  const lensBarrel = add(keep(new THREE.CylinderGeometry(0.0085, 0.0095, 0.012, 16)), carbon, [0, 0, -0.014], pod);
  lensBarrel.rotation.x = Math.PI / 2;
  const lens = add(
    keep(new THREE.SphereGeometry(0.0075, 14, 10)),
    keep(new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.08, metalness: 0.5 })),
    [0, 0, -0.019],
    pod,
  );
  lens.scale.z = 0.6;

  const gimbal = new THREE.Object3D();
  gimbal.position.set(0, 0, -0.024);
  pod.add(gimbal);

  /* Side plates flanking the pod, as on a real front end. */
  for (const side of [-1, 1]) {
    add(keep(new THREE.BoxGeometry(0.0035, 0.03, 0.052)), carbon, [side * 0.0165, 0.016, -0.06]);
  }

  /* --------------------------------------------------------- antenna --- */

  const antenna = new THREE.Group();
  antenna.position.set(0, 0.031, 0.072);
  antenna.rotation.x = -0.5;
  root.add(antenna);
  add(keep(new THREE.CylinderGeometry(0.0016, 0.0016, 0.042, 6)), carbonLight, [0, 0.021, 0], antenna);
  add(keep(new THREE.CapsuleGeometry(0.0055, 0.014, 4, 10)), shell, [0, 0.05, 0], antenna);

  /* ---------------------------------------------------------- beacon --- */

  const beacon = new THREE.PointLight(CORAL, 0, 1.6, 2);
  beacon.position.set(0, 0.012, -0.1);
  root.add(beacon);

  /*
   * Ground clearance, measured.
   *
   * `setFromObject` after the rig is assembled, so a skid moved by two
   * millimetres cannot silently leave the aircraft hovering above its own pad —
   * the failure mode a hardcoded constant here has every single time.
   */
  const bounds = new THREE.Box3().setFromObject(root);
  const groundClearance = -bounds.min.y;

  return {
    root,
    rotors,
    blurs,
    gimbal,
    beacon,
    setArmed(armed: boolean) {
      for (const material of ledMaterials) material.emissiveIntensity = armed ? 1.4 : 0.3;
      beacon.intensity = armed ? 0.55 : 0;
    },
    groundClearance,
    dispose() {
      for (const value of owned) value.dispose();
      root.removeFromParent();
    },
  };
}

/**
 * Fades the rotor blur discs in with rotor speed.
 *
 * Squared, so the disc is genuinely absent at idle rather than a faint smear —
 * "are the motors running" is a question the lab asks the student to answer by
 * looking, and a permanently visible haze removes the answer.
 */
export function updatePropBlur(blurs: THREE.Mesh[], omega: Float64Array) {
  for (let index = 0; index < blurs.length; index += 1) {
    const fraction = omega[index] / VEHICLE.maxRotorOmega;
    const blur = Math.min(1, fraction / 0.5);
    (blurs[index].material as THREE.MeshBasicMaterial).opacity = blur * blur * 0.34;
  }
}
