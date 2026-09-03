import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * One loader for everything the practice labs fetch.
 *
 * All four assets — the quadrotor pack, the helicopter pack, the six-axis arm
 * and its suction tool — are plain uncompressed glTF binaries with no Draco and
 * no Meshopt, so this needs none of the machinery the Library's loader carries.
 * What it does need is to be *one* loader per lab, because a lab that builds a
 * loader per part leaks a parser and a texture cache for every mesh it opens.
 *
 * `dispose()` is the reason this is a factory rather than a module-level
 * singleton: a lab that unmounts has to give back every geometry, material and
 * texture it created, and the only way to be sure of that is to own them.
 */

export const PRACTICE_ASSETS = '/asset/practice/';

export type PracticeLoader = {
  load(path: string): Promise<THREE.Group>;
  /** Textures the caller made by hand, so teardown can reach them too. */
  own<T extends THREE.Texture>(texture: T): T;
  dispose(): void;
};

export function createPracticeLoader(): PracticeLoader {
  const gltf = new GLTFLoader();
  const scenes: THREE.Object3D[] = [];
  const owned = new Set<THREE.Texture>();

  return {
    async load(path) {
      const result = await gltf.loadAsync(`${PRACTICE_ASSETS}${path}`);
      scenes.push(result.scene);
      return result.scene;
    },
    own(texture) {
      owned.add(texture);
      return texture;
    },
    dispose() {
      for (const scene of scenes) disposeTree(scene);
      scenes.length = 0;
      for (const texture of owned) texture.dispose();
      owned.clear();
    },
  };
}

/**
 * The Open Industry Project's meshes carry their maps as separate files rather
 * than embedded, so a caller has to build the material itself. This is that,
 * once, with the two details that are easy to get wrong:
 *
 *   - **ORM packing.** Occlusion in R, roughness in G, metalness in B, which is
 *     the glTF convention — so one texture is assigned to three slots and
 *     three.js reads the right channel from each. Assigning it only to
 *     `roughnessMap` (the obvious guess) gives a uniformly non-metal arm.
 *   - **`aoMap` needs `uv1`.** three.js samples ambient occlusion from the
 *     *second* UV set, which these meshes do not have, so the first is copied
 *     across. Without it the AO map is silently ignored.
 */
export async function loadSurface(
  loader: PracticeLoader,
  files: { baseColor: string; normal: string; orm: string },
): Promise<THREE.MeshStandardMaterial> {
  const textureLoader = new THREE.TextureLoader();
  const [baseColor, normal, orm] = await Promise.all([
    textureLoader.loadAsync(`${PRACTICE_ASSETS}${files.baseColor}`),
    textureLoader.loadAsync(`${PRACTICE_ASSETS}${files.normal}`),
    textureLoader.loadAsync(`${PRACTICE_ASSETS}${files.orm}`),
  ]);

  baseColor.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  orm.colorSpace = THREE.NoColorSpace;
  for (const texture of [baseColor, normal, orm]) {
    texture.flipY = false;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    loader.own(texture);
  }

  return new THREE.MeshStandardMaterial({
    map: baseColor,
    normalMap: normal,
    aoMap: orm,
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.85,
  });
}

/** Copies UV0 into UV1 so `aoMap` has something to sample. */
export function prepareForAo(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const uv = mesh.geometry.attributes.uv;
    if (uv && !mesh.geometry.attributes.uv1) mesh.geometry.setAttribute('uv1', uv);
  });
}

export function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
