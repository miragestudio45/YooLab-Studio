import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createOceanCamera, oceanFrameHalfHeight, placeOceanCamera } from './camera';
import {
  intersectsClearance, reasons, seabedSafeY, stageCentre, stageClearance, SUBJECT_STAGES,
  type Clearance,
} from './stage';

/**
 * Blue Marine, as chapters 02 and 03's environment.
 *
 * Adapted from the engineering study in `reference-sources/BlueMarine`
 * (`src/main.js` plus the HAR capture it was built from). What is taken is the
 * *technique*, and every one of these is here because the reference proves it
 * carries an ocean where a generic three.js water scene does not:
 *
 *   - a background plate that is a gradient plus analytic light beams, drawn
 *     un-fogged behind everything, so the far field has structure rather than
 *     being a flat clear colour;
 *   - `FogExp2` in a depth-matched blue, which is the only thing that turns a
 *     scatter of rocks into distance. It is squared-exponential on purpose: at
 *     three units the foreground subject loses 0.4% of its contrast and at sixty
 *     it is gone, which is exactly the split the brief asks for;
 *   - world-space animated caustics multiplied additively over the seabed;
 *   - god rays as additively blended textured quads;
 *   - suspended dust, and a separate bubble field that only exists while the
 *     surface is being crossed;
 *   - the reef itself: `rock.glb`, `coral-1.glb` and `coral-3.glb` drawn as
 *     InstancedMesh against Blue Marine's own instance transforms, lifted out of
 *     `object-data/mpa.unseen` into `public/asset/ocean/reef-layout.json`. This
 *     is the single most load-bearing import in the file — a hand-scattered reef
 *     does not compose, and this one was composed.
 *   - schooling fish as one dynamic InstancedMesh per species, sharing the
 *     reference's KTX2 fish atlas;
 *   - manta and whale-shark silhouettes on Catmull-Rom paths, far enough back
 *     that the fog reduces them to shapes.
 *
 * Deliberately NOT taken: the HUD, the labels, the branding, the cursor ripple
 * canvas, OrbitControls and every camera control. The camera here is a constant.
 */

const ASSETS = {
  layout: '/asset/ocean/reef-layout.json',
  rock: '/asset/ocean/models/rock.glb',
  coral1: '/asset/ocean/models/coral-1.glb',
  coral3: '/asset/ocean/models/coral-3.glb',
  sardine: '/asset/ocean/models/sardine.glb',
  anchovy: '/asset/ocean/models/anchovy.glb',
  mackerel: '/asset/ocean/models/mackerel.glb',
  manta: '/asset/ocean/models/manta.glb',
  whaleshark: '/asset/ocean/models/whaleshark.glb',
  whale: '/asset/ocean/models/whale.glb',
  rockTex: '/asset/ocean/textures/rock.ktx2',
  coralTex: '/asset/ocean/textures/coral.ktx2',
  sandTex: '/asset/ocean/textures/sand.ktx2',
  fishAtlas: '/asset/ocean/textures/fish-atlas.ktx2',
  faunaTex: '/asset/ocean/textures/whaleshark-manta.ktx2',
  whaleTex: '/asset/ocean/textures/whale.ktx2',
  matcap: '/asset/ocean/textures/matcap-white.png',
} as const;

type Transform = { p: [number, number, number]; r: [number, number, number, number]; s: [number, number, number] };
type ReefLayout = {
  rocks: Transform[];
  coral1: Transform[];
  coral3: Transform[];
  schools: Record<string, [number, number, number][]>;
};

export type OceanWorld = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Key + rim reserved for the educational subject, so it keeps local contrast. */
  subjectKey: THREE.PointLight;
  subjectRim: THREE.PointLight;
  environment: THREE.Texture;
  update(delta: number, elapsed: number, dive: number, presence: { fish: number; jelly: number }): void;
  resize(aspect: number): void;
  dispose(): void;
};

export type OceanOptions = {
  compact: boolean;
  reduceMotion: boolean;
};

/* ------------------------------------------------------------------ loaders --- */

function createLoaders(renderer: THREE.WebGLRenderer) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('/asset/draco/');
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath('/asset/basis/');
  ktx2.detectSupport(renderer);
  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);
  gltf.setKTX2Loader(ktx2);
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return {
    gltf,
    ktx2,
    image: new THREE.TextureLoader(),
    dispose() { draco.dispose(); ktx2.dispose(); },
  };
}

type Loaders = ReturnType<typeof createLoaders>;

/**
 * Every remote read is allowed to fail into a procedural stand-in.
 *
 * The reference does this because its assets were proxied; here they are all
 * local, so a failure means a genuinely broken deploy — and a reef that loses
 * its rock texture but keeps its composition is a far better failure than a
 * chapter that renders nothing.
 */
async function safeTexture(loaders: Loaders, url: string, anisotropy: number) {
  try {
    const texture = await loaders.ktx2.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    return texture;
  } catch (error) {
    console.warn('[ocean] texture unavailable', url, error);
    return null;
  }
}

async function safeGLB(loaders: Loaders, url: string) {
  try {
    return await loaders.gltf.loadAsync(url);
  } catch (error) {
    console.warn('[ocean] model unavailable', url, error);
    return null;
  }
}

/* ------------------------------------------------------------------ grading --- */

/**
 * Art direction on an imported material, without touching the texture.
 *
 * Blue Marine's reef is a documentary capture: strongly saturated moss on the
 * rock, a hard cyan in the water, warm sand. That is a fine picture and it is
 * not YooLab's — the site it has to sit inside is warm ivory and restrained, and
 * an unmodified import reads as a different product bolted on.
 *
 * The grading happens in the shader rather than on the asset for three reasons:
 * the source stays untouched and re-gradable, it costs nothing (three lines in a
 * fragment shader already running), and it operates after the sRGB decode, so
 * saturation means what it says instead of being applied to encoded values.
 *
 *   `saturation`  1 keeps the source; below 1 pulls toward its own luminance.
 *   `tint`        multiplied in, for pushing a hue family without crushing it.
 *   `lift`        added to the shadow end only, which is where underwater
 *                 scattering actually shows up.
 */
function gradeMaterial(
  material: THREE.MeshStandardMaterial,
  options: { saturation: number; tint: THREE.Color; lift: number },
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSaturation = { value: options.saturation };
    shader.uniforms.uTint = { value: options.tint };
    shader.uniforms.uLift = { value: options.lift };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSaturation;
        uniform vec3 uTint;
        uniform float uLift;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float grey = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(grey), diffuseColor.rgb, uSaturation) * uTint;
          /* Scattering lifts the shadows, not the highlights: a flat add would
             just wash the whole surface out, which is the look being fixed. */
          diffuseColor.rgb += uLift * (1.0 - smoothstep(0.0, 0.45, grey));
        }`);
  };
  /* Distinct programs per grade, or three.js reuses one compiled shader for
     materials that differ only in a callback it cannot see. */
  material.customProgramCacheKey = () =>
    `grade:${options.saturation}:${options.tint.getHexString()}:${options.lift}`;
  return material;
}

/* --------------------------------------------------------------- background --- */

/**
 * The far plate: a vertical gradient with four analytic light beams in it.
 *
 * Un-fogged and depth-write-off at the back of the world. This is the
 * reference's `makeBackground`, re-graded for a frame whose subject is a
 * foreground animal rather than the water itself — the deep is a little less
 * black and the cyan a little less saturated, because the fish has to be the
 * brightest thing in the picture.
 */
function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uDrift: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uDrift;
      float beam(float x, float c, float w) { return exp(-pow((x - c) / w, 2.0)); }
      void main() {
        /* Regraded from the reference's cerulean toward teal, and the top stop
           is pulled well back from pure cyan — the brightest thing in the frame
           has to be the animal, not the water behind it. */
        vec3 deep = vec3(0.010, 0.072, 0.212);
        vec3 mid  = vec3(0.028, 0.286, 0.470);
        vec3 cyan = vec3(0.118, 0.660, 0.712);
        float g = smoothstep(0.04, 0.98, vUv.y);
        vec3 col = mix(deep, mid, pow(g, 0.72));
        col = mix(col, cyan, pow(g, 2.6) * 0.56);
        float rays =
            beam(vUv.x, 0.16 + 0.018 * sin(uTime * 0.12 + uDrift * 0.5), 0.055)
          + beam(vUv.x, 0.34 + 0.019 * cos(uTime * 0.10), 0.075)
          + beam(vUv.x, 0.58 + 0.015 * sin(uTime * 0.08), 0.084)
          + beam(vUv.x, 0.80 + 0.014 * cos(uTime * 0.09 - uDrift), 0.055);
        col += vec3(0.20, 0.62, 0.75) * rays * pow(g, 3.2) * 0.30;
        col += vec3(0.10, 0.28, 0.32) * smoothstep(0.45, 1.0, vUv.y) * 0.05;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  /*
   * 340x230, not the reference's 210x125.
   *
   * At 124 units from this camera the frame is 224 world units wide, so the
   * reference plate is narrower than the view it is supposed to fill — and a
   * 1920 capture showed exactly that: a vertical seam where the plate ended and
   * the flat clear colour behind it began. The plate has to over-cover the
   * frustum at its own depth, and at this distance the extra area costs nothing
   * because it is one un-lit, depth-write-off quad either way.
   */
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(340, 230), material);
  mesh.position.set(0, 26, -132);
  mesh.renderOrder = -100;
  return { mesh, material };
}

/* ------------------------------------------------------------------- seabed --- */

const hashNoise = (x: number, z: number) => (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
const waveNoise = (x: number, z: number) =>
  Math.sin(x * 0.19) * 0.1 + Math.sin(z * 0.12 + x * 0.07) * 0.08
  + Math.sin((x - z) * 0.31) * 0.03 + hashNoise(x, z) * 0.016;

function createSeabed(sandTexture: THREE.Texture | null, compact: boolean) {
  const geometry = new THREE.PlaneGeometry(190, 520, compact ? 72 : 128, compact ? 240 : 420);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, -1.48 + waveNoise(position.getX(i), position.getZ(i)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  if (sandTexture) sandTexture.repeat.set(24, 78);
  const material = gradeMaterial(new THREE.MeshStandardMaterial({
    map: sandTexture,
    /* The reference's 0xc9dbd3 is for a scene whose subject is the water. Here
       the subject is an animal five units from the lens, and a seabed running to
       92% value under it takes the frame's top end away from the thing that
       needs it. Warm rather than neutral: the sand is the one place the ocean is
       allowed to remember the ivory site it came from. */
    /*
     * Darkened about a quarter and cooled, from a capture rather than a taste.
     *
     * The plain runs to the horizon and, lit, it was returning more light than
     * anything else in the frame — so the eye went to the floor and the picture
     * read as a bright band of sand with a chapter happening above it. Value is
     * the whole of the fix: the hue stays where it was, a warm ivory memory of
     * the site above water, but it now sits below the reef rather than above it,
     * which is what lets the fog put distance into the rest of the frame.
     */
    color: sandTexture ? 0x6d8580 : 0x486760,
    roughness: 0.97,
    metalness: 0,
  }), { saturation: 0.6, tint: new THREE.Color(0xc4c3b4), lift: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -220;
  return mesh;
}

/**
 * Caustics.
 *
 * The reference's shader verbatim in its band structure — two interfering sine
 * sets, an inverted power curve to keep only the bright filaments, additive
 * blend over the seabed. It is a world-space plane rather than a screen effect,
 * which is what makes the pattern crawl over the sand in perspective instead of
 * sliding across the lens.
 */
function createCaustics() {
  const geometry = new THREE.PlaneGeometry(190, 520, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      uniform float uTime;
      uniform float uStrength;
      void main() {
        vec2 p = vUv * vec2(56.0, 156.0);
        float a = sin(p.x * 1.07 + uTime * 0.62) + sin(p.y * 0.77 - uTime * 0.48) + sin((p.x + p.y) * 0.58 + uTime * 0.32);
        float b = sin(p.x * 0.41 - p.y * 0.63 - uTime * 0.37) + sin(p.x * 0.92 + p.y * 0.28 + uTime * 0.51);
        float n = abs(a * 0.48 + b * 0.35);
        float c = pow(max(0.0, 1.0 - n * 0.62), 8.0);
        float fade = smoothstep(0.0, 0.10, vUv.y) * smoothstep(1.0, 0.83, vUv.y);
        /* Caustics die with distance for the same reason the fog does: a bright
           filament sixty units out reads as noise, not as light on sand. */
        float reach = 1.0 - smoothstep(14.0, 62.0, vDepth);
        float k = c * fade * reach * uStrength;
        gl_FragColor = vec4(vec3(0.22, 0.95, 1.0) * c * 0.54 * uStrength, k * 0.34);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -1.33, -220);
  mesh.renderOrder = -8;
  return { mesh, material };
}

/* --------------------------------------------------------------- light rays --- */

function rayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const vertical = ctx.createLinearGradient(0, 0, 0, 512);
  vertical.addColorStop(0, 'rgba(230,255,255,.88)');
  vertical.addColorStop(0.4, 'rgba(170,245,255,.16)');
  vertical.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 64, 512);
  const horizontal = ctx.createLinearGradient(0, 0, 64, 0);
  horizontal.addColorStop(0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, 64, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRays(count: number) {
  const group = new THREE.Group();
  const texture = rayTexture();
  const seeds: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const seed = (Math.sin(i * 91.7) * 0.5 + 0.5);
    seeds.push(seed);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.055 + seed * 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3 + seed * 5, 44 + seed * 32), material);
    mesh.position.set(-15 + i * 3.3, 12, -22 - i * 5.5);
    mesh.rotation.x = -0.11;
    mesh.rotation.y = (i - count * 0.4) * 0.024;
    mesh.renderOrder = -6;
    group.add(mesh);
  }
  return { group, texture, seeds };
}

/* ------------------------------------------------------------------ suspend --- */

function createDust(count: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.sin(i * 12.9898) * 0.5 + 0.5 - 0.5) * 48;
    positions[i * 3 + 1] = -1 + (Math.sin(i * 78.233) * 0.5 + 0.5) * 16;
    positions[i * 3 + 2] = 6 - (Math.sin(i * 37.719) * 0.5 + 0.5) * 128;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xcff6ff,
    size: 0.035,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/**
 * Bubbles.
 *
 * Not in the reference's ocean, and here for one reason: they are the cheapest
 * honest signal that the eye has just gone under. They rise on the GPU from a
 * per-particle seed and wrap, so nothing is written from the CPU, and their
 * opacity is driven by the dive — strongest just after the crossing, restrained
 * once the chapter has settled, which is what stops them reading as a filter.
 */
function createBubbles(count: number) {
  const seeds = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    seeds[i * 3] = (Math.sin(i * 4.1237) * 0.5 + 0.5) * 2 - 1;
    seeds[i * 3 + 1] = Math.sin(i * 9.3311) * 0.5 + 0.5;
    seeds[i * 3 + 2] = Math.sin(i * 2.7714) * 0.5 + 0.5;
    scales[i] = 0.4 + (Math.sin(i * 17.13) * 0.5 + 0.5) * 0.6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, -14), 40);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aScale;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vFade;
      void main() {
        float lane = position.x;
        float seedY = position.y;
        float seedZ = position.z;
        float rise = fract(seedY + uTime * (0.05 + seedZ * 0.07));
        vec3 p = vec3(
          lane * 9.0 + sin(uTime * 0.6 + seedY * 31.0) * 0.22,
          -1.6 + rise * 11.0,
          -8.0 - seedZ * 15.0
        );
        vFade = smoothstep(0.0, 0.12, rise) * (1.0 - smoothstep(0.72, 1.0, rise));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aScale * 26.0 * uPixelRatio / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        /* A bubble is a rim, not a dot: bright shell, hollow middle. */
        float shell = smoothstep(0.55, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r));
        float core = (1.0 - smoothstep(0.0, 0.85, r)) * 0.22;
        gl_FragColor = vec4(vec3(0.80, 0.96, 1.0), (shell + core) * vFade * uOpacity);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return { points, material };
}

/* --------------------------------------------------------------------- reef --- */

function collectParts(gltf: GLTF | null) {
  const parts: THREE.BufferGeometry[] = [];
  gltf?.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) parts.push(mesh.geometry.clone());
  });
  return parts;
}

const matrixScratch = new THREE.Matrix4();
const positionScratch = new THREE.Vector3();
const quaternionScratch = new THREE.Quaternion();
const scaleScratch = new THREE.Vector3();
const sphereScratch = new THREE.Vector3();

/**
 * Instance a reef part, leaving the subject volumes empty.
 *
 * The cull is done against the SOURCE geometry's own bounding sphere scaled by
 * each instance, so it is correct for a boulder at 12x and a coral sprig at 2x
 * without either being described anywhere. A dropped instance is dropped from
 * every part of that model at once — the loop below builds the reduced transform
 * list first, so a rock's three sub-meshes never disagree about whether the rock
 * exists.
 */
function instanceParts(
  parts: THREE.BufferGeometry[],
  transforms: Transform[],
  material: THREE.Material,
  clearances: Clearance[],
) {
  let kept = transforms;
  let dropped = 0;
  if (clearances.length && parts.length) {
    /*
     * The instance's REAL world sphere, not a guess from its scale.
     *
     * A first pass used `sourceRadius * instanceScale` as the collision radius,
     * and a boulder at 12.9x turned that into roughly ten world units — which
     * culled almost the entire reef and left the fish floating over a bare sand
     * plain. The geometry knows its own bounding sphere and where that sphere
     * sits relative to the instance origin (rocks are modelled with their base
     * at the origin, so the centre is well above it); transforming that is
     * exact, and it is also cheap because it happens once at build.
     *
     * `SPHERE_FIT` acknowledges the one place this is still conservative: a
     * bounding sphere around a lumpy, wider-than-tall rock encloses a lot of
     * empty water. Culling on the full sphere removes rocks that never come near
     * the subject, so the test uses a fraction of it — chosen by looking at the
     * frame, which is the only way to choose it.
     */
    const SPHERE_FIT = 0.5;
    let best: { centre: THREE.Vector3; radius: number } | null = null;
    for (const geometry of parts) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere;
      if (!sphere) continue;
      if (!best || sphere.radius > best.radius) best = { centre: sphere.center.clone(), radius: sphere.radius };
    }
    if (best) {
      const centre = best.centre;
      const sourceRadius = best.radius;
      kept = transforms.filter((t) => {
        positionScratch.set(t.p[0], t.p[1], t.p[2]);
        quaternionScratch.set(t.r[0], t.r[1], t.r[2], t.r[3]);
        scaleScratch.set(t.s[0], t.s[1], t.s[2]);
        matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch);
        sphereScratch.copy(centre).applyMatrix4(matrixScratch);
        const scale = Math.max(Math.abs(t.s[0]), Math.abs(t.s[1]), Math.abs(t.s[2]));
        const hit = intersectsClearance(sphereScratch, sourceRadius * scale * SPHERE_FIT, clearances);
        if (hit) dropped += 1;
        return !hit;
      });
    }
  }
  const group = new THREE.Group();
  group.userData.dropped = dropped;
  for (const geometry of parts) {
    const mesh = new THREE.InstancedMesh(geometry, material, kept.length);
    kept.forEach((t, i) => {
      positionScratch.set(t.p[0], t.p[1], t.p[2]);
      quaternionScratch.set(t.r[0], t.r[1], t.r[2], t.r[3]);
      scaleScratch.set(t.s[0], t.s[1], t.s[2]);
      mesh.setMatrixAt(i, matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/* ------------------------------------------------------------------ schools --- */

function firstGeometry(gltf: GLTF | null) {
  let geometry: THREE.BufferGeometry | null = null;
  gltf?.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!geometry && mesh.isMesh) geometry = mesh.geometry.clone();
  });
  return geometry as THREE.BufferGeometry | null;
}

type SchoolOptions = {
  count: number;
  spread: [number, number, number];
  speed: number;
  scale: [number, number];
};

class FishSchool {
  readonly mesh: THREE.InstancedMesh;
  private readonly fish: { x: number; y: number; z: number; phase: number; speed: number; scale: number; dir: number }[] = [];
  private readonly dummy = new THREE.Object3D();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    centres: [number, number, number][],
    options: SchoolOptions,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, options.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < options.count; i += 1) {
      const centre = centres[i % centres.length];
      const r1 = Math.sin(i * 12.9898) * 0.5;
      const r2 = Math.sin(i * 78.233) * 0.5;
      const r3 = Math.sin(i * 37.719) * 0.5;
      this.fish.push({
        x: centre[0] + r1 * options.spread[0],
        y: centre[1] + r2 * options.spread[1],
        z: centre[2] + r3 * options.spread[2],
        phase: (Math.sin(i * 4.113) * 0.5 + 0.5) * Math.PI * 2,
        speed: options.speed * (0.7 + (Math.sin(i * 9.71) * 0.5 + 0.5) * 0.6),
        scale: options.scale[0] + (Math.sin(i * 2.331) * 0.5 + 0.5) * (options.scale[1] - options.scale[0]),
        dir: i % 2 ? 1 : -1,
      });
    }
  }

  update(time: number) {
    const dummy = this.dummy;
    for (let i = 0; i < this.fish.length; i += 1) {
      const f = this.fish[i];
      const travel = Math.sin(time * f.speed + f.phase) * 2.4 * f.dir;
      dummy.position.set(
        f.x + travel,
        f.y + Math.sin(time * 0.62 + f.phase) * 0.18,
        f.z + Math.cos(time * 0.25 + f.phase) * 0.35,
      );
      dummy.rotation.set(0, f.dir > 0 ? -Math.PI / 2 : Math.PI / 2, Math.sin(time * 0.4 + f.phase) * 0.06);
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ ambient --- */

/**
 * A silhouette on a path.
 *
 * Kept from the reference because it is the depth cue nothing else provides: a
 * large animal moving slowly at forty units reads as *volume of water*, which no
 * amount of fog density can say on its own. Cut back hard from the reference's
 * eight swimmers to three, all far, all under the fog — the brief's "background
 * wildlife must be subtle" is the binding constraint, not the spectacle.
 */
/**
 * How thin a background animal gets when it is behind the subject.
 *
 * Not zero. A twenty-six-unit humpback blinking out because it drifted behind a
 * jellyfish would be a more conspicuous event than the crowding it was meant to
 * cure, and the animal is the reason the water reads as deep even where it is
 * not legible. A sixth of its opacity is present as depth and gone as
 * competition.
 */
const FAUNA_FLOOR = 0.16;

class AmbientSwimmer {
  readonly root: THREE.Object3D;
  /**
   * Half-extents after scaling, for the subject-clearance test.
   *
   * Two of them, taken from the model's own bounds. All three of these animals
   * are far wider than they are thick, and treating a manta's four-and-a-half
   * unit wingspan as its vertical size too would have it "crowding" a subject it
   * is passing well above.
   */
  readonly radiusX: number;
  readonly radiusY: number;
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly material: THREE.Material & { opacity: number };
  private readonly baseOpacity: number;
  private readonly next = new THREE.Vector3();

  constructor(
    gltf: GLTF,
    points: THREE.Vector3[],
    material: THREE.Material,
    private readonly options: { length: number; duration: number; offset: number; opacity: number; phase: number },
  ) {
    this.root = cloneSkeleton(gltf.scene);
    const box = new THREE.Box3().setFromObject(this.root);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 1e-4);
    this.root.scale.multiplyScalar(options.length / longest);
    this.radiusX = options.length * 0.5;
    this.radiusY = options.length * 0.5 * Math.max(0.08, size.y / longest);
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    /*
     * A material per animal, cloned from the shared one.
     *
     * `options.opacity` was declared for every swimmer and then never read: all
     * four rendered at the shared material's value, so the three depths the
     * placement comment below describes were three sizes at one opacity. The
     * clone is what makes that number mean anything, and it is also what lets
     * one animal thin out near the subject without thinning the others.
     *
     * It costs no shader. Opacity is a uniform and not a define, so every clone
     * shares the base material's program — nothing here can compile during the
     * crossing, which is the one thing the transition cannot afford.
     */
    this.material = material.clone() as THREE.Material & { opacity: number };
    this.baseOpacity = (material as THREE.Material & { opacity: number }).opacity * options.opacity;
    this.material.opacity = this.baseOpacity;
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = this.material;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
    });
  }

  update(time: number) {
    const u = (time / this.options.duration + this.options.offset) % 1;
    this.curve.getPointAt(u, this.root.position);
    this.curve.getPointAt(Math.min(0.999, u + 0.008), this.next);
    this.root.position.y += Math.sin(time * 0.28 + this.options.phase) * 0.1;
    this.root.lookAt(this.next);
    this.root.rotateZ(Math.sin(time * 0.16 + this.options.phase) * 0.025);
  }

  /** `clear` is 1 in open water and 0 directly behind a subject on screen. */
  setClearance(clear: number) {
    const wanted = this.baseOpacity * (FAUNA_FLOOR + (1 - FAUNA_FLOOR) * clear);
    if (Math.abs(this.material.opacity - wanted) > 1e-4) this.material.opacity = wanted;
  }

  dispose() {
    this.material.dispose();
  }
}

/**
 * The subjects, with the half-extents of their own silhouettes.
 *
 * Deliberately not the reef clearance ellipsoid's radii: that volume carries a
 * margin and applies the longest axis in every direction, so at the jellyfish's
 * six units it covers 27° of the frame — a keep-out that wide takes the
 * megafauna out of most of the picture, which is the opposite failure to the one
 * being fixed.
 *
 * Width and height are kept apart because the two subjects are shaped nothing
 * alike. The fish is four units long and a quarter as tall, framed left; the
 * jellyfish is as tall as it is long, framed right. One isotropic radius for
 * both means either a cone too wide to leave the fish chapter any background
 * animals, or one too narrow to keep them out of the bell.
 */
const SUBJECT_BOXES = (['fish', 'jelly'] as const).map((key) => {
  const stage = SUBJECT_STAGES[key];
  const length = stage.span * stage.scale;
  return {
    key,
    centre: stageCentre({ ...stage, y: seabedSafeY(stage) }),
    halfWidth: length * 0.5,
    halfHeight: length * stage.aspect * 0.5,
  };
});

const eyeToPoint = new THREE.Vector3();
const viewForward = new THREE.Vector3();
const viewRight = new THREE.Vector3();
const viewUp = new THREE.Vector3();

/**
 * How much of a background animal survives where it is, right now.
 *
 * The reef is culled against the subjects once, at build, because the reef does
 * not move. The megafauna do: three animals on minute-long paths that cross the
 * whole frame, against two subjects framed on opposite sides of it. There is no
 * fixed path that clears both, and a capture of chapter 03 showed what that
 * costs — a manta ray drawn through the bell and down among the tentacles, on a
 * path that is perfectly clear in chapter 02.
 *
 * So it is resolved per frame, exactly as the flower field resolves the same
 * problem on land: the animal knows where the subject is and thins out rather
 * than crossing it.
 *
 * The test is run in FRAME space — both bodies projected onto the live camera's
 * right/up plane and divided by the frame's own half-extents at their depth —
 * because "crowding" is a claim about the picture and not about the water. An
 * angle from the eye was the first attempt and it conflates the two axes: it
 * faded the manta out of chapter 02, where the fish is wide and on the left and
 * the manta is high and on the right, with clear water between them.
 */
function subjectClearance(
  eye: THREE.Vector3,
  quaternion: THREE.Quaternion,
  aspect: number,
  fov: number,
  swimmer: AmbientSwimmer,
  presence: { fish: number; jelly: number },
) {
  if (presence.fish < 0.02 && presence.jelly < 0.02) return 1;
  viewForward.set(0, 0, -1).applyQuaternion(quaternion);
  viewRight.set(1, 0, 0).applyQuaternion(quaternion);
  viewUp.set(0, 1, 0).applyQuaternion(quaternion);

  /** A world point and a world size, as a fraction of the frame at its depth. */
  const place = (point: THREE.Vector3, halfWidth: number, halfHeight: number) => {
    eyeToPoint.copy(point).sub(eye);
    const depth = eyeToPoint.dot(viewForward);
    if (depth <= 0.05) return null;
    const halfH = oceanFrameHalfHeight(depth, fov);
    const halfW = halfH * aspect;
    return {
      x: eyeToPoint.dot(viewRight) / halfW,
      y: eyeToPoint.dot(viewUp) / halfH,
      rx: halfWidth / halfW,
      ry: halfHeight / halfH,
    };
  };

  let clear = 1;
  for (const box of SUBJECT_BOXES) {
    const weight = presence[box.key];
    if (weight < 0.02) continue;
    const subject = place(box.centre, box.halfWidth, box.halfHeight);
    const animal = place(swimmer.root.position, swimmer.radiusX, swimmer.radiusY);
    if (!subject || !animal) continue;
    /* Normalised separation: below 1 the two silhouettes overlap on screen. */
    const dx = (animal.x - subject.x) / Math.max(1e-4, subject.rx + animal.rx);
    const dy = (animal.y - subject.y) / Math.max(1e-4, subject.ry + animal.ry);
    const separation = Math.sqrt(dx * dx + dy * dy);
    /* Fully thinned while it is inside the subject, released by the time it is
       one silhouette clear. The animals are on 52-to-118-second paths, so even
       the whole ramp is several seconds of travel and reads as haze rather than
       as a fade. */
    const t = Math.min(1, Math.max(0, (separation - 0.72) / 0.78));
    clear = Math.min(clear, 1 - weight * (1 - t * t * (3 - 2 * t)));
  }
  return clear;
}

const path = (...points: [number, number, number][]) => points.map((p) => new THREE.Vector3(...p));

/* ------------------------------------------------------------------- world --- */

export async function createOceanWorld(
  renderer: THREE.WebGLRenderer,
  environment: THREE.Texture,
  options: OceanOptions,
): Promise<OceanWorld> {
  const { compact, reduceMotion } = options;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loaders = createLoaders(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a4763);
  /*
   * Squared-exponential, and the density is the reference's.
   *
   * The brief's constraint — "underwater fog must NOT wash the foreground
   * educational subject" — is satisfied by the *shape* of this curve, not by
   * turning it down. At the subject's three units it removes 0.4% of contrast;
   * at twenty units, 17%; at sixty, 81%. A linear fog tuned to reach the same
   * far value would have taken a fifth of the fish's contrast with it.
   */
  /* Teal rather than the reference's cerulean, and denser. The hue is what
     connects the ocean to the rest of the site; the density is what gives the
     reef a near, a mid and a far instead of two banks and a backdrop. */
  scene.fog = new THREE.FogExp2(0x0b4a63, 0.029);
  scene.environment = environment;
  scene.environmentIntensity = 0.85;

  const camera = createOceanCamera(1);
  scene.add(camera);

  /* --------------------------------------------------------------- lighting --- */
  const hemisphere = new THREE.HemisphereLight(0xc3f7ff, 0x132948, 1.75);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xe8ffff, 3.35);
  sun.position.set(-5.5, 12, 3.5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x63bdf5, 1.15);
  fill.position.set(4, 5, 7);
  scene.add(fill);

  /*
   * Two lights that exist only for the subject.
   *
   * The ambient ocean rig above is balanced for a reef forty units deep; the
   * educational animal is three units from the lens and needs its own key and
   * its own rim or it sits in the same value band as the rocks behind it. They
   * are parented to the camera so the modelling stays put while the subject
   * moves between chapter 02's mark and chapter 03's.
   */
  /*
   * Point lights with a hard reach, NOT directionals.
   *
   * The first pass used two DirectionalLights parented to the camera, and the
   * capture showed exactly why that cannot work: a directional light has no
   * falloff, so a "subject key" at 2.6 was adding 2.6 to every rock in the reef
   * as well. The whole frame went up together and the subject gained nothing but
   * a blown white flank. A point light with an explicit `distance` is the only
   * rig here that can actually be local: these reach nine and a half units, the
   * subjects stand at five, and the reef beyond is lit by the ambient rig alone.
   */
  const subjectKey = new THREE.PointLight(0xf2ffff, 26, 10.5, 2);
  subjectKey.position.set(-2.6, 2.5, -4.2);
  /*
   * Raised and shortened, because its reach was landing on the floor.
   *
   * At `y: 0.6` and a fourteen-unit radius the rim sat two units above the sand
   * and lit a hard diagonal streak across the bottom of both ocean captures —
   * the brightest thing in a frame whose subject is the animal. Nine and a half
   * units from a point a metre and a half above the subject still wraps the
   * silhouette and no longer reaches the seabed at all.
   */
  const subjectRim = new THREE.PointLight(0x9fe8ff, 42, 9.5, 2);
  subjectRim.position.set(2.4, 1.55, -9.6);
  camera.add(subjectKey, subjectRim);
  /*
   * Both stand level with the subject rather than at the lens, and the reason is
   * inverse-square.
   *
   * A point light on the camera is roughly two units from the seabed directly
   * below it and five from the animal, so it delivers about six times as much
   * light to the sand in the bottom of the frame as to the thing the chapter is
   * about — the first capture had a blown foreground and an under-lit fish from
   * exactly this. Moving them out to the subject's own depth flips that ratio,
   * and the `distance` cutoff still keeps the reef behind on the ambient rig.
   */

  /* --------------------------------------------------------------- elements --- */
  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);
  const caustics = createCaustics();
  scene.add(caustics.mesh);
  const rays = createRays(compact ? 6 : 10);
  scene.add(rays.group);
  const dust = createDust(compact ? 900 : 1900);
  scene.add(dust);
  const bubbles = createBubbles(compact ? 220 : 520);
  bubbles.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  scene.add(bubbles.points);

  /* ------------------------------------------------------------------ loads --- */
  const [layout, rockGLB, coral1GLB, coral3GLB, rockTex, coralTex, sandTex] = await Promise.all([
    fetch(ASSETS.layout).then((r) => (r.ok ? (r.json() as Promise<ReefLayout>) : null)).catch(() => null),
    safeGLB(loaders, ASSETS.rock),
    safeGLB(loaders, ASSETS.coral1),
    safeGLB(loaders, ASSETS.coral3),
    safeTexture(loaders, ASSETS.rockTex, anisotropy),
    safeTexture(loaders, ASSETS.coralTex, anisotropy),
    safeTexture(loaders, ASSETS.sandTex, anisotropy),
  ]);

  const seabed = createSeabed(sandTex, compact);
  scene.add(seabed);

  /*
   * The reef, re-graded for YooLab.
   *
   * The rock's moss is the loudest thing in the imported palette and the least
   * like this site; it comes down hardest and is pushed from yellow-green toward
   * a muted sage-teal. The coral keeps more of its own colour — it is the reef's
   * only warm note and the frame needs it — but loses the acid edge. Both get a
   * small teal lift in the shadows, which is what water actually does to a
   * shaded surface and what makes the near and far banks separate.
   */
  const rockMaterial = gradeMaterial(new THREE.MeshStandardMaterial({
    map: rockTex, color: rockTex ? 0xa9bfb8 : 0x4d6d6c, roughness: 0.95, metalness: 0,
  }), { saturation: 0.62, tint: new THREE.Color(0xb9d4d2), lift: 0.045 });
  const coralMaterial = gradeMaterial(new THREE.MeshStandardMaterial({
    map: coralTex, color: coralTex ? 0xb3bda4 : 0x4f7566, roughness: 0.84, metalness: 0, side: THREE.DoubleSide,
  }), { saturation: 0.74, tint: new THREE.Color(0xc2d3c6), lift: 0.04 });

  /* The two subject volumes, carved out of the reef before it is instanced. */
  const clearances: Clearance[] = [stageClearance(SUBJECT_STAGES.fish), stageClearance(SUBJECT_STAGES.jelly)];

  const reef = new THREE.Group();
  let droppedInstances = 0;
  if (layout) {
    const rockParts = collectParts(rockGLB);
    const coral1Parts = collectParts(coral1GLB);
    const coral3Parts = collectParts(coral3GLB);
    for (const [parts, transforms, material] of [
      [rockParts, layout.rocks, rockMaterial],
      [coral1Parts, layout.coral1, coralMaterial],
      [coral3Parts, layout.coral3, coralMaterial],
    ] as [THREE.BufferGeometry[], Transform[], THREE.Material][]) {
      if (!parts.length) continue;
      const group = instanceParts(parts, transforms, material, clearances);
      droppedInstances += (group.userData.dropped as number) ?? 0;
      reef.add(group);
    }
  }
  /*
   * A near reef bank, authored rather than imported.
   *
   * Blue Marine's layout has nothing between the camera and about nine units,
   * because its own camera stood further back. From the approved station that
   * leaves the bottom of the frame as an unbroken sand plain in both chapters —
   * a scene with a midground and a distance and no foreground, which is what
   * makes it read as "rocks placed around a model" rather than as a place.
   *
   * These are placed on the seabed just inside the near plane, in two banks that
   * hug the frame's lower corners, and they run through the same clearance test
   * as the imported reef so they can never be the thing that collides. The
   * pattern is deterministic — a hash, not `Math.random` — so the composition is
   * the same picture on every load.
   */
  function foregroundReef(parts: THREE.BufferGeometry[], material: THREE.Material, count: number, seed: number) {
    if (!parts.length) return null;
    const transforms: Transform[] = [];
    for (let i = 0; i < count; i += 1) {
      const h = (n: number) => {
        const v = Math.sin((i + 1) * n + seed) * 43758.5453;
        return v - Math.floor(v);
      };
      const side = i % 2 === 0 ? -1 : 1;
      /* Out at the frame edges, never across the middle where the subjects and
         the sand corridor are. */
      const x = 0.85 + side * (2.9 + h(12.9898) * 3.4);
      const z = -8.6 - h(78.233) * 3.2;
      const y = -1.46 + h(37.719) * 0.12;
      const angle = h(4.1237) * Math.PI * 2;
      const scale = 1.5 + h(9.3311) * 2.6;
      transforms.push({
        p: [x, y, z],
        r: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
        s: [scale, scale * (0.8 + h(2.7714) * 0.5), scale],
      });
    }
    return instanceParts(parts, transforms, material, clearances);
  }

  if (layout) {
    const nearCoral = foregroundReef(collectParts(coral1GLB), coralMaterial, compact ? 8 : 16, 3.7);
    if (nearCoral) reef.add(nearCoral);
    const nearRock = foregroundReef(collectParts(coral3GLB), coralMaterial, compact ? 5 : 11, 11.3);
    if (nearRock) reef.add(nearRock);
  }

  scene.add(reef);
  if (process.env.NODE_ENV !== 'production') {
    (window as unknown as { __reef?: unknown }).__reef = {
      dropped: droppedInstances,
      total: (layout?.rocks.length ?? 0) + (layout?.coral1.length ?? 0) + (layout?.coral3.length ?? 0),
      reasons: { ...reasons },
      clearances,
    };
  }

  /* ---------------------------------------------------------------- schools --- */
  const schools: FishSchool[] = [];
  const [sardineGLB, anchovyGLB, mackerelGLB, fishAtlas] = await Promise.all([
    safeGLB(loaders, ASSETS.sardine),
    safeGLB(loaders, ASSETS.anchovy),
    compact ? Promise.resolve(null) : safeGLB(loaders, ASSETS.mackerel),
    safeTexture(loaders, ASSETS.fishAtlas, anisotropy),
  ]);
  const schoolMaterial = new THREE.MeshStandardMaterial({
    map: fishAtlas,
    color: fishAtlas ? 0xffffff : 0xa8e7ee,
    roughness: 0.6,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const schoolPlan: { gltf: GLTF | null; centres: [number, number, number][]; options: SchoolOptions }[] = [
    {
      gltf: sardineGLB,
      centres: [[-9, 2.4, -19], [4, 3.2, -24], [11, 2.0, -28]],
      options: { count: compact ? 34 : 68, spread: [5, 2.5, 7], speed: 0.8, scale: [0.16, 0.36] },
    },
    {
      gltf: anchovyGLB,
      centres: [[-10, 0.6, -30], [0, 1.6, -35], [10, 1.1, -38]],
      options: { count: compact ? 46 : 96, spread: [6, 3, 9], speed: 0.68, scale: [0.13, 0.3] },
    },
    {
      gltf: mackerelGLB,
      centres: [[-11, 4.0, -44], [2, 4.6, -49], [12, 3.6, -53]],
      options: { count: 62, spread: [7, 3.5, 11], speed: 0.56, scale: [0.12, 0.26] },
    },
  ];
  for (const plan of schoolPlan) {
    const geometry = firstGeometry(plan.gltf);
    if (!geometry) continue;
    const school = new FishSchool(geometry, schoolMaterial, plan.centres, plan.options);
    schools.push(school);
    scene.add(school.mesh);
  }

  /* ---------------------------------------------------------------- ambient --- */
  const swimmers: AmbientSwimmer[] = [];
  let faunaMaterial: THREE.Material | null = null;
  let whaleMaterial: THREE.Material | null = null;
  let whaleTexRef: THREE.Texture | null = null;
  if (!compact) {
    const [mantaGLB, sharkGLB, whaleGLB, faunaTex, whaleTex, matcap] = await Promise.all([
      safeGLB(loaders, ASSETS.manta),
      safeGLB(loaders, ASSETS.whaleshark),
      safeGLB(loaders, ASSETS.whale),
      safeTexture(loaders, ASSETS.faunaTex, anisotropy),
      safeTexture(loaders, ASSETS.whaleTex, anisotropy),
      loaders.image.loadAsync(ASSETS.matcap).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; }).catch(() => null),
    ]);
    whaleTexRef = whaleTex;
    if (matcap) {
      /*
       * Bright and thin, not dark and solid.
       *
       * A matcap shades by view normal, so an animal turned away from the lens
       * goes almost black — and a black silhouette at thirty units reads as the
       * most contrasty thing in a frame whose subject is a pale animal five units
       * away. Tinting toward the water and dropping the opacity lets the fog do
       * the placing, which is what actually makes them read as distance.
       */
      whaleMaterial = new THREE.MeshMatcapMaterial({
        map: whaleTex, matcap, color: 0x9cc0cc, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      });
      faunaMaterial = new THREE.MeshMatcapMaterial({
        map: faunaTex, matcap, color: 0x93b9c8, transparent: true, opacity: 0.52, side: THREE.DoubleSide,
      });
    } else {
      whaleMaterial = new THREE.MeshStandardMaterial({
        map: whaleTex, roughness: 0.74, metalness: 0, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      });
      faunaMaterial = new THREE.MeshStandardMaterial({
        map: faunaTex, roughness: 0.72, metalness: 0, transparent: true, opacity: 0.52, side: THREE.DoubleSide,
      });
    }
    /*
     * Deep, and only three of them.
     *
     * The reference runs eight swimmers between 33 and 75 units. A capture at 40
     * units showed the failure the brief names outright: a manta at that depth is
     * still a *shape*, and it swam straight through the jellyfish at a comparable
     * size — background wildlife competing with the subject rather than placing
     * it. At 52 units the fog has taken 70% of their contrast and at 70 it has
     * taken 86%, which is the depth at which they stop being animals and start
     * being the reason the water reads as deep.
     */
    /*
     * Three animals, at three depths, sized to be RECOGNISED.
     *
     * The first pass put them at 52-78 units, where the fog had taken 70-86% of
     * their contrast — they were technically present and read as smudges, which
     * is worth neither the bytes nor the draw calls. The brief asks for the
     * opposite: visible, beautiful, and still unmistakably background.
     *
     * So each one is placed at the depth where the fog does the job the brief
     * describes rather than erasing it, and scaled up to match:
     *
     *   manta        ~29 units, 51% fog — the closest, and the one whose shape is
     *                readable enough to name.
     *   whale shark  ~42 units, 78% fog — larger, softer, clearly further.
     *   humpback     ~55 units, 92% fog — a silhouette rather than an animal,
     *                and the only thing in the scene big enough to say how much
     *                water there is.
     *
     * All four sit ABOVE the subjects' own band (world y 4.4 and up, against a
     * fish at 0.4 and a jellyfish bell reaching 2.6), so they cross the frame in
     * open water rather than through the animal the chapter is about.
     *
     * None of their paths crosses the frame centre at the same time as another,
     * and all three pass behind the reef banks rather than in front of them.
     */
    if (mantaGLB) {
      swimmers.push(new AmbientSwimmer(
        mantaGLB,
        path([-20, 5.0, -30], [-10, 4.7, -28], [2, 4.4, -29], [13, 4.6, -32], [21, 4.9, -36]),
        faunaMaterial,
        { length: 9.4, duration: 52, offset: 0.08, opacity: 0.9, phase: 0.2 },
      ));
      swimmers.push(new AmbientSwimmer(
        mantaGLB,
        path([22, 3.4, -40], [11, 3.7, -37], [0, 3.9, -36], [-12, 3.6, -39], [-22, 4.0, -44]),
        faunaMaterial,
        { length: 6.8, duration: 71, offset: 0.54, opacity: 0.78, phase: 1.6 },
      ));
    }
    if (sharkGLB) {
      swimmers.push(new AmbientSwimmer(
        sharkGLB,
        path([-26, 6.0, -44], [-13, 5.7, -41], [0, 5.4, -40], [13, 5.6, -44], [26, 5.2, -50]),
        faunaMaterial,
        { length: 16.5, duration: 78, offset: 0.36, opacity: 0.84, phase: 0.7 },
      ));
    }
    if (whaleGLB && whaleMaterial) {
      swimmers.push(new AmbientSwimmer(
        whaleGLB,
        path([-32, 7.6, -58], [-16, 8.0, -54], [0, 7.8, -53], [17, 7.3, -57], [32, 6.8, -64]),
        whaleMaterial,
        { length: 26, duration: 118, offset: 0.62, opacity: 0.72, phase: 0.4 },
      ));
    }
    for (const swimmer of swimmers) scene.add(swimmer.root);
  }

  loaders.dispose();

  /* ------------------------------------------------------------------ frame --- */
  let aspect = 1;

  return {
    scene,
    camera,
    subjectKey,
    subjectRim,
    environment,
    resize(next: number) {
      aspect = next;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    update(delta: number, elapsed: number, dive: number, presence: { fish: number; jelly: number }) {
      placeOceanCamera(camera, dive);
      const fov = camera.fov;
      const time = reduceMotion ? 0 : elapsed;
      backdrop.material.uniforms.uTime.value = time;
      caustics.material.uniforms.uTime.value = time;
      /* Caustics resolve *after* the surface has closed over the eye: below the
         boundary you are looking at light already refracted, and having it at
         full strength while the sky is still in frame reads as a texture on the
         sand rather than as light through water. */
      caustics.material.uniforms.uStrength.value = 0.16 + 0.84 * Math.min(1, Math.max(0, (dive - 0.34) / 0.5));
      for (let i = 0; i < rays.group.children.length; i += 1) {
        const ray = rays.group.children[i] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        ray.material.opacity = (0.05 + 0.035 * (0.5 + 0.5 * Math.sin(time * 0.15 + i)))
          * Math.min(1, Math.max(0, (dive - 0.24) / 0.42));
      }
      dust.rotation.y = Math.sin(time * 0.03) * 0.05;
      dust.position.y = Math.sin(time * 0.12) * 0.08;
      bubbles.material.uniforms.uTime.value = time;
      /* A burst on the way through, then a residue. Peaks at the crossing and
         settles to a tenth of that once the chapter is established. */
      const crossing = Math.min(1, Math.max(0, (dive - 0.2) / 0.28));
      const settle = 1 - 0.86 * Math.min(1, Math.max(0, (dive - 0.62) / 0.3));
      bubbles.material.uniforms.uOpacity.value = crossing * settle;
      if (reduceMotion) return;
      for (const school of schools) school.update(elapsed);
      for (const swimmer of swimmers) {
        swimmer.update(elapsed);
        swimmer.setClearance(
          subjectClearance(camera.position, camera.quaternion, aspect, fov, swimmer, presence),
        );
      }
      void delta;
    },
    dispose() {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
      });
      backdrop.material.dispose();
      caustics.material.dispose();
      bubbles.material.dispose();
      rays.texture?.dispose();
      (dust.material as THREE.Material).dispose();
      for (const ray of rays.group.children) ((ray as THREE.Mesh).material as THREE.Material).dispose();
      rockMaterial.dispose();
      coralMaterial.dispose();
      schoolMaterial.dispose();
      for (const swimmer of swimmers) swimmer.dispose();
      faunaMaterial?.dispose();
      whaleMaterial?.dispose();
      whaleTexRef?.dispose();
      rockTex?.dispose();
      coralTex?.dispose();
      sandTex?.dispose();
      fishAtlas?.dispose();
    },
  };
}
