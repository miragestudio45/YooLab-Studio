import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The building — the Open Industry Project's own warehouse shell, tiled.
 *
 * The robot cell used to stand in the Library's ivory studio, on the house rule
 * that every lab in this section shares one room. That rule was wrong here and
 * the reference screenshot is the argument: a palletising cell is not a specimen
 * on a turntable, it is a machine that only makes sense inside a building. A 3 m
 * arm in a white void has nothing to be 3 m *relative to*.
 *
 * So the room is theirs now, built from their kit:
 *
 *   `Wall_A`     10 × 12 m corrugated section with full X-bracing, 22.6 k tris
 *   `Wall_D`     the same section with a plain frame, 4.0 k tris
 *   `Roof_A`     10 × 10 m roof bay: deck, purlins, truss, high-bay light
 *   `Floor.glb`  10 × 10 m concrete slab
 *   `Light_A`    pendant high-bay fixture
 *
 * ## Materials arrive separately
 *
 * These GLBs carry placeholder base colours and no images at all — Godot binds
 * `.tres` materials to them by name at import time, so `Wall_A.glb`'s materials
 * are literally called `Wall_01` and `Framing_01` and are coloured red and blue.
 * Loading them as-is gives a red and blue building. `BINDINGS` below is the same
 * join Godot makes, against the texture sets `scripts/build-robot-model.mjs`
 * exports from `WallsAndRoof/Textures/`.
 *
 * ## Why the roof is split by material
 *
 * A roof bay is 68 k triangles and twenty of them is 1.4 M — more than the rest
 * of the lab put together, for something that is mostly above the frame. But the
 * bay is six primitives and they are not equally useful: the deck is 1.7 k and
 * reads from everywhere, while the truss is 44 k and only reads where you can
 * see into it. So they are instanced *separately*, over different section sets:
 * deck and trim everywhere, truss over the bays the camera actually looks
 * through. Same model, a third of the cost.
 */

const MODEL = '/asset/practice/robot';

/** Section size, metres. The kit is authored on a 10 m grid. */
export const SECTION = 10;
/** Wall height, metres. `Wall_A` is 12 m tall and the roof sits on top of it. */
export const WALL_HEIGHT = 12;

/**
 * Material name in the GLB → texture set on disk.
 *
 * `Floor_01` and `Floor_A` disagreeing is upstream's own naming, not a typo
 * here: the mesh's material is `Floor_01`, the texture files are
 * `BuildingPart_Floor_A_*`.
 */
const BINDINGS: Record<string, {
  set: string;
  normal?: boolean;
  emissive?: boolean;
  /**
   * Multiplied over the base-colour map.
   *
   * Godot renders these with its own tonemapper and exposure; three.js here uses
   * ACES at 0.92, and the same albedo comes out several stops brighter — the
   * corrugated siding read as white plastic rather than as galvanised steel. The
   * tint is matched against the upstream editor's own view of the building, and
   * it is a tint rather than a re-export because the *texture* is right: it is
   * the tone mapping between the two engines that differs.
   */
  tint?: number;
}> = {
  Wall_01: { set: 'wall_01', normal: true, tint: 0x9aa1a7 },
  Framing_01: { set: 'framing_01', tint: 0x7b838c },
  Framing_02: { set: 'framing_02', tint: 0x7b838c },
  Roof_01: { set: 'roof_01', tint: 0x9098a0 },
  Floor_01: { set: 'floor_a', normal: true, tint: 0xa9a7a2 },
  Mat_Light: { set: 'light_a', emissive: true },
  /* The fan's own set is not exported — it is four thousand triangles of blade
     seen from below at 12 m. It borrows the roof steel. */
  Mat_Fan: { set: 'framing_02', tint: 0x7b838c },
};

export type Warehouse = {
  group: THREE.Group;
  /**
   * The roof, as one object.
   *
   * Upstream hides it once the editor camera pitches past 80°, for the obvious
   * reason: you cannot look into a building through its roof. The lab does the
   * same on its own orbit camera.
   */
  roof: THREE.Object3D;
  /** Clear interior floor area, metres. The cell and the camera both use it. */
  bounds: { halfWidth: number; halfDepth: number; height: number };
  dispose(): void;
};

export type WarehouseOptions = {
  /** Sections along X. Five is 50 m, which is a small distribution bay. */
  width?: number;
  /** Sections along Z. */
  depth?: number;
};

/* --------------------------------------------------------------- textures --- */

const textureCache = new Map<string, THREE.Texture>();

function loadTexture(loader: THREE.TextureLoader, url: string, colorSpace: THREE.ColorSpace) {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  return loader.loadAsync(url).then((texture) => {
    texture.colorSpace = colorSpace;
    texture.flipY = false; // glTF UV convention.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    textureCache.set(url, texture);
    return texture;
  });
}

/**
 * Builds one material per binding.
 *
 * Godot's `ORMMaterial3D` packs occlusion in R, roughness in G and metallic in
 * B of one image, which is the glTF convention — so the same `THREE.Texture`
 * goes into `aoMap`, `roughnessMap` and `metalnessMap`. `roughness` and
 * `metalness` stay at 1 because they *multiply* the map: the default 0 metalness
 * would cancel the B channel and turn every steel girder into painted plastic.
 */
async function buildMaterials(): Promise<Map<string, THREE.MeshStandardMaterial>> {
  const loader = new THREE.TextureLoader();
  const materials = new Map<string, THREE.MeshStandardMaterial>();

  await Promise.all(Object.entries(BINDINGS).map(async ([name, binding]) => {
    const base = `${MODEL}/${binding.set}`;
    const [colour, orm, normal, emissive] = await Promise.all([
      loadTexture(loader, `${base}-basecolor.webp`, THREE.SRGBColorSpace),
      binding.emissive
        ? Promise.resolve(null)
        : loadTexture(loader, `${base}-orm.webp`, THREE.NoColorSpace),
      binding.normal
        ? loadTexture(loader, `${base}-normal.webp`, THREE.NoColorSpace)
        : Promise.resolve(null),
      binding.emissive
        ? loadTexture(loader, `${base}-emissive.webp`, THREE.SRGBColorSpace)
        : Promise.resolve(null),
    ]);

    const material = new THREE.MeshStandardMaterial({
      map: colour,
      ...(binding.tint ? { color: new THREE.Color(binding.tint) } : {}),
      ...(orm ? { aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1 } : {}),
      ...(normal ? { normalMap: normal } : {}),
      ...(emissive ? { emissiveMap: emissive, emissive: new THREE.Color(0xffe9c4), emissiveIntensity: 2.6 } : {}),
      ...(binding.emissive ? { roughness: 0.5, metalness: 0.1 } : {}),
      envMapIntensity: 0.7,
    });
    material.name = name;
    materials.set(name, material);
  }));

  return materials;
}

/* ------------------------------------------------------------------ build --- */

/** Every primitive of a loaded model, keyed by its material name. */
type Primitives = Map<string, THREE.BufferGeometry>;

function collectPrimitives(scene: THREE.Object3D): Primitives {
  const out: Primitives = new Map();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const name = Array.isArray(node.material) ? node.material[0]?.name : node.material?.name;
    /*
     * The node's own transform is baked into the geometry rather than kept.
     * These pieces are instanced by the hundred, and an `InstancedMesh` has one
     * geometry and no node — so a scale of 0.01 sitting on `Light_01` would
     * simply be lost, and the fixture would render a hundred times life size.
     */
    node.updateWorldMatrix(true, false);
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    out.set(name ?? node.name, geometry);
  });
  return out;
}

export async function createWarehouse(options: WarehouseOptions = {}): Promise<Warehouse> {
  const width = options.width ?? 5;
  const depth = options.depth ?? 4;

  const loader = new GLTFLoader();
  const [materials, braced, plain, roofModel, floorModel, lightModel] = await Promise.all([
    buildMaterials(),
    loader.loadAsync(`${MODEL}/wall-braced.glb`),
    loader.loadAsync(`${MODEL}/wall-plain.glb`),
    loader.loadAsync(`${MODEL}/roof.glb`),
    loader.loadAsync(`${MODEL}/floor-tile.glb`),
    loader.loadAsync(`${MODEL}/light.glb`),
  ]);

  const group = new THREE.Group();
  group.name = 'oip_warehouse';
  const owned: THREE.BufferGeometry[] = [];
  const instanced: THREE.InstancedMesh[] = [];

  const halfWidth = (width * SECTION) / 2;
  const halfDepth = (depth * SECTION) / 2;

  /**
   * One `InstancedMesh` per primitive, placed at every matrix given.
   *
   * `castShadow` is off for the whole shell and that is deliberate rather than
   * lazy: the enclosure is what the shadow map would be *cast onto*, and putting
   * 600 k triangles of building through the depth pass to shadow the floor it
   * already covers doubles the frame cost to darken nothing.
   */
  const place = (primitives: Primitives, name: string, matrices: THREE.Matrix4[]) => {
    const geometry = primitives.get(name);
    const material = materials.get(name);
    if (!geometry || !material || !matrices.length) return null;
    owned.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `warehouse_${name}`;
    instanced.push(mesh);
    return mesh;
  };

  const matrix = () => new THREE.Matrix4();

  /* ------------------------------------------------------------ floor --- */

  const floorPrimitives = collectPrimitives(floorModel.scene);
  const floorMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < width; i += 1) {
    for (let j = 0; j < depth; j += 1) {
      floorMatrices.push(matrix().makeTranslation(-halfWidth + i * SECTION, 0, -halfDepth + j * SECTION));
    }
  }
  const floor = place(floorPrimitives, 'Floor_01', floorMatrices);
  if (floor) group.add(floor);

  /* ------------------------------------------------------------ walls --- */

  /*
   * Four runs, each placed so the section's *braced face* points into the room.
   *
   * A wall section spans its own +X and stands mostly on its +Z side, so the run
   * direction and the starting corner both follow from the yaw. Getting this
   * backwards builds a hall with the bracing on the outside and the smooth skin
   * facing the camera — which looks almost right, and is why the interior
   * direction is written down per run rather than inferred.
   */
  const RUNS: { yaw: number; from: [number, number]; along: [number, number]; count: number; braced: boolean }[] = [
    /* Back and right are the two the camera faces, and carry the full bracing. */
    { yaw: 0, from: [-halfWidth, -halfDepth], along: [1, 0], count: width, braced: true },
    { yaw: -Math.PI / 2, from: [halfWidth, -halfDepth], along: [0, 1], count: depth, braced: true },
    { yaw: Math.PI, from: [halfWidth, halfDepth], along: [-1, 0], count: width, braced: false },
    { yaw: Math.PI / 2, from: [-halfWidth, halfDepth], along: [0, -1], count: depth, braced: false },
  ];

  const bracedMatrices: THREE.Matrix4[] = [];
  const plainMatrices: THREE.Matrix4[] = [];
  for (const run of RUNS) {
    const target = run.braced ? bracedMatrices : plainMatrices;
    for (let index = 0; index < run.count; index += 1) {
      const x = run.from[0] + run.along[0] * index * SECTION;
      const z = run.from[1] + run.along[1] * index * SECTION;
      target.push(matrix().makeRotationY(run.yaw).setPosition(x, 0, z));
    }
  }

  const bracedPrimitives = collectPrimitives(braced.scene);
  const plainPrimitives = collectPrimitives(plain.scene);
  for (const name of ['Wall_01', 'Framing_01']) {
    const a = place(bracedPrimitives, name, bracedMatrices);
    if (a) group.add(a);
    const b = place(plainPrimitives, name, plainMatrices);
    if (b) group.add(b);
  }

  /* ------------------------------------------------------------- roof --- */

  const roof = new THREE.Group();
  roof.name = 'oip_warehouse_roof';
  group.add(roof);

  const roofPrimitives = collectPrimitives(roofModel.scene);
  const allBays: THREE.Matrix4[] = [];
  /* Trusses on the far half only. They read where you can see up into them —
     which from an orbit camera aimed at the cell is the bays beyond it. */
  const trussBays: THREE.Matrix4[] = [];
  for (let i = 0; i < width; i += 1) {
    for (let j = 0; j < depth; j += 1) {
      const placement = matrix().makeTranslation(
        -halfWidth + i * SECTION,
        WALL_HEIGHT,
        -halfDepth + j * SECTION,
      );
      allBays.push(placement);
      if (j < Math.ceil(depth / 2)) trussBays.push(placement.clone());
    }
  }

  for (const [name, matrices] of [
    ['Roof_01', allBays],
    ['Wall_01', allBays],
    ['Framing_02', trussBays],
    ['Framing_01', trussBays],
    ['Mat_Light', allBays],
  ] as const) {
    const mesh = place(roofPrimitives, name, matrices as THREE.Matrix4[]);
    if (mesh) roof.add(mesh);
  }

  /* ------------------------------------------- pendant high-bay lights --- */

  /*
   * Hung on a grid between the bays rather than one per bay: upstream's own
   * building spaces them the same way, and a fixture directly over every 10 m
   * square reads as a ceiling texture rather than as lights.
   */
  const lightPrimitives = collectPrimitives(lightModel.scene);
  const lightMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < width - 1; i += 2) {
    for (let j = 0; j < depth - 1; j += 2) {
      lightMatrices.push(matrix().makeTranslation(
        -halfWidth + (i + 1) * SECTION,
        WALL_HEIGHT - 0.2,
        -halfDepth + (j + 1) * SECTION,
      ));
    }
  }
  const lights = place(lightPrimitives, 'Mat_Light', lightMatrices);
  if (lights) {
    lights.receiveShadow = false;
    roof.add(lights);
  }

  return {
    group,
    roof,
    bounds: { halfWidth: halfWidth - 1.5, halfDepth: halfDepth - 1.5, height: WALL_HEIGHT },
    dispose() {
      for (const mesh of instanced) mesh.dispose();
      for (const geometry of owned) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      group.removeFromParent();
    },
  };
}

/* ------------------------------------------------------------- furniture --- */

export type WarehouseProp = {
  scene: THREE.Object3D;
  dispose(): void;
};

/**
 * Loads one of the standalone props — the Euro pallet or the AGV.
 *
 * These two do carry their own textures inside the GLB (re-encoded to WebP by
 * the build script), so unlike the building kit they need no material binding
 * and `GLTFLoader` produces something correct on its own.
 */
export async function loadProp(name: 'pallet' | 'agv'): Promise<WarehouseProp> {
  const gltf = await new GLTFLoader().loadAsync(`${MODEL}/${name}.glb`);
  const scene = gltf.scene;
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return {
    scene,
    dispose() {
      scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        const material = Array.isArray(node.material) ? node.material : [node.material];
        for (const entry of material) entry.dispose();
      });
      scene.removeFromParent();
    },
  };
}
