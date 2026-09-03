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
 *
 * `blendable` is what a fully present creature gets back. The previous version
 * left `transparent = true` permanently after the first call, which put an
 * opaque fish in the transparent queue for the whole chapter: no early-Z, sorted
 * against the reef by centroid rather than by depth, and every fin drawn in
 * whatever order the sort landed on. A creature at full presence is opaque, and
 * only the crossfade needs blending.
 */
export function fadeTargets(targets: FadeTarget[], presence: number, blendable = true) {
  const blend = blendable && presence < 0.995;
  for (const target of targets) {
    target.material.opacity = target.opacity * presence;
    if (target.alphaTest > 0) {
      target.material.alphaTest = Math.max(0.02, target.alphaTest * presence);
    }
    const wanted = blend || target.opacity < 1;
    if (target.material.transparent !== wanted) {
      target.material.transparent = wanted;
      target.material.needsUpdate = true;
    }
  }
}

/** A small local aura, not a frame-wide bloom pass. */
function createSpecimenGlow(
  color: THREE.ColorRepresentation,
  opacity: number,
  width: number,
  height: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 126);
    gradient.addColorStop(0, 'rgba(255,255,255,.82)');
    gradient.addColorStop(0.24, 'rgba(255,255,255,.28)');
    gradient.addColorStop(0.58, 'rgba(255,255,255,.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = -1;
  return { sprite, material, texture, opacity };
}

/**
 * Sampler state, applied to every map on a creature.
 *
 * This is the least glamorous item in the whole render audit and the one with
 * the largest visible payoff. glTF carries no anisotropy, so three defaults it
 * to 1, and every one of these animals is seen at a grazing angle along its own
 * length — a fish's flank *is* the grazing case. At anisotropy 1 the 1024px
 * body atlas collapses to a low mip across most of its own silhouette, which is
 * precisely the "soft, low-resolution" read the brief is describing. It costs
 * nothing but a sampler flag.
 */
export function tuneMaps(object: THREE.Object3D, maxAnisotropy: number) {
  const anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  const seen = new Set<THREE.Texture>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      const source = material as THREE.MeshStandardMaterial;
      const maps = [source.map, source.normalMap, source.roughnessMap, source.metalnessMap,
        source.emissiveMap, source.aoMap, source.alphaMap];
      for (const map of maps) {
        if (!map || seen.has(map)) continue;
        seen.add(map);
        map.anisotropy = anisotropy;
        map.needsUpdate = true;
      }
    }
  });
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
 * `KHR_materials_pbrSpecularGlossiness`, put back.
 *
 * three.js removed this extension in r155, and what that removal looks like on a
 * real asset is not a warning — it is a specimen with no colour. The T-rex ships
 * its hand-painted teal-and-rust skin as the extension's `diffuseTexture`, so
 * the core loader reads the material's empty `pbrMetallicRoughness` block,
 * builds a white MeshStandardMaterial, correctly applies the normal and
 * occlusion maps (those are core), and hands back a grey dinosaur. Nothing in
 * the console says a texture was skipped.
 *
 * So the mapping is done here, as a loader plugin, which is what three itself
 * used to do. It is deliberately the cheap conversion rather than a faithful
 * one: `diffuse → map`, `glossiness → 1 - roughness`, `metalness = 0`, and the
 * specular map is dropped. A spec/gloss workflow cannot be expressed exactly in
 * metal/rough — the two describe reflectance differently — and for a dielectric
 * skin the difference is a slightly softer highlight, while the difference
 * between having the diffuse map and not having it is the whole animal.
 *
 * Registered on every Library loader rather than at the one call site that needs
 * it: the next asset from Sketchfab will arrive the same way, and a texture that
 * silently does not load is the worst class of bug this project can ship.
 */
export function registerSpecularGlossiness(loader: GLTFLoader) {
  const NAME = 'KHR_materials_pbrSpecularGlossiness';
  loader.register((parser) => ({
    name: NAME,
    getMaterialType(index: number) {
      const definition = parser.json.materials?.[index];
      return definition?.extensions?.[NAME] ? THREE.MeshPhysicalMaterial : null;
    },
    extendMaterialParams(index: number, params: THREE.MeshPhysicalMaterialParameters) {
      const extension = parser.json.materials?.[index]?.extensions?.[NAME];
      if (!extension) return Promise.resolve();

      const pending: Promise<unknown>[] = [];
      const diffuse = extension.diffuseFactor as number[] | undefined;
      if (diffuse) {
        params.color = new THREE.Color().setRGB(diffuse[0], diffuse[1], diffuse[2], THREE.LinearSRGBColorSpace);
        params.opacity = diffuse[3] ?? 1;
      }
      if (extension.diffuseTexture) {
        pending.push(parser.assignTexture(params, 'map', extension.diffuseTexture, THREE.SRGBColorSpace));
      }
      // Glossiness is the inverse of roughness, and the floor matters: a
      // glossiness of 1 becomes a perfect mirror, which on a skin reads as wet
      // plastic under this section's four-light rig.
      const glossiness = (extension.glossinessFactor as number | undefined) ?? 1;
      params.roughness = Math.max(0.16, 1 - glossiness);
      params.metalness = 0;
      const specular = extension.specularFactor as number[] | undefined;
      if (specular) {
        params.specularColor = new THREE.Color().setRGB(specular[0], specular[1], specular[2], THREE.LinearSRGBColorSpace);
      }
      return Promise.all(pending);
    },
  // The plugin shape is wider than the public `GLTFLoaderPlugin` type, which
  // does not declare `getMaterialType` returning a physical-material class.
  } as unknown as Parameters<GLTFLoader['register']>[0] extends (p: infer P) => infer R ? R : never));
}

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
  registerSpecularGlossiness(gltf);
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

/**
 * Where a creature is being lit, which is the only thing that legitimately
 * differs between the two stages that build these.
 *
 * `studio` is the Library's white room. `ocean` is the reef, where the
 * environment is a body of water rather than a lightbox — so a flank can carry a
 * much stronger specular before it blows out, and the surface needs *more*
 * environment rather than less to separate from the reef behind it.
 */
export type CreatureFinish = 'studio' | 'ocean';

export type FishCreatureOptions = {
  targetSize: number;
  finish?: CreatureFinish;
  maxAnisotropy?: number;
  /** Optional specimen-only PMREM; keeps a blue world from tinting white scales. */
  environment?: THREE.Texture;
  /**
   * Whether the fins may be transmissive.
   *
   * `transmission` is not a shading parameter like the others on this material:
   * the moment ANY visible material in a scene carries it, three renders the
   * whole opaque scene a SECOND time each frame into a half-resolution
   * transmission target and generates its mip chain, so the reef behind the fish
   * is drawn twice for a 0.18 effect on two thin fins. The jellyfish already had
   * exactly this switch for exactly this reason; the fish did not, and it is the
   * fish that is on screen for the longer of the two chapters.
   *
   * Defaults to true, so nothing that does not ask for the cheap path changes.
   */
  transmissive?: boolean;
};

/**
 * The fish, rebuilt against what the asset actually ships.
 *
 * The audit that produced these numbers, because every one of them was a real
 * defect rather than a taste call:
 *
 *   GEOMETRY   `fish_Body/Fin/Eyes`, skinned, one 376-channel swim clip, UV0
 *              only. No tangents and no second UV set — so no normal map and no
 *              AO map are possible, and nothing here pretends otherwise.
 *
 *   TEXTURES   three 1024² WebP maps: base colour, a shared metallic-roughness
 *              pair, and a fin base colour. glTF puts base colour in sRGB and the
 *              MR map in linear, which `GLTFLoader` already gets right — there is
 *              no double gamma here. What was missing was `anisotropy`, left at
 *              three's default of 1 on an animal whose whole flank is a grazing
 *              angle. See `tuneMaps`.
 *
 *   MATERIAL   the glTF declares no `roughnessFactor`, so it is the spec default
 *              of **1.0**, and the previous setup's `Math.max(source.roughness,
 *              0.38)` therefore left it at 1.0. The body was rendering fully
 *              diffuse — no specular lobe at all — which is the entire "flat,
 *              milky, washed-out" complaint in one line. The fix is to let the MR
 *              map keep authoring the *variation* and pull the factor down to a
 *              wet value, then put the sharp highlight where it belongs on a fish:
 *              in a clearcoat, which is a film of water over a semi-matte animal
 *              rather than a plastic-shiny animal.
 *
 *   QUEUE      every material was `transparent: true` with `opacity: 1` forever.
 *              Fixed in `fadeTargets`.
 */
export function createFishCreature(gltf: GLTF, options: FishCreatureOptions): CreatureHandle {
  const visual = gltf.scene;
  const ocean = (options.finish ?? 'studio') === 'ocean';
  /* Wet fins without the second scene pass. Iridescence, clearcoat and the
     tight roughness all survive — they are per-pixel and cost nothing extra —
     and what goes is the 0.18 of light that passed THROUGH the fin. */
  const finTransmission = ocean && (options.transmissive ?? true);
  const fades: FadeTarget[] = [];
  const created: THREE.Material[] = [];

  visual.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const source = mesh.material as THREE.MeshStandardMaterial;

    if (source.name === 'fish_Fin') {
      /* Thin, wet, back-lit tissue. The previous pass reached for sheen and
         heavy iridescence to say "delicate" and got milk instead: a broad pink
         sheen lobe over a pale fin is a wash by construction. Crispness comes
         from a tight clearcoat and a restrained iridescent tint on the rays. */
      const fin = new THREE.MeshPhysicalMaterial({
        name: 'fish_Fin_calibrated',
        color: source.color,
        map: source.map,
        alphaMap: source.alphaMap,
        metalnessMap: source.metalnessMap,
        roughnessMap: source.roughnessMap,
        roughness: ocean ? 0.2 : 0.34,
        metalness: 0,
        alphaTest: ocean ? 0.76 : 0.82,
        opacity: 1,
        depthWrite: true,
        transmission: finTransmission ? 0.18 : 0,
        thickness: finTransmission ? 0.16 : 0,
        ior: ocean ? 1.48 : 1.4,
        iridescence: ocean ? 0.48 : 0.4,
        iridescenceIOR: ocean ? 1.48 : 1.28,
        iridescenceThicknessRange: [180, 680],
        sheen: ocean ? 0.12 : 0.4,
        sheenColor: new THREE.Color(ocean ? 0xff8fc5 : 0xffd9ec),
        sheenRoughness: 0.42,
        clearcoat: ocean ? 1 : 0.55,
        clearcoatRoughness: ocean ? 0.055 : 0.24,
        specularIntensity: 1,
        specularColor: new THREE.Color(0xffffff),
        envMap: options.environment ?? null,
        envMapIntensity: ocean ? 1.32 : 0.7,
        side: THREE.DoubleSide,
      });
      mesh.material = fin;
      mesh.renderOrder = 1;
      source.dispose();
      created.push(fin);
      fades.push({ material: fin, opacity: 1, alphaTest: ocean ? 0.76 : 0.82 });
      return;
    }

    if (source.name === 'fish_Eyes') {
      /* The asset ships this at `baseColorFactor` alpha 0.0655 in BLEND mode —
         an eye that is 93% invisible. It is authored here instead: near-black,
         metallic and mirror-smooth, which is what makes a fish look alive. */
      const eyes = new THREE.MeshPhysicalMaterial({
        name: 'fish_Eyes_calibrated',
        color: new THREE.Color(ocean ? 0x171820 : 0x1e2028),
        metalness: 1,
        roughness: ocean ? 0.12 : 0.06,
        iridescence: ocean ? 0.62 : 0,
        iridescenceIOR: 1.42,
        iridescenceThicknessRange: [120, 420],
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        opacity: 1,
        depthWrite: true,
        envMap: options.environment ?? null,
        envMapIntensity: ocean ? 1.62 : 0.95,
      });
      mesh.material = eyes;
      mesh.renderOrder = 2;
      source.dispose();
      created.push(eyes);
      fades.push({ material: eyes, opacity: 1, alphaTest: 0 });
      return;
    }

    const body = new THREE.MeshPhysicalMaterial({
      name: 'fish_Body_calibrated',
      color: source.color,
      map: source.map,
      roughnessMap: source.roughnessMap,
      metalnessMap: source.metalnessMap,
      /* The map authors the variation; this factor decides how wet the animal
         is. 1.0 — the glTF default this asset inherits — is a chalk fish. */
      roughness: ocean ? 0.36 : 0.6,
      metalness: ocean ? 0.02 : 0,
      /* A film of water, not a plastic shell: high coverage, very low roughness,
         and the base material underneath left semi-matte. This is what carries
         the sharp, controlled highlight along the back and the gill plate. */
      clearcoat: ocean ? 1 : 0.6,
      clearcoatRoughness: ocean ? 0.045 : 0.16,
      sheen: ocean ? 0.06 : 0,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.42,
      specularIntensity: 1,
      specularColor: new THREE.Color(0xffffff),
      envMap: options.environment ?? null,
      envMapIntensity: ocean ? 1.26 : 0.72,
      opacity: 1,
      depthWrite: true,
    });
    mesh.material = body;
    mesh.renderOrder = 0;
    source.dispose();
    created.push(body);
    fades.push({ material: body, opacity: 1, alphaTest: 0 });
  });

  tuneMaps(visual, options.maxAnisotropy ?? 8);
  normalizeObject(visual, options.targetSize);
  const root = new THREE.Group();
  root.add(visual);
  const glow = ocean
    ? createSpecimenGlow(0x51c8ff, 0.11, options.targetSize * 1.32, options.targetSize * 0.7)
    : null;
  if (glow) {
    glow.sprite.position.z = -0.16;
    root.add(glow.sprite);
    fades.push({ material: glow.material, opacity: glow.opacity, alphaTest: 0 });
  }

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
      for (const material of created) material.dispose();
      glow?.material.dispose();
      glow?.texture.dispose();
    },
  };
}

/* -------------------------------------------------------------- jellyfish --- */

/**
 * The jellyfish, which must not be treated like the fish.
 *
 * The asset ships three nested skinned shells — `JF_heart` inside `JF_skin_in`
 * inside `JF_skin_out` — each with its own 512² base colour, a shared
 * metallic-roughness pair, and, on the two outer shells, a real **emissive map**
 * with `emissiveFactor` 1,1,1. That map is the animal's own luminosity and it is
 * the thing to build on: the glow belongs to specific tissue, so it is driven
 * from the texture and tinted, never faked with a uniform emissive over the
 * whole body (which is what produces a glow blob) and never post-processed into
 * one with a bloom pass over the frame.
 *
 * Volume comes from transmission plus attenuation rather than from opacity: an
 * alpha-blended shell is a flat translucent decal, whereas transmission with a
 * short `attenuationDistance` darkens *through* thickness, so the bell's crown
 * is pale and the deep folds under it hold colour. That gradient is what reads
 * as a body with an inside.
 *
 * On the ocean stage everything is re-graded once more: the tints stop being
 * lilac-over-ivory and become cyan-violet against blue, the emissive is allowed
 * to carry more of the value range because there is no bright room competing
 * with it, and `envMapIntensity` goes up rather than down — a transmissive shell
 * with nothing to refract is grey plastic.
 */
export type JellyfishCreatureOptions = {
  targetSize: number;
  transmissive: boolean;
  finish?: CreatureFinish;
  maxAnisotropy?: number;
  environment?: THREE.Texture;
};

export function createJellyfishCreature(
  gltf: GLTF,
  options: JellyfishCreatureOptions,
): CreatureHandle {
  const visual = gltf.scene;
  const ocean = (options.finish ?? 'studio') === 'ocean';
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
      material.color.set(ocean ? 0x23439b : 0x6f8dff);
      material.emissive.set(ocean ? 0x245cc4 : 0x3d1f86);
      material.emissiveIntensity = ocean ? 1.35 : 0.52;
      material.metalness = 0;
      material.roughness = ocean ? 0.2 : 0.28;
      material.opacity = 1;
      material.depthWrite = true;
      material.transmission = transmissive ? 0.08 : 0;
      material.thickness = 0.35;
      material.ior = 1.36;
      material.clearcoat = ocean ? 0.76 : 0.45;
      material.clearcoatRoughness = ocean ? 0.18 : 0.32;
      material.sheen = ocean ? 0.9 : 0.7;
      material.sheenColor = new THREE.Color(ocean ? 0xff77ce : 0xa8f0ff);
      material.sheenRoughness = 0.48;
      material.envMap = options.environment ?? null;
      material.envMapIntensity = ocean ? 1.28 : 0.62;
      mesh.renderOrder = 1;
      fades.push({ material, opacity: 1, alphaTest: 0 });
    } else if (material.name === 'JF_skin_in') {
      // Living tissue. Translucent with real transmission so the heart
      // reads through it instead of being alpha-masked away.
      material.color.set(ocean ? 0x6047c4 : 0xa79bff);
      material.emissive.set(ocean ? 0xb64de4 : 0x8a5cf0);
      material.emissiveIntensity = ocean ? 1.72 : 0.54;
      material.metalness = 0;
      material.roughness = ocean ? 0.24 : 0.18;
      material.opacity = transmissive ? 0.94 : 0.88;
      material.alphaTest = ocean ? 0.18 : 0;
      material.depthWrite = false;
      material.transmission = transmissive ? 0.22 : 0;
      material.thickness = 0.48;
      material.ior = ocean ? 1.42 : 1.34;
      material.attenuationDistance = ocean ? 0.94 : 1.5;
      material.attenuationColor = new THREE.Color(ocean ? 0x6a30c8 : 0x7a34ff);
      material.iridescence = ocean ? 0.82 : 0.45;
      material.iridescenceIOR = ocean ? 1.4 : 1.28;
      material.iridescenceThicknessRange = [180, 640];
      material.clearcoat = ocean ? 0.78 : 0.55;
      material.clearcoatRoughness = ocean ? 0.2 : 0.28;
      material.envMap = options.environment ?? null;
      material.envMapIntensity = ocean ? 1.45 : 0.78;
      material.side = THREE.FrontSide;
      mesh.renderOrder = 2;
      fades.push({ material, opacity: material.opacity, alphaTest: material.alphaTest });
    } else if (material.name === 'JF_skin_out') {
      // Opal shell. High transmission, low opacity, heavy iridescence: the
      // layer that has to carry the holographic colour shift.
      material.color.set(ocean ? 0x1f3d83 : 0xb9aaff);
      material.emissive.set(ocean ? 0x2bb7ef : 0x7a5ce6);
      material.emissiveIntensity = ocean ? 1.95 : 0.3;
      material.metalness = 0;
      material.roughness = ocean ? 0.16 : 0.08;
      material.opacity = transmissive ? 0.78 : 0.66;
      material.alphaTest = ocean ? 0.02 : 0;
      material.depthWrite = false;
      material.transmission = transmissive ? 0.24 : 0;
      material.thickness = 0.72;
      material.ior = ocean ? 1.4 : 1.31;
      material.attenuationDistance = ocean ? 1.25 : 2.3;
      material.attenuationColor = new THREE.Color(ocean ? 0x2d4fc8 : 0x9560ff);
      material.iridescence = ocean ? 0.94 : 0.9;
      material.iridescenceIOR = 1.33;
      material.iridescenceThicknessRange = [220, 800];
      material.clearcoat = 1;
      material.clearcoatRoughness = ocean ? 0.16 : 0.08;
      material.sheen = ocean ? 1 : 1;
      material.sheenColor = new THREE.Color(ocean ? 0xff82d6 : 0xffc6ec);
      material.sheenRoughness = 0.32;
      material.specularIntensity = 1;
      material.specularColor = new THREE.Color(0xdff6ff);
      material.envMap = options.environment ?? null;
      material.envMapIntensity = ocean ? 1.58 : 0.92;
      material.side = THREE.FrontSide;
      mesh.renderOrder = 3;
      fades.push({ material, opacity: material.opacity, alphaTest: material.alphaTest });
    }
    material.needsUpdate = true;
  });
  tuneMaps(visual, options.maxAnisotropy ?? 8);
  normalizeObject(visual, options.targetSize);
  const root = new THREE.Group();
  root.add(visual);
  const glow = ocean
    ? createSpecimenGlow(0x4f7dff, 0.26, options.targetSize * 1.08, options.targetSize * 1.46)
    : null;
  if (glow) {
    glow.sprite.position.z = -0.2;
    root.add(glow.sprite);
    fades.push({ material: glow.material, opacity: glow.opacity, alphaTest: 0 });
  }

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
      glow?.material.dispose();
      glow?.texture.dispose();
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
/**
 * Measure the animal, not its bind pose.
 *
 * `Box3.setFromObject` on a `SkinnedMesh` reads `mesh.boundingBox`, and three
 * computes that lazily from `getVertexPosition` — which goes through
 * `applyBoneTransform` and therefore through `skeleton.boneMatrices`. Those
 * matrices are only refreshed by `Skeleton.update()`, which the renderer calls at
 * *draw* time. A fit solved between `mixer.update(poseTime)` and the first frame
 * is therefore solved against whatever the skeleton happened to hold — the bind
 * pose, not the pose the visitor is about to see.
 *
 * For the T-rex the two differ enormously: the bind pose is a sprawled A-pose
 * with the tail straight out and the legs apart, so the box was roughly half
 * again as large as the biting animal inside it, and a manifest asking for
 * `fill: 0.92` got a dinosaur occupying about 40% of the frame with a lake of
 * empty ivory above it. Nothing in the fit was wrong; it was exact about the
 * wrong box.
 *
 * three's own documentation says as much — "if the skinned mesh is animated, the
 * bounding box should be recomputed" — so this does that, once, right before the
 * measurement that depends on it.
 *
 * Deliberately NOT applied to `CreatureStage`. The bee, fish and jellyfish are
 * normalised to authored world sizes and framed with `fill` values hand-tuned
 * against the bind-pose box; correcting the box under them would silently
 * re-frame three finished chapters and change the bee's optical scale with it.
 */
export function refreshSkinnedBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const skinned = child as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    skinned.skeleton.update();
    skinned.computeBoundingBox();
  });
}

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
