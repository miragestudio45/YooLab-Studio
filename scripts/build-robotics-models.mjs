/**
 * Prepares the three robotics models the Education panel runs.
 *
 * The sources are in `reference-sources/Model -robot/`. They arrive already
 * optimised — glTF-Transform has meshopt-compressed the geometry and animation,
 * quantized the attributes and re-encoded every texture to WebP — so there is no
 * geometry work to do here and this script deliberately does none. `repackGlb`
 * in `lib/glb.mjs` cannot be used on them for exactly that reason: it rebuilds
 * accessors by copying their bufferViews verbatim, which for a meshopt-packed
 * view copies compressed bytes into a slot the loader will read as raw floats.
 *
 * Two of the three are copied byte for byte. The third needs a subset, and that
 * is what most of this file is.
 *
 * ## The four-skin set
 *
 * `Dv2 Animated 4 Skins Set.glb` is not one drone. It is FOUR — Cybertech,
 * RedManga, SciFi and Wood — as four sibling subtrees under the same root, all
 * at the origin, at scales three orders of magnitude apart (1.57, 0.0069,
 * 0.00035, 0.0069). Loaded whole, the viewer frames the bounding box of all four
 * and shows a small drone sitting inside a much larger one.
 *
 * Hiding three at runtime would fix the picture and none of the cost: 901 KB of
 * the file's 1.1 MB is texture data, and twelve of its fifteen images belong to
 * skins nothing draws. So the subset happens here, and what ships is one drone
 * with its own three maps.
 *
 * Cybertech is the one kept. It is blue-grey with orange trim, which is the only
 * one of the four that sits in this site's warm-cream and teal palette without a
 * fight — RedManga is fire-engine red, Wood is orange-brown, and SciFi is desert
 * military tan.
 *
 * ## How the subset survives meshopt
 *
 * Nothing is decompressed. The file has two buffers: buffer 0 is the GLB's BIN
 * chunk and holds both the images (plain bufferViews) and the meshopt-compressed
 * blocks, and buffer 1 is a `fallback: true` placeholder with no bytes at all,
 * which the loader never fetches because every view pointing at it carries the
 * extension. The subset walks the reference graph down from the surviving nodes,
 * then rebuilds buffer 0 out of the byte ranges those references reach —
 * *moving* each range and rewriting the offset that names it, whether that
 * offset lives on the bufferView or inside its `EXT_meshopt_compression`. A
 * compressed block is copied as opaque bytes and is bit-identical afterwards.
 *
 * ## THIS IS NOT A LICENCE
 *
 * All three came from Sketchfab per the hand-off, and that is a marketplace
 * rather than a licence: entries there ship under anything from CC0 to
 * "editorial use only". Until the specific entry and its terms are recorded in
 * THIRD_PARTY_ASSETS.md, these carry no `credits` block and stay out of the
 * Library manifest — see `app/lib/education/showcase.ts`.
 *
 * Run: node scripts/build-robotics-models.mjs
 */

import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { readGlb, writeGlb } from './lib/glb.mjs';

const SRC = 'reference-sources/Model -robot';
const OUT = 'public/asset/robotics';

/**
 * [source, destination, keepRoot].
 *
 * `keepRoot` names the one child of the scene root to keep, for a file that
 * carries several. Without it the file is copied byte for byte.
 */
const MODELS = [
  ['Dv2 Animated 4 Skins Set.glb', 'work-drone.glb', 'Dummy001'],
  ['Spider Drone Animations Reel.glb', 'spider-drone.glb', null],
  ['Biomechanical Whale Animated.glb', 'mech-whale.glb', null],
];

/** Every texture slot glTF puts on a material, so the walk cannot miss one. */
function materialTextures(material) {
  const pbr = material.pbrMetallicRoughness ?? {};
  return [
    pbr.baseColorTexture,
    pbr.metallicRoughnessTexture,
    material.normalTexture,
    material.occlusionTexture,
    material.emissiveTexture,
  ].filter(Boolean);
}

/**
 * Keeps one subtree of the scene and everything it reaches; drops the rest.
 *
 * Mutates `json` and returns the new BIN. Renumbering is done table by table in
 * dependency order — nodes, meshes, materials, textures, images, accessors,
 * bufferViews — because every table below the one being rewritten still holds
 * the old indices at the moment it is read.
 */
function subsetGlb(json, bin, keepRoot) {
  /* ------------------------------------------------------------- nodes --- */
  const parent = new Map();
  json.nodes.forEach((node, index) => {
    for (const child of node.children ?? []) parent.set(child, index);
  });

  const rootIndex = json.nodes.findIndex((node) => node.name === keepRoot);
  if (rootIndex < 0) throw new Error(`no node named ${keepRoot}`);

  const keep = new Set();
  /* The subtree, plus every ancestor: the kept drone's transform is the product
     of the chain above it, and dropping a link would move it. */
  for (let index = rootIndex; index !== undefined; index = parent.get(index)) keep.add(index);
  const walk = (index) => {
    keep.add(index);
    for (const child of json.nodes[index].children ?? []) walk(child);
  };
  walk(rootIndex);

  for (const index of keep) {
    const node = json.nodes[index];
    if (node.children) node.children = node.children.filter((child) => keep.has(child));
  }
  for (const scene of json.scenes ?? []) scene.nodes = scene.nodes.filter((node) => keep.has(node));

  /* --------------------------------------------------------- animation --- */
  for (const animation of json.animations ?? []) {
    animation.channels = animation.channels.filter((channel) => keep.has(channel.target.node));
    const used = new Set(animation.channels.map((channel) => channel.sampler));
    const map = new Map();
    const next = [];
    animation.samplers.forEach((sampler, index) => {
      if (!used.has(index)) return;
      map.set(index, next.length);
      next.push(sampler);
    });
    for (const channel of animation.channels) channel.sampler = map.get(channel.sampler);
    animation.samplers = next;
  }
  json.animations = (json.animations ?? []).filter((animation) => animation.channels.length);

  const nodeMap = new Map();
  const nextNodes = [];
  json.nodes.forEach((node, index) => {
    if (!keep.has(index)) return;
    nodeMap.set(index, nextNodes.length);
    nextNodes.push(node);
  });
  for (const node of nextNodes) {
    if (node.children) node.children = node.children.map((child) => nodeMap.get(child));
  }
  for (const scene of json.scenes ?? []) scene.nodes = scene.nodes.map((node) => nodeMap.get(node));
  for (const animation of json.animations) {
    for (const channel of animation.channels) channel.target.node = nodeMap.get(channel.target.node);
  }
  json.nodes = nextNodes;

  /* ------------------------------------------------------------ meshes --- */
  const usedMeshes = new Set(json.nodes.map((node) => node.mesh).filter((mesh) => mesh != null));
  const meshMap = new Map();
  json.meshes = json.meshes.filter((mesh, index) => {
    if (!usedMeshes.has(index)) return false;
    meshMap.set(index, meshMap.size);
    return true;
  });
  for (const node of json.nodes) if (node.mesh != null) node.mesh = meshMap.get(node.mesh);

  /* --------------------------------------------------------- materials --- */
  const usedMaterials = new Set();
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.material != null) usedMaterials.add(primitive.material);
    }
  }
  const materialMap = new Map();
  json.materials = (json.materials ?? []).filter((material, index) => {
    if (!usedMaterials.has(index)) return false;
    materialMap.set(index, materialMap.size);
    return true;
  });
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.material != null) primitive.material = materialMap.get(primitive.material);
    }
  }

  /* ---------------------------------------------------------- textures --- */
  /* A material extension could hold a texture reference this walk does not
     know about, and dropping one would strip a map rather than fail. The file
     declares only the three extensions below, none of them on a material. */
  for (const material of json.materials) {
    if (material.extensions) throw new Error(`material ${material.name} carries an unhandled extension`);
  }
  const usedTextures = new Set();
  for (const material of json.materials) {
    for (const info of materialTextures(material)) usedTextures.add(info.index);
  }
  const textureMap = new Map();
  json.textures = (json.textures ?? []).filter((texture, index) => {
    if (!usedTextures.has(index)) return false;
    textureMap.set(index, textureMap.size);
    return true;
  });
  for (const material of json.materials) {
    for (const info of materialTextures(material)) info.index = textureMap.get(info.index);
  }

  /* ------------------------------------------------------------ images --- */
  const sourceOf = (texture) => texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  const usedImages = new Set(json.textures.map(sourceOf).filter((image) => image != null));
  const imageMap = new Map();
  json.images = (json.images ?? []).filter((image, index) => {
    if (!usedImages.has(index)) return false;
    imageMap.set(index, imageMap.size);
    return true;
  });
  for (const texture of json.textures) {
    const webp = texture.extensions?.EXT_texture_webp;
    if (webp) webp.source = imageMap.get(webp.source);
    if (texture.source != null) texture.source = imageMap.get(texture.source);
  }

  /* --------------------------------------------------------- accessors --- */
  const usedAccessors = new Set();
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      for (const accessor of Object.values(primitive.attributes)) usedAccessors.add(accessor);
      if (primitive.indices != null) usedAccessors.add(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const accessor of Object.values(target)) usedAccessors.add(accessor);
      }
    }
  }
  for (const animation of json.animations) {
    for (const sampler of animation.samplers) {
      usedAccessors.add(sampler.input);
      usedAccessors.add(sampler.output);
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices != null) usedAccessors.add(skin.inverseBindMatrices);
  }
  const accessorMap = new Map();
  json.accessors = json.accessors.filter((accessor, index) => {
    if (!usedAccessors.has(index)) return false;
    accessorMap.set(index, accessorMap.size);
    return true;
  });
  const remapAccessor = (index) => accessorMap.get(index);
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      for (const [name, index] of Object.entries(primitive.attributes)) {
        primitive.attributes[name] = remapAccessor(index);
      }
      if (primitive.indices != null) primitive.indices = remapAccessor(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const [name, index] of Object.entries(target)) target[name] = remapAccessor(index);
      }
    }
  }
  for (const animation of json.animations) {
    for (const sampler of animation.samplers) {
      sampler.input = remapAccessor(sampler.input);
      sampler.output = remapAccessor(sampler.output);
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices != null) {
      skin.inverseBindMatrices = remapAccessor(skin.inverseBindMatrices);
    }
  }

  /* ------------------------------------------------- views and the BIN --- */
  const usedViews = new Set();
  for (const accessor of json.accessors) if (accessor.bufferView != null) usedViews.add(accessor.bufferView);
  for (const image of json.images) if (image.bufferView != null) usedViews.add(image.bufferView);

  const parts = [];
  let offset = 0;
  /* Buffer 1 holds no bytes — it is the meshopt fallback, sized but never
     fetched. Its offsets are still rewritten so the file stays self-consistent
     for any tool that does read them. */
  let fallbackOffset = 0;
  const viewMap = new Map();
  const nextViews = [];

  const append = (bytes) => {
    const padding = (4 - (offset % 4)) % 4;
    if (padding) {
      parts.push(Buffer.alloc(padding));
      offset += padding;
    }
    const at = offset;
    parts.push(bytes);
    offset += bytes.length;
    return at;
  };

  json.bufferViews.forEach((view, index) => {
    if (!usedViews.has(index)) return;
    const copy = { ...view };
    const packed = view.extensions?.EXT_meshopt_compression;
    if (packed) {
      const start = packed.byteOffset ?? 0;
      const at = append(Buffer.from(bin.subarray(start, start + packed.byteLength)));
      copy.extensions = { ...view.extensions, EXT_meshopt_compression: { ...packed, buffer: 0, byteOffset: at } };
      copy.buffer = 1;
      copy.byteOffset = fallbackOffset;
      fallbackOffset += view.byteLength;
      fallbackOffset += (4 - (fallbackOffset % 4)) % 4;
    } else {
      const start = view.byteOffset ?? 0;
      copy.buffer = 0;
      copy.byteOffset = append(Buffer.from(bin.subarray(start, start + view.byteLength)));
    }
    viewMap.set(index, nextViews.length);
    nextViews.push(copy);
  });

  for (const accessor of json.accessors) {
    if (accessor.bufferView != null) accessor.bufferView = viewMap.get(accessor.bufferView);
  }
  for (const image of json.images) {
    if (image.bufferView != null) image.bufferView = viewMap.get(image.bufferView);
  }
  json.bufferViews = nextViews;

  const nextBin = Buffer.concat(parts);
  json.buffers = [
    { byteLength: nextBin.length },
    { byteLength: fallbackOffset, extensions: { EXT_meshopt_compression: { fallback: true } } },
  ];
  return nextBin;
}

mkdirSync(OUT, { recursive: true });

for (const [from, to, keepRoot] of MODELS) {
  const source = `${SRC}/${from}`;
  const destination = `${OUT}/${to}`;

  if (!keepRoot) {
    copyFileSync(source, destination);
    console.log(`  ${destination}  ${(statSync(destination).size / 1024).toFixed(0)} KB  (copied)`);
    continue;
  }

  const before = statSync(source).size;
  const { json, bin } = readGlb(source);
  const nextBin = subsetGlb(json, bin, keepRoot);
  const total = writeGlb(destination, json, nextBin);
  console.log(
    `  ${destination}  ${(before / 1024).toFixed(0)} KB -> ${(total / 1024).toFixed(0)} KB`
    + `  (kept ${keepRoot}: ${json.meshes.length} meshes, ${json.materials.length} material,`
    + ` ${json.images.length} images)`,
  );
}
