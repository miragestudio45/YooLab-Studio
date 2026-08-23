'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createProceduralEnvironment, exploreEnvironmentPalette } from '../lib/three/environment';
import { createLiquidSurface, liquidPalette, type LiquidPalette } from '../lib/three/liquid';
import { buildBeeAnatomy, createBeeMaterials, shareSkinnedMesh } from '../lib/three/beeOptics';
import { EXPLORE_SCENES, type ExploreScene } from '../lib/exploreScenes';

type ExploreCanvasProps = {
  /**
   * Continuous scroll position across the four Explore panels, 0 to 3.
   * A ref, not state: this changes every frame and re-rendering React on each
   * one would cost more than the whole scene does.
   */
  progressRef: { current: number };
  beeMode: number;
};

type CreatureKey = 'jelly' | 'fish' | 'bee';

type Placement = {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  pitch: number;
};

/** A camera shot. `roll` tilts the frame, which is how the jellyfish panel gets
 *  a diagonal composition instead of a very tall vertical one. */
type Shot = {
  camera: { position: THREE.Vector3; target: THREE.Vector3; fov: number; roll: number };
  layout: Placement;
};

type Creature = {
  key: CreatureKey;
  root: THREE.Group;
  presence: number;
  setPresence: (value: number) => void;
};

type FadeTarget = {
  material: THREE.Material & { opacity: number; alphaTest: number };
  opacity: number;
  alphaTest: number;
};

const place = (x: number, y: number, z: number, scale: number, yaw = 0, pitch = 0): Placement => ({
  x, y, z, scale, yaw, pitch,
});

/**
 * Scene choreography.
 *
 * Every panel owns a camera shot and a placement for its creature, and the
 * render loop reads a *continuous* position along this list rather than a
 * current panel. There is no moment where one shot is swapped for another: the
 * camera, the fov, the lights, the backdrop palette and the three creature
 * weights are all sampled from the same scroll number, so Jellyfish -> Fish ->
 * Bee is one camera travelling through a single world.
 *
 * The hand-offs also overlap on purpose (see `creatureWeights`). The outgoing
 * creature recedes on Z while the incoming one rises, which is what gives the
 * crossfade depth instead of making it a dissolve between two flat images.
 */
const shots: Record<ExploreScene, Shot> = {
  /* Hero. The bee sits right of centre and large — a little over half the
     frame width — with the whole left half left clear for the proposition. */
  'bee-hero': {
    camera: { position: new THREE.Vector3(0.16, 0.2, 6.55), target: new THREE.Vector3(0.86, 0.02, 0), fov: 33, roll: 0 },
    layout: place(1.62, 0.0, 0.1, 1.0, -0.52, -0.05),
  },
  /* Study. Same creature, closer and turned: the copy moves right, so the bee
     moves left and the camera comes in about half a metre. */
  'bee-study': {
    camera: { position: new THREE.Vector3(-0.6, 0.12, 6.05), target: new THREE.Vector3(-1.16, -0.02, 0), fov: 31, roll: 0.015 },
    layout: place(-1.58, -0.02, 0.2, 1.04, 0.42, -0.02),
  },
  fish: {
    camera: { position: new THREE.Vector3(-0.9, -0.02, 7.4), target: new THREE.Vector3(-1.22, -0.06, 0), fov: 33, roll: -0.02 },
    layout: place(-1.52, -0.04, 0.2, 1.04, 1.36, 0.07),
  },
  /* Jellyfish. The bell is framed rather than the whole animal: aiming above
     the model centre and tilting the camera turns a very tall subject into a
     diagonal that fits one screen, instead of asking for two of scrolling
     before the tentacles end. */
  jelly: {
    camera: { position: new THREE.Vector3(0.62, 0.42, 6.0), target: new THREE.Vector3(1.22, 0.34, 0), fov: 30, roll: -0.075 },
    layout: place(1.5, -0.34, 0.15, 1.12, 0.22, -0.05),
  },
};

/**
 * Where a creature waits before it enters, and where it goes when it leaves.
 *
 * Offsets are added to the panel placement and scaled by `1 - presence`, so a
 * creature at full presence sits exactly on its mark and one at zero presence is
 * off the edge of the frame. Because the whole thing is a pure function of
 * scroll position, scrolling back up walks the creature back in along the same
 * arc — no teleport, no re-entry animation to trigger.
 */
const exits: Record<CreatureKey, { x: number; y: number; z: number; yaw: number }> = {
  bee: { x: 4.6, y: 1.5, z: 0.6, yaw: -0.7 },
  fish: { x: -3.9, y: -0.7, z: -1.2, yaw: 0.5 },
  jelly: { x: 1.4, y: -2.9, z: -1.6, yaw: 0.2 },
};

/**
 * Backdrop palettes.
 *
 * Light-first: every stop sits in the top decile of the value range, so the
 * stage reads as a bright studio the creature is lit inside, not as a coloured
 * field the creature floats on. The bee panel is the palest of the four on
 * purpose — the reference bee is shot against pure white, and optical glass
 * only resolves when there is something bright behind it to refract.
 */
const scenePalettes: Record<ExploreScene, LiquidPalette> = {
  'bee-hero': liquidPalette(0xfffdf9, 0xf8ecdf, 0xfae0d3, 0xfff2e8, 0xf3e7f3),
  'bee-study': liquidPalette(0xfffcf7, 0xf7e8d8, 0xf9dcce, 0xffefe3, 0xf1e4f2),
  fish: liquidPalette(0xfdfcfa, 0xf4ecdf, 0xe6eef0, 0xfceee9, 0xe9eaf4),
  jelly: liquidPalette(0xfdfbfb, 0xefe6f4, 0xe6edf2, 0xfbe9ef, 0xece4f6),
};

type SceneLight = {
  key: number;
  keyColor: THREE.Color;
  cyan: number;
  pink: number;
  ambient: number;
  exposure: number;
};

const sceneLighting: Record<ExploreScene, SceneLight> = {
  'bee-hero': { key: 2.45, keyColor: new THREE.Color(0xfff6ec), cyan: 3.2, pink: 2.6, ambient: 1.06, exposure: 0.99 },
  'bee-study': { key: 2.4, keyColor: new THREE.Color(0xfff4e9), cyan: 3.4, pink: 2.5, ambient: 1.04, exposure: 0.98 },
  fish: { key: 2.1, keyColor: new THREE.Color(0xfff8f2), cyan: 4.4, pink: 2.2, ambient: 1.12, exposure: 0.92 },
  jelly: { key: 2.15, keyColor: new THREE.Color(0xfff4f6), cyan: 5.6, pink: 3.6, ambient: 1.1, exposure: 0.95 },
};

/** How long the bee takes to fly in, in seconds. */
const BEE_ENTRY_SECONDS = 2.6;

/** Where the bee starts: off the right edge, high, and closer to camera. */
const beeEntry = { x: 6.4, y: 1.35 };

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Creature weights along the panel axis.
 *
 * The hand-offs deliberately overlap: the fish is already at 30% before the
 * bee has finished leaving. A cut where one reaches zero exactly as the next
 * leaves zero is what makes a crossfade read as a slide change.
 */
function creatureWeights(progress: number) {
  const toFish = smoothstep(1.06, 1.9, progress);
  const toJelly = smoothstep(2.08, 2.9, progress);
  return {
    bee: 1 - toFish,
    fish: toFish * (1 - toJelly),
    jelly: toJelly,
  };
}

function normalizeObject(object: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.sub(center.clone().multiplyScalar(scale));
  return { scale, size };
}

function disposeObject(object: THREE.Object3D) {
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
function fadeTargets(targets: FadeTarget[], presence: number) {
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
function toPhysical(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial {
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

export function ExploreCanvas({ progressRef, beeMode }: ExploreCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const beeModeRef = useRef(beeMode);
  // Held in a ref of our own so the scene effect can stay on an empty dependency
  // list: the renderer, the loaders and the three models must survive a prop
  // change, and rebuilding them because an identity changed would restart the
  // whole download.
  const progressSource = useRef(progressRef);

  useEffect(() => { progressSource.current = progressRef; }, [progressRef]);
  useEffect(() => { beeModeRef.current = beeMode; }, [beeMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = window.matchMedia('(max-width: 780px)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    camera.position.copy(shots['bee-hero'].camera.position);
    scene.add(camera);

    const maxPixelRatio = compact ? 1.3 : 1.6;
    const renderer = new THREE.WebGLRenderer({
      antialias: !compact,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    let pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.insertBefore(renderer.domElement, host.firstChild);

    const environment = createProceduralEnvironment(renderer, exploreEnvironmentPalette);
    scene.environment = environment.texture;

    /* --------------------------------------------------------- liquid stage --- */
    const liquid = createLiquidSurface({
      palette: scenePalettes['bee-hero'],
      simScale: compact ? 0.16 : 0.24,
      simulate: !reduceMotion,
      planeWidth: 2,
      planeHeight: 2,
    });
    // Parented to the camera: the choreography moves the camera constantly, and
    // the environment has to stay a full-frame backdrop through all of it.
    liquid.mesh.position.set(0, 0, -24);
    liquid.mesh.renderOrder = -50;
    camera.add(liquid.mesh);
    const activePalette = {
      mist: scenePalettes['bee-hero'].mist.clone(),
      primary: scenePalettes['bee-hero'].primary.clone(),
      secondary: scenePalettes['bee-hero'].secondary.clone(),
      accent: scenePalettes['bee-hero'].accent.clone(),
      deep: scenePalettes['bee-hero'].deep.clone(),
    };
    // Scratch colours for the per-frame interpolation, so the loop allocates
    // nothing.
    const paletteTarget = {
      mist: new THREE.Color(),
      primary: new THREE.Color(),
      secondary: new THREE.Color(),
      accent: new THREE.Color(),
      deep: new THREE.Color(),
    };
    const keyColorTarget = new THREE.Color();

    // Mipmapped on purpose: the bee shell reads its refraction with an explicit
    // LOD so surface roughness blurs what is behind the glass. Without the mip
    // chain that term collapses to a sharp copy of the background, which is
    // exactly what makes screen-space glass look like a decal.
    const sceneCapture = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    sceneCapture.texture.colorSpace = THREE.LinearSRGBColorSpace;

    /* ---------------------------------------------------------------- lights --- */
    const hemisphere = new THREE.HemisphereLight(0xf2f6ff, 0xcfc4e6, 1.1);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xfff1fb, 2.0);
    keyLight.position.set(-3.4, 4.8, 5.2);
    scene.add(keyLight);
    const cyanLight = new THREE.PointLight(0x74ecff, 7.6, 14, 2);
    cyanLight.position.set(3.4, 1.7, 2.6);
    scene.add(cyanLight);
    const pinkLight = new THREE.PointLight(0xff5aae, 4.8, 11, 2);
    pinkLight.position.set(-2.6, -1.9, 2.3);
    scene.add(pinkLight);
    const rimLight = new THREE.DirectionalLight(0xbfe9ff, 1.1);
    rimLight.position.set(4.2, -1.2, -4.5);
    scene.add(rimLight);

    /* -------------------------------------------------------------- creatures --- */
    const creatures = new Map<CreatureKey, Creature>();
    const mixers: THREE.AnimationMixer[] = [];
    let beeActions: THREE.AnimationAction[] = [];
    let beeMaterialSet: ReturnType<typeof createBeeMaterials> | undefined;
    let beeShell: THREE.SkinnedMesh | undefined;
    let beeWings: THREE.SkinnedMesh | undefined;
    let renderWidth = 1;
    let renderHeight = 1;

    const draco = new DRACOLoader();
    draco.setDecoderPath('/asset/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const textureLoader = new THREE.TextureLoader();

    const registerCreature = (key: CreatureKey, root: THREE.Group, setPresence: (value: number) => void) => {
      root.visible = false;
      scene.add(root);
      creatures.set(key, { key, root, presence: 0, setPresence });
    };

    const configureJelly = async () => {
      const gltf = await loader.loadAsync('/asset/fish/jellyfish.glb');
      const visual = gltf.scene;
      const fades: FadeTarget[] = [];
      // Either every layer is transmissive or none is: three sorts transmissive
      // and transparent objects into separate passes, and a split would draw the
      // inner bell over the outer membrane.
      const transmissive = !compact;
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
      normalizeObject(visual, 3.6);
      const root = new THREE.Group();
      root.add(visual);
      registerCreature('jelly', root, (presence) => fadeTargets(fades, presence));
      if (gltf.animations[0]) {
        const mixer = new THREE.AnimationMixer(visual);
        mixer.clipAction(gltf.animations[0]).setEffectiveTimeScale(0.72).play();
        mixers.push(mixer);
      }
    };

    const configureFish = async () => {
      const gltf = await loader.loadAsync('/asset/fish/Fish.glb');
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
      normalizeObject(visual, 3.15);
      const root = new THREE.Group();
      root.add(visual);
      registerCreature('fish', root, (presence) => fadeTargets(fades, presence));
      if (gltf.animations[0]) {
        const mixer = new THREE.AnimationMixer(visual);
        mixer.clipAction(gltf.animations[0]).setEffectiveTimeScale(0.82).play();
        mixers.push(mixer);
      }
    };

    const configureBee = async () => {
      const [gltf, normalMap, ormMap] = await Promise.all([
        loader.loadAsync('/asset/bee/bee_fixed.glb'),
        textureLoader.loadAsync('/asset/bee/bee_normal.webp'),
        textureLoader.loadAsync('/asset/bee/bee_orm.webp'),
      ]);
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
      ormMap.wrapS = ormMap.wrapT = THREE.RepeatWrapping;
      normalMap.colorSpace = THREE.NoColorSpace;
      ormMap.colorSpace = THREE.NoColorSpace;
      normalMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

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
        normalMap,
        ormMap,
        sceneTexture: sceneCapture.texture,
        resolution: new THREE.Vector2(renderWidth, renderHeight),
      });
      // The reference insets the inner body by exactly one geometry unit and
      // relies on polygon offset for the rest. On this asset the diagonal is
      // ~2860 units, so the ratio below reproduces that almost exactly while
      // still scaling if the model is ever re-exported.
      materials.coreInset.value = Math.max(geometrySpan * 0.00035, 1e-4);
      beeMaterialSet = materials;

      const previousMaterial = source.material as THREE.Material;
      source.material = materials.shell;
      source.frustumCulled = false;
      source.renderOrder = 1;
      beeShell = source;
      previousMaterial?.dispose();

      const core = shareSkinnedMesh(source, materials.core, 'bee_core');
      core.renderOrder = 0;
      const wings = shareSkinnedMesh(source, materials.wings, 'bee_wings');
      wings.renderOrder = 2;
      beeWings = wings;
      (source.parent ?? visual).add(core, wings);

      normalizeObject(visual, 3.42);
      const root = new THREE.Group();
      root.add(visual);
      registerCreature('bee', root, (presence) => {
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
      });

      const beeClips = gltf.animations.map((clip) => clip.clone());
      const isBodyPositionTrack = (track: THREE.KeyframeTrack) => (
        track.name.toLowerCase().includes('body_jnt') && track.name.endsWith('.position')
      );
      const idleRootTrack = beeClips[0]?.tracks.find(isBodyPositionTrack);
      const anchoredRoot = idleRootTrack?.values.slice(0, 3);
      if (anchoredRoot?.length === 3) {
        // Hover and take-off carry world-scale authored root motion (the fly
        // track reaches ~4,479 source units). Keep the skeletal performance and
        // anchor the body joint; the procedural path below supplies locomotion.
        for (const clip of beeClips.slice(1)) {
          const rootTrack = clip.tracks.find(isBodyPositionTrack);
          if (!rootTrack) continue;
          for (let index = 0; index < rootTrack.values.length; index += 3) {
            rootTrack.values[index] = anchoredRoot[0];
            rootTrack.values[index + 1] = anchoredRoot[1];
            rootTrack.values[index + 2] = anchoredRoot[2];
          }
        }
      }
      const mixer = new THREE.AnimationMixer(visual);
      mixers.push(mixer);
      beeActions = beeClips.map((clip) => mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity));
      // Starts on the fly clip: the very first thing the bee does is fly in.
      beeActions[2]?.reset().fadeIn(0.01).play();
    };

    let disposed = false;
    let deferredIdle: number | undefined;
    let deferredTimer: ReturnType<typeof setTimeout> | undefined;
    let loadedModels = 0;
    let settledModels = 0;
    const loadModel = async (label: string, configure: () => Promise<void>) => {
      try {
        await configure();
        if (disposed) return;
        loadedModels += 1;
        host.dataset.ready = 'true';
      } catch (error) {
        console.error(`${label} scene failed to load`, error);
      } finally {
        if (disposed) return;
        settledModels += 1;
        if (settledModels === 3 && loadedModels < 3) host.dataset.partial = 'true';
        if (settledModels === 3 && loadedModels === 0) {
          host.dataset.error = 'true';
          const loaderLabel = host.querySelector('.visual-loader');
          if (loaderLabel) loaderLabel.textContent = 'Không thể tải mô hình 3D';
        }
      }
    };
    const loadDeferredModels = () => {
      if (disposed) return;
      void Promise.all([loadModel('Fish', configureFish), loadModel('Jellyfish', configureJelly)]);
    };
    // The bee is the hero now, so it is the only blocking download; the other
    // two are a scroll away and wait for an idle frame.
    void loadModel('Bee', configureBee).finally(() => {
      if (disposed) return;
      if ('requestIdleCallback' in window) {
        deferredIdle = window.requestIdleCallback(loadDeferredModels, { timeout: 900 });
      } else {
        deferredTimer = setTimeout(loadDeferredModels, 240);
      }
    });

    /* ----------------------------------------------------------------- input --- */
    const pointerTarget = new THREE.Vector2(0.62, 0.54);
    const pointer = new THREE.Vector2(0.62, 0.54);
    const pointerVelocity = new THREE.Vector2();
    const previousPointer = new THREE.Vector2(0.62, 0.54);
    let impulse = 0;
    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      pointerTarget.set(
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      );
      impulse = Math.max(impulse, 0.09);
    };
    const onPointerLeave = () => { impulse = 0; };
    let previousScrollY = window.scrollY;
    const onScroll = () => {
      const delta = Math.abs(window.scrollY - previousScrollY);
      previousScrollY = window.scrollY;
      impulse = Math.max(impulse, Math.min(0.06, delta / 820));
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---------------------------------------------------------------- resize --- */
    let viewportWidth = 1;
    let viewportHeight = 1;
    const resize = () => {
      viewportWidth = Math.max(host.clientWidth, 1);
      viewportHeight = Math.max(host.clientHeight, 1);
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(viewportWidth, viewportHeight, false);
      const ratio = renderer.getPixelRatio();
      renderWidth = Math.floor(viewportWidth * ratio);
      renderHeight = Math.floor(viewportHeight * ratio);
      liquid.setSize(viewportWidth, viewportHeight, ratio);
      // Fit the backdrop to a frustum wider than any shot uses, so the plate
      // still covers the frame while the choreography dollies the fov.
      const distance = 24;
      const half = Math.tan(THREE.MathUtils.degToRad(20)) * distance;
      liquid.mesh.scale.set(half * camera.aspect, half, 1);
      sceneCapture.setSize(
        Math.max(1, Math.floor(renderWidth * 0.8)),
        Math.max(1, Math.floor(renderHeight * 0.8)),
      );
      beeMaterialSet?.optical.uSceneResolution.value.set(renderWidth, renderHeight);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let stageVisible = true;
    const visibilityTarget = host.closest('.explore-story') ?? host;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => { stageVisible = entry?.isIntersecting ?? true; },
      { rootMargin: '200px 0px' },
    );
    visibilityObserver.observe(visibilityTarget);
    let documentVisible = document.visibilityState !== 'hidden';
    const onVisibility = () => { documentVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    /* ------------------------------------------------------------------ loop --- */
    const cameraPosition = shots['bee-hero'].camera.position.clone();
    const cameraTarget = shots['bee-hero'].camera.target.clone();
    const desiredCamera = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const shotPosition = new THREE.Vector3();
    const shotTarget = new THREE.Vector3();
    const beeLayout: Placement = { ...shots['bee-hero'].layout };
    let cameraFov = shots['bee-hero'].camera.fov;
    let cameraRoll = shots['bee-hero'].camera.roll;
    // Damped copy of the scroll position. The raw value can jump on a wheel
    // flick or an anchor jump; the creature crossfade has to survive both.
    let smoothProgress = 0;
    /* Entrance clock. `-1` means "not started": it is stamped on the first
       frame after the bee exists, so a slow model download delays the flight
       instead of the bee appearing halfway through it. */
    let entryStart = -1;
    let entryEase = 0;
    let beeFlightState = 2;
    let frameAccumulator = 0;
    let frameCount = 0;
    let downscales = 0;
    const timer = new THREE.Timer();

    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stageVisible || !documentVisible) return;
      const elapsed = timer.getElapsed();
      const motionTime = reduceMotion ? 0 : elapsed;
      /* Continuous panel position. Everything below reads from this one number,
         which is what turns four panels into one camera move: there is no
         "current scene" to switch to, only a place on the track. */
      const target = Math.min(EXPLORE_SCENES.length - 1, Math.max(0, progressSource.current.current));
      smoothProgress += (target - smoothProgress) * (1 - Math.pow(0.0025, delta));
      const progress = smoothProgress;
      const lower = Math.min(EXPLORE_SCENES.length - 2, Math.floor(progress));
      const span = progress - lower;
      // Eased inside each panel gap so the hand-off has no corner at either end.
      const mix = span * span * (3 - 2 * span);
      const keyA = EXPLORE_SCENES[lower];
      const keyB = EXPLORE_SCENES[lower + 1];
      const shotA = shots[keyA];
      const shotB = shots[keyB];
      const lightA = sceneLighting[keyA];
      const lightB = sceneLighting[keyB];
      const paletteA = scenePalettes[keyA];
      const paletteB = scenePalettes[keyB];
      const weights = creatureWeights(progress);
      const dominant: CreatureKey = weights.bee >= 0.5
        ? 'bee'
        : weights.fish >= 0.5 ? 'fish' : 'jelly';

      // Recomputed every frame: the flag has to clear when the model finishes
      // loading, not only when the panel changes.
      const pending = creatures.has(dominant) ? 'false' : 'true';
      if (host.dataset.scenePending !== pending) host.dataset.scenePending = pending;
      const blend = 1 - Math.pow(0.006, delta);

      /* camera choreography. On narrow viewports the lateral framing collapses
         toward the centre so the creature stays inside the frame. */
      const mobileFrame = viewportWidth < 780 ? 0.3 : 1;
      shotPosition.copy(shotA.camera.position).lerp(shotB.camera.position, mix);
      shotTarget.copy(shotA.camera.target).lerp(shotB.camera.target, mix);
      const shotFov = shotA.camera.fov + (shotB.camera.fov - shotA.camera.fov) * mix;
      desiredCamera.set(
        shotPosition.x * mobileFrame + (pointer.x - 0.5) * 0.5 + Math.sin(motionTime * 0.11) * 0.16,
        shotPosition.y + (pointer.y - 0.5) * 0.3 + Math.cos(motionTime * 0.083) * 0.1,
        shotPosition.z + Math.sin(motionTime * 0.062) * 0.18,
      );
      desiredTarget.set(
        shotTarget.x * mobileFrame,
        shotTarget.y,
        shotTarget.z,
      );
      const shotRoll = shotA.camera.roll + (shotB.camera.roll - shotA.camera.roll) * mix;
      cameraPosition.lerp(desiredCamera, blend);
      cameraTarget.lerp(desiredTarget, blend);
      cameraFov += (shotFov - cameraFov) * blend;
      cameraRoll += (shotRoll - cameraRoll) * blend;
      camera.position.copy(cameraPosition);
      camera.lookAt(cameraTarget);
      // Frame tilt, applied after the aim. This is what lets the jellyfish read
      // as a diagonal across one screen instead of a column that needs two.
      if (Math.abs(cameraRoll) > 1e-4) camera.rotateZ(cameraRoll);
      if (Math.abs(camera.fov - cameraFov) > 0.008) {
        camera.fov = cameraFov;
        camera.updateProjectionMatrix();
      }

      /* light + palette transitions, interpolated on the same axis as the
         camera so the room brightens into the next panel instead of stepping */
      const lerp = (a: number, b: number) => a + (b - a) * mix;
      hemisphere.intensity += (lerp(lightA.ambient, lightB.ambient) - hemisphere.intensity) * blend;
      keyLight.intensity += (lerp(lightA.key, lightB.key) - keyLight.intensity) * blend;
      keyColorTarget.copy(lightA.keyColor).lerp(lightB.keyColor, mix);
      keyLight.color.lerp(keyColorTarget, blend);
      cyanLight.intensity += (lerp(lightA.cyan, lightB.cyan) - cyanLight.intensity) * blend;
      pinkLight.intensity += (lerp(lightA.pink, lightB.pink) - pinkLight.intensity) * blend;
      rimLight.intensity += ((1.1 + weights.bee * 0.45) - rimLight.intensity) * blend;
      renderer.toneMappingExposure += (lerp(lightA.exposure, lightB.exposure) - renderer.toneMappingExposure) * blend;
      paletteTarget.mist.copy(paletteA.mist).lerp(paletteB.mist, mix);
      paletteTarget.primary.copy(paletteA.primary).lerp(paletteB.primary, mix);
      paletteTarget.secondary.copy(paletteA.secondary).lerp(paletteB.secondary, mix);
      paletteTarget.accent.copy(paletteA.accent).lerp(paletteB.accent, mix);
      paletteTarget.deep.copy(paletteA.deep).lerp(paletteB.deep, mix);
      activePalette.mist.lerp(paletteTarget.mist, blend);
      activePalette.primary.lerp(paletteTarget.primary, blend);
      activePalette.secondary.lerp(paletteTarget.secondary, blend);
      activePalette.accent.lerp(paletteTarget.accent, blend);
      activePalette.deep.lerp(paletteTarget.deep, blend);
      liquid.palette.uMist.value.copy(activePalette.mist);
      liquid.palette.uPrimary.value.copy(activePalette.primary);
      liquid.palette.uSecondary.value.copy(activePalette.secondary);
      liquid.palette.uAccent.value.copy(activePalette.accent);
      liquid.palette.uDeep.value.copy(activePalette.deep);

      /* pointer + liquid */
      pointer.lerp(pointerTarget, reduceMotion ? 0.05 : 0.12);
      pointerVelocity.set(pointer.x - previousPointer.x, pointer.y - previousPointer.y).multiplyScalar(6);
      previousPointer.copy(pointer);
      impulse = Math.max(impulse * 0.9, Math.min(0.34, pointerVelocity.length() * 1.1));
      liquid.step(renderer, delta, elapsed, pointer, pointerVelocity, reduceMotion ? impulse * 0.2 : impulse);

      /*
       * Bee flight state.
       *
       * Three sources want to drive the clip and they are resolved here in one
       * place, strongest first:
       *
       *   1. the entrance, which is `Fly` from the moment the model appears
       *      until the arrival crossfade begins;
       *   2. leaving the composition, which is also `Fly` — the bee flies out
       *      rather than dissolving;
       *   3. the three buttons in the study panel, which own it the rest of the
       *      time.
       *
       * Anything else would have the buttons fighting the choreography: a
       * visitor who left the bee on "đứng yên" would watch it slide out of
       * frame with its wings folded.
       */
      if (beeActions.length) {
        if (entryStart < 0) entryStart = elapsed;
        const entryRaw = reduceMotion ? 1 : Math.min(1, (elapsed - entryStart) / BEE_ENTRY_SECONDS);
        // Out-cubic: most of the distance is covered early and the last stretch
        // is a deceleration into the mark.
        entryEase = 1 - Math.pow(1 - entryRaw, 3);
        const arriving = entryRaw > 0.72;
        const beePresence = creatures.get('bee')?.presence ?? 0;
        const leaving = beePresence < 0.985 && smoothProgress > 0.6;
        const desired = !arriving ? 2 : leaving ? 2 : Math.max(0, Math.min(2, beeModeRef.current));
        if (desired !== beeFlightState) {
          // A long crossfade on the arrival (Fly -> Hover) because that one is
          // the cinematic beat; a short one everywhere else so the buttons feel
          // like controls rather than transitions.
          const fade = beeFlightState === 2 && desired !== 2 ? 0.85 : 0.4;
          beeActions[beeFlightState]?.fadeOut(fade);
          beeActions[desired]?.reset().setEffectiveWeight(1).fadeIn(fade).play();
          beeFlightState = desired;
        }
      }
      for (const mixer of mixers) mixer.update(reduceMotion ? 0 : delta);
      if (beeMaterialSet) {
        beeMaterialSet.optical.uTime.value = elapsed;
        // The glass and the inner body are lit analytically from one direction,
        // exactly as the reference does, so they have to track the key light.
        beeMaterialSet.optical.uLightDir.value.copy(keyLight.position).normalize();
      }

      /* creature presence + placement */
      const mobile = viewportWidth < 780;
      const presenceBlend = 1 - Math.pow(0.004, delta);
      // The bee is on screen across two panels, so its own placement travels
      // with the camera rather than snapping at the panel boundary.
      const beeMix = smoothstep(0, 1, Math.min(1, Math.max(0, progress)));
      const hero = shots['bee-hero'].layout;
      const study = shots['bee-study'].layout;
      beeLayout.x = hero.x + (study.x - hero.x) * beeMix;
      beeLayout.y = hero.y + (study.y - hero.y) * beeMix;
      beeLayout.z = hero.z + (study.z - hero.z) * beeMix;
      beeLayout.scale = hero.scale + (study.scale - hero.scale) * beeMix;
      beeLayout.yaw = hero.yaw + (study.yaw - hero.yaw) * beeMix;
      beeLayout.pitch = hero.pitch + (study.pitch - hero.pitch) * beeMix;

      for (const creature of creatures.values()) {
        const weight = weights[creature.key];
        creature.presence += (weight - creature.presence) * presenceBlend;
        if (weight < 0.004 && creature.presence < 0.004) creature.presence = 0;
        const visible = creature.presence > 0.002;
        if (creature.root.visible !== visible) creature.root.visible = visible;
        if (!visible) continue;
        creature.setPresence(creature.presence);

        const layout = creature.key === 'bee'
          ? beeLayout
          : shots[creature.key === 'fish' ? 'fish' : 'jelly'].layout;
        /*
         * Leaving the frame is a flight, not a fade.
         *
         * `recede` is how far this creature is from being the current one, and
         * everything below is a pure function of it: the creature travels along
         * its exit arc, falls back on Z, loses a little scale and turns away.
         * Because none of it is time-based, scrolling back up walks the same arc
         * in reverse — the bee flies back in and settles rather than popping
         * back into place.
         */
        const recede = 1 - creature.presence;
        const arc = recede * recede;          // slow to leave, then quick
        const exit = exits[creature.key];
        const idleY = creature.key === 'fish'
          ? Math.sin(motionTime * 0.9) * 0.11
          : Math.sin(motionTime * 0.62) * 0.09;
        let extraX = 0;
        let extraY = 0;
        let extraRoll = 0;
        let motionScale = 1;
        if (creature.key === 'bee') {
          /* Entrance. Held at `entryEase` = 0 until the model is ready, then
             flown in along a curve: the lateral travel finishes before the
             vertical one, so the path bends instead of being a straight slide,
             and both are eased out so the bee decelerates into its mark. */
          const entering = 1 - entryEase;
          const bend = entering * (2 - entering);   // out-quad: leads the settle
          extraX += beeEntry.x * entering;
          extraY += beeEntry.y * bend;
          extraRoll += -0.22 * entering;
          const flying = beeFlightState === 2 && !reduceMotion;
          if (flying) {
            extraX += Math.sin(motionTime * 0.78) * 0.34;
            extraY += Math.sin(motionTime * 1.56) * 0.2;
            extraRoll += -Math.sin(motionTime * 0.78) * 0.07;
          }
          // The hover and fly poses spread the wings, which reads a touch larger
          // than the folded idle pose; this keeps the apparent size steady.
          motionScale = beeFlightState === 0 ? 1 : 0.94;
        }
        // On narrow viewports the copy sits at the bottom of the panel, so the
        // creature moves up and toward the centre instead of behind the text.
        creature.root.position.set(
          layout.x * (mobile ? 0.34 : 1) + extraX + exit.x * arc,
          layout.y + idleY + extraY + exit.y * arc + (mobile ? 0.42 : 0),
          layout.z + exit.z * arc - recede * 1.1,
        );
        creature.root.scale.setScalar(
          layout.scale * (mobile ? 0.66 : 1) * motionScale * (1 - recede * 0.14),
        );
        creature.root.rotation.set(
          layout.pitch + (pointer.y - 0.5) * -0.07,
          layout.yaw + (pointer.x - 0.5) * 0.16 + Math.sin(motionTime * 0.24) * 0.06
            + extraX * 0.1 + exit.yaw * arc,
          extraRoll,
        );
      }

      /* optical capture pass: everything except the two outer bee layers, so
         the ruby shell refracts the liquid environment *and* its own core. */
      const bee = creatures.get('bee');
      if (bee && bee.presence > 0.01 && beeShell && beeWings) {
        beeShell.visible = false;
        beeWings.visible = false;
        renderer.setRenderTarget(sceneCapture);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        beeShell.visible = true;
        beeWings.visible = true;
      }
      renderer.render(scene, camera);

      /* adaptive resolution: two sustained slow windows step the ratio down */
      frameAccumulator += delta;
      frameCount += 1;
      if (frameAccumulator > 1.4) {
        const average = frameAccumulator / frameCount;
        frameAccumulator = 0;
        frameCount = 0;
        if (average > 0.0235 && downscales < 2 && pixelRatio > 0.85) {
          downscales += 1;
          pixelRatio = Math.max(0.85, pixelRatio - 0.25);
          renderer.setPixelRatio(pixelRatio);
          resize();
        }
      }
    });

    return () => {
      disposed = true;
      if (deferredIdle !== undefined) window.cancelIdleCallback(deferredIdle);
      if (deferredTimer !== undefined) clearTimeout(deferredTimer);
      renderer.setAnimationLoop(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      for (const mixer of mixers) mixer.stopAllAction();
      for (const creature of creatures.values()) disposeObject(creature.root);
      beeMaterialSet?.dispose();
      liquid.dispose();
      environment.dispose();
      sceneCapture.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="explore-canvas" ref={hostRef} aria-hidden="true">
      <div className="visual-loader"><span />Đang mở phòng thí nghiệm 3D…</div>
    </div>
  );
}
