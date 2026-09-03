import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VEHICLE } from './flight';

/**
 * The aircraft — the quadrotor sandbox's own Mint parts, assembled by its own
 * fit table.
 *
 * This replaces an airframe built from primitives. That version existed because
 * the sandbox's art is not in its repository — it is fetched from `cdn.mint.gg`
 * at runtime — and shipping files whose terms nobody has stated was a line this
 * project would not cross on its own. The user asked for the real models, which
 * is theirs to decide; the files are now in `public/asset/practice/drone/` and
 * `THIRD_PARTY_ASSETS.md` records exactly what they are and where the ambiguity
 * lies.
 *
 * ## The fit table is upstream's, and so is the reasoning
 *
 * The parts arrive normalised into roughly unit boxes centred on the origin, so
 * real scale has to be re-established here. `VEHICLE.motors` is the authority
 * for where the rotors are: **the art is fitted to the physics, never the other
 * way round.** Move a rotor in the flight model and the propeller follows it.
 *
 * The measured part bounds below were taken from the same meshes and were
 * re-checked against the files this repository actually ships, after the build
 * script de-interleaved their vertex buffers — all four agree to a millimetre.
 *
 *   fuselage      0.971 × 0.260 × 0.998, motor pads at mean radius 0.565
 *   propeller     0.998 × 0.131 × 0.873, disc flat in XZ, hub centred
 *   landing skid  0.514 × 0.998 × 0.857, long axis +Y
 *   camera pod    0.998 × 0.928 × 0.580
 *
 * The fuselage already includes its four arms and motor pads, so the pack's
 * standalone arm part is not used in the assembly — mounting it again would
 * duplicate every arm. It ships because it is part of the delivered pack.
 *
 * One inherited imprecision, worth stating: the generated frame is a slightly
 * stretched X (front arms a little shorter than the rear) while the flight model
 * uses a symmetric one. The offset is about 4% of the arm length — a centimetre
 * at this scale — and is cosmetic.
 */

const MODEL = '/asset/practice/drone';

/** The reference airframe every absolute dimension below was calibrated against. */
const REFERENCE_ARM_LENGTH = 0.125;
const SCALE = VEHICLE.armLength / REFERENCE_ARM_LENGTH;

/**
 * Calibration table. Every number that positions generated art lives here, so a
 * visual correction is a one-line edit rather than a hunt through the rig.
 */
const FIT = {
  /** Normalised-unit radius of the fuselage's motor pads, measured. Intrinsic
   * to the mesh, not a physical size — not scaled. */
  fuselagePadRadius: 0.565,
  /** Propeller diameter, metres. */
  propellerDiameter: 0.127 * SCALE,
  /** Height of the rotor plane above the frame centre, metres. */
  propellerHeight: 0.035 * SCALE,
  /** Landing skid height, metres. */
  skidHeight: 0.05 * SCALE,
  /** Skid mounting height relative to the frame centre, metres. */
  skidOffsetY: -0.022 * SCALE,
  /** Camera pod width, metres. */
  podWidth: 0.035 * SCALE,
  /** Camera pod mount point, metres, in body coordinates. */
  podOffset: new THREE.Vector3(0, 0.004 * SCALE, -0.062 * SCALE),
} as const;

/** Rotor disc diameter, for anything that has to match the fitted propellers. */
export const PROP_DIAMETER = FIT.propellerDiameter;
export const PROP_HEIGHT = FIT.propellerHeight;

export type DroneRig = {
  /** Body root. Driven from the canonical simulation state every frame. */
  root: THREE.Group;
  /** The four propellers, in mixer order. Spun from `state.motorAngle`. */
  rotors: THREE.Object3D[];
  /** Per-rotor blur discs, faded in with rotor speed. */
  blurs: THREE.Mesh[];
  /** The camera pod — mount point for the onboard view. */
  gimbal: THREE.Object3D;
  /** Nose light, brightened while armed. */
  beacon: THREE.PointLight;
  setArmed(armed: boolean): void;
  /**
   * Distance from the body origin down to the lowest point of the airframe.
   * Measured from the *assembled* rig rather than assumed, so the aircraft rests
   * on its skids instead of floating above or sinking into the pad when the fit
   * table changes.
   */
  groundClearance: number;
  dispose(): void;
};

/** Uniformly scales and recentres a loaded part so one axis measures `target`. */
function fitPart(object: THREE.Object3D, axis: 'x' | 'y' | 'z', target: number) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  const extent = size[axis] || 1;
  /* Recentre first, in the part's own units, then scale the wrapper. Scaling an
     off-centre part moves it as well as resizing it. */
  object.position.sub(centre);

  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.scale.setScalar(target / extent);
  return wrapper;
}

export async function createDroneRig(): Promise<DroneRig> {
  const loader = new GLTFLoader();
  const load = async (name: string) => {
    const gltf = await loader.loadAsync(`${MODEL}/${name}.glb`);
    gltf.scene.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return gltf.scene;
  };

  const [fuselageRaw, propellerRaw, skidRaw, podRaw] = await Promise.all([
    load('drone-fuselage'),
    load('drone-propeller'),
    load('drone-skid'),
    load('drone-pod'),
  ]);

  const root = new THREE.Group();
  root.name = 'mint_quadrotor';

  /* The fuselage sets the scale for everything: its pads have to land on the
     rotor positions the flight model uses. */
  const fuselageBox = new THREE.Box3().setFromObject(fuselageRaw);
  const fuselageCentre = new THREE.Vector3();
  fuselageBox.getCenter(fuselageCentre);
  fuselageRaw.position.sub(fuselageCentre);
  const fuselage = new THREE.Group();
  fuselage.add(fuselageRaw);
  fuselage.scale.setScalar(VEHICLE.armLength / FIT.fuselagePadRadius);
  root.add(fuselage);

  const rotors: THREE.Object3D[] = [];
  const blurs: THREE.Mesh[] = [];

  /*
   * Rotor disc blur.
   *
   * A real propeller past a few thousand rpm reads as a translucent disc, not as
   * blades — and a rendered one at 60 fps reads as a slow strobing cartwheel,
   * which is worse than either. Upstream's answer, kept: a separate additive
   * disc per rotor that fades in with rotor speed, rather than fading the
   * authored propeller material. The propellers keep turning underneath and the
   * effect is pure addition.
   */
  const blurGeometry = new THREE.CircleGeometry(FIT.propellerDiameter / 2, 40);
  const owned: (THREE.BufferGeometry | THREE.Material)[] = [blurGeometry];

  for (let index = 0; index < 4; index += 1) {
    const motor = VEHICLE.motors[index];

    const propeller = fitPart(
      index === 0 ? propellerRaw : propellerRaw.clone(true),
      'x',
      FIT.propellerDiameter,
    );
    propeller.position.set(motor.x, FIT.propellerHeight, motor.z);
    root.add(propeller);
    rotors.push(propeller);

    const skid = fitPart(skidRaw.clone(true), 'y', FIT.skidHeight);
    skid.position.set(
      motor.x * 0.72,
      FIT.skidOffsetY - FIT.skidHeight / 2,
      motor.z * 0.72,
    );
    root.add(skid);

    const blurMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9c6cf,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    owned.push(blurMaterial);
    const disc = new THREE.Mesh(blurGeometry, blurMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(motor.x, FIT.propellerHeight + 0.002, motor.z);
    root.add(disc);
    blurs.push(disc);
  }

  const gimbal = fitPart(podRaw, 'x', FIT.podWidth);
  gimbal.position.copy(FIT.podOffset);
  root.add(gimbal);

  /*
   * The nose light, and the only thing here that is not upstream's.
   *
   * The lab's first step is "press arm and watch the motors spin up", and on a
   * grey airframe under flat light the four propellers starting to turn is a
   * subtle answer to a question the objective line asked directly. A beacon that
   * comes on says it in the first frame.
   */
  const beacon = new THREE.PointLight(0x00aaab, 0, 1.6, 2);
  beacon.position.set(0, 0.012, -0.1);
  root.add(beacon);

  const assembled = new THREE.Box3().setFromObject(root);
  const groundClearance = Math.max(0, -assembled.min.y);

  return {
    root,
    rotors,
    blurs,
    gimbal,
    beacon,
    setArmed(armed: boolean) {
      beacon.intensity = armed ? 0.55 : 0;
    },
    groundClearance,
    dispose() {
      for (const value of owned) value.dispose();
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const material = Array.isArray(child.material) ? child.material : [child.material];
        for (const entry of material) entry.dispose();
      });
      root.clear();
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
    const blur = Math.min(1, fraction / 0.55);
    (blurs[index].material as THREE.MeshBasicMaterial).opacity = blur * blur * 0.3;
  }
}
