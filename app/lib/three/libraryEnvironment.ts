import * as THREE from 'three';
import { createProceduralEnvironment, type EnvironmentPalette } from './environment';
import {
  createContactShadow,
  createLearningGrid,
  createStudioBackdrop,
  type BackdropPalette,
  type ContactShadow,
  type LearningGrid,
  type StudioBackdrop,
} from './studioBackdrop';
import { createVisibilityGate } from './visibility';
import { createFrameGovernor, pixelRatioCap } from './deviceTier';

/**
 * Library viewer environment — a warm ivory room.
 *
 * The Library panels are ivory and the borders are warm brown, so the room the
 * specimens reflect has to be the same room. Reusing the Explore palette here
 * put a cool blue cast in every highlight, which read as a specimen photographed
 * somewhere else and pasted in.
 *
 * **The levels below are the calibrated ones. The first set was over-lit and
 * every pale specimen in the Library showed it.** The room was carrying
 * `keyStrength: 5.2` into an environment map, plus a 2.5 directional key, plus a
 * 5.0 point fill, plus a 1.25 hemisphere, at exposure 1.0, onto a backdrop whose
 * centre was pure white. Four sources all pushing at once is not a bright room,
 * it is a room with no shadow side: the fish's reflective scales, the
 * jellyfish's three transmissive layers and the T-rex's painted hide each lost
 * their own form to it, because ACES had already clipped the top of the curve
 * before the surface's own highlight got there.
 *
 * What is *not* the fix is turning the exposure down and leaving the rig alone —
 * that darkens the whole frame and keeps the flatness. The rig is rebalanced
 * instead, so the ratios do the work: the key keeps most of its authority, the
 * hemisphere and the point fill drop hardest (they are the two that were filling
 * the shadow side to nothing), and exposure comes down a little on top so the
 * specular hits have somewhere above the ground to live.
 *
 * The bee, fish and jellyfish shaders themselves are untouched — DESIGN.md calls
 * them finished work, and they are. A specimen that reads as washed out under
 * four uncontrolled sources is a lighting defect, not a shader one.
 */
export const libraryEnvironmentPalette: EnvironmentPalette = {
  zenith: 0xfffaf4,
  horizon: 0xf5ece1,
  /* Deeper than the horizon by a real step. This is the term that lands on a
     specimen's underside, and at the old value it was returning almost the same
     energy as the sky — which is why nothing in the Library had a shadow side. */
  ground: 0xd9d1c3,
  keyColor: 0xfff6ec,
  keyStrength: 3.9,
  rimColor: 0xffdcc8,
  rimStrength: 1.62,
  fillColor: 0xeee2f2,
  fillStrength: 0.82,
};

/** Backstop behind the backdrop plate, from --color-surface. */
export const LIBRARY_CLEAR_COLOR = 0xfffdf9;

/**
 * The bridge viewer is still the same warm YooLab room, but with enough tonal
 * separation for the bee's colourless optical shell to stay legible. The
 * Library remains untouched; this preset is opt-in from the bridge only.
 */
const bridgeEnvironmentPalette: EnvironmentPalette = {
  zenith: 0xfff7f2,
  horizon: 0xeadde8,
  ground: 0xdccfd9,
  keyColor: 0xffe9df,
  keyStrength: 4.15,
  rimColor: 0xd8c7ff,
  rimStrength: 1.45,
  fillColor: 0xf1bec1,
  fillStrength: 0.72,
};

const bridgeBackdropPalette: BackdropPalette = {
  center: 0xfbf1eb,
  mid: 0xeee2e8,
  edge: 0xded7e7,
};

const BRIDGE_CLEAR_COLOR = 0xe9dfe5;

export type LibraryStage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Exposed because the analytic bee shaders have to track the key direction. */
  keyLight: THREE.DirectionalLight;
  backdrop: StudioBackdrop;
  shadow: ContactShadow;
  /**
   * The measured floor. Every Library stage has one; call `grid.fit(box)` with
   * the same fitted box the contact shadow gets, right after the subject has
   * been re-centred on its aim point.
   */
  grid: LearningGrid;
  reduceMotion: boolean;
  compact: boolean;
  /** Drawing-buffer size in device pixels; valid after the first resize. */
  renderSize: THREE.Vector2;
  /** Runs after every size or pixel-ratio change, once the camera is updated. */
  onResize(handler: () => void): void;
  /** True while the canvas is on screen and the tab is in front. */
  active(): boolean;
  /** Feeds the adaptive pixel-ratio governor. Call once per rendered frame. */
  noteFrame(delta: number): void;
  dispose(): void;
};

export type LibraryStageOptions = {
  /**
   * Where the canvas is appended. Defaults to `host`. The stages keep the canvas
   * in a small labelled box of its own — an element with `role="img"` hides its
   * subtree from assistive technology, so the control rail cannot live inside it
   * — while `host` stays the element that is measured and that receives pointer
   * input.
   */
  mount?: HTMLElement;
  fov?: number;
  /** Opt-in tonal preset for the YooLab bridge; Library callers keep default. */
  appearance?: 'library' | 'bridge';
};

/**
 * The shared rig behind both Library specimen viewers.
 *
 * `CreatureStage` and `ModelStage` differ in exactly two things: what they load,
 * and whether they need the bee's two-pass refraction capture. Everything
 * else — one context, the ivory environment, the four-light rig, the backdrop the
 * glass refracts, the contact shadow, the resize plumbing, the hard pause when
 * off screen, the adaptive pixel ratio and the teardown — is identical, so it
 * lives here once instead of twice.
 */
export function createLibraryStage(host: HTMLElement, options: LibraryStageOptions = {}): LibraryStage {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compact = window.matchMedia('(max-width: 900px)').matches;
  const bridgeAppearance = options.appearance === 'bridge';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov ?? 30, 1, 0.05, 200);
  // The backdrop is parented to the camera, so the camera itself has to be part
  // of the graph or the plate is never traversed.
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    antialias: !compact,
    /* Opaque, unlike the viewer this replaces. The glass creatures refract a
       screen capture of the scene; with a transparent canvas and the page
       showing through, that capture is empty and the glass resolves to almost
       nothing. An opaque buffer plus the backdrop below gives it something real
       to bend. */
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = bridgeAppearance ? 0.86 : 0.92;
  renderer.setClearColor(bridgeAppearance ? BRIDGE_CLEAR_COLOR : LIBRARY_CLEAR_COLOR, 1);
  renderer.setPixelRatio(pixelRatioCap('panel'));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'stage-canvas';
  // A canvas is inline by default, which leaves a baseline gap under it.
  renderer.domElement.style.display = 'block';
  (options.mount ?? host).appendChild(renderer.domElement);

  const environment = createProceduralEnvironment(
    renderer,
    bridgeAppearance ? bridgeEnvironmentPalette : libraryEnvironmentPalette,
  );
  scene.environment = environment.texture;

  /* Four lights, in the hero's proportions: a broad hemisphere fill, a strong
     warm key over the left shoulder, a cool-warm rim from behind and below to
     separate the silhouette from the plate, and a soft point on the camera side
     so the near surfaces are not carried by the environment alone. */
  const hemisphere = new THREE.HemisphereLight(
    bridgeAppearance ? 0xffeee8 : 0xfff6ec,
    bridgeAppearance ? 0xd5c8d4 : 0xdccbb6,
    bridgeAppearance ? 0.92 : 0.86,
  );
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(0xfff4e8, bridgeAppearance ? 1.9 : 2.15);
  keyLight.position.set(-3.2, 4.4, 5.0);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(
    bridgeAppearance ? 0xd5c2ff : 0xffd9c6,
    bridgeAppearance ? 1.15 : 1.42,
  );
  rimLight.position.set(4.0, -0.6, -4.0);
  scene.add(rimLight);
  /* The point fill is the one that was doing the damage: at 5.0 it was the
     brightest source in the room and it sits on the camera side, so it filled in
     exactly the shading that tells you a specimen is round. It stays — near
     surfaces should not be carried by the environment alone — at a strength that
     lifts the shadow side instead of erasing it. */
  const fillLight = new THREE.PointLight(
    bridgeAppearance ? 0xf1c6ca : 0xe4d9f6,
    bridgeAppearance ? 3.15 : 2.4,
    18,
    2,
  );
  fillLight.position.set(2.4, 1.6, 3.0);
  scene.add(fillLight);

  const backdrop = createStudioBackdrop(camera, bridgeAppearance ? bridgeBackdropPalette : undefined);
  const shadow = createContactShadow({
    color: bridgeAppearance ? 0x6e4a55 : undefined,
    /* Raised with the rest of the rebalance. A specimen framed in mid-air over a
       0.16 shadow was floating; the grid below now says where the floor is, and
       the shadow has to agree with it. */
    strength: bridgeAppearance ? 0.21 : 0.2,
  });
  scene.add(shadow.mesh);

  /*
   * One floor for every specimen in the section.
   *
   * Created here rather than in the two loaders because it is the answer to the
   * question "what is this thing standing on", which the stage owns — and
   * because when only `CreatureStage` could build one, the bee had a room and
   * the other eleven specimens had a white void. It is added to the scene
   * immediately and stays invisible until a caller fits it, so a stage that
   * never calls `fit` draws a correctly-scaled nothing instead of a 9-unit plane
   * at the origin.
   */
  const grid = createLearningGrid();
  grid.mesh.visible = false;
  scene.add(grid.mesh);

  const renderSize = new THREE.Vector2(1, 1);
  const handlers: Array<() => void> = [];
  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    /* The CSS size is written too, not only the drawing-buffer size. A canvas
       carries an intrinsic size from its width/height attributes — which the
       renderer sets to box × devicePixelRatio — and in flow that becomes the
       element's min-content contribution, so the canvas widens its own column,
       the ResizeObserver enlarges the buffer to match, and the two grow
       together. Pinning the CSS box to the measured size closes that loop
       whatever the stylesheet does. */
    renderer.setSize(width, height);
    const ratio = renderer.getPixelRatio();
    renderSize.set(Math.floor(width * ratio), Math.floor(height * ratio));
    backdrop.resize();
    for (const handler of handlers) handler();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  // Self-healing on-screen test; see `visibility.ts` for why the observer alone
  // is not enough here.
  const gate = createVisibilityGate(host, 160);
  let tabVisible = document.visibilityState !== 'hidden';
  const onVisibility = () => { tabVisible = document.visibilityState !== 'hidden'; };
  document.addEventListener('visibilitychange', onVisibility);

  /*
    * Adaptive resolution, through the shared governor.
    *
    * What was here counted forty slow FRAMES, which is 0.66 s at 60 fps and
    * 2.7 s at 15 fps — so the slower the machine, the longer it waited before
    * helping. It also had no way back up, and this stage's first specimen is
    * mounted while the section is thousands of pixels below the fold: the model
    * fetch and the shader compile that follows it are exactly the kind of stall
    * that used to be read as "this GPU is slow" and cost the stage its
    * resolution for the rest of the visit.
    */
  const governor = createFrameGovernor({
    start: pixelRatioCap('panel'),
    /* This canvas sits inside a card next to 10 px labels, so it keeps at least
       one buffer pixel per CSS pixel on any machine that has not told us it
       cannot afford one. Same decision, and the same measurement behind it, as
       in `ExploreCanvas`. */
    floor: 0.8,
    crispFloor: 1,
    /* One pass over one specimen, so it can hold a tighter budget than the
       full-viewport cinematic canvas does. */
    budgetMs: 19,
    comfortMs: 13,
    step: 0.25,
    apply: (next) => {
      renderer.setPixelRatio(next);
      resize();
    },
  });

  return {
    renderer,
    scene,
    camera,
    keyLight,
    backdrop,
    shadow,
    grid,
    reduceMotion,
    compact,
    renderSize,
    onResize: (handler) => { handlers.push(handler); },
    active: () => gate.visible() && tabVisible,
    noteFrame: (delta) => governor.note(delta),
    dispose: () => {
      renderer.setAnimationLoop(null);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      gate.dispose();
      handlers.length = 0;
      backdrop.dispose();
      shadow.dispose();
      grid.dispose();
      scene.remove(hemisphere, keyLight, rimLight, fillLight);
      hemisphere.dispose();
      keyLight.dispose();
      rimLight.dispose();
      fillLight.dispose();
      environment.dispose();
      scene.environment = null;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
