import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createProceduralEnvironment, exploreEnvironmentPalette } from './environment';
import { pixelRatioCap } from './deviceTier';
import { loadLibraryGltf, refreshSkinnedBounds, registerSpecularGlossiness } from './creatures';

/**
 * Offscreen thumbnail baker.
 *
 * The library and education sections need real pictures of the assets they list,
 * and mounting a live canvas per card would mean a WebGL context per card. This
 * bakes each model once through a single shared renderer, hands back a PNG data
 * URL and tears the context down when the queue goes quiet, so the cost is one
 * context and one frame per asset for the whole page.
 */

export type ThumbnailPreset = 'opal' | 'ruby' | 'natural' | 'plastic' | 'tissue' | 'steel' | 'organ';

export type ThumbnailRequest = {
  url: string;
  preset: ThumbnailPreset;
  width?: number;
  height?: number;
  /** Camera azimuth in radians, measured from +Z. */
  yaw?: number;
  pitch?: number;
  /** Extra distance multiplier; 1 frames the bounding sphere tightly. */
  zoom?: number;
  /** Advance the first animation clip before capturing. */
  poseTime?: number;
  /**
   * Vertical aim as a fraction of the bounding box, 0 = bottom, 1 = top.
   * Long-tailed subjects such as the jellyfish need this: framing their whole
   * bounding sphere shrinks the part worth looking at to a few pixels.
   */
  targetY?: number;
  /*
   * Opacity of a ground contact shadow, 0 or absent for none.
   *
   * Presence of this also switches the light rig to the studio one below. It is
   * a flag rather than a default because the two consumers want opposite
   * things: a Library rail chip is 56 px of a subject on a tinted circle, where
   * a contact shadow is three grey pixels and the framing has no room to give,
   * while a belt cover is 240 px of the same subject presented as a product
   * shot, where the shadow is most of what makes it stop looking like a cut-out
   * pasted onto cream.
   */
  ground?: number;
};

type Runtime = {
  renderer: THREE.WebGLRenderer;
  loader: GLTFLoader;
  draco: DRACOLoader;
  environment: { texture: THREE.Texture; dispose: () => void };
};

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let runtime: Runtime | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function key(request: ThumbnailRequest) {
  return [
    request.url,
    request.preset,
    request.width ?? 0,
    request.height ?? 0,
    request.yaw ?? 0,
    request.pitch ?? 0,
    request.zoom ?? 0,
    request.poseTime ?? 0,
    request.targetY ?? 0,
  ].join('|');
}

function ensureRuntime(): Runtime {
  if (runtime) return runtime;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  /*
   * 1.5, not 2 — and 1 on a lean device.
   *
   * A bake is 560 x 420 and is then displayed at 56 px in the Library rail, 44 px
   * in the knowledge panel and at most ~500 px on the education stage. Ratio 2
   * on top of that was four times the fragment work of ratio 1 for pixels that
   * are scaled DOWN everywhere they appear — and because this queue is
   * serialised, they delayed the next chip in the rail rather than costing
   * nothing.
   */
  renderer.setPixelRatio(pixelRatioCap('thumb'));
  renderer.setClearColor(0x000000, 0);
  const draco = new DRACOLoader();
  draco.setDecoderPath('/asset/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Same extension set as the live stages. A rail chip that bakes a grey model
  // beside a viewer that shows a painted one is the inconsistency this whole
  // module exists to avoid.
  registerSpecularGlossiness(loader);
  const environment = createProceduralEnvironment(renderer, exploreEnvironmentPalette);
  runtime = { renderer, loader, draco, environment };
  return runtime;
}

function scheduleTeardown() {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!runtime) return;
    runtime.environment.dispose();
    runtime.draco.dispose();
    runtime.renderer.dispose();
    runtime.renderer.forceContextLoss();
    runtime = null;
  }, 6000);
}

/**
 * The mesh's first material, for the presets that modify rather than replace.
 *
 * `organ` keeps the mesh's own colour, map and vertex-colour flag — the eye and
 * the heart carry their anatomy in `COLOR_0` rather than in a factor, so
 * dropping that attribute would render them grey.
 */
function material0(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return (list[0] as THREE.MeshStandardMaterial | undefined) ?? null;
}

function applyPreset(root: THREE.Object3D, preset: ThumbnailPreset) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const source of list) {
      const material = source as THREE.MeshStandardMaterial;
      if (!material) continue;
      material.envMapIntensity = 0.85;
      if ('emissive' in material) material.emissiveIntensity = Math.min(material.emissiveIntensity ?? 0, 0.4);
      material.needsUpdate = true;
    }
    if (preset === 'tissue') {
      // Soft biological tissue. The bacterial wall mesh arrives with no
      // materials at all, and a glassy preset on a scientific model reads as a
      // trinket rather than as a specimen.
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: 0xe9a08a,
        emissive: new THREE.Color(0x3a0f08),
        emissiveIntensity: 0.06,
        roughness: 0.6,
        metalness: 0,
        ior: 1.4,
        clearcoat: 0.18,
        clearcoatRoughness: 0.3,
        sheen: 0.4,
        sheenColor: new THREE.Color(0xffd8c4),
        sheenRoughness: 0.4,
        envMapIntensity: 1.05,
        side: THREE.FrontSide,
      });
      return;
    }
    if (preset === 'organ') {
      /*
       * Wet tissue, keeping the mesh's own anatomical colour.
       *
       * `ModelStage` has had this preset since the organs shipped and this baker
       * never did, so the twelve organ covers were rendering under `natural` —
       * their authored `baseColorFactor` under a standard material with no
       * specular life at all. Against the belt's blush plate the lungs, the
       * brain and the eye came out as ghosts, which is a large part of what
       * review meant by the pictures not being good enough.
       *
       * No `color` is set, deliberately: every value here is a *modifier* and
       * the base colour stays whatever the HuBMAP mesh painted. Anatomy is the
       * one thing on this page that may not be restyled for looks — see the
       * chroma-ceiling note in THIRD_PARTY_ASSETS.md — so what this adds is the
       * clearcoat and sheen that make a surface read as living tissue rather
       * than as matte plastic, and nothing else.
       */
      const base = material0(mesh);
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: base?.color?.clone() ?? new THREE.Color(0xe4a79a),
        map: base?.map ?? null,
        vertexColors: base?.vertexColors ?? false,
        /*
         * Damp tissue, not a party balloon.
         *
         * These were 0.42 / 0.55 / 0.26, and with the studio key on them the
         * heart, liver and kidney came back as glossy inflatables: a broad
         * clearcoat highlight over a smooth surface is exactly how latex reads.
         * Wet tissue has a *narrow* specular over a rougher body, so the
         * clearcoat drops by more than half and gets rougher, the body roughness
         * comes up, and the sheen — which is the soft velvet falloff at grazing
         * angles, the part that actually says "organ" — is left almost intact.
         * The base colour is still untouched, as above.
         */
        roughness: 0.52,
        metalness: 0,
        ior: 1.4,
        clearcoat: 0.24,
        clearcoatRoughness: 0.42,
        sheen: 0.34,
        sheenColor: new THREE.Color(0xffd9cf),
        sheenRoughness: 0.45,
        envMapIntensity: 1.05,
        side: THREE.FrontSide,
      });
      return;
    }
    if (preset === 'steel') {
      // Tool steel. The toolkit meshes carry a flat 0.8 grey and no texture, so
      // left alone the rail chip was a white smudge in a pink circle. Metal
      // gives the silhouette an edge highlight, which is the only thing that
      // makes a screwdriver readable at 56 px.
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: 0x9ba3ab,
        roughness: 0.24,
        metalness: 0.86,
        ior: 2.2,
        clearcoat: 0.2,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.15,
        side: THREE.FrontSide,
      });
      return;
    }
    if (preset === 'opal' || preset === 'ruby') {
      // Deliberately opaque. The canvas clears to transparent so the card can
      // tint behind the render, and a transmissive material over an empty
      // transmission target bakes out to almost nothing. Glassiness comes from
      // iridescence, sheen and clearcoat instead.
      const physical = new THREE.MeshPhysicalMaterial({
        color: preset === 'ruby' ? 0x7c0a20 : 0x8770ea,
        emissive: new THREE.Color(preset === 'ruby' ? 0x2c0008 : 0x3c2a8a),
        emissiveIntensity: preset === 'ruby' ? 0.35 : 0.32,
        roughness: preset === 'ruby' ? 0.12 : 0.14,
        metalness: 0,
        ior: preset === 'ruby' ? 1.74 : 1.34,
        iridescence: preset === 'ruby' ? 0.4 : 0.9,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [180, 720],
        clearcoat: 1,
        clearcoatRoughness: 0.07,
        sheen: preset === 'ruby' ? 0.5 : 0.7,
        sheenColor: new THREE.Color(preset === 'ruby' ? 0xffb257 : 0xffc6ec),
        sheenRoughness: 0.35,
        specularIntensity: 1,
        specularColor: new THREE.Color(preset === 'ruby' ? 0xfff0e6 : 0xdff6ff),
        envMapIntensity: 1.25,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.FrontSide,
      });
      mesh.material = physical;
    }
  });
}

async function bake(request: ThumbnailRequest): Promise<string | null> {
  const { renderer, loader, environment } = ensureRuntime();
  const width = request.width ?? 560;
  const height = request.height ?? 420;
  const gltf = await loadLibraryGltf(loader, request.url);
  const scene = new THREE.Scene();
  scene.environment = environment.texture;
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 100);

  const visual = gltf.scene;
  applyPreset(visual, request.preset);
  scene.add(visual);

  let mixer: THREE.AnimationMixer | undefined;
  if (gltf.animations[0] && request.poseTime) {
    mixer = new THREE.AnimationMixer(visual);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(request.poseTime);
    // Same reason as in `ModelStage`: a skinned box is the bind pose until the
    // skeleton has been evaluated, and a rail chip framed on the bind pose bakes
    // a small animal in a large empty circle.
    refreshSkinnedBounds(visual);
  }

  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center.clone();
  if (request.targetY !== undefined) {
    target.y = bounds.min.y + (bounds.max.y - bounds.min.y) * request.targetY;
  }

  /*
   * The light rig, and why it is built here rather than above.
   *
   * Every light below is positioned as a multiple of the subject's bounding
   * radius, which is only knowable after the model is measured. That is not
   * tidiness: the models arrive in their own units and the jellyfish's radius is
   * about 32 against the heart's fraction of one, so the rig this replaced —
   * three lights at fixed coordinates like `(-3, 4.5, 5)` and a point light with
   * a 14-unit falloff — lit them completely differently. Directional lights only
   * carry a direction, so those were harmless for the two big directionals; the
   * point light was not. At the heart's scale it sat a few radii away and put a
   * warm kick on the near side, and at the jellyfish's it was buried inside the
   * animal with its entire falloff spent before reaching the surface. A cover
   * set has to look like one set of photographs, and it cannot while the lights
   * are somewhere different for each subject.
   *
   * The colours are the page's own: a warm key at 5% above neutral, a teal rim
   * from behind — DESIGN.md's accent, not the cyan `0x9fe6ff` this had, which
   * put a cold edge on every white subject — and a dim warm bounce standing in
   * for light coming back off the plate the cover sits on.
   */
  const radius = Math.max(sphere.radius, 1e-4);
  const studio = (request.ground ?? 0) > 0;
  scene.add(new THREE.HemisphereLight(0xf3f6ff, studio ? 0x6b5240 : 0x3a2a56, studio ? 0.85 : 1.0));

  const key = new THREE.DirectionalLight(0xfff6f0, studio ? 2.9 : 2.6);
  const rim = new THREE.DirectionalLight(studio ? 0x8fe4e6 : 0x9fe6ff, studio ? 1.5 : 1.7);
  if (studio) {
    /* Three-quarter key from above left, the standard product-shot position:
       high enough to put a highlight on the top plane and far enough to the side
       that the form turns before it reaches the shadow. */
    key.position.set(target.x - radius * 1.5, target.y + radius * 2.2, target.z + radius * 1.9);
    rim.position.set(target.x + radius * 2.0, target.y + radius * 0.7, target.z - radius * 2.2);
    const bounce = new THREE.DirectionalLight(0xffd9b8, 0.55);
    bounce.position.set(target.x + radius * 0.6, target.y - radius * 1.6, target.z + radius * 1.2);
    scene.add(bounce);
  } else {
    key.position.set(-3, 4.5, 5);
    rim.position.set(4, -1, -4);
    const warm = new THREE.PointLight(0xffb98a, 8, 14, 2);
    warm.position.set(2.6, 1.2, 2.6);
    scene.add(warm);
  }
  scene.add(key, rim);

  /*
   * The ground, which is the whole difference between a render and a photograph.
   *
   * `ShadowMaterial` paints black with the shadow's own alpha and nothing
   * elsewhere, so on a transparent canvas the plane contributes exactly one
   * thing to the PNG: a soft dark ellipse under the subject. Composited on the
   * cover plate in CSS that reads as contact shadow, and contact shadow is what
   * tells the eye the object is resting *in* the frame rather than pasted on it.
   *
   * The plane is eight radii wide so its own edge is never in frame, and the
   * shadow camera is fitted to the subject instead of left at its default 5-unit
   * box — at the jellyfish's scale that default would have covered a thirtieth
   * of the animal, and at the heart's it would have spread one shadow map over
   * sixty times the area it needed and produced a grey smudge.
   */
  if (studio) {
    renderer.shadowMap.enabled = true;
    /*
     * VSM, and a separate light to cast it.
     *
     * The first pass hung the shadow on the key light, and the result was a
     * silhouette thrown clear of the subject — the trex, the fish and the
     * jellyfish each stood beside their own shadow rather than on it. That is
     * arithmetic, not taste: a key at 1.5 radii to the side and 2.2 up displaces
     * the shadow by sqrt(1.5² + 1.9²) / 2.2 ≈ 1.1 radii, so an object one radius
     * off the ground casts its shadow a whole radius away.
     *
     * Steepening the key would fix the shadow and ruin the lighting — a light
     * that far overhead puts a flat highlight on the top of everything and lets
     * the sides fall away. So the two jobs are split. The key keeps the
     * three-quarter position that models the form and casts nothing; a second,
     * nearly overhead light casts the shadow and is dim enough (0.08) to be
     * invisible in the shading. `ShadowMaterial` reads the shadow mask rather
     * than any light's intensity, so a dim caster still lays down a full-strength
     * contact shadow. Its displacement is sqrt(0.5² + 0.8²) / 3.6 ≈ 0.26 radii:
     * enough for the light to have a direction, not enough to detach.
     *
     * PCF soft, and the softness comes from the map being *small*.
     *
     * VSM was tried here and had to go. It blurs in shadow space, which widens
     * the penumbra with distance exactly the way a real soft light does — and it
     * also returns a small non-zero occlusion everywhere its filter reaches,
     * including outside the shadow camera's frustum. On a transparent canvas
     * that turns the whole 8-radius ground plane faintly visible and puts a
     * straight-edged band across the cover wherever the frustum boundary crosses
     * it. Which is the same defect as the hero's clipped wash, arrived at from
     * the opposite direction, and rejected for the same reason: a soft ground
     * must not have a corner in it.
     *
     * PCF returns exactly zero outside the penumbra, so the plane stays
     * invisible where nothing shadows it. Its filter is a fixed number of texels,
     * which means the way to widen the penumbra is to make each texel bigger:
     * 512 with a radius of 9 is a soft pool, where 1024 with a radius of 5 was
     * an outline of the animal.
     */
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const caster = new THREE.DirectionalLight(0xffffff, 0.08);
    caster.position.set(target.x - radius * 0.5, target.y + radius * 3.6, target.z + radius * 0.8);
    caster.castShadow = true;
    caster.shadow.mapSize.set(512, 512);
    caster.shadow.radius = 9;
    /* Scaled with the subject: a constant bias is either useless at the
       jellyfish's size or peels the shadow off the heart's contact point. */
    caster.shadow.bias = -0.0012 * radius;
    caster.shadow.camera.near = radius * 0.05;
    caster.shadow.camera.far = radius * 9;
    const shadowCamera = caster.shadow.camera as THREE.OrthographicCamera;
    shadowCamera.left = -radius * 1.7;
    shadowCamera.right = radius * 1.7;
    shadowCamera.top = radius * 1.7;
    shadowCamera.bottom = -radius * 1.7;
    shadowCamera.updateProjectionMatrix();
    caster.target.position.copy(target);
    scene.add(caster, caster.target);

    visual.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 6, radius * 6),
      new THREE.ShadowMaterial({ opacity: request.ground, transparent: true }),
    );
    floor.rotation.x = -Math.PI / 2;
    /* A hair below the lowest point, so a flat-bottomed model does not z-fight
       its own contact shadow. */
    floor.position.set(sphere.center.x, bounds.min.y - radius * 0.004, sphere.center.z);
    floor.receiveShadow = true;
    scene.add(floor);

    /* Room for the shadow to land in. Aiming a little below the subject's centre
       lifts it in frame; without this the tight cover zooms crop the shadow at
       the bottom edge, which reads as a torn-off drop shadow. */
    target.y -= radius * 0.1;
  }
  const distance = (sphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) * (request.zoom ?? 1.18);
  const yaw = request.yaw ?? 0.6;
  const pitch = request.pitch ?? 0.22;
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  camera.lookAt(target);
  /*
   * Clip planes from the subject, not from a constant.
   *
   * The camera was built with a fixed 0.05 / 100 and the models arrive in their
   * own units — the jellyfish's bounding sphere is about 32 across, so its
   * fitted distance is already 75, and nudging its `zoom` from 0.62 to 0.9 put
   * the whole animal behind the far plane. What that produced was not a small
   * jellyfish or a clipped one but a completely blank PNG, cached for the
   * session, with no error: the education section and the studio mock showed an
   * empty box. Deriving both planes from the fit makes `zoom` safe to author at
   * any value.
   */
  camera.near = Math.max(0.01, distance - sphere.radius * 2.5);
  camera.far = distance + sphere.radius * 4;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL('image/png');

  mixer?.stopAllAction();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  visual.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  scene.clear();
  scheduleTeardown();
  return data;
}

export function getCachedThumbnail(request: ThumbnailRequest) {
  return cache.get(key(request)) ?? null;
}

/**
 * Queues a thumbnail bake. Requests are serialised so a grid of cards never
 * competes for the GPU, and every result is memoised for the session.
 */
export function requestThumbnail(request: ThumbnailRequest): Promise<string | null> {
  const id = key(request);
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(id);
  if (existing) return existing;
  const connection = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return Promise.resolve(null);

  const task = queue
    .then(() => bake(request))
    .then((data) => {
      if (data) cache.set(id, data);
      return data;
    })
    .catch((error) => {
      console.error('Thumbnail bake failed', request.url, error);
      return null;
    })
    .finally(() => { inflight.delete(id); });
  queue = task;
  inflight.set(id, task);
  return task;
}

/*
 * A bake seam, for the build step that turns these renders into files.
 *
 * The Library's rail and the lesson belt want pictures of real meshes, and the
 * runtime baker above is the wrong way to get them for the belt: sixteen cards
 * would mean fetching sixteen GLBs, and this repository's organ set alone is
 * 6.4 MB. So `scripts/bake-library-covers.mjs` drives a real Chrome, calls this
 * from the page, and writes each result to a WebP under
 * `public/asset/Library/cover/`. The belt then costs ~20 kB a card and fetches
 * no geometry at all.
 *
 * Dev-only, and it has to be: it exists so a build script can reach a renderer
 * that only exists inside a browser, and shipping a global that bakes GLBs on
 * demand to production would be a way to make any visitor's tab do it.
 */
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { __bakeThumbnail?: unknown }).__bakeThumbnail =
    (request: ThumbnailRequest) => requestThumbnail(request);
}
