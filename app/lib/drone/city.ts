import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The city — the quadrotor sandbox's own downtown, its own plan, its own
 * buildings.
 *
 * This replaces an indoor flight cage built from primitives. The cage was a
 * defensible room to learn in and it was not what the sandbox flies: forty
 * buildings on a street grid around a landing plaza, with a yard of industrial
 * props and a mountain horizon. Given the real models, the real city is what the
 * lab should be.
 *
 * Ported from `world/city.ts` and `world/props.ts`, with three things carried
 * across as they stand — because each of them is a decision that took that
 * project a while to reach:
 *
 *   - **buildings are fitted by height from a design table**, and their collider
 *     half-extents are then *measured from the fitted art* rather than typed
 *     again. The one lesson that project keeps re-learning is that a second
 *     hand-written copy of a dimension goes stale the moment the first changes.
 *   - **a footprint cap.** A building whose fitted footprint would exceed 30 m
 *     is scaled down until it fits, trading height for street width — otherwise
 *     the grid closes up and there is nowhere to fly.
 *   - **the four blocks around the origin stay open** as the plaza. The pad has
 *     to be somewhere a beginner can climb out of without hitting anything.
 *
 * What is *not* carried across is Rapier. Upstream turns every placed building
 * into a static box collider in a physics world; here the same boxes answer the
 * same question — "did the aircraft hit something" — with a dozen comparisons
 * and no 1.1 MB of WASM. The collider list is the same list.
 */

const MODEL = '/asset/practice/drone';

/** Street-grid block spacing, metres. Upstream's. */
const BLOCK = 44;
/** A fitted footprint wider than this is scaled down until it fits. */
const MAX_FOOTPRINT = 30;

/** Design heights, metres. The table is upstream's. */
const BUILDINGS = [
  { key: 'glassTower', file: 'city-glass-tower', height: 58 },
  { key: 'setbackTower', file: 'city-setback-tower', height: 52 },
  { key: 'cornerOffice', file: 'city-corner-office', height: 28 },
  { key: 'apartmentBlock', file: 'city-apartment', height: 24 },
  { key: 'podiumTower', file: 'city-podium-tower', height: 36 },
  { key: 'concreteMidRise', file: 'city-mid-rise', height: 20 },
  { key: 'storefrontBlock', file: 'city-storefront', height: 9 },
  { key: 'hotelTower', file: 'city-hotel-tower', height: 44 },
] as const;

type BuildingKey = (typeof BUILDINGS)[number]['key'];

/**
 * The downtown plan: kind, grid column, grid row, quarter turns.
 *
 * Upstream's table, unchanged. Tall towers cluster in an inner ring so the
 * skyline reads from the pad, and heights taper toward the edges.
 */
const PLAN: ReadonlyArray<[BuildingKey, number, number, number]> = [
  ['glassTower', 1, 1, 0],
  ['setbackTower', -1, 1, 1],
  ['hotelTower', -1, -1, 2],
  ['podiumTower', 1, -1, 3],
  ['cornerOffice', 0, 1, 2],
  ['apartmentBlock', 0, -1, 0],
  ['concreteMidRise', 1, 0, 1],
  ['storefrontBlock', -1, 0, 3],
  ['setbackTower', 2, 1, 2],
  ['glassTower', -2, -1, 1],
  ['hotelTower', 2, -1, 0],
  ['apartmentBlock', -2, 1, 0],
  ['concreteMidRise', -2, 0, 2],
  ['podiumTower', 0, 2, 1],
  ['cornerOffice', 0, -2, 3],
  ['apartmentBlock', 1, 2, 0],
  ['storefrontBlock', -1, 2, 1],
  ['concreteMidRise', 1, -2, 2],
  ['storefrontBlock', -1, -2, 0],
  ['glassTower', 2, 0, 3],
  ['hotelTower', -2, 2, 1],
  ['setbackTower', -2, -2, 3],
  ['cornerOffice', 2, 2, 0],
  ['podiumTower', 2, -2, 2],
  ['apartmentBlock', 0, 3, 0],
  ['concreteMidRise', -1, 3, 1],
  ['storefrontBlock', 1, 3, 2],
  ['cornerOffice', -3, 1, 0],
  ['apartmentBlock', -3, 0, 3],
  ['storefrontBlock', -3, -1, 1],
  ['concreteMidRise', -3, 2, 0],
  ['podiumTower', -3, -2, 2],
  ['apartmentBlock', 0, -3, 1],
  ['storefrontBlock', -1, -3, 3],
  ['concreteMidRise', 1, -3, 0],
  ['cornerOffice', -2, 3, 2],
  ['storefrontBlock', -3, 3, 0],
  ['apartmentBlock', 2, 3, 1],
  ['concreteMidRise', 2, -3, 3],
  ['storefrontBlock', -2, -3, 2],
];

/** Yard props scattered around the plaza, as [file, x, z, yaw, height]. */
const PROPS: ReadonlyArray<[string, number, number, number, number]> = [
  ['prop-container', 20, 16, 0.2, 2.6],
  ['prop-container', 20, 22.6, 0.2, 2.6],
  ['prop-container', -24, 18, -0.5, 2.6],
  ['prop-scaffold', -19, -18, 0.9, 9],
  ['prop-antenna', 26, -22, 0, 14],
  ['prop-cable-drum', 15, -15, 1.2, 1.8],
  ['prop-cable-drum', 17.4, -13.4, 0.3, 1.8],
  ['prop-barrier', -13, 9, 0, 0.9],
  ['prop-barrier', -13, 12.2, 0, 0.9],
  ['prop-barrier', -13, 15.4, 0, 0.9],
  ['prop-cone', 8.5, 8.5, 0, 0.6],
  ['prop-cone', -8.5, 8.5, 0, 0.6],
  ['prop-cone', 8.5, -8.5, 0, 0.6],
  ['prop-cone', -8.5, -8.5, 0, 0.6],
];

/** A solid the aircraft can hit, as an axis-aligned box. */
export type Obstacle = {
  centre: THREE.Vector3;
  half: THREE.Vector3;
};

export type City = {
  group: THREE.Group;
  obstacles: Obstacle[];
  /** Half-extent of the flyable box, so the lab can nudge a stray aircraft back. */
  bounds: { radius: number; ceiling: number };
  dispose(): void;
};

/** Fits a raw building: base on y = 0, centred in XZ, height per the table. */
function fitBuilding(raw: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);
  raw.position.set(-centre.x, -box.min.y, -centre.z);

  let scale = targetHeight / (size.y || 1);
  const footprint = Math.max(size.x, size.z) * scale;
  if (footprint > MAX_FOOTPRINT) scale *= MAX_FOOTPRINT / footprint;

  const wrapper = new THREE.Group();
  wrapper.add(raw);
  wrapper.scale.setScalar(scale);

  /* Fitted world-space half-extents, measured — the collider's source of truth. */
  const half = new THREE.Vector3(
    (size.x * scale) / 2,
    (size.y * scale) / 2,
    (size.z * scale) / 2,
  );
  return { wrapper, half };
}

export async function createCity(): Promise<City> {
  const loader = new GLTFLoader();

  const load = async (file: string) => {
    const gltf = await loader.loadAsync(`${MODEL}/${file}.glb`);
    gltf.scene.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return gltf.scene;
  };

  const [buildingScenes, propScenes] = await Promise.all([
    Promise.all(BUILDINGS.map((spec) => load(spec.file))),
    Promise.all([...new Set(PROPS.map(([file]) => file))].map(async (file) => [file, await load(file)] as const)),
  ]);

  const templates = new Map<BuildingKey, { wrapper: THREE.Group; half: THREE.Vector3 }>();
  BUILDINGS.forEach((spec, index) => {
    templates.set(spec.key, fitBuilding(buildingScenes[index], spec.height));
  });
  const propTemplates = new Map(propScenes);

  const group = new THREE.Group();
  group.name = 'mint_city';
  const obstacles: Obstacle[] = [];

  for (const [kind, column, row, turns] of PLAN) {
    const template = templates.get(kind);
    if (!template) continue;

    const object = template.wrapper.clone(true);
    const rotation = (turns * Math.PI) / 2;
    object.position.set(column * BLOCK, 0, row * BLOCK);
    object.rotation.y = rotation;
    group.add(object);

    /* Quarter turns swap the footprint axes; the collider follows. */
    const swapped = turns % 2 === 1;
    obstacles.push({
      centre: new THREE.Vector3(column * BLOCK, template.half.y, row * BLOCK),
      half: new THREE.Vector3(
        swapped ? template.half.z : template.half.x,
        template.half.y,
        swapped ? template.half.x : template.half.z,
      ),
    });
  }

  for (const [file, x, z, yaw, height] of PROPS) {
    const source = propTemplates.get(file);
    if (!source) continue;
    const { wrapper, half } = fitBuilding(source.clone(true), height);
    wrapper.position.set(x, 0, z);
    wrapper.rotation.y = yaw;
    group.add(wrapper);
    obstacles.push({
      centre: new THREE.Vector3(x, half.y, z),
      half: half.clone(),
    });
  }

  /*
   * The ground.
   *
   * One large plane rather than tiled asphalt: the city's own buildings carry
   * all the detail the eye reads at altitude, and a repeating road texture at
   * this scale becomes a moiré field the moment the aircraft climbs.
   */
  const groundGeometry = new THREE.PlaneGeometry(900, 900);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x585c60,
    roughness: 0.95,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  /* The plaza the pad sits on, so the open block reads as paved rather than as a
     gap in the city. */
  const plazaGeometry = new THREE.PlaneGeometry(BLOCK * 1.6, BLOCK * 1.6);
  const plazaMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d7175,
    roughness: 0.9,
    metalness: 0.02,
  });
  const plaza = new THREE.Mesh(plazaGeometry, plazaMaterial);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  group.add(plaza);

  return {
    group,
    obstacles,
    bounds: { radius: 190, ceiling: 95 },
    dispose() {
      groundGeometry.dispose();
      groundMaterial.dispose();
      plazaGeometry.dispose();
      plazaMaterial.dispose();
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const material = Array.isArray(child.material) ? child.material : [child.material];
        for (const entry of material) entry.dispose();
      });
      group.clear();
      group.removeFromParent();
    },
  };
}

/**
 * The sky.
 *
 * Upstream's mountain-horizon panorama, on the inside of a sphere. A skybox
 * rather than a fog colour because the city is flown *over*: at 60 m the
 * horizon is most of the frame, and a flat clear colour there reads as the
 * world having no edge rather than as sky.
 */
export async function createSky(): Promise<{ mesh: THREE.Mesh; dispose(): void }> {
  const texture = await new THREE.TextureLoader().loadAsync(`${MODEL}/sky-panorama.webp`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;

  const geometry = new THREE.SphereGeometry(600, 48, 32);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'mint_sky';
  /* Rendered first and never depth-tested against, so it can be smaller than the
     far plane without ever occluding a building. */
  mesh.renderOrder = -1000;
  material.depthWrite = false;

  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      mesh.removeFromParent();
    },
  };
}

/**
 * Whether a point is inside any obstacle, with a margin for the airframe.
 *
 * Boxes rather than a physics world, and no response beyond "you hit something":
 * upstream runs Rapier for exactly this, and it is 1.1 MB of WASM to answer a
 * question that fifty axis-aligned boxes answer in fifty comparisons. What the
 * lab does with a hit — respawn hovering over the last gate cleared — needs a
 * boolean, not a contact manifold.
 */
export function hitsObstacle(obstacles: Obstacle[], point: THREE.Vector3, margin: number) {
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
 * Distance from `point` to the nearest solid.
 *
 * Feeds the proximity readout on the panel, which is the one instrument on a
 * real drone a beginner immediately understands. Upstream computes this with a
 * 32-ray lidar sweep and an occupancy grid; for this set of boxes the exact
 * distance is the same number and is not sampled.
 */
export function nearestSolid(obstacles: Obstacle[], point: THREE.Vector3) {
  let nearest = point.y;
  for (const obstacle of obstacles) {
    const dx = Math.max(0, Math.abs(point.x - obstacle.centre.x) - obstacle.half.x);
    const dy = Math.max(0, Math.abs(point.y - obstacle.centre.y) - obstacle.half.y);
    const dz = Math.max(0, Math.abs(point.z - obstacle.centre.z) - obstacle.half.z);
    nearest = Math.min(nearest, Math.hypot(dx, dy, dz));
  }
  return Math.max(0, nearest);
}
