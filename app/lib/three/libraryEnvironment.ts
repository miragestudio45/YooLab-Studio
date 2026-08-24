import * as THREE from 'three';
import { createProceduralEnvironment, type EnvironmentPalette } from './environment';
import { createContactShadow, createStudioBackdrop, type ContactShadow, type StudioBackdrop } from './studioBackdrop';
import { createVisibilityGate } from './visibility';

/**
 * Library viewer environment — a warm ivory room.
 *
 * The Library panels are ivory and the borders are warm brown, so the room the
 * specimens reflect has to be the same room. Reusing the Explore palette here
 * put a cool blue cast in every highlight, which read as a specimen photographed
 * somewhere else and pasted in.
 */
export const libraryEnvironmentPalette: EnvironmentPalette = {
  zenith: 0xfffdf9,
  horizon: 0xf6efe6,
  ground: 0xece0d2,
  keyColor: 0xfff8ef,
  keyStrength: 5.2,
  rimColor: 0xffe0cf,
  rimStrength: 1.9,
  fillColor: 0xf1e6f4,
  fillStrength: 1.1,
};

/** Backstop behind the backdrop plate, from --color-surface. */
export const LIBRARY_CLEAR_COLOR = 0xfffdf9;

export type LibraryStage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Exposed because the analytic bee shaders have to track the key direction. */
  keyLight: THREE.DirectionalLight;
  backdrop: StudioBackdrop;
  shadow: ContactShadow;
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
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(LIBRARY_CLEAR_COLOR, 1);
  let pixelRatio = Math.min(window.devicePixelRatio, compact ? 1.4 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'stage-canvas';
  // A canvas is inline by default, which leaves a baseline gap under it.
  renderer.domElement.style.display = 'block';
  (options.mount ?? host).appendChild(renderer.domElement);

  const environment = createProceduralEnvironment(renderer, libraryEnvironmentPalette);
  scene.environment = environment.texture;

  /* Four lights, in the hero's proportions: a broad hemisphere fill, a strong
     warm key over the left shoulder, a cool-warm rim from behind and below to
     separate the silhouette from the plate, and a soft point on the camera side
     so the near surfaces are not carried by the environment alone. */
  const hemisphere = new THREE.HemisphereLight(0xfff6ec, 0xe4d5c4, 1.25);
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(0xfff4e8, 2.5);
  keyLight.position.set(-3.2, 4.4, 5.0);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffd9c6, 1.5);
  rimLight.position.set(4.0, -0.6, -4.0);
  scene.add(rimLight);
  const fillLight = new THREE.PointLight(0xe4d9f6, 5, 18, 2);
  fillLight.position.set(2.4, 1.6, 3.0);
  scene.add(fillLight);

  const backdrop = createStudioBackdrop(camera);
  const shadow = createContactShadow();
  scene.add(shadow.mesh);

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

  // Adaptive resolution. Two sustained slow windows are allowed to step the
  // ratio down; the bee stage renders the scene twice, so one step is often not
  // enough on integrated graphics.
  let slowFrames = 0;
  let downscales = 0;

  return {
    renderer,
    scene,
    camera,
    keyLight,
    backdrop,
    shadow,
    reduceMotion,
    compact,
    renderSize,
    onResize: (handler) => { handlers.push(handler); },
    active: () => gate.visible() && tabVisible,
    noteFrame: (delta) => {
      if (downscales >= 2) return;
      slowFrames = delta > 0.028 ? slowFrames + 1 : 0;
      if (slowFrames <= 40) return;
      slowFrames = 0;
      downscales += 1;
      pixelRatio = Math.max(0.8, pixelRatio - 0.3);
      renderer.setPixelRatio(pixelRatio);
      resize();
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      gate.dispose();
      handlers.length = 0;
      backdrop.dispose();
      shadow.dispose();
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
