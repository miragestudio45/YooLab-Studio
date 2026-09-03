import * as THREE from 'three';
import { REFERENCE_ARM_LENGTH, VEHICLE, type DroneState } from './flight';
import { createPracticeLoader, type PracticeLoader } from '../practice/gltf';

/**
 * The two aircraft, assembled from the real meshes.
 *
 * These are the quadrotor sandbox's own airframes and its own fit tables — the
 * parts arrive normalized into roughly unit boxes centred on the origin, so
 * real scale has to be re-established here, and every absolute number below was
 * *measured* upstream from the generated geometry rather than guessed. The
 * measurements are worth keeping in front of you, because all three obvious
 * assumptions about the helicopter turned out to be wrong:
 *
 *   drone fuselage   0.971 × 0.260 × 0.998, motor pads at mean radius 0.565
 *   drone propeller  disc flat in XZ, hub centred
 *   heli fuselage    long axis Z, and the generated **nose points +Z**, so the
 *                    wrapper turns it to face the simulation's nose at −Z
 *   heli main rotor  spins about its own **Z**, disc in XY — not the flat-in-XZ
 *                    layout you would expect, so its mount lays that Z onto +Y
 *   heli tail rotor  spins about its own Y, disc in XZ
 *
 * `VEHICLE.motors` is the authority for where the rotors are: the art is fitted
 * to the physics, never the other way round. Move a rotor in the flight model
 * and the propeller follows it.
 *
 * Both craft fly the *same* flight model and the same PID cascade. That is
 * upstream's decision and it is the right one — a helicopter is a different
 * airframe wearing the same controls, and it means one tuned controller instead
 * of two to keep in sync. Nothing in this file touches dynamics; it only
 * projects the canonical state onto geometry.
 */

/** Uniformly scale and recentre a part so a chosen axis measures `target`. */
function fitByAxis(object: THREE.Object3D, axis: 'x' | 'y' | 'z', target: number) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // Recentre first, in the part's own units, then scale the wrapper.
  object.position.sub(centre);
  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.scale.setScalar(target / (size[axis] || 1));
  return wrapper;
}

/**
 * Scale a rotor so its swept disc measures `diameter`, using the farthest
 * vertex from the hub.
 *
 * A bounding-box axis is the wrong ruler for a rotor whose blades sit on a
 * diagonal: the helicopter's main rotor tips reach 0.717 while its widest box
 * axis is 0.998, so fitting by the box comes out about 40% small.
 */
function fitRotorByRadius(object: THREE.Object3D, diameter: number) {
  const vertex = new THREE.Vector3();
  let radius = 0;
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      radius = Math.max(radius, vertex.length());
    }
  });
  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.scale.setScalar(radius > 0 ? diameter / (2 * radius) : 1);
  return wrapper;
}

/**
 * A translucent disc over each rotor, faded in with rotor speed.
 *
 * Never a change to the blades' own materials. Two blades turning at 900 rad/s
 * under a 60 Hz render loop is a strobe — the propeller appears to stand still,
 * or to turn slowly backwards, which makes an aircraft under full power look
 * switched off. A disc is what the eye actually sees at those rates.
 */
function createBlur(diameter: number) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(diameter / 2, 40),
    new THREE.MeshBasicMaterial({
      color: 0xb9c6cf,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Rotor speed at which a blur disc is fully opaque, as a fraction of max. */
const FULL_BLUR = 0.5;
/*
 * Low, because the room is ivory.
 *
 * The disc blends additively, which on the sandbox's night city is a faint
 * silver smear and on this floor is a white plate: at 0.3 the helicopter's
 * 1.3 m main rotor read as a solid saucer with an aircraft hanging under it.
 */
const PEAK_OPACITY = 0.15;

export type CraftId = 'drone' | 'heli';

export type CraftRig = {
  id: CraftId;
  /** Body root. Projected each frame from the canonical simulation state. */
  root: THREE.Group;
  /**
   * Distance from the body origin down to the lowest point of the airframe.
   * Measured from the assembled rig rather than assumed, so the aircraft rests
   * on its skids instead of floating above or sinking into the pad when the fit
   * table changes.
   */
  groundClearance: number;
  /** Widest horizontal half-extent, for sizing the contact shadow. */
  footprint: number;
  /** Largest overall dimension. The chase camera sets its distance from this,
   *  because the helicopter is nearly three times the quadrotor's size and a
   *  distance tuned for one fills the frame with a rotor disc on the other. */
  span: number;
  /** Spins the rotors and fades their blur from the canonical state. */
  update(state: DroneState): void;
  dispose(): void;
};

/* ------------------------------------------------------------------ drone --- */

/**
 * Every absolute dimension below was measured or tuned upstream against a
 * 5-inch racer. `SCALE` carries them to whatever airframe `VEHICLE.armLength`
 * currently specifies, so resizing the drone in `flight.ts` is the only edit
 * needed — nothing here goes stale the way a second hardcoded copy would.
 */
const DRONE_SCALE = VEHICLE.armLength / REFERENCE_ARM_LENGTH;

const DRONE_FIT = {
  /** Normalized-unit radius of the fuselage's motor pads, measured. Intrinsic
   *  to the generated mesh, not a physical size — not scaled. */
  fuselagePadRadius: 0.565,
  /** Propeller diameter, metres — a 5-inch prop on the reference airframe. */
  propellerDiameter: 0.127 * DRONE_SCALE,
  /** Height of the rotor plane above the frame centre, metres. */
  propellerHeight: 0.035 * DRONE_SCALE,
  skidHeight: 0.05 * DRONE_SCALE,
  skidOffsetY: -0.022 * DRONE_SCALE,
  podWidth: 0.035 * DRONE_SCALE,
  podOffset: new THREE.Vector3(0, 0.004 * DRONE_SCALE, -0.062 * DRONE_SCALE),
} as const;

export async function loadDroneRig(loader: PracticeLoader): Promise<CraftRig> {
  const [fuselageRaw, propellerRaw, skidRaw, podRaw] = await Promise.all([
    loader.load('drone/fuselage.glb'),
    loader.load('drone/propeller.glb'),
    loader.load('drone/landing-skid.glb'),
    loader.load('drone/camera-pod.glb'),
  ]);

  const root = new THREE.Group();
  root.name = 'drone-quad';

  /*
   * The fuselage sets the scale for everything: its pads must land on the rotor
   * positions the flight model uses. It already includes its four arms and
   * motor pads, which is why the pack's standalone arm part is not mounted —
   * doing so would duplicate every arm.
   */
  const fuselageScale = VEHICLE.armLength / DRONE_FIT.fuselagePadRadius;
  const fuselageBox = new THREE.Box3().setFromObject(fuselageRaw);
  fuselageRaw.position.sub(fuselageBox.getCenter(new THREE.Vector3()));
  const fuselage = new THREE.Group();
  fuselage.add(fuselageRaw);
  fuselage.scale.setScalar(fuselageScale);
  root.add(fuselage);

  const rotors: THREE.Object3D[] = [];
  const blurs: THREE.Mesh[] = [];
  for (let index = 0; index < 4; index += 1) {
    const motor = VEHICLE.motors[index];

    const propeller = fitByAxis(
      index === 0 ? propellerRaw : propellerRaw.clone(true),
      'x',
      DRONE_FIT.propellerDiameter,
    );
    propeller.position.set(motor.x, DRONE_FIT.propellerHeight, motor.z);
    root.add(propeller);
    rotors.push(propeller);

    const blur = createBlur(DRONE_FIT.propellerDiameter);
    blur.position.set(motor.x, DRONE_FIT.propellerHeight + 0.004, motor.z);
    root.add(blur);
    blurs.push(blur);

    const skid = fitByAxis(skidRaw.clone(true), 'y', DRONE_FIT.skidHeight);
    skid.position.set(
      motor.x * 0.72,
      DRONE_FIT.skidOffsetY - DRONE_FIT.skidHeight / 2,
      motor.z * 0.72,
    );
    root.add(skid);
  }

  const pod = fitByAxis(podRaw, 'x', DRONE_FIT.podWidth);
  pod.position.copy(DRONE_FIT.podOffset);
  root.add(pod);

  root.traverse((child) => { child.castShadow = true; });

  const assembled = new THREE.Box3().setFromObject(root);
  const size = assembled.getSize(new THREE.Vector3());

  return {
    id: 'drone',
    root,
    groundClearance: Math.max(0, -assembled.min.y),
    footprint: Math.max(size.x, size.z) * 0.5,
    span: Math.max(size.x, size.y, size.z),
    update(state) {
      for (let index = 0; index < 4; index += 1) {
        rotors[index].rotation.y = state.motorAngle[index];
        const fraction = state.motorOmega[index] / VEHICLE.maxRotorOmega;
        const blur = Math.min(1, fraction / FULL_BLUR);
        (blurs[index].material as THREE.MeshBasicMaterial).opacity = blur * blur * PEAK_OPACITY;
      }
    },
    dispose() { root.clear(); },
  };
}

/* ------------------------------------------------------------- helicopter --- */

const HELI_FIT = {
  /** Fuselage length nose-to-tail, metres. Sets the rig's overall scale. */
  fuselageLength: 1.15,
  mainRotorDiameter: 1.3,
  /** Rotor plane height above the body origin — measured mast top is 0.307. */
  mainRotorHeight: 0.31,
  tailRotorDiameter: 0.26,
  /**
   * Tail rotor hub in body coordinates. Z from the measured tail end (+0.575
   * after the flip, pulled slightly inboard); X and Y placed on the boom's side
   * and centreline by eye — the one number here not derived from a measurement,
   * and the first thing to nudge if it looks off.
   */
  tailRotorOffset: new THREE.Vector3(0.045, 0.06, 0.54),
} as const;

export async function loadHelicopterRig(loader: PracticeLoader): Promise<CraftRig> {
  const [fuselageRaw, mainRaw, tailRaw] = await Promise.all([
    loader.load('heli/fuselage.glb'),
    loader.load('heli/main-rotor.glb'),
    loader.load('heli/tail-rotor.glb'),
  ]);

  const root = new THREE.Group();
  root.name = 'helicopter';

  const fuselage = fitByAxis(fuselageRaw, 'z', HELI_FIT.fuselageLength);
  // The generated nose points +Z; the simulation's nose is −Z.
  fuselage.rotation.y = Math.PI;
  root.add(fuselage);

  // The main rotor's disc lies in XY and it spins about its own Z, so the mount
  // lays that Z over onto the aircraft's +Y.
  const mainRotor = fitRotorByRadius(mainRaw, HELI_FIT.mainRotorDiameter);
  const mainMount = new THREE.Group();
  mainMount.rotation.x = -Math.PI / 2;
  mainMount.position.set(0, HELI_FIT.mainRotorHeight, 0);
  mainMount.add(mainRotor);
  root.add(mainMount);

  const mainBlur = createBlur(HELI_FIT.mainRotorDiameter);
  mainBlur.position.set(0, HELI_FIT.mainRotorHeight + 0.004, 0);
  root.add(mainBlur);

  // The tail rotor's disc already lies in XZ spinning about its own Y, so its
  // mount only has to tip that Y over onto the lateral axis.
  const tailRotor = fitRotorByRadius(tailRaw, HELI_FIT.tailRotorDiameter);
  const tailMount = new THREE.Group();
  tailMount.rotation.z = Math.PI / 2;
  tailMount.position.copy(HELI_FIT.tailRotorOffset);
  tailMount.add(tailRotor);
  root.add(tailMount);

  root.traverse((child) => { child.castShadow = true; });

  const assembled = new THREE.Box3().setFromObject(root);
  const size = assembled.getSize(new THREE.Vector3());
  const blurMaterial = mainBlur.material as THREE.MeshBasicMaterial;

  return {
    id: 'heli',
    root,
    groundClearance: Math.max(0, -assembled.min.y),
    footprint: Math.max(size.x, size.z) * 0.42,
    span: Math.max(size.x, size.y, size.z),
    update(state) {
      /*
       * The multirotor model fills all four rotor slots identically; the
       * helicopter reads slot 0 for the main rotor and gears the tail rotor up
       * from it, as a real tail rotor is driven off the same engine.
       */
      const angle = state.motorAngle[0];
      mainRotor.rotation.z = angle;
      tailRotor.rotation.y = angle * 4.2;
      const fraction = state.motorOmega[0] / VEHICLE.maxRotorOmega;
      const blur = Math.min(1, fraction / FULL_BLUR);
      blurMaterial.opacity = blur * blur * PEAK_OPACITY;
    },
    dispose() { root.clear(); },
  };
}

export async function loadCraft(id: CraftId, loader: PracticeLoader): Promise<CraftRig> {
  return id === 'heli' ? loadHelicopterRig(loader) : loadDroneRig(loader);
}

export { createPracticeLoader };
