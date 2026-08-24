'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createProceduralEnvironment, exploreEnvironmentPalette } from '../lib/three/environment';
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
import { EXPLORE_SCENES, type ExploreScene } from '../lib/exploreScenes';
import { createVisibilityGate } from '../lib/three/visibility';

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

/**
 * How wide each creature is in world units at `scale: 1`.
 *
 * These are the `targetSize` values handed to `createBeeCreature` and friends
 * below, which normalise each mesh's largest dimension to them. They are needed
 * up here because the narrow-viewport fit has to know how much room a creature
 * asks for *before* deciding how much to give it — a portrait phone frame is
 * about 2 world units wide where a laptop's is 6, so a constant mobile scale
 * either overflowed the two wide creatures or shrank the tall one to a thumbnail.
 */
const CREATURE_SPAN: Record<CreatureKey, number> = { bee: 3.6, fish: 3.15, jelly: 3.42 };

/** A camera shot. `roll` tilts the frame, which is how the jellyfish panel gets
 *  a diagonal composition instead of a very tall vertical one. */
type Shot = {
  camera: { position: THREE.Vector3; target: THREE.Vector3; fov: number; roll: number };
  layout: Placement;
};

/**
 * One creature on the track.
 *
 * The material setup itself lives in `lib/three/creatures.ts` now, because the
 * Library needs exactly the same bee, fish and jellyfish and used to render them
 * through a generic GLB viewer instead. What stays here is the only thing the
 * hero adds on top: where each one sits along the scroll and how present it is.
 */
type Creature = {
  key: CreatureKey;
  handle: CreatureHandle;
  presence: number;
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
  /*
   * Hero. The bee sits right of centre and large — a little over half the frame
   * width — with the whole left half left clear for the proposition.
   *
   * `scale: 1.12` and `y: 0.16`, up from 1.0 and 0. Twelve percent larger because
   * the hero read as underweight against its own empty frame, and the flower
   * valley that now fills the lower third makes a bee at the old size look like it
   * is standing in the meadow rather than flying over it. The lift is what
   * restores that: the creature clears the vegetation line, and the gap between
   * the two is what says "hovering".
   */
  'bee-hero': {
    camera: { position: new THREE.Vector3(0.16, 0.2, 6.55), target: new THREE.Vector3(0.86, 0.02, 0), fov: 33, roll: 0 },
    layout: place(1.62, 0.16, 0.1, 1.12, -0.52, -0.05),
  },
  /*
   * Study. Same creature, closer and turned — and moved a full unit further left
   * than it used to be.
   *
   * The copy column is columns 8–12 of the shell grid, which starts at 58% of the
   * frame. At `x = -1.58` the bee spanned roughly 12–74% of the frame, so its
   * back legs and one wing crossed into the headline, the readout and the mode
   * buttons: three text-on-text collisions in a single screen. At `x = -2.48` it
   * spans about 0–57% and the two halves never touch.
   */
  'bee-study': {
    camera: { position: new THREE.Vector3(-0.6, 0.12, 6.05), target: new THREE.Vector3(-1.16, -0.02, 0), fov: 31, roll: 0.015 },
    layout: place(-2.48, -0.02, 0.2, 0.99, 0.42, -0.02),
  },
  /*
   * Fish. Bigger and further left.
   *
   * This chapter had the worst composition on the page: the fish occupied the
   * middle of the frame at 42% of its width, which left a wide empty strip down
   * the left and put the tail fin straight through "quan sát chuyển động". It now
   * fills columns 1–6 of twelve — the camera is half a metre closer and the model
   * is 8% larger, so removing the dead strip makes the fish *more* present rather
   * than just moving the hole to the other side.
   */
  fish: {
    camera: { position: new THREE.Vector3(-0.75, 0.02, 7.05), target: new THREE.Vector3(-1.05, -0.02, 0), fov: 33, roll: -0.02 },
    layout: place(-2.53, 0.04, 0.2, 1.12, 1.36, 0.07),
  },
  /*
   * Jellyfish. Vertical subject, so the constraint is height, not width.
   *
   * Two faults here. The animal was 19% taller than the frame — the tentacles ran
   * off the bottom edge, which is what a viewer reads as "this section needs more
   * scrolling than it has". And it sat at 55% of the frame width, leaving the last
   * quarter of the screen empty next to a copy column that ends at 42%.
   *
   * Pulling the camera back to 8.2 makes the frame tall enough for the whole
   * animal and putting the model on the camera's own target height centres it
   * there, so nothing is cut. The `roll` also had to come back from -0.075 to
   * -0.05: a tilted frame costs `|sin(roll)| × half-width` of usable height at
   * top and bottom, which at 3.9 units of half-width was 0.29 — more than the
   * margin the pull-back had bought, and the bell was still clipped by the header.
   * Moving the model to `x = 2.68` fills columns 6–12: far enough right that the
   * two annotations in the last three columns have a tentacle to point at rather
   * than empty ground beside them, which is what the band on that edge had been.
   */
  jelly: {
    camera: { position: new THREE.Vector3(0.52, 0.28, 8.2), target: new THREE.Vector3(1.10, 0.24, 0), fov: 30, roll: -0.05 },
    layout: place(2.68, 0.24, 0.15, 1.08, 0.22, -0.05),
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
    let beeMaterialSet: BeeMaterialSet | undefined;
    let beeShell: THREE.SkinnedMesh | undefined;
    let beeWings: THREE.SkinnedMesh | undefined;
    let beeMaps: THREE.Texture[] = [];
    let renderWidth = 1;
    let renderHeight = 1;

    const loader = createCreatureLoader();

    const registerCreature = (key: CreatureKey, handle: CreatureHandle) => {
      handle.root.visible = false;
      scene.add(handle.root);
      creatures.set(key, { key, handle, presence: 0 });
      if (handle.mixer) mixers.push(handle.mixer);
    };

    const configureJelly = async () => {
      const gltf = await loader.gltf.loadAsync(CREATURE_ASSETS.jellyfish);
      registerCreature('jelly', createJellyfishCreature(gltf, {
        targetSize: 3.6,
        // Phones get the blended path instead: three sorts transmissive and
        // transparent objects into separate passes, so the three membranes are
        // all transmissive or none of them is.
        transmissive: !compact,
      }));
    };

    const configureFish = async () => {
      const gltf = await loader.gltf.loadAsync(CREATURE_ASSETS.fish);
      registerCreature('fish', createFishCreature(gltf, { targetSize: 3.15 }));
    };

    const configureBee = async () => {
      const assets = await loadBeeAssets(loader, renderer.capabilities.getMaxAnisotropy());
      beeMaps = [assets.normalMap, assets.ormMap];
      const handle = createBeeCreature(assets.gltf, {
        normalMap: assets.normalMap,
        ormMap: assets.ormMap,
        sceneTexture: sceneCapture.texture,
        resolution: new THREE.Vector2(renderWidth, renderHeight),
        targetSize: 3.42,
        // The procedural path further down owns locomotion here, so the authored
        // world-scale root motion on the hover and take-off clips has to go.
        anchorRootMotion: true,
      });
      beeMaterialSet = handle.materials;
      beeShell = handle.opticalLayers?.shell;
      beeWings = handle.opticalLayers?.wings;
      beeActions = handle.actions ?? [];
      registerCreature('bee', handle);
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

    /*
     * The hero's botanical world is not here any more.
     *
     * It used to be an instanced field of procedural plant silhouettes added to
     * this scene, and it is now `FlowerValleyLayer` — a Canvas2D field of
     * photographic sprites over this canvas, ported from the flower-valley
     * reference. The two could not coexist: they would be two vegetation systems
     * composing the same lower third of the same frame, and the procedural one
     * was the reason the hero read as crude polygon grass.
     *
     * What that layer gives up by living above this canvas is the bee's
     * refraction: the shell no longer picks the meadow up for free, because the
     * capture pass only sees this scene. What it gains is the actual flowers. That
     * is not a close trade.
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

    const gate = createVisibilityGate(host.closest('.explore-story') ?? host, 200);
    const stageVisible = () => gate.visible();
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
      if (!stageVisible() || !documentVisible) return;
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
      const mobileFrame = viewportWidth < 780 ? 0.22 : 1;
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
      /*
       * The frame, in world units, measured from the camera that is actually
       * looking through it — not guessed from a breakpoint.
       *
       * A phone panel is portrait, so its frame is roughly 2 units wide against a
       * laptop's 6, and the flat `scale × 0.66` this used to apply left the fish
       * 117% as wide as the frame it had to fit in: on a 390 px screen the
       * chapter showed a fragment of a fish behind its own headline. `frameW` and
       * `frameH` here are the same numbers the shots were composed against, so
       * the fit below is exact rather than tuned per device.
       */
      const frameH = 2 * Math.tan((cameraFov * Math.PI) / 360) * cameraPosition.distanceTo(cameraTarget);
      const frameW = frameH * camera.aspect;
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
        const root = creature.handle.root;
        const weight = weights[creature.key];
        creature.presence += (weight - creature.presence) * presenceBlend;
        if (weight < 0.004 && creature.presence < 0.004) creature.presence = 0;
        const visible = creature.presence > 0.002;
        if (root.visible !== visible) root.visible = visible;
        if (!visible) continue;
        creature.handle.setPresence(creature.presence);

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
        /*
         * On a narrow viewport the copy sits at the bottom of the panel, so the
         * creature collapses toward the centre, lifts into the upper half, and is
         * scaled to the frame it actually has: 86% of the width, or half the
         * height, whichever binds first. The width term is what saves the fish
         * and the bee; the height term is what stops the jellyfish from running
         * off the top and bottom of a tall phone screen.
         */
        let fit = 1;
        let lift = 0;
        if (mobile) {
          const span = layout.scale * CREATURE_SPAN[creature.key];
          fit = Math.min(1, (frameW * 0.86) / span, (frameH * 0.5) / span);
          lift = frameH * 0.2;
        }
        root.position.set(
          layout.x * (mobile ? 0.12 : 1) + extraX + exit.x * arc,
          layout.y + idleY + extraY + exit.y * arc + lift,
          layout.z + exit.z * arc - recede * 1.1,
        );
        root.scale.setScalar(
          layout.scale * fit * motionScale * (1 - recede * 0.14),
        );
        root.rotation.set(
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
      gate.dispose();
      for (const mixer of mixers) mixer.stopAllAction();
      // Each handle owns its own geometry, materials and — for the bee — the
      // three shader programs; the two data maps are ours because both callers
      // load them.
      for (const creature of creatures.values()) creature.handle.dispose();
      for (const map of beeMaps) map.dispose();
      liquid.dispose();
      environment.dispose();
      sceneCapture.dispose();
      loader.dispose();
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
