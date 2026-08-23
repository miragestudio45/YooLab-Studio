import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createProceduralEnvironment, exploreEnvironmentPalette } from './environment';

/**
 * Offscreen thumbnail baker.
 *
 * The library and education sections need real pictures of the assets they list,
 * and mounting a live canvas per card would mean a WebGL context per card. This
 * bakes each model once through a single shared renderer, hands back a PNG data
 * URL and tears the context down when the queue goes quiet, so the cost is one
 * context and one frame per asset for the whole page.
 */

export type ThumbnailPreset = 'opal' | 'ruby' | 'natural' | 'plastic';

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  const draco = new DRACOLoader();
  draco.setDecoderPath('/asset/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
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
  const gltf = await loader.loadAsync(request.url);
  const scene = new THREE.Scene();
  scene.environment = environment.texture;
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 100);

  const visual = gltf.scene;
  applyPreset(visual, request.preset);
  scene.add(visual);

  scene.add(new THREE.HemisphereLight(0xeaf1ff, 0x3a2a56, 1.0));
  const key1 = new THREE.DirectionalLight(0xfff2fb, 2.6);
  key1.position.set(-3, 4.5, 5);
  scene.add(key1);
  const rim = new THREE.DirectionalLight(0x9fe6ff, 1.7);
  rim.position.set(4, -1, -4);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffb98a, 8, 14, 2);
  warm.position.set(2.6, 1.2, 2.6);
  scene.add(warm);

  let mixer: THREE.AnimationMixer | undefined;
  if (gltf.animations[0] && request.poseTime) {
    mixer = new THREE.AnimationMixer(visual);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(request.poseTime);
  }

  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center.clone();
  if (request.targetY !== undefined) {
    target.y = bounds.min.y + (bounds.max.y - bounds.min.y) * request.targetY;
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
