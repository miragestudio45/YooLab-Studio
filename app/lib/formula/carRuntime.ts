import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Shared Formula car runtime.
 *
 * The full-screen experience and the library preview card both need the same
 * protected loader, the same texture channel conventions and the same material
 * set, so the pieces that must not drift live here. Every invariant from the
 * original implementation is preserved deliberately:
 *
 *   - every GLB under `public/asset/Library/Car` is XOR-protected with 0x5A and
 *     must be decoded before `GLTFLoader.parseAsync`;
 *   - material names carry a `.003` style suffix that has to be stripped before
 *     lookup;
 *   - base colour is sRGB, normal/ORM/mask are NoColorSpace, and the car
 *     textures use `flipY = true` to match the capture's UVs;
 *   - the car ORM is not standard: G is roughness, B is metalness, and AO moves
 *     between R (assembled) and A (kit), which is why `uKitProgress` exists;
 *   - bounds and scale must be computed at the assembled endpoints before the
 *     nodes are returned to their kit pose.
 */

export const CAR_BASE = '/asset/Library/Car/';

export type MaterialShader = {
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
  vertexShader: string;
};

export type CarPieceState = {
  object: THREE.Object3D;
  kitPosition: THREE.Vector3;
  assembledPosition: THREE.Vector3;
  kitQuaternion: THREE.Quaternion;
  assembledQuaternion: THREE.Quaternion;
  isWheel: boolean;
  isFrontWheel: boolean;
};

export function endpointPosition(value: unknown, fallback: THREE.Vector3) {
  if (!Array.isArray(value) || value.length < 3 || value.some((item) => typeof item !== 'number')) {
    return fallback.clone();
  }
  return new THREE.Vector3(value[0], value[2], -value[1]);
}

export function endpointQuaternion(value: unknown, fallback: THREE.Quaternion) {
  if (!Array.isArray(value) || value.length < 4 || value.some((item) => typeof item !== 'number')) {
    return fallback.clone();
  }
  // The glTF extras store Blender quaternions as WXYZ. Convert to Three's XYZW
  // while changing from Blender's Z-up coordinates to the runtime Y-up system.
  return new THREE.Quaternion(value[1], value[3], -value[2], value[0]).normalize();
}

export function normalizeModel(object: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.sub(center.clone().multiplyScalar(scale));
}

export function disposeScene(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(object as THREE.Line).isLine) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

/* -------------------------------------------------------------- branding --- */

type BrandRegion = {
  /** Centre in texture pixels, on the 2048 square body atlas. */
  cx: number;
  cy: number;
  /** Extent along the wordmark baseline. */
  length: number;
  /** Extent across the wordmark. */
  thickness: number;
  /** Baseline angle in degrees. */
  angle: number;
};

/**
 * Tobacco wordmark positions on `body_baseColor.webp`.
 *
 * The shipped livery is a period McLaren with Marlboro wordmarks printed six
 * times across the atlas. Those are the only decals removed: Honda, Shell,
 * Goodyear, BOSS, the panel lines, the red/white split and every other detail
 * stay exactly as authored, and normal/ORM detail is untouched, so the paint
 * keeps its richness.
 */
const TOBACCO_REGIONS: BrandRegion[] = [
  // Engine cover, left and right of the centreline.
  { cx: 812, cy: 174, length: 340, thickness: 112, angle: 79 },
  { cx: 1033, cy: 168, length: 330, thickness: 116, angle: -81.5 },
  // Nose flanks. The atlas mirrors about x = 922.
  { cx: 717, cy: 776, length: 244, thickness: 108, angle: 66.4 },
  { cx: 1128, cy: 776, length: 244, thickness: 108, angle: -66.4 },
  // Nose top, printed in grey rather than black.
  { cx: 97, cy: 936, length: 196, thickness: 88, angle: -82.9 },
  // Rear wing endplate strip.
  { cx: 1712, cy: 1288, length: 300, thickness: 136, angle: 87.8 },
];

function medianChannel(values: number[]) {
  if (!values.length) return 235;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/**
 * Repaints the tobacco wordmarks with the colour of the panel they sit on.
 *
 * Only the printed ink is replaced, never the whole rectangle: a pixel is
 * repainted if it is dark, inside one of the boxes, and surrounded by a bright
 * panel. That keeps panel edges, the black atlas background and every other
 * decal untouched even where a box overhangs, and the replacement colour is the
 * median of the panel pixels inside the same box, so a wordmark on white comes
 * back white and one on red comes back red.
 */
export function neutralizeBodyBranding(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;
  context.drawImage(source, 0, 0, width, height);
  const scale = width / 2048;

  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const luminance = (index: number) => (
    (pixels[index * 4] * 77 + pixels[index * 4 + 1] * 150 + pixels[index * 4 + 2] * 29) >> 8
  );

  for (const region of TOBACCO_REGIONS) {
    const cx = region.cx * scale;
    const cy = region.cy * scale;
    const half = (region.length * scale) / 2;
    const across = (region.thickness * scale) / 2;
    const radians = THREE.MathUtils.degToRad(region.angle);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Work in a local window: the rotated box plus a margin the flood fill uses
    // to recognise the atlas background.
    const margin = 10;
    const reachX = Math.ceil(Math.abs(half * cos) + Math.abs(across * sin)) + margin;
    const reachY = Math.ceil(Math.abs(half * sin) + Math.abs(across * cos)) + margin;
    const minX = Math.max(0, Math.floor(cx - reachX));
    const maxX = Math.min(width - 1, Math.ceil(cx + reachX));
    const minY = Math.max(0, Math.floor(cy - reachY));
    const maxY = Math.min(height - 1, Math.ceil(cy + reachY));
    const localWidth = maxX - minX + 1;
    const localHeight = maxY - minY + 1;
    if (localWidth < 4 || localHeight < 4) continue;

    const insideBox = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      return Math.abs(dx * cos + dy * sin) <= half && Math.abs(-dx * sin + dy * cos) <= across;
    };

    // Panel colour and ink threshold, both derived from the window itself so a
    // wordmark on red behaves the same as one on white.
    const luminances: number[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (insideBox(x, y)) luminances.push(luminance(y * width + x));
      }
    }
    if (luminances.length < 32) continue;
    luminances.sort((a, b) => a - b);
    const panelLuminance = luminances[Math.floor(luminances.length * 0.8)];
    const inkThreshold = Math.max(24, panelLuminance - 55);
    const panelFloor = panelLuminance - 26;

    const reds: number[] = [];
    const greens: number[] = [];
    const blues: number[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!insideBox(x, y)) continue;
        const index = y * width + x;
        if (luminance(index) < panelFloor) continue;
        reds.push(pixels[index * 4]);
        greens.push(pixels[index * 4 + 1]);
        blues.push(pixels[index * 4 + 2]);
      }
    }
    if (!reds.length) continue;
    const fillR = medianChannel(reds);
    const fillG = medianChannel(greens);
    const fillB = medianChannel(blues);

    // Dark pixels reachable from the window border belong to the atlas cut-out
    // or to a panel outline, never to the printed wordmark. Flood them first and
    // repaint only the dark islands that remain.
    const dark = new Uint8Array(localWidth * localHeight);
    for (let y = 0; y < localHeight; y += 1) {
      for (let x = 0; x < localWidth; x += 1) {
        if (luminance((y + minY) * width + x + minX) < inkThreshold) dark[y * localWidth + x] = 1;
      }
    }
    const seen = new Uint8Array(dark.length);
    const queue: number[] = [];
    const pushSeed = (x: number, y: number) => {
      const local = y * localWidth + x;
      if (dark[local] && !seen[local]) { seen[local] = 1; queue.push(local); }
    };
    for (let x = 0; x < localWidth; x += 1) { pushSeed(x, 0); pushSeed(x, localHeight - 1); }
    for (let y = 0; y < localHeight; y += 1) { pushSeed(0, y); pushSeed(localWidth - 1, y); }
    while (queue.length) {
      const local = queue.pop() as number;
      const x = local % localWidth;
      const y = (local - x) / localWidth;
      if (x > 0) pushSeed(x - 1, y);
      if (x < localWidth - 1) pushSeed(x + 1, y);
      if (y > 0) pushSeed(x, y - 1);
      if (y < localHeight - 1) pushSeed(x, y + 1);
    }

    const repaint: number[] = [];
    for (let y = 0; y < localHeight; y += 1) {
      for (let x = 0; x < localWidth; x += 1) {
        const local = y * localWidth + x;
        if (!dark[local] || seen[local]) continue;
        const globalX = x + minX;
        const globalY = y + minY;
        if (!insideBox(globalX, globalY)) continue;
        repaint.push(globalY * width + globalX);
      }
    }
    // Two dilation passes clear the anti-aliased rim around each glyph.
    let frontier = repaint.slice();
    const painted = new Set(repaint);
    for (let pass = 0; pass < 2; pass += 1) {
      const next: number[] = [];
      for (const index of frontier) {
        for (const step of [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1]) {
          const neighbour = index + step;
          if (neighbour < 0 || neighbour >= width * height) continue;
          if (painted.has(neighbour)) continue;
          const nx = neighbour % width;
          const ny = (neighbour - nx) / width;
          if (!insideBox(nx, ny)) continue;
          if (luminance(neighbour) >= panelFloor) continue;
          painted.add(neighbour);
          next.push(neighbour);
        }
      }
      frontier = next;
    }

    // Directional inpaint: walk perpendicular to the baseline until the panel
    // reappears and take that colour. A flat median fill leaves a faint plate
    // where the panel has a gradient; following the gradient does not.
    const resolved = new Map<number, [number, number, number]>();
    for (const index of painted) {
      const x = index % width;
      const y = (index - x) / width;
      let found: [number, number, number] | null = null;
      let best = Infinity;
      for (const direction of [1, -1]) {
        for (let step = 1; step <= across * 2 + 6; step += 1) {
          const sx = Math.round(x - sin * step * direction);
          const sy = Math.round(y + cos * step * direction);
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) break;
          const probe = sy * width + sx;
          if (painted.has(probe)) continue;
          if (luminance(probe) < panelFloor) continue;
          if (step < best) {
            best = step;
            found = [pixels[probe * 4], pixels[probe * 4 + 1], pixels[probe * 4 + 2]];
          }
          break;
        }
      }
      resolved.set(index, found ?? [fillR, fillG, fillB]);
    }
    for (const [index, colour] of resolved) {
      pixels[index * 4] = colour[0];
      pixels[index * 4 + 1] = colour[1];
      pixels[index * 4 + 2] = colour[2];
    }
  }

  context.putImageData(frame, 0, 0);
  return canvas;
}

/* ---------------------------------------------------------------- loaders --- */

export type CarLoaders = {
  loader: GLTFLoader;
  draco: DRACOLoader;
  ownedTextures: Set<THREE.Texture>;
  loadProtected: (name: string) => Promise<GLTF>;
  loadTexture: (name: string, srgb: boolean, flipY?: boolean) => Promise<THREE.Texture>;
  loadBodyBaseColor: () => Promise<THREE.Texture>;
  dispose: () => void;
};

export function createCarLoaders(renderer: THREE.WebGLRenderer): CarLoaders {
  const draco = new DRACOLoader();
  draco.setDecoderPath('/asset/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const textureLoader = new THREE.TextureLoader();
  const ownedTextures = new Set<THREE.Texture>();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const loadTexture = async (name: string, srgb: boolean, flipY = true) => {
    const texture = await textureLoader.loadAsync(`${CAR_BASE}${name}`);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = flipY;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    ownedTextures.add(texture);
    return texture;
  };

  const loadBodyBaseColor = async () => {
    const raw = await textureLoader.loadAsync(`${CAR_BASE}body_baseColor.webp`);
    const image = raw.image as HTMLImageElement;
    const canvas = neutralizeBodyBranding(image, image.naturalWidth || 2048, image.naturalHeight || 2048);
    raw.dispose();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    ownedTextures.add(texture);
    return texture;
  };

  const loadProtected = async (name: string): Promise<GLTF> => {
    const response = await fetch(`${CAR_BASE}${name}`);
    if (!response.ok) throw new Error(`Unable to load ${name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!(bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46)) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] ^= 0x5a;
    }
    return loader.parseAsync(bytes.buffer, CAR_BASE);
  };

  return {
    loader,
    draco,
    ownedTextures,
    loadProtected,
    loadTexture,
    loadBodyBaseColor,
    dispose: () => {
      for (const texture of ownedTextures) texture.dispose();
      ownedTextures.clear();
      draco.dispose();
    },
  };
}

/* -------------------------------------------------------------- materials --- */

export type CarTextureSet = {
  bodyBase: THREE.Texture;
  bodyNormal: THREE.Texture;
  bodyOrm: THREE.Texture;
  bottomBase: THREE.Texture;
  bottomNormal: THREE.Texture;
  bottomOrm: THREE.Texture;
  glassBase: THREE.Texture;
  glassOrm: THREE.Texture;
  interiorBase: THREE.Texture;
  interiorNormal: THREE.Texture;
  interiorOrm: THREE.Texture;
  wheelsBase: THREE.Texture;
  wheelsNormal: THREE.Texture;
  wheelsOrm: THREE.Texture;
};

export async function loadCarTextures(loaders: CarLoaders): Promise<CarTextureSet> {
  const [
    bodyBase, bodyNormal, bodyOrm,
    bottomBase, bottomNormal, bottomOrm,
    glassBase, glassOrm,
    interiorBase, interiorNormal, interiorOrm,
    wheelsBase, wheelsNormal, wheelsOrm,
  ] = await Promise.all([
    loaders.loadBodyBaseColor(),
    loaders.loadTexture('body_normal.webp', false),
    loaders.loadTexture('body_orm.webp', false),
    loaders.loadTexture('bottom_baseColor.webp', true),
    loaders.loadTexture('bottom_normal.webp', false),
    loaders.loadTexture('bottom_orm.webp', false),
    loaders.loadTexture('glass_baseColor.webp', true),
    loaders.loadTexture('glass_orm.webp', false),
    loaders.loadTexture('interior_baseColor.webp', true),
    loaders.loadTexture('interior_normal.webp', false),
    loaders.loadTexture('interior_orm.webp', false),
    loaders.loadTexture('wheels_baseColor.webp', true),
    loaders.loadTexture('wheels_normal.webp', false),
    loaders.loadTexture('wheels_orm.webp', false),
  ]);
  return {
    bodyBase, bodyNormal, bodyOrm,
    bottomBase, bottomNormal, bottomOrm,
    glassBase, glassOrm,
    interiorBase, interiorNormal, interiorOrm,
    wheelsBase, wheelsNormal, wheelsOrm,
  };
}

export type CarMaterialSet = {
  materials: Record<string, THREE.Material>;
  shaders: MaterialShader[];
};

export function createCarMaterials(
  textures: CarTextureSet,
  options: { initialKitProgress: number; envMapIntensity?: number },
): CarMaterialSet {
  const shaders: MaterialShader[] = [];
  const envMapIntensity = options.envMapIntensity ?? 0.62;

  const patchCarMaterial = (material: THREE.MeshPhysicalMaterial) => {
    material.onBeforeCompile = (shader) => {
      const patch = shader as unknown as MaterialShader;
      patch.uniforms.uKitProgress = { value: options.initialKitProgress };
      patch.fragmentShader = patch.fragmentShader.replace(
        '#include <aomap_fragment>',
        `
        #ifdef USE_AOMAP
          vec4 yoolabOrm = texture2D(aoMap, vAoMapUv);
          float ambientOcclusion = (mix(yoolabOrm.r, yoolabOrm.a, uKitProgress) - 1.0) * aoMapIntensity + 1.0;
          reflectedLight.indirectDiffuse *= ambientOcclusion;
          #if defined(USE_ENVMAP) && defined(STANDARD)
            float yoolabDotNV = saturate(dot(geometryNormal, geometryViewDir));
            reflectedLight.indirectSpecular *= computeSpecularOcclusion(yoolabDotNV, ambientOcclusion, material.roughness);
          #endif
        #endif
        `,
      );
      patch.fragmentShader = patch.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `
        float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          vec4 texelMetalness = texture2D(metalnessMap, vMetalnessMapUv);
          metalnessFactor *= texelMetalness.b;
        #endif
        metalnessFactor *= (1.0 - uKitProgress * 0.72);
        `,
      );
      patch.fragmentShader = patch.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uKitProgress;',
      );
      material.userData.shader = patch;
      shaders.push(patch);
    };
    material.customProgramCacheKey = () => `yoolab-car-${material.name}-v2`;
    return material;
  };

  const makeCarMaterial = (
    name: string,
    base: THREE.Texture,
    normal: THREE.Texture,
    orm: THREE.Texture,
    config: { roughness: number; metalness: number; ao: number; normalScale?: number },
  ) => patchCarMaterial(new THREE.MeshPhysicalMaterial({
    name,
    map: base,
    normalMap: normal,
    normalScale: new THREE.Vector2(config.normalScale ?? 1, config.normalScale ?? 1),
    roughnessMap: orm,
    metalnessMap: orm,
    aoMap: orm,
    aoMapIntensity: config.ao,
    roughness: config.roughness,
    metalness: config.metalness,
    envMapIntensity,
    side: THREE.DoubleSide,
  }));

  const materials: Record<string, THREE.Material> = {
    bottom_details_mat: makeCarMaterial('bottom_details_mat', textures.bottomBase, textures.bottomNormal, textures.bottomOrm, { roughness: 1, metalness: 0.28, ao: 0.82 }),
    wheels_mat: makeCarMaterial('wheels_mat', textures.wheelsBase, textures.wheelsNormal, textures.wheelsOrm, { roughness: 0.8, metalness: 0, ao: 0.5, normalScale: 2 }),
    body_mat: makeCarMaterial('body_mat', textures.bodyBase, textures.bodyNormal, textures.bodyOrm, { roughness: 0.82, metalness: 0.36, ao: 0.82 }),
    interior_mat: makeCarMaterial('interior_mat', textures.interiorBase, textures.interiorNormal, textures.interiorOrm, { roughness: 0.9, metalness: 0.22, ao: 0.78 }),
    glass_details_mat: new THREE.MeshPhysicalMaterial({
      name: 'glass_details_mat',
      map: textures.glassBase,
      roughnessMap: textures.glassOrm,
      metalnessMap: textures.glassOrm,
      color: 0xc8dcff,
      roughness: 1,
      metalness: 0,
      transmission: 0.12,
      thickness: 0.04,
      ior: 1.45,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      // The authored glass carries a strong emissive; the runtime replaces it
      // outright so the canopy does not glow.
      emissive: 0x000000,
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
      envMapIntensity: envMapIntensity * 0.52,
    }),
  };

  return { materials, shaders };
}

/**
 * Applies the material set, collects assembly endpoints and sizes the car from
 * its assembled pose.
 */
export function prepareCarVisual(
  carVisual: THREE.Object3D,
  materials: Record<string, THREE.Material>,
  displaySize: number,
) {
  const pieces: CarPieceState[] = [];

  // Materials, UVs and shadow flags belong on every mesh.
  carVisual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.material as THREE.Material;
    const baseName = source.name.replace(/\.\d+$/, '');
    if (materials[baseName]) object.material = materials[baseName];
    if (object.geometry.attributes.uv && !object.geometry.attributes.uv1) {
      object.geometry.setAttribute('uv1', object.geometry.attributes.uv);
    }
    object.geometry.computeBoundingBox();
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });

  // Assembly endpoints live on the glTF *node*, and a node with more than one
  // primitive is loaded as a Group whose child meshes carry no extras at all.
  // Collecting meshes instead of extras-bearing objects therefore left the five
  // multi-primitive parts — body_bottom, main_shell, cockpit and both rear
  // suspensions — permanently at their exploded kit pose.
  carVisual.traverse((object) => {
    const extras = object.userData as Record<string, unknown>;
    if (!extras || !Array.isArray(extras.assembled_location)) return;
    const loweredName = object.name.toLowerCase();
    pieces.push({
      object,
      kitPosition: endpointPosition(extras.kit_location, object.position),
      assembledPosition: endpointPosition(extras.assembled_location, object.position),
      kitQuaternion: endpointQuaternion(extras.kit_rotation, object.quaternion),
      assembledQuaternion: endpointQuaternion(extras.assembled_rotation, object.quaternion),
      isWheel: /tire|rim|lock|tube|brake_disc/.test(loweredName),
      isFrontWheel: /front/.test(loweredName),
    });
  });

  // Size and centre the display from the assembled endpoints. The shipped GLB
  // opens at its exploded KIT endpoints, so normalising that pose makes the
  // finished car undersized and visually scattered even at zero progress.
  for (const piece of pieces) {
    piece.object.position.copy(piece.assembledPosition);
    piece.object.quaternion.copy(piece.assembledQuaternion);
  }
  carVisual.updateMatrixWorld(true);
  const assembledBounds = new THREE.Box3().setFromObject(carVisual);
  const assembledSize = assembledBounds.getSize(new THREE.Vector3());
  const assembledCenter = assembledBounds.getCenter(new THREE.Vector3());
  const displayScale = displaySize / Math.max(assembledSize.x, assembledSize.y, assembledSize.z);
  carVisual.scale.setScalar(displayScale);
  carVisual.position.copy(assembledCenter).multiplyScalar(-displayScale);
  for (const piece of pieces) {
    piece.object.position.copy(piece.kitPosition);
    piece.object.quaternion.copy(piece.kitQuaternion);
  }
  return pieces;
}
