import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  buildBeeAnatomy,
  createBeeMaterials,
  shareSkinnedMesh,
  type BeeMaterialSet,
} from './beeOptics';

/**
 * The three hand-calibrated creatures, as builders rather than as scene code.
 *
 * These setups used to live inside the Explore hero's effect, which meant the
 * Library could not reach them: its viewer fell back on the generic GLB path and
 * the same bee that is optical glass in the hero arrived in the Library as a
 * solid ruby mesh with opaque wings. Side by side on one page that reads as an
 * admission that the good version was a marketing render.
 *
 * So the setups moved here verbatim — every material value, every renderOrder,
 * every emissive intensity, every alphaTest — and both stages build from the
 * same functions. Nothing in this file knows about a camera, a scene, a light or
 * a scroll position: a builder takes a loaded glTF and returns a handle the
 * caller parents wherever it likes.
 */

export const CREATURE_ASSETS = {
  bee: '/asset/bee/bee_fixed.glb',
  fish: '/asset/fish/Fish.glb',
  jellyfish: '/asset/fish/jellyfish.glb',
} as const;

export const BEE_TEXTURES = {
  normal: '/asset/bee/bee_normal.webp',
  orm: '/asset/bee/bee_orm.webp',
} as const;

export type CreatureHandle = {
  /** Add this to your scene. Nothing above it is touched by the builder. */
  root: THREE.Group;
  /** Crossfade weight, 0..1. Drives opacity, alphaTest and the shader presence. */
  setPresence(value: number): void;
  mixer?: THREE.AnimationMixer;
  /** Bee only: the two layers hidden during the refraction capture pass. */
  opticalLayers?: { shell: THREE.SkinnedMesh; wings: THREE.SkinnedMesh };
  /** Bee only. */
  materials?: BeeMaterialSet;
  /** Bee only: three flight clips — 0 idle, 1 hover, 2 fly. */
  actions?: THREE.AnimationAction[];
  dispose(): void;
};

export type FadeTarget = {
  material: THREE.Material & { opacity: number; alphaTest: number };
  opacity: number;
  alphaTest: number;
};

/* ------------------------------------------------------------- utilities --- */

export function normalizeObject(object: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.sub(center.clone().multiplyScalar(scale));
  return { scale, size };
}

export function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

/**
 * Crossfades a creature without breaking its render queue.
 *
 * `alphaTest` is scaled with the fade rather than left fixed: an alpha-masked
 * fin would otherwise vanish the moment `opacity` fell below the cutoff. The
 * value is clamped above zero so the `USE_ALPHATEST` define never toggles and
 * the program stays cached.
 */
export function fadeTargets(targets: FadeTarget[], presence: number) {
  for (const target of targets) {
    target.material.opacity = target.opacity * presence;
    if (target.alphaTest > 0) {
      target.material.alphaTest = Math.max(0.02, target.alphaTest * presence);
    }
    target.material.transparent = true;
  }
}

/**
 * Promotes a glTF material to MeshPhysicalMaterial while keeping its maps.
 *
 * Only `JF_skin_out` ships a clearcoat extension, so the loader hands back a
 * plain MeshStandardMaterial for the other two jellyfish layers. Assigning
 * transmission or IOR to those would define USE_TRANSMISSION against the
 * standard material struct and fail to compile.
 */
export function toPhysical(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial {
  const source = mesh.material as THREE.MeshStandardMaterial;
  if ((source as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
    return source as THREE.MeshPhysicalMaterial;
  }
  const physical = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: source.color.clone(),
    map: source.map,
    emissive: source.emissive.clone(),
    emissiveMap: source.emissiveMap,
    emissiveIntensity: source.emissiveIntensity,
    normalMap: source.normalMap,
    normalScale: source.normalScale.clone(),
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    aoMap: source.aoMap,
    alphaMap: source.alphaMap,
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.side,
  });
  mesh.material = physical;
  source.dispose();
  return physical;
}

/* ---------------------------------------------------------------- loaders --- */

export type CreatureLoader = {
  gltf: GLTFLoader;
  textures: THREE.TextureLoader;
  dispose(): void;
};

/**
 * The one loader configuration both stages must agree on. The bee ships Draco
 * geometry and meshopt-packed animation, so a stage that forgets either decoder
 * fails at parse time rather than at render time — which is exactly the kind of
 * divergence this module exists to prevent.
 */
export function createCreatureLoader(): CreatureLoader {
  const draco = new DRACOLoader();
  draco.setDecoderPath('/asset/draco/');
  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return {
    gltf,
    textures: new THREE.TextureLoader(),
    dispose: () => draco.dispose(),
  };
}

export type BeeAssets = {
  gltf: GLTF;
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
};

/**
 * Mesh and the two data maps in one request batch, with the sampler state the
 * optical shaders assume: both maps are read as raw data (no sRGB decode) and
 * the normal map is anisotropic because the bee is nearly always seen at a
 * grazing angle along the abdomen.
 */
export async function loadBeeAssets(loader: CreatureLoader, maxAnisotropy: number): Promise<BeeAssets> {
  const [gltf, normalMap, ormMap] = await Promise.all([
    loader.gltf.loadAsync(CREATURE_ASSETS.bee),
    loader.textures.loadAsync(BEE_TEXTURES.normal),
    loader.textures.loadAsync(BEE_TEXTURES.orm),
  ]);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  ormMap.wrapS = ormMap.wrapT = THREE.RepeatWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  ormMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = Math.min(8, maxAnisotropy);
  return { gltf, normalMap, ormMap };
}

/* -------------------------------------------------------------------- bee --- */

export type BeeCreatureOptions = {
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
  /** The mip-chained screen capture the shell refracts. */
  sceneTexture: THREE.Texture;
  /** Live render-buffer size in pixels; the caller keeps it up to date. */
  resolution: THREE.Vector2;
  /** Longest-axis size in world units after normalisation. */
  targetSize: number;
  /**
   * Pin the body joint of the hover and take-off clips to its idle position.
   *
   * Both callers pass `true`, and the flag exists to record why. The clips carry
   * world-scale authored translation on `body_jnt` — the fly track reaches ~4,479
   * source units — so playing them unmodified throws the bee out of frame. The
   * hero wants the skeletal performance without the travel because it supplies
   * its own procedural locomotion; the Library viewer wants it because a bee that
   * leaves a 900px panel is a bug.
   */
  anchorRootMotion: boolean;
};

export function createBeeCreature(gltf: GLTF, options: BeeCreatureOptions): CreatureHandle {
  const visual = gltf.scene;
  let source: THREE.SkinnedMesh | undefined;
  visual.traverse((child) => {
    const skinned = child as THREE.SkinnedMesh;
    if (!source && skinned.isSkinnedMesh) source = skinned;
  });
  if (!source) throw new Error('bee_fixed.glb no longer contains a skinned mesh');

  buildBeeAnatomy(source);
  const geometryBounds = source.geometry.boundingBox
    ?? new THREE.Box3().setFromBufferAttribute(source.geometry.getAttribute('position') as THREE.BufferAttribute);
  const geometrySpan = geometryBounds.getSize(new THREE.Vector3()).length();

  const materials = createBeeMaterials({
    normalMap: options.normalMap,
    ormMap: options.ormMap,
    sceneTexture: options.sceneTexture,
    resolution: options.resolution,
  });
  // The reference insets the inner body by exactly one geometry unit and
  // relies on polygon offset for the rest. On this asset the diagonal is
  // ~2860 units, so the ratio below reproduces that almost exactly while
  // still scaling if the model is ever re-exported.
  materials.coreInset.value = Math.max(geometrySpan * 0.00035, 1e-4);

  const previousMaterial = source.material as THREE.Material;
  source.material = materials.shell;
  source.frustumCulled = false;
  source.renderOrder = 1;
  const shell = source;
  previousMaterial?.dispose();

  const core = shareSkinnedMesh(source, materials.core, 'bee_core');
  core.renderOrder = 0;
  const wings = shareSkinnedMesh(source, materials.wings, 'bee_wings');
  wings.renderOrder = 2;
  (source.parent ?? visual).add(core, wings);

  normalizeObject(visual, options.targetSize);
  const root = new THREE.Group();
  root.add(visual);

  const clips = gltf.animations.map((clip) => clip.clone());
  if (options.anchorRootMotion) {
    const isBodyPositionTrack = (track: THREE.KeyframeTrack) => (
      track.name.toLowerCase().includes('body_jnt') && track.name.endsWith('.position')
    );
    const idleRootTrack = clips[0]?.tracks.find(isBodyPositionTrack);
    const anchoredRoot = idleRootTrack?.values.slice(0, 3);
    if (anchoredRoot?.length === 3) {
      for (const clip of clips.slice(1)) {
        const rootTrack = clip.tracks.find(isBodyPositionTrack);
        if (!rootTrack) continue;
        for (let index = 0; index < rootTrack.values.length; index += 3) {
          rootTrack.values[index] = anchoredRoot[0];
          rootTrack.values[index + 1] = anchoredRoot[1];
          rootTrack.values[index + 2] = anchoredRoot[2];
        }
      }
    }
  }
  const mixer = new THREE.AnimationMixer(visual);
  // No clip is started here: which flight state the bee opens on is a
  // composition decision, and the two stages answer it differently.
  const actions = clips.map((clip) => mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity));

  return {
    root,
    mixer,
    actions,
    materials,
    opticalLayers: { shell, wings },
    setPresence: (presence: number) => {
      materials.presence.value = presence;
      // Opaque while fully present so the shell keeps writing depth; only the
      // crossfade needs the blended path.
      const blend = presence < 0.995;
      if (materials.core.transparent !== blend) {
        materials.core.transparent = blend;
        materials.core.needsUpdate = true;
      }
      if (materials.shell.transparent !== blend) {
        materials.shell.transparent = blend;
        materials.shell.needsUpdate = true;
      }
    },
    dispose: () => {
      mixer.stopAllAction();
      disposeObject(root);
      materials.dispose();
    },
  };
}

/* ------------------------------------------------------------------- fish --- */

export function createFishCreature(gltf: GLTF, options: { targetSize: number }): CreatureHandle {
  const visual = gltf.scene;
  const fades: FadeTarget[] = [];
  visual.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const source = mesh.material as THREE.MeshStandardMaterial;
    if (source.name === 'fish_Fin') {
      const fin = new THREE.MeshPhysicalMaterial({
        name: 'fish_Fin_calibrated',
        color: source.color,
        map: source.map,
        alphaMap: source.alphaMap,
        metalnessMap: source.metalnessMap,
        roughnessMap: source.roughnessMap,
        roughness: Math.max(source.roughness, 0.34),
        metalness: 0.06,
        alphaTest: 0.82,
        transparent: true,
        opacity: 1,
        depthWrite: true,
        iridescence: 0.52,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [160, 520],
        sheen: 0.7,
        sheenColor: new THREE.Color(0xffd9ec),
        sheenRoughness: 0.5,
        clearcoat: 0.4,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.62,
        side: THREE.DoubleSide,
      });
      mesh.material = fin;
      mesh.renderOrder = 1;
      source.dispose();
      fades.push({ material: fin, opacity: 1, alphaTest: 0.82 });
    } else if (source.name === 'fish_Eyes') {
      source.color.set(0x2c2d35);
      source.emissive.set(0x000000);
      source.emissiveIntensity = 0;
      source.transparent = true;
      source.opacity = 1;
      source.depthWrite = true;
      source.alphaTest = 0;
      source.metalness = 0.92;
      source.roughness = 0.1;
      source.envMapIntensity = 0.85;
      source.needsUpdate = true;
      mesh.renderOrder = 2;
      fades.push({ material: source, opacity: 1, alphaTest: 0 });
    } else {
      source.emissive.set(0x000000);
      source.emissiveIntensity = 0;
      source.envMapIntensity = 0.5;
      source.metalness = 0.05;
      source.roughness = Math.max(source.roughness, 0.38);
      source.aoMapIntensity = 0.62;
      source.transparent = true;
      source.opacity = 1;
      source.depthWrite = true;
      source.needsUpdate = true;
      mesh.renderOrder = 0;
      fades.push({ material: source, opacity: 1, alphaTest: 0 });
    }
  });
  normalizeObject(visual, options.targetSize);
  const root = new THREE.Group();
  root.add(visual);

  let mixer: THREE.AnimationMixer | undefined;
  if (gltf.animations[0]) {
    mixer = new THREE.AnimationMixer(visual);
    mixer.clipAction(gltf.animations[0]).setEffectiveTimeScale(0.82).play();
  }

  return {
    root,
    mixer,
    setPresence: (presence: number) => fadeTargets(fades, presence),
    dispose: () => {
      mixer?.stopAllAction();
      disposeObject(root);
    },
  };
}

/* -------------------------------------------------------------- jellyfish --- */

export function createJellyfishCreature(
  gltf: GLTF,
  options: { targetSize: number; transmissive: boolean },
): CreatureHandle {
  const visual = gltf.scene;
  const fades: FadeTarget[] = [];
  // Either every layer is transmissive or none is: three sorts transmissive
  // and transparent objects into separate passes, and a split would draw the
  // inner bell over the outer membrane.
  const transmissive = options.transmissive;
  visual.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const material = toPhysical(mesh);
    material.toneMapped = true;
    material.transparent = true;
    material.alphaTest = 0;
    if (material.name === 'JF_heart') {
      // Inner bell. Source of the internal glow, kept low enough that the
      // two membranes above it stay readable.
      material.color.set(0x6f8dff);
      material.emissive.set(0x3d1f86);
      material.emissiveIntensity = 0.52;
      material.metalness = 0;
      material.roughness = 0.28;
      material.opacity = 1;
      material.depthWrite = true;
      material.transmission = transmissive ? 0.08 : 0;
      material.thickness = 0.35;
      material.ior = 1.36;
      material.clearcoat = 0.45;
      material.clearcoatRoughness = 0.32;
      material.sheen = 0.7;
      material.sheenColor = new THREE.Color(0xa8f0ff);
      material.sheenRoughness = 0.48;
      material.envMapIntensity = 0.62;
      mesh.renderOrder = 1;
      fades.push({ material, opacity: 1, alphaTest: 0 });
    } else if (material.name === 'JF_skin_in') {
      // Living tissue. Translucent with real transmission so the heart
      // reads through it instead of being alpha-masked away.
      material.color.set(0xa79bff);
      material.emissive.set(0x8a5cf0);
      material.emissiveIntensity = 0.54;
      material.metalness = 0;
      material.roughness = 0.18;
      material.opacity = transmissive ? 0.9 : 0.78;
      material.depthWrite = false;
      material.transmission = transmissive ? 0.44 : 0;
      material.thickness = 0.55;
      material.ior = 1.34;
      material.attenuationDistance = 1.5;
      material.attenuationColor = new THREE.Color(0x7a34ff);
      material.iridescence = 0.45;
      material.iridescenceIOR = 1.28;
      material.iridescenceThicknessRange = [180, 640];
      material.clearcoat = 0.55;
      material.clearcoatRoughness = 0.28;
      material.envMapIntensity = 0.78;
      material.side = THREE.FrontSide;
      mesh.renderOrder = 2;
      fades.push({ material, opacity: material.opacity, alphaTest: 0 });
    } else if (material.name === 'JF_skin_out') {
      // Opal shell. High transmission, low opacity, heavy iridescence: the
      // layer that has to carry the holographic colour shift.
      material.color.set(0xb9aaff);
      material.emissive.set(0x7a5ce6);
      material.emissiveIntensity = 0.30;
      material.metalness = 0;
      material.roughness = 0.08;
      material.opacity = transmissive ? 0.6 : 0.5;
      material.depthWrite = false;
      material.transmission = transmissive ? 0.74 : 0;
      material.thickness = 0.95;
      material.ior = 1.31;
      material.attenuationDistance = 2.3;
      material.attenuationColor = new THREE.Color(0x9560ff);
      material.iridescence = 0.9;
      material.iridescenceIOR = 1.33;
      material.iridescenceThicknessRange = [220, 800];
      material.clearcoat = 1;
      material.clearcoatRoughness = 0.08;
      material.sheen = 1;
      material.sheenColor = new THREE.Color(0xffc6ec);
      material.sheenRoughness = 0.32;
      material.specularIntensity = 1;
      material.specularColor = new THREE.Color(0xdff6ff);
      material.envMapIntensity = 0.92;
      material.side = THREE.FrontSide;
      mesh.renderOrder = 3;
      fades.push({ material, opacity: material.opacity, alphaTest: 0 });
    }
    material.needsUpdate = true;
  });
  normalizeObject(visual, options.targetSize);
  const root = new THREE.Group();
  root.add(visual);

  let mixer: THREE.AnimationMixer | undefined;
  if (gltf.animations[0]) {
    mixer = new THREE.AnimationMixer(visual);
    mixer.clipAction(gltf.animations[0]).setEffectiveTimeScale(0.72).play();
  }

  return {
    root,
    mixer,
    setPresence: (presence: number) => fadeTargets(fades, presence),
    dispose: () => {
      mixer?.stopAllAction();
      disposeObject(root);
    },
  };
}

/* ------------------------------------------------------- protected assets --- */

/**
 * Load a Library GLB, unwrapping the ones that ship XOR-protected.
 *
 * Every mesh under `public/asset/Library/Car` — the Formula car, its sprue, and
 * the eight hand tools — is stored XOR'd with 0x5A rather than as a plain GLB.
 * `lib/formula/carRuntime.ts` has always known that, which is why the Formula
 * workshop worked; the generic Library paths did not, so the moment the toolkit
 * bench pointed `ModelStage` at `ruler.glb` the viewer showed "không tải được"
 * and the thumbnail baker logged a JSON parse error on binary data.
 *
 * The check is on the magic rather than on the path: an unprotected GLB is
 * passed through untouched, so this is safe to put on every load and there is no
 * list of protected files to keep in sync.
 */
export async function loadLibraryGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!(bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46)) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] ^= 0x5a;
  }
  // Parse against the directory the file came from, so a glTF that references
  // sibling textures resolves them.
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return loader.parseAsync(bytes.buffer, base);
}
