'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  createProceduralEnvironment,
  exploreEnvironmentPalette,
  oceanEnvironmentPalette,
  specimenEnvironmentPalette,
  type ProceduralEnvironment,
} from '../lib/three/environment';
import { createLiquidSurface, liquidPalette, type LiquidPalette } from '../lib/three/liquid';
import type { BeeMaterialSet } from '../lib/three/beeOptics';
import {
  createBeeCreature,
  createCreatureLoader,
  createFishCreature,
  createJellyfishCreature,
  loadBeeAssets,
  CREATURE_ASSETS,
  type CreatureHandle,
} from '../lib/three/creatures';
import { createVisibilityGate } from '../lib/three/visibility';
import { createOceanWorld, type OceanWorld } from '../lib/ocean/scene';
import { OCEAN_CAMERA, oceanFovFor } from '../lib/ocean/camera';
import { frameSubject, seabedSafeY, SUBJECT_STAGES, type SubjectPlacement } from '../lib/ocean/stage';
import { createWaterlinePass } from '../lib/three/waterline';
import { createOceanBloomPass } from '../lib/three/oceanBloom';
import { creatureWeights, diveFor, waterbandFor, waterlineFor } from '../lib/story/clock';
import { clearSubjectRect, subjectRect } from '../lib/story/subject';

type ExploreCanvasProps = {
  /**
   * Continuous scroll position across the four Explore panels, 0 to 3.
   * A ref, not state: this changes every frame and re-rendering React on each
   * one would cost more than the whole scene does.
   */
  progressRef: { current: number };
  beeMode: number;
};

type CreatureKey = 'bee' | 'fish' | 'jelly';

/**
 * ONE renderer, ONE canvas, TWO worlds.
 *
 * The story is a single journey from a flower valley to a reef, and the two
 * halves cannot share a camera: the land camera is choreographed across the hero
 * and chapter 01, while the ocean camera is a hand-approved constant that
 * nothing is allowed to move. So the renderer draws each into its own target
 * and `lib/three/waterline.ts` joins them under a travelling water surface —
 * the brief's second permitted architecture, and here the only honest one.
 *
 * The double cost is paid only where it buys something. Outside the crossing
 * exactly one world exists and it is rendered straight to the canvas with no
 * targets and no composite at all; the two targets are allocated the first time
 * the surface is actually in frame.
 *
 *   land scene    ivory studio, liquid backdrop plate, the bee
 *   ocean scene   Blue Marine reef, and the fish and jellyfish inside it
 *
 * Both are driven by one number — the panel position `ExploreStory` writes —
 * through the pure functions in `lib/story/clock.ts`. Nothing here is a
 * one-shot: scroll up and the dive runs backwards because there is no state
 * that could be left behind.
 */

type Placement = { x: number; y: number; z: number; scale: number; yaw: number; pitch: number };

const place = (x: number, y: number, z: number, scale: number, yaw = 0, pitch = 0): Placement => ({
  x, y, z, scale, yaw, pitch,
});

/**
 * How wide each creature is in world units at `scale: 1` — the `targetSize`
 * handed to the builders below. Needed up here because the narrow-viewport fit
 * has to know how much room a creature asks for before deciding how much to
 * give it.
 */
const CREATURE_SPAN: Record<CreatureKey, number> = { bee: 3.6, fish: 3.15, jelly: 3.42 };

/* --------------------------------------------------------------------- land --- */

type LandShot = { position: THREE.Vector3; target: THREE.Vector3; fov: number; roll: number };

/**
 * The land camera, as three stations along the panel axis.
 *
 * 0 and 1 are the hero and the anatomy chapter and are unchanged. 2 is new: it
 * is where the camera has got to by the time the water has closed over it —
 * lower, tipped down and a little wider, so the last land frames read as the eye
 * *sinking* rather than as a still picture with blue arriving over it. Nothing
 * past station 2 is ever visible, because the surface is above the frame by then.
 */
const LAND_SHOTS: LandShot[] = [
  /* Hero. The bee sits right of centre with the left half clear for the
     proposition. */
  { position: new THREE.Vector3(0.16, 0.2, 6.55), target: new THREE.Vector3(0.86, 0.02, 0), fov: 33, roll: 0 },
  /* Study. Same creature, closer and turned, and far enough left that the copy
     column in twelfths 7–12 is never crossed. */
  { position: new THREE.Vector3(-0.6, 0.12, 6.05), target: new THREE.Vector3(-1.16, -0.02, 0), fov: 31, roll: 0.015 },
  /* Submerging. */
  { position: new THREE.Vector3(-0.7, -0.62, 6.5), target: new THREE.Vector3(-1.2, -1.1, 0), fov: 36.5, roll: 0.026 },
];

/**
 * The bee's two marks.
 *
 * `yaw` is the one number the brief names directly, and it is set on both marks
 * rather than only on the hero — a bee that is three-quarter in the hero and
 * head-on one chapter later has not been re-oriented, it has been re-oriented
 * and then undone.
 *
 * The hero was -0.52: near-frontal, all head and very little animal. At -0.80
 * the creature turns onto its own left far enough that the thorax and the first
 * third of the abdomen come into frame and the wing root reads as an attachment
 * rather than a silhouette, while the head stays turned enough toward the lens
 * to remain the focal point. A capture at -0.86 confirmed the other limit: the
 * abdomen starts running off the right edge, which is why `x` also comes in from
 * 1.62 to 1.46 and the scale from 1.12 to 1.08. Past about -1.1 it is side-on
 * and the compound eye stops being legible.
 *
 * The study mark turns the same way for the same reason, from 0.42 to 0.66 —
 * the sign is opposite because by then the creature has crossed the frame and is
 * being seen from its other side.
 */
const BEE_MARKS = {
  hero: place(1.46, 0.16, 0.1, 1.08, -0.8, -0.05),
  study: place(-2.48, -0.02, 0.2, 0.99, 0.66, -0.02),
};

/** Where the bee goes when it leaves: up and out, ahead of the water. */
const BEE_EXIT = { x: 4.6, y: 2.4, z: 0.6, yaw: -0.7 };

/**
 * Backdrop palettes.
 *
 * Stations 0 and 1 are the bright ivory studio the bee was lit against. Station
 * 2 is the cooling: still light, but the warmth has gone out of it and the
 * secondary has turned to a pale sea-glass green. The composite adds its own
 * grade on top; this is the half that has to happen in the *scene*, because the
 * bee's refraction shell samples this plate and would otherwise keep refracting
 * a warm room while the water rose.
 */
const LAND_PALETTES: LiquidPalette[] = [
  liquidPalette(0xfffdf9, 0xf8ecdf, 0xfae0d3, 0xfff2e8, 0xf3e7f3),
  liquidPalette(0xfffcf7, 0xf7e8d8, 0xf9dcce, 0xffefe3, 0xf1e4f2),
  /*
   * Descending gets DARKER, not paler.
   *
   * The first version of this stop was a very light sea-glass, on the reasoning
   * that the ivory should "cool". The capture at dive 0.39 showed what that
   * actually produces: a near-white field with a ghost of a bee in it, which is
   * the washed transition frame in the feedback video. Light attenuates with
   * depth — so the last land station is a deeper, more saturated glass, and the
   * exposure comes down with it. That also gives the refractive shell something
   * to be seen against; a white bee on a white sky is invisible however opaque
   * the material is.
   */
  liquidPalette(0xb4d2dc, 0x8fbecd, 0x63a2b8, 0xa4cdd6, 0x4f88a6),
];

type SceneLight = {
  key: number;
  keyColor: THREE.Color;
  cyan: number;
  pink: number;
  ambient: number;
  exposure: number;
};

const LAND_LIGHTING: SceneLight[] = [
  { key: 2.45, keyColor: new THREE.Color(0xfff6ec), cyan: 3.2, pink: 2.6, ambient: 1.06, exposure: 0.99 },
  { key: 2.4, keyColor: new THREE.Color(0xfff4e9), cyan: 3.4, pink: 2.5, ambient: 1.04, exposure: 0.98 },
  { key: 1.65, keyColor: new THREE.Color(0xd8eeff), cyan: 4.2, pink: 1.4, ambient: 0.88, exposure: 0.9 },
];

/** Tone-mapping exposure once the ocean owns the frame. */
const OCEAN_EXPOSURE = 1.06;

/* -------------------------------------------------------------------- ocean --- */

/**
 * Where each educational subject stands in the approved frame.
 *
 * Expressed in the *camera's own* axes — `x` right, `y` up, `distance` forward —
 * because the camera is a constant and the subjects are composed against it.
 * A rig node carrying the approved camera's transform turns these into world
 * space, so the numbers here mean the same thing they meant on the land stage.
 *
 * The two marks are on opposite sides on purpose, and it is the copy that
 * decides which: chapter 02's column is twelfths 7–12, so the fish takes the
 * left; chapter 03's is 1–5, so the jellyfish takes the right. That is also the
 * whole of the ocean-readability answer — the reef behind each block of copy is
 * the corridor between the banks rather than the banks themselves.
 */
type OceanMark = {
  distance: number;
  x: number;
  y: number;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
};

const OCEAN_MARKS: Record<'fish' | 'jelly', OceanMark> = {
  fish: { ...SUBJECT_STAGES.fish, y: seabedSafeY(SUBJECT_STAGES.fish) },
  jelly: { ...SUBJECT_STAGES.jelly, y: seabedSafeY(SUBJECT_STAGES.jelly) },
};

/**
 * The live placement, recomputed only when the aspect ratio changes.
 *
 * `frameSubject` allocates — it projects a probe point to apply the seabed
 * clamp — and the render loop that reads it runs during the crossing, which is
 * measured for allocations. A resize is the only event that can change the
 * answer, so the answer is cached against the aspect that produced it and the
 * loop pays nothing.
 */
const FRAMED: Record<'fish' | 'jelly', SubjectPlacement> = {
  fish: { scale: 1, x: 0, y: 0 },
  jelly: { scale: 1, x: 0, y: 0 },
};
let framedAspect = -1;

function framedFor(key: 'fish' | 'jelly', aspect: number): SubjectPlacement {
  if (aspect !== framedAspect) {
    framedAspect = aspect;
    const fov = oceanFovFor(aspect);
    for (const subject of ['fish', 'jelly'] as const) {
      const next = frameSubject(subject, aspect, fov);
      FRAMED[subject].scale = next.scale;
      FRAMED[subject].x = next.x;
      FRAMED[subject].y = next.y;
    }
  }
  return FRAMED[key];
}

/**
 * Exits, in the same camera-local axes.
 *
 * A subject at zero presence is off the mark and further into the haze; at full
 * presence it is exactly on it. Because the offset is scaled by `1 - presence`
 * and presence is a pure function of scroll, arriving and leaving are the same
 * arc walked in opposite directions — the fish resolves out of the fog on the
 * way down and recedes back into it on the way up.
 */
const OCEAN_EXITS: Record<'fish' | 'jelly', { x: number; y: number; z: number; yaw: number }> = {
  fish: { x: -2.6, y: -0.35, z: -3.4, yaw: 0.42 },
  jelly: { x: 1.9, y: -2.2, z: -2.8, yaw: 0.3 },
};

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How long the bee takes to fly in, in seconds. */
const BEE_ENTRY_SECONDS = 2.6;
/** Where the bee starts: off the right edge, high, and closer to camera. */
const beeEntry = { x: 6.4, y: 1.35 };

export function ExploreCanvas({ progressRef, beeMode }: ExploreCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const beeModeRef = useRef(beeMode);
  // Held in a ref of our own so the scene effect can stay on an empty dependency
  // list: the renderer, the loaders and the models must survive a prop change,
  // and rebuilding them because an identity changed would restart the download.
  const progressSource = useRef(progressRef);

  useEffect(() => { progressSource.current = progressRef; }, [progressRef]);
  useEffect(() => { beeModeRef.current = beeMode; }, [beeMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const story = host.closest('.explore-story') as HTMLElement | null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = window.matchMedia('(max-width: 780px)').matches;

    /* ================================================================ land === */
    const landScene = new THREE.Scene();
    const landCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    landCamera.position.copy(LAND_SHOTS[0].position);
    landScene.add(landCamera);

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

    const landEnvironment = createProceduralEnvironment(renderer, exploreEnvironmentPalette);
    landScene.environment = landEnvironment.texture;

    /* --------------------------------------------------------- liquid stage --- */
    const liquid = createLiquidSurface({
      palette: LAND_PALETTES[0],
      simScale: compact ? 0.16 : 0.24,
      simulate: !reduceMotion,
      planeWidth: 2,
      planeHeight: 2,
    });
    // Parented to the camera: the choreography moves the camera constantly, and
    // the environment has to stay a full-frame backdrop through all of it.
    liquid.mesh.position.set(0, 0, -24);
    liquid.mesh.renderOrder = -50;
    landCamera.add(liquid.mesh);
    const activePalette = {
      mist: LAND_PALETTES[0].mist.clone(),
      primary: LAND_PALETTES[0].primary.clone(),
      secondary: LAND_PALETTES[0].secondary.clone(),
      accent: LAND_PALETTES[0].accent.clone(),
      deep: LAND_PALETTES[0].deep.clone(),
    };
    const paletteTarget = {
      mist: new THREE.Color(),
      primary: new THREE.Color(),
      secondary: new THREE.Color(),
      accent: new THREE.Color(),
      deep: new THREE.Color(),
    };
    const keyColorTarget = new THREE.Color();

    // Mipmapped on purpose: the bee shell reads its refraction with an explicit
    // LOD so surface roughness blurs what is behind the glass.
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
    landScene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xfff1fb, 2.0);
    keyLight.position.set(-3.4, 4.8, 5.2);
    landScene.add(keyLight);
    const cyanLight = new THREE.PointLight(0x74ecff, 7.6, 14, 2);
    cyanLight.position.set(3.4, 1.7, 2.6);
    landScene.add(cyanLight);
    const pinkLight = new THREE.PointLight(0xff5aae, 4.8, 11, 2);
    pinkLight.position.set(-2.6, -1.9, 2.3);
    landScene.add(pinkLight);
    const rimLight = new THREE.DirectionalLight(0xbfe9ff, 1.1);
    rimLight.position.set(4.2, -1.2, -4.5);
    landScene.add(rimLight);

    /* ------------------------------------------------------------ transition --- */
    const waterline = createWaterlinePass();
    const oceanBloom = createOceanBloomPass(compact);
    const targetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
    } as const;
    let landTarget: THREE.WebGLRenderTarget | null = null;
    let oceanTarget: THREE.WebGLRenderTarget | null = null;
    /* Four pixels is enough to compile a shader and upload a quad. */
    const warmScratch = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    const ensureTargets = () => {
      if (landTarget) return;
      landTarget = new THREE.WebGLRenderTarget(renderWidth, renderHeight, targetOptions);
      landTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
      oceanTarget = new THREE.WebGLRenderTarget(renderWidth, renderHeight, targetOptions);
      oceanTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    };

    /* -------------------------------------------------------------- creatures --- */
    let bee: CreatureHandle | undefined;
    let beePresence = 0;
    let beeActions: THREE.AnimationAction[] = [];
    let beeMaterialSet: BeeMaterialSet | undefined;
    let beeShell: THREE.SkinnedMesh | undefined;
    let beeWings: THREE.SkinnedMesh | undefined;
    let beeMaps: THREE.Texture[] = [];
    /** Root-local bounding-box corners, for the per-frame screen projection. */
    let beeCorners: THREE.Vector3[] = [];
    const cornerScratch = new THREE.Vector3();
    const mixers: THREE.AnimationMixer[] = [];

    let ocean: OceanWorld | null = null;
    let oceanEnvironment: ProceduralEnvironment | null = null;
    let specimenEnvironment: ProceduralEnvironment | null = null;
    let oceanRig: THREE.Group | null = null;
    let fish: CreatureHandle | undefined;
    let jelly: CreatureHandle | undefined;
    let fishPresence = 0;
    let jellyPresence = 0;
    /** Handed to the ocean every frame; see the call site. */
    const oceanPresence = { fish: 0, jelly: 0 };

    let renderWidth = 1;
    let renderHeight = 1;
    let disposed = false;

    const loader = createCreatureLoader();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const configureBee = async () => {
      const assets = await loadBeeAssets(loader, maxAnisotropy);
      if (disposed) return;
      beeMaps = [assets.normalMap, assets.ormMap];
      const handle = createBeeCreature(assets.gltf, {
        normalMap: assets.normalMap,
        ormMap: assets.ormMap,
        sceneTexture: sceneCapture.texture,
        resolution: new THREE.Vector2(renderWidth, renderHeight),
        targetSize: CREATURE_SPAN.bee,
        anchorRootMotion: true,
      });
      beeMaterialSet = handle.materials;
      beeShell = handle.opticalLayers?.shell;
      beeWings = handle.opticalLayers?.wings;
      beeActions = handle.actions ?? [];
      handle.root.visible = false;
      landScene.add(handle.root);
      if (handle.mixer) mixers.push(handle.mixer);
      bee = handle;
      /*
       * The creature's own bounds, in the root's local space, captured once.
       *
       * The flower field needs to know where the bee IS on screen, not where a
       * hand-authored ellipse guessed it would be. Eight corners transformed by
       * the root matrix and projected each frame is exact and costs nothing; a
       * bounding sphere would have been cheaper and much too generous, because
       * this creature is mostly wing.
       */
      const bounds = new THREE.Box3().setFromObject(handle.root);
      handle.root.updateWorldMatrix(true, true);
      const inverse = new THREE.Matrix4().copy(handle.root.matrixWorld).invert();
      bounds.applyMatrix4(inverse);
      beeCorners = [
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
        new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
        new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
      ];
      // Starts on the fly clip: the very first thing the bee does is fly in.
      beeActions[2]?.reset().fadeIn(0.01).play();
      host.dataset.ready = 'true';
    };

    /*
     * The ocean is warmed, not loaded on demand.
     *
     * Everything the reef needs — the layout, five GLBs, six KTX2 textures and
     * the Basis transcoder — is fetched, decoded, instanced and *compiled* while
     * the visitor is still in the hero, so that by the time the surface starts
     * rising there is nothing left to wait for. A model resolving out of the haze
     * is the effect; a model appearing because it finished downloading is the bug
     * that looks identical to it.
     */
    let oceanStarted = false;
    const startOcean = () => {
      if (oceanStarted || disposed) return;
      oceanStarted = true;
      void (async () => {
        try {
          oceanEnvironment = createProceduralEnvironment(renderer, oceanEnvironmentPalette);
          specimenEnvironment = createProceduralEnvironment(renderer, specimenEnvironmentPalette);
          const world = await createOceanWorld(renderer, oceanEnvironment.texture, { compact, reduceMotion });
          if (disposed) { world.dispose(); return; }
          /*
           * The ocean camera has to be told the shape of the window it is about
           * to render into, and until now nothing ever told it.
           *
           * `createOceanWorld` builds its camera at aspect 1 as a placeholder,
           * and the only caller of `resize` is the window listener — which has
           * already fired its initial pass by the time this await resolves, and
           * does not fire again unless the visitor drags the window. So every
           * ocean frame was projected through a square frustum and stretched to
           * fill a 16:9 canvas: a 1.78x horizontal smear over the reef, the
           * megafauna and both educational subjects. That is the whole of the
           * "everything looks flattened" defect in the annotated captures, and
           * it is one line.
           */
          world.resize(landCamera.aspect);
          ocean = world;
          /*
           * A node carrying the approved camera's transform, so a subject mark
           * can be written in the frame's own axes.
           *
           * Built from `Matrix4.lookAt` rather than `Object3D.lookAt`, and the
           * difference is not cosmetic: for anything that is not a camera or a
           * light, `Object3D.lookAt` points **+Z** at the target, so a child
           * placed at local `-distance` on Z — the camera convention every mark
           * here is written in — ends up exactly that far *behind* the lens.
           * Which is where the fish and the jellyfish were.
           */
          const rig = new THREE.Group();
          rig.position.copy(OCEAN_CAMERA.position);
          rig.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().lookAt(OCEAN_CAMERA.position, OCEAN_CAMERA.target, new THREE.Vector3(0, 1, 0)),
          );
          world.scene.add(rig);
          oceanRig = rig;

          const [fishGltf, jellyGltf] = await Promise.all([
            loader.gltf.loadAsync(CREATURE_ASSETS.fish),
            loader.gltf.loadAsync(CREATURE_ASSETS.jellyfish),
          ]);
          if (disposed) return;
          fish = createFishCreature(fishGltf, {
            targetSize: CREATURE_SPAN.fish,
            finish: 'ocean',
            maxAnisotropy,
            environment: specimenEnvironment.texture,
          });
          jelly = createJellyfishCreature(jellyGltf, {
            targetSize: CREATURE_SPAN.jelly,
            // Phones get the blended path: three sorts transmissive and
            // transparent objects into separate passes, so either all three
            // membranes are transmissive or none of them is.
            transmissive: !compact,
            finish: 'ocean',
            maxAnisotropy,
            environment: specimenEnvironment.texture,
          });
          fish.root.visible = false;
          jelly.root.visible = false;
          rig.add(fish.root, jelly.root);
          if (fish.mixer) mixers.push(fish.mixer);
          if (jelly.mixer) mixers.push(jelly.mixer);

          /*
           * Warm everything the crossing will need, before the crossing.
           *
           * `renderer.compile` builds the programs, and that alone is not
           * enough. Three allocates lazily in several other places, and every
           * one of them would land on the first visible ocean frame — which is
           * the exact moment the brief says must not stutter:
           *
           *   - the two composite render targets, sized to the full drawing
           *     buffer, are created the first time the waterline pass runs;
           *   - the transmission buffer the jellyfish's refraction samples is
           *     allocated by three on the first frame a transmissive material is
           *     actually drawn — not when it is compiled;
           *   - the KTX2 and WebP textures are only uploaded to the GPU on first
           *     draw, not on load.
           *
           * So the warm-up renders one real frame of the ocean, with both
           * subjects present, into an offscreen target. It costs a single frame
           * while the visitor is still up in the meadow, and it means the first
           * frame they actually see has nothing left to allocate.
           */
          renderer.compile(world.scene, world.camera);
          ensureTargets();
          if (landTarget && oceanTarget) {
            const previous = [fish.root.visible, jelly.root.visible] as const;
            fish.root.visible = true;
            jelly.root.visible = true;
            /*
             * Both presence states, because they are different PROGRAMS.
             *
             * A creature at full presence is opaque and a creature mid-crossfade
             * is blended, and `setPresence` flips `transparent` and marks the
             * material for re-initialisation. Warming only the settled state left
             * six shaders to compile at the exact moment the fish faded in —
             * measured, not assumed, by diffing `renderer.info.programs` across
             * the crossing.
             */
            for (const presence of [0.5, 1]) {
              fish.setPresence(presence);
              jelly.setPresence(presence);
              renderer.setRenderTarget(oceanTarget);
              renderer.render(world.scene, world.camera);
            }
            /* Compile and allocate the HDR extract/blur/composite while the
               visitor is still in the meadow, exactly like the waterline pass. */
            oceanBloom.render(renderer, oceanTarget.texture, 0.88, OCEAN_EXPOSURE, warmScratch);
            /* The land half, including the bee's own blended variant, so the way
               back up is warm too. */
            const beePresence = bee ? 1 : 0;
            for (const presence of [0.5, 1]) {
              bee?.setPresence(presence);
              renderer.setRenderTarget(landTarget);
              renderer.render(landScene, landCamera);
            }
            bee?.setPresence(beePresence);

            /*
             * And the composite itself. It is a `RawShaderMaterial` with its own
             * full-screen quad, so both its program and its geometry are created
             * on first draw — which would otherwise be the first frame of the
             * water surface appearing.
             */
            waterline.uniforms.uLand.value = landTarget.texture;
            waterline.uniforms.uOcean.value = oceanTarget.texture;
            waterline.uniforms.uOceanBloom.value = oceanBloom.texture;
            waterline.uniforms.uBloomStrength.value = 0.88;
            renderer.setRenderTarget(warmScratch);
            renderer.render(waterline.scene, waterline.camera);

            renderer.setRenderTarget(null);
            fish.root.visible = previous[0];
            jelly.root.visible = previous[1];
            host.dataset.oceanWarm = 'true';
          }
        } catch (error) {
          console.error('[ocean] world failed to load', error);
          host.dataset.oceanError = 'true';
        }
      })();
    };

    let deferredIdle: number | undefined;
    let deferredTimer: ReturnType<typeof setTimeout> | undefined;
    void configureBee()
      .catch((error) => {
        console.error('Bee scene failed to load', error);
        host.dataset.error = 'true';
        const label = host.querySelector('.visual-loader');
        if (label) label.textContent = 'Không thể tải mô hình 3D';
      })
      .finally(() => {
        if (disposed) return;
        if ('requestIdleCallback' in window) {
          deferredIdle = window.requestIdleCallback(startOcean, { timeout: 900 });
        } else {
          deferredTimer = setTimeout(startOcean, 240);
        }
      });

    /*
     * The hero's botanical world is not in this scene.
     *
     * It is `FlowerValleyLayer` — a Canvas2D field of photographic sprites over
     * this canvas. What it gives up by living above the WebGL frame is the bee's
     * refraction; what it gains is actual flowers. During the crossing it reads
     * the same `lib/story/clock.ts` this file does, so it sinks and is clipped by
     * the same water surface the composite draws, to the pixel.
     */

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
      const aspect = viewportWidth / viewportHeight;
      landCamera.aspect = aspect;
      landCamera.updateProjectionMatrix();
      ocean?.resize(aspect);
      renderer.setSize(viewportWidth, viewportHeight, false);
      const ratio = renderer.getPixelRatio();
      renderWidth = Math.floor(viewportWidth * ratio);
      renderHeight = Math.floor(viewportHeight * ratio);
      liquid.setSize(viewportWidth, viewportHeight, ratio);
      // Fit the backdrop to a frustum wider than any shot uses, so the plate
      // still covers the frame while the choreography dollies the fov.
      const distance = 24;
      const half = Math.tan(THREE.MathUtils.degToRad(20)) * distance;
      liquid.mesh.scale.set(half * landCamera.aspect, half, 1);
      sceneCapture.setSize(
        Math.max(1, Math.floor(renderWidth * 0.8)),
        Math.max(1, Math.floor(renderHeight * 0.8)),
      );
      landTarget?.setSize(renderWidth, renderHeight);
      oceanTarget?.setSize(renderWidth, renderHeight);
      oceanBloom.setSize(renderWidth, renderHeight);
      waterline.uniforms.uAspect.value = aspect;
      beeMaterialSet?.optical.uSceneResolution.value.set(renderWidth, renderHeight);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const gate = createVisibilityGate(host.closest('.explore-story') ?? host, 200);
    let documentVisible = document.visibilityState !== 'hidden';
    const onVisibility = () => { documentVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    /* ------------------------------------------------------------------ loop --- */
    const cameraPosition = LAND_SHOTS[0].position.clone();
    const cameraTarget = LAND_SHOTS[0].target.clone();
    const desiredCamera = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const shotPosition = new THREE.Vector3();
    const shotTarget = new THREE.Vector3();
    const beeLayout: Placement = { ...BEE_MARKS.hero };
    let cameraFov = LAND_SHOTS[0].fov;
    let cameraRoll = LAND_SHOTS[0].roll;
    // Damped copy of the scroll position. The raw value can jump on a wheel
    // flick or an anchor jump; the crossing has to survive both.
    let smoothProgress = 0;
    let entryStart = -1;
    let entryEase = 0;
    let beeFlightState = 2;
    let paintedDive = -1;
    let worstFrame = 0;
    let frameAccumulator = 0;
    let frameCount = 0;
    let downscales = 0;
    /* QA hook: collapse every damped value onto its target on the next frame. */
    let snapFrames = 0;
    const timer = new THREE.Timer();

    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!gate.visible() || !documentVisible) return;
      const elapsed = timer.getElapsed();
      const motionTime = reduceMotion ? 0 : elapsed;

      const target = Math.min(3, Math.max(0, progressSource.current.current));
      const snapping = snapFrames > 0;
      if (snapping) snapFrames -= 1;
      smoothProgress = snapping
        ? target
        : smoothProgress + (target - smoothProgress) * (1 - Math.pow(0.0025, delta));
      const progress = smoothProgress;
      if (!oceanStarted && progress > 0.25) startOcean();

      const dive = diveFor(progress);
      const weights = creatureWeights(progress);
      const blend = snapping ? 1 : 1 - Math.pow(0.006, delta);
      const presenceBlend = snapping ? 1 : 1 - Math.pow(0.004, delta);

      /* The DOM reads the dive too — chapters 02 and 03 have to move their type
         from ink on ivory to ivory on deep blue across the same crossing. Written
         only when it actually moves, so a settled chapter costs no style recalc. */
      if (story && Math.abs(dive - paintedDive) > 0.008) {
        paintedDive = dive;
        story.style.setProperty('--dive', dive.toFixed(3));
      }

      /* ----------------------------------------------------------- land shot --- */
      const landStop = Math.min(LAND_SHOTS.length - 1, Math.max(0, progress));
      const lower = Math.min(LAND_SHOTS.length - 2, Math.floor(landStop));
      const span = landStop - lower;
      const mix = span * span * (3 - 2 * span);
      const shotA = LAND_SHOTS[lower];
      const shotB = LAND_SHOTS[lower + 1];
      const lightA = LAND_LIGHTING[lower];
      const lightB = LAND_LIGHTING[lower + 1];
      const paletteA = LAND_PALETTES[lower];
      const paletteB = LAND_PALETTES[lower + 1];

      const mobileFrame = viewportWidth < 780 ? 0.22 : 1;
      shotPosition.copy(shotA.position).lerp(shotB.position, mix);
      shotTarget.copy(shotA.target).lerp(shotB.target, mix);
      const shotFov = shotA.fov + (shotB.fov - shotA.fov) * mix;
      desiredCamera.set(
        shotPosition.x * mobileFrame + (pointer.x - 0.5) * 0.5 + Math.sin(motionTime * 0.11) * 0.16,
        shotPosition.y + (pointer.y - 0.5) * 0.3 + Math.cos(motionTime * 0.083) * 0.1,
        shotPosition.z + Math.sin(motionTime * 0.062) * 0.18,
      );
      desiredTarget.set(shotTarget.x * mobileFrame, shotTarget.y, shotTarget.z);
      const shotRoll = shotA.roll + (shotB.roll - shotA.roll) * mix;
      cameraPosition.lerp(desiredCamera, blend);
      cameraTarget.lerp(desiredTarget, blend);
      cameraFov += (shotFov - cameraFov) * blend;
      cameraRoll += (shotRoll - cameraRoll) * blend;
      landCamera.position.copy(cameraPosition);
      landCamera.lookAt(cameraTarget);
      if (Math.abs(cameraRoll) > 1e-4) landCamera.rotateZ(cameraRoll);
      if (Math.abs(landCamera.fov - cameraFov) > 0.008) {
        landCamera.fov = cameraFov;
        landCamera.updateProjectionMatrix();
      }

      /* --------------------------------------------------- light and palette --- */
      const lerp = (a: number, b: number) => a + (b - a) * mix;
      hemisphere.intensity += (lerp(lightA.ambient, lightB.ambient) - hemisphere.intensity) * blend;
      keyLight.intensity += (lerp(lightA.key, lightB.key) - keyLight.intensity) * blend;
      keyColorTarget.copy(lightA.keyColor).lerp(lightB.keyColor, mix);
      keyLight.color.lerp(keyColorTarget, blend);
      cyanLight.intensity += (lerp(lightA.cyan, lightB.cyan) - cyanLight.intensity) * blend;
      pinkLight.intensity += (lerp(lightA.pink, lightB.pink) - pinkLight.intensity) * blend;
      rimLight.intensity += ((1.1 + weights.bee * 0.45) - rimLight.intensity) * blend;
      /* One exposure for the whole frame, ramped across the crossing and handed
         to the composite as well, so the two halves are graded by the same curve
         and the hand-off at dive 0 and dive 1 is invisible. */
      const exposure = lerp(lightA.exposure, lightB.exposure) * (1 - dive) + OCEAN_EXPOSURE * dive;
      renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * blend;
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
      if (dive < 0.999) {
        liquid.step(renderer, delta, elapsed, pointer, pointerVelocity, reduceMotion ? impulse * 0.2 : impulse);
      }

      /* ---------------------------------------------------------------- bee --- */
      if (beeActions.length) {
        if (entryStart < 0) entryStart = elapsed;
        const entryRaw = reduceMotion || snapping ? 1 : Math.min(1, (elapsed - entryStart) / BEE_ENTRY_SECONDS);
        entryEase = 1 - Math.pow(1 - entryRaw, 3);
        const arriving = entryRaw > 0.72;
        const leaving = beePresence < 0.985 && smoothProgress > 0.6;
        const desired = !arriving ? 2 : leaving ? 2 : Math.max(0, Math.min(2, beeModeRef.current));
        if (desired !== beeFlightState) {
          const fade = beeFlightState === 2 && desired !== 2 ? 0.85 : 0.4;
          beeActions[beeFlightState]?.fadeOut(fade);
          beeActions[desired]?.reset().setEffectiveWeight(1).fadeIn(fade).play();
          beeFlightState = desired;
        }
      }
      for (const mixer of mixers) mixer.update(reduceMotion ? 0 : delta);
      if (beeMaterialSet) {
        beeMaterialSet.optical.uTime.value = elapsed;
        beeMaterialSet.optical.uLightDir.value.copy(keyLight.position).normalize();
      }

      const mobile = viewportWidth < 780;
      const landFrameH = 2 * Math.tan((cameraFov * Math.PI) / 360) * cameraPosition.distanceTo(cameraTarget);
      const landFrameW = landFrameH * landCamera.aspect;

      if (bee) {
        beePresence += (weights.bee - beePresence) * presenceBlend;
        if (weights.bee < 0.004 && beePresence < 0.004) beePresence = 0;
        const visible = beePresence > 0.002 && dive < 0.995;
        if (bee.root.visible !== visible) bee.root.visible = visible;
        if (visible) {
          /*
           * Opacity is NOT the presence.
           *
           * `beePresence` also drives the exit arc, and using it directly meant
           * the creature was already half transparent while it was still on
           * screen — at 0.76 the capture showed a ghost hovering over the meadow.
           * The brief's read is that the bee *leaves*, so the material holds full
           * opacity for most of the departure and only gives way at the very end,
           * by which point the arc has taken it off the top of the frame anyway.
           */
          bee.setPresence(smoothstep(0, 0.4, beePresence));
          const beeMix = smoothstep(0, 1, Math.min(1, Math.max(0, progress)));
          const hero = BEE_MARKS.hero;
          const study = BEE_MARKS.study;
          beeLayout.x = hero.x + (study.x - hero.x) * beeMix;
          beeLayout.y = hero.y + (study.y - hero.y) * beeMix;
          beeLayout.z = hero.z + (study.z - hero.z) * beeMix;
          beeLayout.scale = hero.scale + (study.scale - hero.scale) * beeMix;
          beeLayout.yaw = hero.yaw + (study.yaw - hero.yaw) * beeMix;
          beeLayout.pitch = hero.pitch + (study.pitch - hero.pitch) * beeMix;

          const recede = 1 - beePresence;
          const arc = recede * recede;
          const entering = 1 - entryEase;
          const bend = entering * (2 - entering);
          let extraX = beeEntry.x * entering;
          let extraY = beeEntry.y * bend;
          let extraRoll = -0.22 * entering;
          const flying = beeFlightState === 2 && !reduceMotion;
          if (flying) {
            extraX += Math.sin(motionTime * 0.78) * 0.34;
            extraY += Math.sin(motionTime * 1.56) * 0.2;
            extraRoll += -Math.sin(motionTime * 0.78) * 0.07;
          }
          const motionScale = beeFlightState === 0 ? 1 : 0.94;
          let fit = 1;
          let lift = 0;
          if (mobile) {
            const spanW = beeLayout.scale * CREATURE_SPAN.bee;
            fit = Math.min(1, (landFrameW * 0.86) / spanW, (landFrameH * 0.5) / spanW);
            lift = landFrameH * 0.2;
          }
          bee.root.position.set(
            beeLayout.x * (mobile ? 0.12 : 1) + extraX + BEE_EXIT.x * arc,
            beeLayout.y + Math.sin(motionTime * 0.62) * 0.09 + extraY + BEE_EXIT.y * arc + lift,
            beeLayout.z + BEE_EXIT.z * arc - recede * 1.1,
          );
          bee.root.scale.setScalar(beeLayout.scale * fit * motionScale * (1 - recede * 0.14));
          bee.root.rotation.set(
            beeLayout.pitch + (pointer.y - 0.5) * -0.07,
            beeLayout.yaw + (pointer.x - 0.5) * 0.16 + Math.sin(motionTime * 0.24) * 0.06
              + extraX * 0.1 + BEE_EXIT.yaw * arc,
            extraRoll,
          );

          /*
           * Publish the creature's screen rect for the flower field.
           *
           * This has to happen AFTER the placement above and after the matrix is
           * up to date, and it has to be the projected bounding box rather than
           * anything cheaper: the field uses it to refuse to paint over the bee,
           * so an approximation that is a little too small puts petals across the
           * thorax and one that is a little too large carves a visible hole out
           * of the valley.
           */
          if (beeCorners.length) {
            bee.root.updateWorldMatrix(false, false);
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const corner of beeCorners) {
              cornerScratch.copy(corner).applyMatrix4(bee.root.matrixWorld).project(landCamera);
              const sx = (cornerScratch.x * 0.5 + 0.5) * viewportWidth;
              const sy = (0.5 - cornerScratch.y * 0.5) * viewportHeight;
              if (sx < minX) minX = sx;
              if (sx > maxX) maxX = sx;
              if (sy < minY) minY = sy;
              if (sy > maxY) maxY = sy;
            }
            subjectRect.left = minX;
            subjectRect.top = minY;
            subjectRect.right = maxX;
            subjectRect.bottom = maxY;
            /* The land half stops being drawn at all once the surface has closed
               over it, so the field must stop excluding a creature that is no
               longer on screen. */
            subjectRect.presence = beePresence * (1 - dive);
          }
        } else {
          clearSubjectRect();
        }
      } else {
        clearSubjectRect();
      }

      /* -------------------------------------------------------------- ocean --- */
      if (ocean) {
        /* Last frame's presence, and one object reused for every frame of the
           run. The megafauna read it to decide whether they are crossing a
           subject that is actually on screen; a frame of lag on a value that
           takes half a chapter to travel is not observable, and allocating a
           fresh object here would allocate one during the crossing. */
        oceanPresence.fish = fishPresence;
        oceanPresence.jelly = jellyPresence;
        ocean.update(delta, elapsed, dive, oceanPresence);
        if (oceanRig && (fish || jelly)) {
          const aspect = landCamera.aspect;
          const marks: [CreatureHandle | undefined, OceanMark, typeof OCEAN_EXITS.fish, number, 'fish' | 'jelly'][] = [
            [fish, OCEAN_MARKS.fish, OCEAN_EXITS.fish, weights.fish, 'fish'],
            [jelly, OCEAN_MARKS.jelly, OCEAN_EXITS.jelly, weights.jelly, 'jelly'],
          ];
          for (const [handle, mark, exit, weight, key] of marks) {
            if (!handle) continue;
            const current = key === 'fish' ? fishPresence : jellyPresence;
            const next = current + (weight - current) * presenceBlend;
            const settled = weight < 0.004 && next < 0.004 ? 0 : next;
            if (key === 'fish') fishPresence = settled; else jellyPresence = settled;
            const visible = settled > 0.002;
            if (handle.root.visible !== visible) handle.root.visible = visible;
            if (!visible) continue;
            handle.setPresence(settled);

            const recede = 1 - settled;
            const arc = recede * recede;
            const placed = framedFor(key, aspect);
            const drift = key === 'fish'
              ? Math.sin(motionTime * 0.72) * 0.1
              : Math.sin(motionTime * 0.46) * 0.14;
            handle.root.position.set(
              placed.x + exit.x * arc,
              placed.y + drift + exit.y * arc,
              -mark.distance + exit.z * arc,
            );
            handle.root.scale.setScalar(placed.scale * (1 - recede * 0.1));
            handle.root.rotation.set(
              mark.pitch,
              mark.yaw + Math.sin(motionTime * 0.21) * 0.05 + exit.yaw * arc,
              mark.roll,
            );
          }
        }
      }

      const pending = dive > 0.5 && !ocean ? 'true' : 'false';
      if (host.dataset.scenePending !== pending) host.dataset.scenePending = pending;

      /* --------------------------------------------------------------- draw --- */
      const wantsLand = dive < 0.998;
      const wantsOcean = dive > 0.002 && !!ocean;
      const composite = wantsLand && wantsOcean;

      waterline.uniforms.uTime.value = motionTime;
      waterline.uniforms.uDive.value = dive;
      waterline.uniforms.uLine.value = waterlineFor(dive);
      waterline.uniforms.uBand.value = waterbandFor(dive);
      waterline.uniforms.uExposure.value = renderer.toneMappingExposure;
      const bloomStrength = 0.22 + jellyPresence * 0.66;
      waterline.uniforms.uBloomStrength.value = bloomStrength;

      if (composite) {
        ensureTargets();
        drawLand(landTarget);
        renderer.setRenderTarget(oceanTarget);
        renderer.render(ocean!.scene, ocean!.camera);
        oceanBloom.prepare(renderer, oceanTarget!.texture);
        renderer.setRenderTarget(null);
        waterline.uniforms.uLand.value = landTarget!.texture;
        waterline.uniforms.uOcean.value = oceanTarget!.texture;
        waterline.uniforms.uOceanBloom.value = oceanBloom.texture;
        renderer.render(waterline.scene, waterline.camera);
      } else if (wantsOcean) {
        ensureTargets();
        renderer.setRenderTarget(oceanTarget);
        renderer.render(ocean!.scene, ocean!.camera);
        oceanBloom.render(
          renderer,
          oceanTarget!.texture,
          bloomStrength,
          renderer.toneMappingExposure,
          null,
        );
      } else {
        drawLand(null);
      }

      if (delta > worstFrame) worstFrame = delta;

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

    /**
     * The land pass, including the bee's own refraction capture.
     *
     * The capture renders the scene without the two outer bee layers so the ruby
     * shell refracts the backdrop *and* its own core. It has to happen before the
     * land pass whichever target that pass is going to.
     */
    function drawLand(target: THREE.WebGLRenderTarget | null) {
      if (bee && beePresence > 0.01 && beeShell && beeWings) {
        beeShell.visible = false;
        beeWings.visible = false;
        renderer.setRenderTarget(sceneCapture);
        renderer.render(landScene, landCamera);
        beeShell.visible = true;
        beeWings.visible = true;
      }
      renderer.setRenderTarget(target);
      renderer.render(landScene, landCamera);
      renderer.setRenderTarget(null);
    }

    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __story?: unknown }).__story = {
        /* Collapse every damped value onto its target for the next `frames`
           frames. Look-dev runs through SwiftShader at about five frames a
           second, where a settle that takes sixty frames never happens. */
        snap(frames = 3) { snapFrames = Math.max(snapFrames, frames); },
        /* Live composition surface. Mutating a mark and re-rendering is far
           faster than editing this file and reloading, and only the winner is
           ever written back. */
        /* Proof that the crossing allocates nothing: sample before and after and
           compare. A shader compiled or a texture uploaded mid-transition is the
           root cause of the jank the brief describes, and it is countable. */
        info: () => ({
          programs: renderer.info.programs?.length ?? 0,
          textures: renderer.info.memory.textures,
          geometries: renderer.info.memory.geometries,
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          worstFrameMs: Math.round(worstFrame * 1000),
        }),
        resetFrameWatch() { worstFrame = 0; },
        /*
         * Where the ocean subjects actually land on screen.
         *
         * The framing in `stage.ts` is authored as fractions of the frame, and
         * the only way to know whether a fraction was honoured is to measure the
         * projected silhouette — a model's normalised span is its BOUNDING BOX,
         * which for an animal with long fins or trailing tentacles is a good
         * deal larger than the shape a reader sees. Allocates freely: nothing
         * calls this but look-dev and the capture harness.
         */
        subjects: () => {
          if (!ocean) return null;
          const out: Record<string, unknown> = {};
          for (const [key, handle] of [['fish', fish], ['jelly', jelly]] as const) {
            if (!handle || !handle.root.visible) { out[key] = null; continue; }
            const box = new THREE.Box3().setFromObject(handle.root);
            if (box.isEmpty()) { out[key] = null; continue; }
            const point = new THREE.Vector3();
            let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
            for (let corner = 0; corner < 8; corner += 1) {
              point.set(
                corner & 1 ? box.max.x : box.min.x,
                corner & 2 ? box.max.y : box.min.y,
                corner & 4 ? box.max.z : box.min.z,
              ).project(ocean.camera);
              minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
              minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
            }
            out[key] = {
              /* Fractions of the frame: 0 is the centre, ±0.5 the edges. */
              cx: +((minX + maxX) / 4).toFixed(4),
              cy: +((minY + maxY) / 4).toFixed(4),
              w: +((maxX - minX) / 2).toFixed(4),
              h: +((maxY - minY) / 2).toFixed(4),
              left: +(minX / 2 + 0.5).toFixed(4),
              right: +(maxX / 2 + 0.5).toFixed(4),
              top: +(0.5 - maxY / 2).toFixed(4),
              bottom: +(0.5 - minY / 2).toFixed(4),
            };
          }
          return out;
        },
        marks: OCEAN_MARKS,
        landShots: LAND_SHOTS,
        beeMarks: BEE_MARKS,
        world: () => ocean,
        state: () => ({
          progress: smoothProgress,
          dive: diveFor(smoothProgress),
          line: waterlineFor(diveFor(smoothProgress)),
          ocean: !!ocean,
          camera: ocean
            ? {
              position: ocean.camera.position.toArray().map((v) => +v.toFixed(4)),
              fov: ocean.camera.fov,
            }
            : null,
          presence: { bee: beePresence, fish: fishPresence, jelly: jellyPresence },
          exposure: +renderer.toneMappingExposure.toFixed(3),
        }),
      };
    }

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
      gate.dispose();
      for (const mixer of mixers) mixer.stopAllAction();
      bee?.dispose();
      fish?.dispose();
      jelly?.dispose();
      for (const map of beeMaps) map.dispose();
      ocean?.dispose();
      oceanEnvironment?.dispose();
      specimenEnvironment?.dispose();
      waterline.dispose();
      oceanBloom.dispose();
      landTarget?.dispose();
      oceanTarget?.dispose();
      warmScratch.dispose();
      liquid.dispose();
      landEnvironment.dispose();
      sceneCapture.dispose();
      loader.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      story?.style.removeProperty('--dive');
      clearSubjectRect();
    };
  }, []);

  return (
    <div className="explore-canvas" ref={hostRef} aria-hidden="true">
      <div className="visual-loader"><span />Đang mở phòng thí nghiệm 3D…</div>
    </div>
  );
}
