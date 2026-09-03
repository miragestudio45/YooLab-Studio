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
import { isLeanDevice, pixelRatioCap } from '../lib/three/deviceTier';
import { hdrMipTargetType, hdrTargetSupport, hdrTargetType } from '../lib/three/hdrTarget';
import { createQualityLadder } from '../lib/three/qualityLadder';
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
  hero: place(2.15, 0.24, 0.1, 1.08, -0.8, -0.05),
  study: place(-2.48, 0.16, 0.2, 0.99, 0.66, -0.02),
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
  const foregroundHostRef = useRef<HTMLDivElement>(null);
  const beeModeRef = useRef(beeMode);
  // Held in a ref of our own so the scene effect can stay on an empty dependency
  // list: the renderer, the loaders and the models must survive a prop change,
  // and rebuilding them because an identity changed would restart the download.
  const progressSource = useRef(progressRef);

  useEffect(() => { progressSource.current = progressRef; }, [progressRef]);
  useEffect(() => { beeModeRef.current = beeMode; }, [beeMode]);

  useEffect(() => {
    const host = hostRef.current;
    const foregroundHostMaybe = foregroundHostRef.current;
    if (!host || !foregroundHostMaybe) return;
    /*
     * An explicitly typed alias, because narrowing does not cross a hoisted
     * `function` declaration.
     *
     * TypeScript carries a `const`'s narrowed type into arrow functions, but a
     * `function` declaration can be called before the narrowing runs, so inside
     * `drawBeeForeground` below the compiler falls back to the DECLARED type —
     * `HTMLDivElement | null`. Annotating the alias makes the declared type
     * non-null, which is the honest fix rather than a `!` at the use site.
     */
    const foregroundHost: HTMLDivElement = foregroundHostMaybe;
    const story = host.closest('.explore-story') as HTMLElement | null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = window.matchMedia('(max-width: 780px)').matches;
    /*
     * Two different questions, and they used to have one answer.
     *
     * `compact` is a WIDTH: it decides composition — how the copy sits, how the
     * creature is fitted, whether a second reef layer is clutter in a 390 px
     * frame. `lean` is a BUDGET: it decides how much geometry the reef is built
     * out of. A 13-inch MacBook Air at 1512 px is not compact and is very much
     * lean, and because every density knob in `ocean/scene.ts` keyed off
     * `compact` alone, that machine was handed the full-fat reef — a 128 x 420
     * seabed, 1,900 dust motes, 520 bubbles — while its integrated GPU was the
     * one being reported as stuttering.
     */
    const lean = compact || isLeanDevice();
    /*
     * Where the ladder BEGINS — the only thing the device signals still decide.
     *
     * A handheld starts a few rungs down so its first seconds are not spent
     * discovering that it is a phone; anything else starts at or near full. The
     * numbers are deliberately shallow — a measurement two seconds away is
     * worth more than a guess now, and an emulated phone measured a locked
     * 60 fps at rung 4 while the old start of 4 was keeping it there. Neither is
     * a verdict: either can end up anywhere on the ladder, including full
     * quality on a device this test called weak.
     */
    const startRung = compact ? 3 : (isLeanDevice() ? 1 : 0);

    /* ================================================================ land === */
    const landScene = new THREE.Scene();
    const landCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    landCamera.position.copy(LAND_SHOTS[0].position);
    landScene.add(landCamera);

    /* One place decides this now, for every canvas on the site. See
       `lib/three/deviceTier.ts` for why the retina ceiling came down. */
    const maxPixelRatio = pixelRatioCap('cinema');
    const renderer = new THREE.WebGLRenderer({
      /* MSAA on a full-viewport buffer that is already resolution-governed pays
         twice for the same edge. A lean device spends that budget on resolution
         instead, which helps every pixel rather than only the silhouettes. */
      antialias: !lean,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    /*
     * Whether the specimens may use `transmission` at all.
     *
     * `!lean` is the budget half of this and always was. The new half is the
     * capability, and it is the same capability the bee's refraction capture
     * needs: three's transmission target is a **mipmapped half-float** surface,
     * resolved out of 4× MSAA and read back through a roughness LOD. A GPU that
     * cannot be trusted with our own mipmapped half-float target cannot be
     * trusted with three's either — and there, the failure is not a soft
     * backdrop but the specimen itself rendering in torn blocks, because what
     * the membranes show through themselves *is* that target.
     *
     * So the probe answers both, and the fallback is a path this project
     * already designed and tuned: `createJellyfishCreature` and
     * `createFishCreature` both carry a blended, non-transmissive variant with
     * its own opacities.
     */
    const transmissionSafe = !lean && hdrTargetSupport(renderer).mipmappable;
    let pixelRatio = maxPixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.insertBefore(renderer.domElement, host.firstChild);

    /*
     * A real foreground pass for the bee — and the page's most releasable
     * WebGL context.
     *
     * FlowerValleyLayer is a DOM canvas, so no amount of alpha shaping inside
     * that canvas can put the WebGL bee above it. This second renderer draws
     * only layer 1 (the bee and its lights) into a transparent sibling canvas.
     * The original renderer still owns the complete land/ocean composite; this
     * pass only restores the correct visual order: world, flowers, bee, copy.
     *
     * ## Why it is built on demand and torn down again
     *
     * It exists for ONE creature in the first two of nine sections. Held for the
     * whole visit it was a full-viewport GL context, an MSAA default framebuffer
     * and a half-float mipmapped capture target sitting idle from the bridge all
     * the way to the footer — pure cost on a desktop, and on iOS Safari one of
     * the five contexts that push a page toward the limit at which the browser
     * starts dropping the oldest.
     *
     * So it is chapter-scoped rather than distance-scoped: it is not in
     * `contextRegistry`, because what decides whether the bee is on screen is
     * the dive, not how far the section is from the viewport. `ensureForeground`
     * is idempotent and cheap after the first call; `dropForeground` only fires
     * once the bee has been gone for `FOREGROUND_LINGER_MS`, so the crossing can
     * be scrubbed back and forth without rebuilding anything.
     */
    let foregroundRenderer: THREE.WebGLRenderer | null = null;
    let foregroundSceneCapture: THREE.WebGLRenderTarget | null = null;
    /*
     * Last opacity written to the DOM. An inline style assignment invalidates
     * the element's computed style whether or not the value changed, and this
     * one used to run on every frame of the entire page — including the two
     * ocean chapters, where it wrote the string "0.000" sixty times a second
     * forever.
     *
     * Declared up here with the lifecycle rather than beside its reader, because
     * `dropForeground` resets it and a `let` below would be in its temporal dead
     * zone for anything that ran early.
     */
    let paintedForegroundOpacity = -1;
    /*
     * The bee's refraction capture, on every other frame.
     *
     * An A/B on a retina hero measured the whole foreground pass at 9.5 ms of a
     * 16.7 ms budget: 37.6 fps with it, 58.5 fps without. Almost all of that is
     * the CAPTURE — a full render of the land scene into a target, in a second
     * WebGL context, so that the ruby shell has something to bend.
     *
     * The capture is the one pass on this page that can honestly be amortised.
     * The shell samples it through an explicit mip LOD, so what reaches a pixel
     * is already blurred by surface roughness; behind the bee is a liquid plate
     * whose simulation moves over seconds, not frames; and the camera at the
     * hero is drifting, not cutting. A capture one frame stale, seen through
     * that much blur, is not a thing anyone can point at — and it halves the
     * most expensive pass in the hero.
     *
     * The bee itself is still drawn every frame. This is a stale REFLECTION, not
     * a stale creature, and the difference is the whole reason it is safe.
     */
    let captureFrame = 0;
    /* Long enough that scrubbing the crossing never rebuilds, short enough that
       a visitor who has moved on is not still paying for it. */
    const FOREGROUND_LINGER_MS = 2500;
    let foregroundIdleSince = -1;

    const ensureForeground = () => {
      if (foregroundRenderer) return foregroundRenderer;
      const created = new THREE.WebGLRenderer({
        antialias: !lean,
        alpha: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
      });
      created.outputColorSpace = THREE.SRGBColorSpace;
      created.toneMapping = THREE.ACESFilmicToneMapping;
      created.toneMappingExposure = renderer.toneMappingExposure;
      created.setClearColor(0x000000, 0);
      /* A second full-viewport context drawing one creature over a transparent
         buffer, so it tracks a step under the main one. */
      created.setPixelRatio(Math.max(0.7, pixelRatio - 0.15));
      created.domElement.className = 'explore-foreground-canvas';
      created.domElement.setAttribute('aria-hidden', 'true');
      foregroundHost.appendChild(created.domElement);
      foregroundRenderer = created;

      /* Render targets are context-local. Giving the foreground renderer its own
         mipmapped scene capture preserves the exact ruby refraction instead of
         replacing it with a flat colour approximation. */
      foregroundSceneCapture = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: true,
        /* Probed on `created`, not on the main renderer: this is a second
           context, and capability answers do not travel between them. */
        type: hdrMipTargetType(created),
        depthBuffer: true,
      });
      foregroundSceneCapture.texture.colorSpace = THREE.LinearSRGBColorSpace;
      resizeForeground();
      /* An odd counter means the next drawn frame captures, so a brand-new
         target is never what the shell refracts. */
      captureFrame = 0;
      return created;
    };

    const dropForeground = () => {
      if (!foregroundRenderer) return;
      foregroundSceneCapture?.dispose();
      foregroundSceneCapture = null;
      foregroundRenderer.setAnimationLoop(null);
      foregroundRenderer.dispose();
      /* Not just `dispose`: that frees three's own objects but leaves the GL
         context attached to a live canvas, which is exactly the thing this is
         here to give back. */
      foregroundRenderer.forceContextLoss();
      /* The element goes with it. A canvas whose context has been released
         composites as nothing, and a transparent full-viewport rectangle over
         the composite is a layer the browser still has to blend. */
      foregroundRenderer.domElement.remove();
      foregroundRenderer = null;
      foregroundIdleSince = -1;
      paintedForegroundOpacity = -1;
    };
    /*
     * How much of the frame the two refraction captures are rendered at.
     *
     * The bee's shell reads its capture through an explicit mip LOD, so the
     * image is blurred by surface roughness before it reaches a pixel — which is
     * exactly why the capture can be smaller than the frame. It was a flat 0.8
     * (64% of the pixels) on every machine; a lean device now renders 34% of
     * them, and because there are TWO of these targets and each is drawn once
     * per frame, that is the largest fragment saving available in the hero.
     */
    const captureScale = lean ? 0.46 : 0.66;

    const landEnvironment = createProceduralEnvironment(renderer, exploreEnvironmentPalette);
    landScene.environment = landEnvironment.texture;

    /* --------------------------------------------------------- liquid stage --- */
    const liquid = createLiquidSurface({
      palette: LAND_PALETTES[0],
      simScale: lean ? 0.16 : 0.24,
      simulate: !reduceMotion,
      planeWidth: 2,
      planeHeight: 2,
      targetType: hdrTargetType(renderer),
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

    /*
     * Mipmapped on purpose: the bee shell reads its refraction with an explicit
     * LOD so surface roughness blurs what is behind the glass.
     *
     * And 8-bit rather than half-float wherever the GPU cannot be trusted to
     * build that mip chain. `textureLod` past level 0 on a texture whose levels
     * were never generated is undefined, not blurry — the shell would refract
     * whatever memory happened to be there — and `generateMipmap` on RGBA16F is
     * the single most driver-dependent call this page makes. The capture is a
     * blurred backdrop seen through a ruby, so eight bits costs it nothing that
     * the roughness blur was not going to take anyway.
     */
    const sceneCapture = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      type: hdrMipTargetType(renderer),
      depthBuffer: true,
    });
    sceneCapture.texture.colorSpace = THREE.LinearSRGBColorSpace;

    /* ---------------------------------------------------------------- lights --- */
    const hemisphere = new THREE.HemisphereLight(0xf2f6ff, 0xcfc4e6, 1.1);
    hemisphere.layers.enable(1);
    landScene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xfff1fb, 2.0);
    keyLight.position.set(-3.4, 4.8, 5.2);
    keyLight.layers.enable(1);
    landScene.add(keyLight);
    const cyanLight = new THREE.PointLight(0x74ecff, 7.6, 14, 2);
    cyanLight.position.set(3.4, 1.7, 2.6);
    cyanLight.layers.enable(1);
    landScene.add(cyanLight);
    const pinkLight = new THREE.PointLight(0xff5aae, 4.8, 11, 2);
    pinkLight.position.set(-2.6, -1.9, 2.3);
    pinkLight.layers.enable(1);
    landScene.add(pinkLight);
    const rimLight = new THREE.DirectionalLight(0xbfe9ff, 1.1);
    rimLight.position.set(4.2, -1.2, -4.5);
    rimLight.layers.enable(1);
    landScene.add(rimLight);

    /* ------------------------------------------------------------ transition --- */
    const waterline = createWaterlinePass();
    const oceanBloom = createOceanBloomPass(lean, hdrTargetType(renderer));
    const targetOptions = {
      type: hdrTargetType(renderer),
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

    /*
     * Give the composite targets back while the story is off screen.
     *
     * These two are the largest single allocation on the page: a full-viewport
     * half-float RGBA target is about 30 MB at a 1512 x 982 retina frame, and
     * there are two of them, plus the bloom's pair and the refraction capture.
     * They only exist for the crossing, and they are the reason the Explore
     * canvas dominates this page's GPU memory rather than its GPU time.
     *
     * Unlike the context itself, they are free to give back: `ensureTargets` is
     * already lazy and idempotent, so the composite re-allocates them the next
     * time it actually runs. Nothing is re-parsed, no shader is recompiled, and
     * the waterline pass reads whichever texture it is handed on the frame it
     * runs — which is why this is safe where releasing the context is not.
     *
     * The context stays. Rebuilding it would mean re-parsing a 2.6 MB rigged bee
     * and the whole reef, which is seconds of work on the one interaction —
     * scrolling back to the top — that would have to pay for it. Memory is the
     * pressure on iOS; this returns the memory without buying a stutter.
     */
    const dropTargets = () => {
      if (!landTarget && !oceanTarget) return;
      landTarget?.dispose();
      oceanTarget?.dispose();
      landTarget = null;
      oceanTarget = null;
      waterline.uniforms.uLand.value = null;
      waterline.uniforms.uOcean.value = null;
    };
    /* Long enough that the bridge — which is one section below and pulls the
       story's tail up under itself — never triggers it. */
    const TARGET_LINGER_MS = 6000;
    let offscreenSince = -1;

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
      handle.root.traverse((child) => child.layers.enable(1));
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
      /*
       * Compile the foreground variant before it becomes visible.
       *
       * Read through `handle.materials`, not the outer `beeMaterialSet`: that
       * binding is a mutable `let` and the compiler cannot prove it is still
       * assigned here, which was three of this file's four type errors. And
       * `materials` is genuinely optional on `CreatureHandle` — it is the bee's
       * own optical set and the other two creatures do not have one — so the
       * honest shape is a guard rather than an assertion: with no optical set
       * there is no refraction to pre-compile and nothing to swap.
       */
      const opticals = handle.materials?.optical;
      /* The bee has just arrived, so the foreground context is wanted now — and
         building it here rather than on the first visible frame is the whole
         point of pre-compiling. */
      const foreground = ensureForeground();
      if (opticals && foregroundSceneCapture) {
        const sceneTexture = opticals.uScene.value;
        opticals.uScene.value = foregroundSceneCapture.texture;
        landCamera.layers.set(1);
        foreground.compile(landScene, landCamera);
        landCamera.layers.set(0);
        opticals.uScene.value = sceneTexture;
      }
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
          /* `compact: lean`. The ocean's own parameter is named for the width
             it used to be handed; what it has always actually meant is "build
             the cheap version of this reef", and that is a budget question. */
          const world = await createOceanWorld(renderer, oceanEnvironment.texture, { compact: lean, reduceMotion });
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
          /* The reef is built at full density and then told the rung in force.
             The ladder may already have descended several rungs while the land
             chapters were on screen, and a world that ignored that would arrive
             at full density and be measured back down — a visible pop on
             exactly the frame the crossing must not stutter on. */
          world.setDensity(ladder.current());
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
            /* See the option's own note: one transmissive material anywhere in
               the scene costs a second render of the whole reef every frame. */
            transmissive: transmissionSafe,
            maxAnisotropy,
            environment: specimenEnvironment.texture,
          });
          jelly = createJellyfishCreature(jellyGltf, {
            targetSize: CREATURE_SPAN.jelly,
            // Phones AND weak desktops get the blended path: three sorts
            // transmissive and transparent objects into separate passes, so
            // either all three membranes are transmissive or none of them is.
            // This is why the jellyfish chapter measured 37 fps against the fish
            // chapter's 60 on identical geometry — three membranes with
            // `transmission` make the renderer draw the reef twice per frame.
            transmissive: transmissionSafe,
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
    /* Sizing the bee pass is its own step because it now has two callers: the
       shared resize, and `ensureForeground` when it builds a fresh context that
       has never been sized. A `function` declaration, so it is available to
       `ensureForeground` above it. */
    function resizeForeground() {
      if (!foregroundRenderer || !foregroundSceneCapture) return;
      foregroundRenderer.setSize(viewportWidth, viewportHeight, false);
      const ratio = foregroundRenderer.getPixelRatio();
      foregroundSceneCapture.setSize(
        Math.max(1, Math.floor(viewportWidth * ratio * captureScale)),
        Math.max(1, Math.floor(viewportHeight * ratio * captureScale)),
      );
    }
    const resize = () => {
      viewportWidth = Math.max(host.clientWidth, 1);
      viewportHeight = Math.max(host.clientHeight, 1);
      const aspect = viewportWidth / viewportHeight;
      landCamera.aspect = aspect;
      landCamera.updateProjectionMatrix();
      ocean?.resize(aspect);
      renderer.setSize(viewportWidth, viewportHeight, false);
      resizeForeground();
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
        Math.max(1, Math.floor(renderWidth * captureScale)),
        Math.max(1, Math.floor(renderHeight * captureScale)),
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
    /*
     * Adaptive quality, as a measured LADDER rather than one lever.
     *
     * Two versions preceded this. The first counted 1.4-second windows, allowed
     * two steps down and had no way back up — so the 20-second frame this page
     * spends parsing a 2.6 MB rigged bee was read as "this GPU is slow" and left
     * the canvas soft for the rest of the session on every machine. The second
     * fixed the direction but still adapted the pixel ratio and nothing else,
     * which means that on a frame resolution cannot save it kept lowering the
     * resolution.
     *
     * `lib/three/qualityLadder.ts` owns the whole ordered set instead — surplus
     * resolution, then particles, bubbles, reef density, secondary fauna, and
     * only then sharpness below 1:1. It stops descending the moment the budget
     * is met, climbs back on measured headroom with a doubling penalty so a page
     * on the edge settles rather than pumps, and abandons a descent that three
     * rungs in has bought less than 8%.
     *
     * The device signals survive only as a STARTING rung, so a phone does not
     * spend its first three seconds discovering its own limits. They are no
     * longer the authority: a machine that starts low and turns out to be fast
     * climbs all the way back to full.
     */
    const ladder = createQualityLadder({
      dprCeiling: maxPixelRatio,
      /*
       * Below one buffer pixel per CSS pixel is the ladder's LAST rung, not its
       * range. Measured: with a 0.75 floor the previous one-way controller slid
       * a retina hero to ratio 0.85 — a 1224 x 765 buffer in a 1440 x 900 box,
       * an upscaled full-viewport 3D scene — and bought 6 fps for a visibly
       * softer picture, because that frame is substantially bound by the browser
       * compositing three full-screen layers, a cost set by the CSS box that no
       * pixel ratio can reach.
       */
      dprFloor: lean ? 0.7 : 0.85,
      start: startRung,
      /* Two full-viewport passes per frame in the hero, up to four during the
         crossing, so "slow" starts earlier here than on a panel canvas. */
      budgetMs: 21,
      comfortMs: 13.4,
      apply: (rung) => {
        pixelRatio = rung.dpr;
        renderer.setPixelRatio(rung.dpr);
        /* The bee pass tracks a step under the main one — when it exists at
           all. `ensureForeground` reads `pixelRatio` for the same sum, so a
           context built after a rung change is born at the right size. */
        foregroundRenderer?.setPixelRatio(Math.max(0.7, rung.dpr - 0.15));
        /* `ocean` is undefined until the dive starts it; `startOcean` applies
           the rung in force once the world exists. */
        ocean?.setDensity(rung);
        resize();
      },
    });
    /* QA hook: collapse every damped value onto its target on the next frame. */
    let snapFrames = 0;
    const timer = new THREE.Timer();

    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!gate.visible() || !documentVisible) {
        /* Off screen: stop drawing now, and hand the composite targets back if
           this looks settled rather than a scroll passing through. */
        const now = performance.now();
        if (offscreenSince < 0) offscreenSince = now;
        else if (now - offscreenSince > TARGET_LINGER_MS) dropTargets();
        return;
      }
      offscreenSince = -1;
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

      drawBeeForeground(dive, performance.now());

      if (delta > worstFrame) worstFrame = delta;
      ladder.note(delta);
    });

    /**
     * The land pass, including the bee's own refraction capture.
     *
     * The capture renders the scene without the two outer bee layers so the ruby
     * shell refracts the backdrop *and* its own core. It has to happen before the
     * land pass whichever target that pass is going to.
     */
    let landCaptureFrame = 0;
    function drawLand(target: THREE.WebGLRenderTarget | null) {
      /* The same amortisation, for the same reason, on the main context's copy
         of the same capture. Two full scene renders per frame existed to feed
         two mip-blurred refraction lookups; they now feed them at 30 Hz. */
      landCaptureFrame += 1;
      if (bee && beePresence > 0.01 && beeShell && beeWings && landCaptureFrame % 2 === 1) {
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

    const foregroundResolution = new THREE.Vector2();
    /*
     * The bee's refraction capture, on every other frame.
     *
     * An A/B on a retina hero measured the whole foreground pass at 9.5 ms of a
     * 16.7 ms budget: 37.6 fps with it, 58.5 fps without. Almost all of that is
     * the CAPTURE — a full render of the land scene into a target, in a second
     * WebGL context, so that the ruby shell has something to bend. The bee's own
     * draw is one creature over a transparent buffer.
     *
     * The capture is the one pass on this page that can honestly be amortised.
     * The shell samples it through an explicit mip LOD, so what reaches a pixel
     * is already blurred by surface roughness; behind the bee is a liquid plate
     * whose simulation moves over seconds, not frames; and the camera at the
     * hero is drifting, not cutting. A capture one frame stale, seen through
     * that much blur, is not a thing anyone can point at — and it halves the
     * most expensive pass in the hero.
     *
     * The bee itself is still drawn every frame. This is a stale REFLECTION, not
     * a stale creature, and the difference is the whole reason it is safe.
     */
    function drawBeeForeground(dive: number, nowMs: number) {
      const visibility = 1 - smoothstep(0.04, 0.3, dive);
      const wanted = !!bee && !!beeMaterialSet && beePresence >= 0.006 && visibility >= 0.006;

      /*
       * The context's whole lifecycle, decided here.
       *
       * `wanted` is the honest question — is the bee on screen — and it is the
       * only thing that should hold this context. The linger keeps a scrubbed
       * crossing from rebuilding: cross into the water and back out inside two
       * and a half seconds and nothing is torn down at all.
       */
      if (wanted) {
        foregroundIdleSince = -1;
        ensureForeground();
      } else if (foregroundRenderer) {
        if (foregroundIdleSince < 0) foregroundIdleSince = nowMs;
        if (nowMs - foregroundIdleSince > FOREGROUND_LINGER_MS) {
          dropForeground();
        }
      }

      /* Written only while the layer exists, and only when it moves. An inline
         style assignment invalidates computed style whether the value changed or
         not, and this ran on every frame of the whole page. */
      if (foregroundRenderer && Math.abs(visibility - paintedForegroundOpacity) > 0.002) {
        paintedForegroundOpacity = visibility;
        foregroundHost.style.opacity = visibility.toFixed(3);
      }

      const target = foregroundSceneCapture;
      if (!wanted || !beeMaterialSet || !foregroundRenderer || !target) {
        foregroundRenderer?.clear();
        return;
      }
      const pass = foregroundRenderer;

      const sceneTexture = beeMaterialSet.optical.uScene.value;
      beeMaterialSet.optical.uScene.value = target.texture;
      pass.getDrawingBufferSize(foregroundResolution);
      beeMaterialSet.optical.uSceneResolution.value.copy(foregroundResolution);
      pass.toneMappingExposure = renderer.toneMappingExposure;
      const wingsVisible = beeWings?.visible ?? false;
      const shellVisible = beeShell?.visible ?? false;
      if (beeWings) beeWings.visible = false;
      if (beeShell) beeShell.visible = false;

      /* Capture the liquid backdrop plus ruby core in this WebGL context.
         Every other frame — see `captureFrame` above for why that is safe. The
         first frame after the bee appears always captures, so the shell is never
         drawn against an empty target. */
      captureFrame += 1;
      if (captureFrame % 2 === 1) {
        landCamera.layers.set(0);
        landCamera.layers.enable(1);
        pass.setRenderTarget(target);
        pass.render(landScene, landCamera);
      }
      if (beeWings) beeWings.visible = wingsVisible;
      if (beeShell) beeShell.visible = shellVisible;

      /* Then draw only the complete Bee into the transparent DOM canvas. */
      pass.setRenderTarget(null);
      landCamera.layers.set(1);
      pass.render(landScene, landCamera);
      landCamera.layers.set(0);
      beeMaterialSet.optical.uScene.value = sceneTexture;
      beeMaterialSet.optical.uSceneResolution.value.set(renderWidth, renderHeight);
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
        /* What the quality ladder has decided, and why. The only way to tell a
           machine that measured its way to rung 5 from one that started there. */
        quality: () => ({ ...ladder.report(), depth: ladder.depth(), rung: ladder.current() }),
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
      dropForeground();
      loader.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      story?.style.removeProperty('--dive');
      clearSubjectRect();
    };
  }, []);

  return (
    <>
      <div className="explore-canvas" ref={hostRef} aria-hidden="true">
        <div className="visual-loader"><span />Đang mở phòng thí nghiệm 3D…</div>
      </div>
      <div className="explore-foreground" ref={foregroundHostRef} aria-hidden="true" />
    </>
  );
}
