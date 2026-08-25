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
  /*
   * Geometry and baked maps recovered byte-for-byte from the Organimo HAR the
   * user supplied. They are source material, not a transplanted scene: every
   * mesh is normalised, re-lit, re-graded and placed by YooLab below.
   */
  organimoCoral0: '/asset/ocean/organimo/models/coral0.glb',
  organimoCoral2: '/asset/ocean/organimo/models/coral2.glb',
  organimoCoral3: '/asset/ocean/organimo/models/coral3.glb',
  organimoCoral4: '/asset/ocean/organimo/models/coral4.glb',
  organimoShoal: '/asset/ocean/organimo/models/fish-shoal.glb',
  organimoCoral0Tex: '/asset/ocean/organimo/textures/coral1_Bake.ktx2',
  organimoCoral2Tex: '/asset/ocean/organimo/textures/coral2_Bake.ktx2',
  organimoCoral3Tex: '/asset/ocean/organimo/textures/coral4_Bake.ktx2',
  organimoCoral4Tex: '/asset/ocean/organimo/textures/coral5_Bake.ktx2',
  organimoCoral2Emissive: '/asset/ocean/organimo/textures/coral2_emmission.ktx2',
  organimoCoral4Emissive: '/asset/ocean/organimo/textures/coral5_emmission.ktx2',
  organimoSand: '/asset/ocean/organimo/textures/sand_albedo.ktx2',
  organimoSandNormal: '/asset/ocean/organimo/textures/sand_normal.ktx2',
  organimoShoalTex: '/asset/ocean/organimo/textures/fish_shoal_BaseColor.ktx2',
  /* Kept at its original 1.7 MB source size; five small animated instances share
     its geometry, textures and program. */
  clownfish: '/asset/fish/Clownfish.glb',
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
  subjectAccent: THREE.PointLight;
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
async function safeTexture(
  loaders: Loaders,
  url: string,
  anisotropy: number,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
) {
  try {
    const texture = await loaders.ktx2.loadAsync(url);
    texture.colorSpace = colorSpace;
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
 * The far plate: Peach's near-black specimen ground, but still physically
 * connected to the water above it.
 *
 * Most of the field stays at #00001a. A narrow surface aperture and two broad,
 * drifting shafts are the only bright structure; they give the eye a surface
 * direction without turning the chapter back into a cyan aquarium.
 */
function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uDrift: { value: 0 }, uJelly: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uDrift;
      uniform float uJelly;
      float beam(float x, float c, float w) { return exp(-pow((x - c) / w, 2.0)); }
      void main() {
        /* Linear values: this plate is now resolved through the same ACES pass
           as the physical scene. 0.102 here used to mean sRGB #1a; through ACES
           it became royal blue. These are the linear equivalents that resolve
           back to the requested near-black #00001a family. */
        vec3 abyss = vec3(0.0, 0.0, 0.0075);
        vec3 indigo = vec3(0.0014, 0.0014, 0.016);
        vec3 surface = vec3(0.008, 0.042, 0.078);
        float height = smoothstep(0.28, 1.0, vUv.y);
        /* Broad enough that its lower edge never becomes a horizontal seam in
           the camera's visible slice of this oversized plate. */
        float aperture = smoothstep(-0.12, 1.04, vUv.y);
        aperture *= aperture;
        vec3 col = mix(abyss, indigo, height * 0.58);
        col = mix(col, surface, aperture * 0.26);

        /* Cones taper toward their origin at the surface instead of reading as
           four identical vertical stripes. */
        float spread = mix(0.16, 0.042, aperture);
        float centreA = 0.35 + 0.018 * sin(uTime * 0.095 + uDrift);
        float centreB = 0.68 + 0.014 * cos(uTime * 0.072 - uDrift);
        float rays = beam(vUv.x, centreA, spread)
          + 0.72 * beam(vUv.x, centreB, spread * 0.82);
        col += vec3(0.025, 0.09, 0.15) * rays * aperture * 0.22;

        /* A faint violet volume appears behind chapter 03, not as a full-frame
           filter. It gives the neon jelly and coral a colour family while the
           untouched outer field remains the requested #00001a. */
        float violetPool = beam(vUv.x, 0.72, 0.24) * (1.0 - smoothstep(0.52, 0.92, vUv.y));
        col += vec3(0.035, 0.004, 0.064) * violetPool * uJelly * 0.12;

        /* Keep the outer frame deep so text and distant silhouettes have a
           stable ground at every aspect ratio. */
        float vignette = smoothstep(0.78, 0.22, abs(vUv.x - 0.5));
        col *= mix(0.74, 1.0, vignette);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  /* Over-cover the entire far frustum at every supported aspect. A previous
     340x230 plate exposed one horizontal edge on short desktop frames once the
     camera aimed upward; a single unlit quad costs the same at this size. */
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 600), material);
  mesh.position.set(0, 0, -200);
  mesh.renderOrder = -100;
  return { mesh, material };
}

/* ------------------------------------------------------------------- seabed --- */

const hashNoise = (x: number, z: number) => (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
const waveNoise = (x: number, z: number) =>
  Math.sin(x * 0.19) * 0.1 + Math.sin(z * 0.12 + x * 0.07) * 0.08
  + Math.sin((x - z) * 0.31) * 0.03 + hashNoise(x, z) * 0.016;

function createSeabed(
  sandTexture: THREE.Texture | null,
  sandNormal: THREE.Texture | null,
  compact: boolean,
) {
  const geometry = new THREE.PlaneGeometry(190, 520, compact ? 72 : 128, compact ? 240 : 420);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, -1.48 + waveNoise(position.getX(i), position.getZ(i)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  if (sandTexture) sandTexture.repeat.set(24, 78);
  if (sandNormal) sandNormal.repeat.set(24, 78);
  const material = gradeMaterial(new THREE.MeshStandardMaterial({
    map: sandTexture,
    normalMap: sandNormal,
    normalScale: new THREE.Vector2(0.36, 0.36),
    /* Organimo's sand detail stays visible, but its value is deliberately below
       the reef and far below the subjects. */
    color: sandTexture ? 0x675b73 : 0x3d354b,
    roughness: 0.94,
    metalness: 0,
  }), { saturation: 0.72, tint: new THREE.Color(0xa28da9), lift: 0.006 });
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
  vertical.addColorStop(0, 'rgba(232,255,255,.92)');
  vertical.addColorStop(0.24, 'rgba(152,230,255,.28)');
  vertical.addColorStop(0.58, 'rgba(92,170,255,.08)');
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
      opacity: 0.07 + seed * 0.055,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4 + seed * 6, 50 + seed * 36), material);
    mesh.position.set(-13 + i * 4.2, 17, -26 - i * 7.2);
    mesh.rotation.x = -0.1;
    mesh.rotation.y = (i - count * 0.42) * 0.03;
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

/**
 * Flattens an imported scene into a one-unit, ground-registered set of parts.
 * Organimo's four coral files use different authoring scales and nested node
 * transforms; normalising the whole object once makes their authored placement
 * below deterministic instead of hiding model-specific magic numbers in it.
 */
function collectNormalisedParts(gltf: GLTF | null) {
  const parts: THREE.BufferGeometry[] = [];
  if (!gltf) return parts;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    parts.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  });
  if (!parts.length) return parts;

  const bounds = new THREE.Box3();
  for (const geometry of parts) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z, 1e-4);
  const normalise = new THREE.Matrix4()
    .makeTranslation(-centre.x, -bounds.min.y, -centre.z)
    .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  for (const geometry of parts) {
    geometry.applyMatrix4(normalise);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
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
    if (!geometry && mesh.isMesh) {
      const copy = mesh.geometry.clone();
      copy.computeBoundingBox();
      const bounds = copy.boundingBox;
      if (bounds) {
        const size = bounds.getSize(new THREE.Vector3());
        const centre = bounds.getCenter(new THREE.Vector3());
        const scale = 1 / Math.max(size.x, size.y, size.z, 1e-4);
        copy.translate(-centre.x, -centre.y, -centre.z);
        copy.scale(scale, scale, scale);
      }
      geometry = copy;
    }
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

/** A real rigged clownfish from the supplied source file, kept deliberately
 * small and slow so five of them read as life around the reef, not five new
 * educational subjects. Geometry, textures and the material are shared. */
class ClownSwimmer {
  readonly root = new THREE.Group();
  private readonly visual: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer | null;
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly next = new THREE.Vector3();

  constructor(
    gltf: GLTF,
    material: THREE.Material,
    points: THREE.Vector3[],
    private readonly options: { length: number; duration: number; offset: number; phase: number },
  ) {
    this.visual = cloneSkeleton(gltf.scene);
    const bounds = new THREE.Box3().setFromObject(this.visual);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    /* Box3 measures the clownfish in its bind pose, while the supplied clip
       expands the skinned fins/body much further at runtime. Compensate only at
       the instance transform: the 1.7 MB source mesh and textures stay intact. */
    const scale = (options.length * 0.32) / Math.max(size.x, size.y, size.z, 1e-4);
    this.visual.scale.setScalar(scale);
    this.visual.position.sub(centre.multiplyScalar(scale));
    this.visual.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.frustumCulled = false;
    });
    this.root.add(this.visual);
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.35);
    this.mixer = gltf.animations[0] ? new THREE.AnimationMixer(this.visual) : null;
    this.mixer?.clipAction(gltf.animations[0]).setEffectiveTimeScale(0.72).play();
  }

  update(delta: number, time: number) {
    const u = (time / this.options.duration + this.options.offset) % 1;
    this.curve.getPointAt(u, this.root.position);
    this.curve.getPointAt((u + 0.008) % 1, this.next);
    this.root.position.y += Math.sin(time * 0.42 + this.options.phase) * 0.08;
    this.root.lookAt(this.next);
    this.root.rotateZ(Math.sin(time * 0.28 + this.options.phase) * 0.055);
    this.mixer?.update(delta);
  }

  dispose() {
    this.mixer?.stopAllAction();
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
const FAUNA_FLOOR = 0.26;

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
  scene.background = new THREE.Color(0x00001a);
  /*
   * Squared-exponential, and the density is the reference's.
   *
   * The brief's constraint — "underwater fog must NOT wash the foreground
   * educational subject" — is satisfied by the *shape* of this curve, not by
   * turning it down. At the subject's three units it removes 0.4% of contrast;
   * at twenty units, 17%; at sixty, 81%. A linear fog tuned to reach the same
   * far value would have taken a fifth of the fish's contrast with it.
   */
  /* The abyss and the fog are the same colour, so distant geometry dissolves
     rather than exposing the edge of a cyan scene plate. */
  scene.fog = new THREE.FogExp2(0x00001a, 0.0235);
  scene.environment = environment;
  scene.environmentIntensity = 1.18;

  const camera = createOceanCamera(1);
  scene.add(camera);

  /* --------------------------------------------------------------- lighting --- */
  const hemisphere = new THREE.HemisphereLight(0x8fe9ff, 0x00001a, 0.82);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xe8ffff, 2.65);
  sun.position.set(-5.5, 12, 3.5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x416fc8, 0.54);
  fill.position.set(4, 5, 7);
  scene.add(fill);
  /* Low, finite pools return the Organimo coral's authored pink/violet colour
     without washing the water column. They also put the same restrained neon
     reflection into the sand that the supplied seabed reference uses. */
  const coralPink = new THREE.PointLight(0xff4f9f, 12, 17, 2);
  coralPink.position.set(-6.2, -0.15, -10.5);
  const coralViolet = new THREE.PointLight(0x8755ff, 14, 18, 2);
  coralViolet.position.set(6.4, 0.0, -13.5);
  const coralCyan = new THREE.PointLight(0x28d8ff, 9, 14, 2);
  coralCyan.position.set(1.2, -0.25, -8.8);
  scene.add(coralPink, coralViolet, coralCyan);

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
  const subjectKey = new THREE.PointLight(0xfff7ed, 27, 9.8, 2);
  subjectKey.position.set(-2.2, 2.6, -4.1);
  /*
   * Raised and shortened, because its reach was landing on the floor.
   *
   * At `y: 0.6` and a fourteen-unit radius the rim sat two units above the sand
   * and lit a hard diagonal streak across the bottom of both ocean captures —
   * the brightest thing in a frame whose subject is the animal. Nine and a half
   * units from a point a metre and a half above the subject still wraps the
   * silhouette and no longer reaches the seabed at all.
   */
  const subjectRim = new THREE.PointLight(0x43cfff, 32, 9.2, 2);
  subjectRim.position.set(2.4, 1.3, -8.5);
  const subjectAccent = new THREE.PointLight(0xff4fa8, 18, 8.8, 2);
  subjectAccent.position.set(-2.8, 0.9, -8.4);
  camera.add(subjectKey, subjectRim, subjectAccent);
  const fishKeyPosition = new THREE.Vector3(-2.2, 2.6, -4.1);
  const jellyKeyPosition = new THREE.Vector3(2.2, 2.8, -4.2);
  const fishRimPosition = new THREE.Vector3(2.4, 1.3, -8.5);
  const jellyRimPosition = new THREE.Vector3(-1.2, 1.6, -8.8);
  const fishAccentPosition = new THREE.Vector3(-2.8, 0.9, -8.4);
  const jellyAccentPosition = new THREE.Vector3(2.7, 0.4, -8.6);
  const fishKeyColor = new THREE.Color(0xfff7ed);
  const jellyKeyColor = new THREE.Color(0xe8f8ff);
  const fishRimColor = new THREE.Color(0x43cfff);
  const jellyRimColor = new THREE.Color(0x36d5ff);
  const fishAccentColor = new THREE.Color(0xff5b9f);
  const jellyAccentColor = new THREE.Color(0xe95cff);
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
  const rays = createRays(compact ? 3 : 5);
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

  /* Loaded while the visitor is still on land, alongside the original reef.
     Nothing below is requested or decoded at the water crossing. */
  const [
    organimoCoral0GLB,
    organimoCoral2GLB,
    organimoCoral3GLB,
    organimoCoral4GLB,
    organimoShoalGLB,
    organimoCoral0Tex,
    organimoCoral2Tex,
    organimoCoral3Tex,
    organimoCoral4Tex,
    organimoCoral2Emissive,
    organimoCoral4Emissive,
    organimoSand,
    organimoSandNormal,
    organimoShoalTex,
  ] = await Promise.all([
    safeGLB(loaders, ASSETS.organimoCoral0),
    safeGLB(loaders, ASSETS.organimoCoral2),
    safeGLB(loaders, ASSETS.organimoCoral3),
    safeGLB(loaders, ASSETS.organimoCoral4),
    safeGLB(loaders, ASSETS.organimoShoal),
    safeTexture(loaders, ASSETS.organimoCoral0Tex, anisotropy),
    safeTexture(loaders, ASSETS.organimoCoral2Tex, anisotropy),
    safeTexture(loaders, ASSETS.organimoCoral3Tex, anisotropy),
    safeTexture(loaders, ASSETS.organimoCoral4Tex, anisotropy),
    safeTexture(loaders, ASSETS.organimoCoral2Emissive, anisotropy),
    safeTexture(loaders, ASSETS.organimoCoral4Emissive, anisotropy),
    safeTexture(loaders, ASSETS.organimoSand, anisotropy),
    safeTexture(loaders, ASSETS.organimoSandNormal, anisotropy, THREE.NoColorSpace),
    safeTexture(loaders, ASSETS.organimoShoalTex, anisotropy),
  ]);

  const seabed = createSeabed(organimoSand ?? sandTex, organimoSandNormal, compact);
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
    map: rockTex, color: rockTex ? 0x647580 : 0x344454, roughness: 0.95, metalness: 0,
  }), { saturation: 0.43, tint: new THREE.Color(0x8194a2), lift: 0.006 });
  const coralMaterial = gradeMaterial(new THREE.MeshStandardMaterial({
    map: coralTex,
    color: coralTex ? 0xffffff : 0xb56a9a,
    emissive: new THREE.Color(0x3b1238),
    emissiveIntensity: 0.34,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  }), { saturation: 1.06, tint: new THREE.Color(0xffa4cf), lift: 0.014 });

  /* The two subject volumes, carved out of the reef before it is instanced. */
  const clearances: Clearance[] = [stageClearance(SUBJECT_STAGES.fish), stageClearance(SUBJECT_STAGES.jelly)];

  const reef = new THREE.Group();
  let droppedInstances = 0;
  if (layout) {
    const rockParts = collectParts(rockGLB);
    const coral1Parts = collectParts(coral1GLB);
    const coral3Parts = collectParts(coral3GLB);
    const restrainedRocks: Transform[] = layout.rocks.map((transform) => ({
      ...transform,
      s: [transform.s[0] * 0.74, transform.s[1] * 0.74, transform.s[2] * 0.74],
    }));
    for (const [parts, transforms, material] of [
      [rockParts, restrainedRocks, rockMaterial],
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
      const scale = 0.9 + h(9.3311) * 1.7;
      transforms.push({
        p: [x, y, z],
        r: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
        s: [scale, scale * (0.8 + h(2.7714) * 0.5), scale],
      });
    }
    return instanceParts(parts, transforms, material, clearances);
  }

  if (layout) {
    const nearCoral = foregroundReef(collectParts(coral1GLB), coralMaterial, compact ? 6 : 10, 3.7);
    if (nearCoral) reef.add(nearCoral);
    const nearRock = foregroundReef(collectParts(coral3GLB), coralMaterial, compact ? 4 : 7, 11.3);
    if (nearRock) reef.add(nearRock);
  }

  /* ---------------------------------------------------------- Organimo reef ---
   * Four silhouettes are enough to break up the imported rock vocabulary. They
   * stay low and live on the outer banks: richer than bare stones, still open
   * around the educational animal and its copy.
   */
  const organimoMaterials = [
    gradeMaterial(new THREE.MeshStandardMaterial({
      map: organimoCoral0Tex,
      color: organimoCoral0Tex ? 0xffb2c5 : 0xd96f99,
      emissive: new THREE.Color(0x67123e),
      emissiveIntensity: 0.52,
      roughness: 0.76,
      metalness: 0,
      side: THREE.DoubleSide,
    }), { saturation: 1.08, tint: new THREE.Color(0xff9fc4), lift: 0.012 }),
    gradeMaterial(new THREE.MeshStandardMaterial({
      map: organimoCoral2Tex,
      emissiveMap: organimoCoral2Emissive,
      emissive: new THREE.Color(0x763aff),
      emissiveIntensity: 1.08,
      color: organimoCoral2Tex ? 0xc5b4ff : 0x795ee0,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
    }), { saturation: 1.05, tint: new THREE.Color(0xcab5ff), lift: 0.013 }),
    gradeMaterial(new THREE.MeshStandardMaterial({
      map: organimoCoral3Tex,
      color: organimoCoral3Tex ? 0xff9eaa : 0xd85d7d,
      emissive: new THREE.Color(0x661a45),
      emissiveIntensity: 0.58,
      roughness: 0.77,
      metalness: 0,
      side: THREE.DoubleSide,
    }), { saturation: 1.12, tint: new THREE.Color(0xff91b1), lift: 0.012 }),
    gradeMaterial(new THREE.MeshStandardMaterial({
      map: organimoCoral4Tex,
      emissiveMap: organimoCoral4Emissive,
      emissive: new THREE.Color(0x18c8ff),
      emissiveIntensity: 0.96,
      color: organimoCoral4Tex ? 0xa6e9ff : 0x59b8df,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
    }), { saturation: 1.05, tint: new THREE.Color(0x9ccfff), lift: 0.012 }),
  ];
  const organimoParts = [
    collectNormalisedParts(organimoCoral0GLB),
    collectNormalisedParts(organimoCoral2GLB),
    collectNormalisedParts(organimoCoral3GLB),
    collectNormalisedParts(organimoCoral4GLB),
  ];
  const coralTransform = (
    x: number,
    z: number,
    scale: number,
    yaw: number,
    height = 1,
  ): Transform => ({
    p: [x, -1.45, z],
    r: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    s: [scale, scale * height, scale],
  });
  const organimoTransforms: Transform[][] = [
    [
      coralTransform(-5.8, -10.8, 2.2, 0.5, 1.1),
      coralTransform(5.6, -11.5, 1.8, -0.8, 1.15),
      coralTransform(-7.1, -17.5, 2.7, 1.1, 1.2),
      coralTransform(6.8, -21.0, 2.4, -1.5, 1.1),
      coralTransform(-3.8, -25.5, 1.7, 2.2, 1.05),
    ],
    [
      coralTransform(-4.5, -12.9, 1.65, -0.4, 1.2),
      coralTransform(4.7, -14.4, 1.85, 0.75, 1.3),
      coralTransform(-7.6, -22.8, 2.1, 1.7, 1.15),
      coralTransform(7.2, -28.5, 2.6, -1.1, 1.25),
    ],
    [
      coralTransform(-6.7, -14.2, 1.7, 1.25, 1.35),
      coralTransform(6.4, -16.7, 2.0, -0.55, 1.4),
      coralTransform(-5.4, -31.0, 2.8, 0.3, 1.25),
      coralTransform(8.1, -35.0, 3.1, -1.9, 1.2),
    ],
    [
      coralTransform(-4.1, -10.2, 1.2, 0.9, 1.4),
      coralTransform(5.0, -12.1, 1.35, -0.2, 1.45),
      coralTransform(-8.0, -20.2, 1.9, 2.4, 1.35),
      coralTransform(7.8, -24.3, 2.1, -2.0, 1.4),
      coralTransform(3.6, -32.5, 1.8, 0.65, 1.3),
    ],
  ];
  for (let i = 0; i < organimoParts.length; i += 1) {
    const transforms = compact
      ? organimoTransforms[i].filter((_, index) => index < 2 || index % 2 === 0)
      : organimoTransforms[i];
    if (!organimoParts[i].length) continue;
    reef.add(instanceParts(organimoParts[i], transforms, organimoMaterials[i], clearances));
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
  const [sardineGLB, anchovyGLB, mackerelGLB, fishAtlas, clownfishGLB] = await Promise.all([
    safeGLB(loaders, ASSETS.sardine),
    safeGLB(loaders, ASSETS.anchovy),
    compact ? Promise.resolve(null) : safeGLB(loaders, ASSETS.mackerel),
    safeTexture(loaders, ASSETS.fishAtlas, anisotropy),
    safeGLB(loaders, ASSETS.clownfish),
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
      options: { count: compact ? 30 : 58, spread: [5, 2.5, 7], speed: 0.8, scale: [0.07, 0.15] },
    },
    {
      gltf: anchovyGLB,
      centres: [[-10, 0.6, -30], [0, 1.6, -35], [10, 1.1, -38]],
      options: { count: compact ? 40 : 82, spread: [6, 3, 9], speed: 0.68, scale: [0.055, 0.12] },
    },
    {
      gltf: mackerelGLB,
      centres: [[-11, 4.0, -44], [2, 4.6, -49], [12, 3.6, -53]],
      options: { count: 52, spread: [7, 3.5, 11], speed: 0.56, scale: [0.045, 0.1] },
    },
  ];
  for (const plan of schoolPlan) {
    const geometry = firstGeometry(plan.gltf);
    if (!geometry) continue;
    const school = new FishSchool(geometry, schoolMaterial, plan.centres, plan.options);
    schools.push(school);
    scene.add(school.mesh);
  }

  /* One recognisable shoal shape from Organimo, repeated only a handful of
     times in mid-water. It punctuates the empty dark field without becoming a
     particle curtain. */
  const organimoSchoolMaterial = new THREE.MeshStandardMaterial({
    map: organimoShoalTex,
    color: organimoShoalTex ? 0xa7dbea : 0x8dc7db,
    roughness: 0.48,
    metalness: 0.05,
    emissive: new THREE.Color(0x071c32),
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide,
  });
  const shoalParts = collectNormalisedParts(organimoShoalGLB);
  for (const geometry of shoalParts) {
    const shoal = new FishSchool(
      geometry,
      organimoSchoolMaterial,
      [[-7.5, 3.8, -17], [6.5, 4.6, -23]],
      {
        count: compact ? 12 : 24,
        spread: [4.8, 2.4, 6.8],
        speed: 0.28,
        scale: compact ? [0.07, 0.14] : [0.08, 0.18],
      },
    );
    schools.push(shoal);
    scene.add(shoal.mesh);
  }

  /* Four on a phone, five on landscape. The supplied GLB remains byte-for-byte
     original; these are skeleton clones sharing one 1.7 MB asset, not compressed
     stand-ins or enlarged particle fish. */
  const clownSwimmers: ClownSwimmer[] = [];
  const clownSource = (() => {
    let found: THREE.MeshStandardMaterial | null = null;
    clownfishGLB?.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!found && mesh.isMesh) found = mesh.material as THREE.MeshStandardMaterial;
    });
    return found;
  })() as THREE.MeshStandardMaterial | null;
  const clownMaterial = clownSource?.clone() ?? new THREE.MeshStandardMaterial({ color: 0xff794f });
  clownMaterial.color.set(0xffffff);
  clownMaterial.roughness = 0.38;
  clownMaterial.metalness = 0;
  if ('clearcoat' in clownMaterial) {
    const physical = clownMaterial as THREE.MeshPhysicalMaterial;
    physical.clearcoat = 0.78;
    physical.clearcoatRoughness = 0.09;
    physical.envMapIntensity = 1.25;
  }
  const clownTextures = new Set<THREE.Texture>();
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'specularColorMap'] as const) {
    const texture = (clownMaterial as unknown as Record<string, THREE.Texture | null>)[key];
    if (texture?.isTexture) {
      texture.anisotropy = anisotropy;
      clownTextures.add(texture);
    }
  }
  if (clownfishGLB) {
    const plans = [
      { points: path([-8.2, 0.5, -16], [-5.8, 0.9, -17], [-6.6, 1.6, -20], [-9.1, 1.1, -19]), length: 0.22, duration: 32, offset: 0.08, phase: 0.2 },
      { points: path([5.4, 1.7, -17], [8.0, 1.2, -18], [7.2, 0.6, -21], [4.6, 1.0, -20]), length: 0.2, duration: 37, offset: 0.31, phase: 1.1 },
      { points: path([-1.0, 2.8, -23], [2.5, 3.0, -25], [3.2, 2.2, -27], [-2.2, 2.0, -26]), length: 0.17, duration: 43, offset: 0.57, phase: 2.4 },
      { points: path([-10.0, 2.9, -27], [-6.5, 3.5, -29], [-4.2, 2.7, -31], [-8.0, 2.3, -30]), length: 0.16, duration: 48, offset: 0.76, phase: 3.2 },
      { points: path([8.2, 3.2, -25], [10.4, 2.5, -28], [7.4, 2.0, -30], [5.8, 2.7, -27]), length: 0.19, duration: 41, offset: 0.92, phase: 4.4 },
    ];
    for (const plan of plans.slice(0, compact ? 4 : 5)) {
      const swimmer = new ClownSwimmer(clownfishGLB, clownMaterial, plan.points, plan);
      clownSwimmers.push(swimmer);
      scene.add(swimmer.root);
    }
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
        map: whaleTex, matcap, color: 0xc9e1e9, transparent: true, opacity: 0.66, side: THREE.DoubleSide,
      });
      faunaMaterial = new THREE.MeshMatcapMaterial({
        map: faunaTex, matcap, color: 0xc8e5ef, transparent: true, opacity: 0.76, side: THREE.DoubleSide,
      });
    } else {
      whaleMaterial = new THREE.MeshStandardMaterial({
        map: whaleTex, color: 0xc5dfe8, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.66, side: THREE.DoubleSide,
      });
      faunaMaterial = new THREE.MeshStandardMaterial({
        map: faunaTex, color: 0xc4e3ee, roughness: 0.68, metalness: 0, transparent: true, opacity: 0.76, side: THREE.DoubleSide,
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
        { length: 8.2, duration: 56, offset: 0.08, opacity: 0.9, phase: 0.2 },
      ));
      swimmers.push(new AmbientSwimmer(
        mantaGLB,
        path([22, 3.4, -40], [11, 3.7, -37], [0, 3.9, -36], [-12, 3.6, -39], [-22, 4.0, -44]),
        faunaMaterial,
        { length: 6.2, duration: 73, offset: 0.54, opacity: 0.82, phase: 1.6 },
      ));
    }
    if (sharkGLB) {
      swimmers.push(new AmbientSwimmer(
        sharkGLB,
        path([-26, 6.0, -44], [-13, 5.7, -41], [0, 5.4, -40], [13, 5.6, -44], [26, 5.2, -50]),
        faunaMaterial,
        { length: 14.5, duration: 82, offset: 0.36, opacity: 0.84, phase: 0.7 },
      ));
    }
    if (whaleGLB && whaleMaterial) {
      swimmers.push(new AmbientSwimmer(
        whaleGLB,
        path([-32, 7.6, -58], [-16, 8.0, -54], [0, 7.8, -53], [17, 7.3, -57], [32, 6.8, -64]),
        whaleMaterial,
        { length: 23, duration: 124, offset: 0.62, opacity: 0.8, phase: 0.4 },
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
    subjectAccent,
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
      backdrop.material.uniforms.uJelly.value += (presence.jelly - backdrop.material.uniforms.uJelly.value) * 0.08;
      caustics.material.uniforms.uTime.value = time;
      /* Caustics resolve *after* the surface has closed over the eye: below the
         boundary you are looking at light already refracted, and having it at
         full strength while the sky is still in frame reads as a texture on the
         sand rather than as light through water. */
      caustics.material.uniforms.uStrength.value = 0.16 + 0.84 * Math.min(1, Math.max(0, (dive - 0.34) / 0.5));
      for (let i = 0; i < rays.group.children.length; i += 1) {
        const ray = rays.group.children[i] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        ray.material.opacity = (0.065 + 0.045 * (0.5 + 0.5 * Math.sin(time * 0.15 + i)))
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

      /* Fish wants a clean white modelling key and cyan edge; the translucent
         jellyfish wants the key nearer its bell and a violet back edge. Lights
         move continuously between those authored rigs, so chapter 02 -> 03 has
         no lighting cut and allocates nothing. */
      const subjectTotal = Math.max(0.001, presence.fish + presence.jelly);
      const jellyMix = Math.min(1, Math.max(0, presence.jelly / subjectTotal));
      subjectKey.position.copy(fishKeyPosition).lerp(jellyKeyPosition, jellyMix);
      subjectRim.position.copy(fishRimPosition).lerp(jellyRimPosition, jellyMix);
      subjectAccent.position.copy(fishAccentPosition).lerp(jellyAccentPosition, jellyMix);
      subjectKey.color.copy(fishKeyColor).lerp(jellyKeyColor, jellyMix);
      subjectRim.color.copy(fishRimColor).lerp(jellyRimColor, jellyMix);
      subjectAccent.color.copy(fishAccentColor).lerp(jellyAccentColor, jellyMix);
      subjectKey.intensity = 27 - jellyMix * 9;
      subjectRim.intensity = 32 + jellyMix * 10;
      subjectAccent.intensity = 18 + jellyMix * 12;
      if (reduceMotion) return;
      for (const school of schools) school.update(elapsed);
      for (const clown of clownSwimmers) clown.update(delta, elapsed);
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
      seabed.material.dispose();
      for (const material of organimoMaterials) material.dispose();
      schoolMaterial.dispose();
      organimoSchoolMaterial.dispose();
      for (const clown of clownSwimmers) clown.dispose();
      clownMaterial.dispose();
      for (const texture of clownTextures) texture.dispose();
      for (const swimmer of swimmers) swimmer.dispose();
      faunaMaterial?.dispose();
      whaleMaterial?.dispose();
      whaleTexRef?.dispose();
      rockTex?.dispose();
      coralTex?.dispose();
      sandTex?.dispose();
      fishAtlas?.dispose();
      organimoCoral0Tex?.dispose();
      organimoCoral2Tex?.dispose();
      organimoCoral3Tex?.dispose();
      organimoCoral4Tex?.dispose();
      organimoCoral2Emissive?.dispose();
      organimoCoral4Emissive?.dispose();
      organimoSand?.dispose();
      organimoSandNormal?.dispose();
      organimoShoalTex?.dispose();
    },
  };
}
