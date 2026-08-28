/**
 * Prepares the Open-Industry six-axis arm and its suction tool for the web.
 *
 * The upstream files are Godot import artifacts, and three of the things that
 * makes them are wrong here rather than merely large:
 *
 *   - **COLOR_0 / COLOR_1.** Godot writes custom per-vertex data into these
 *     slots. glTF says a `COLOR_n` attribute is a vertex colour, so
 *     `GLTFLoader` sets `vertexColors: true` and three.js *multiplies* the
 *     base colour by it — the arm renders in whatever those channels happen to
 *     hold, which is not paint. Dropping them is a correctness fix that
 *     happens to save bytes.
 *   - **TEXCOORD_1.** A lightmap UV set. Nothing here bakes lightmaps, and a
 *     second UV channel that no material samples is dead weight.
 *   - **TANGENT.** Explicit tangents for a normal map three.js is perfectly
 *     happy to differentiate in the fragment shader. On a smooth-shaded
 *     industrial casting the two are visually indistinguishable.
 *
 * Positions, normals, TEXCOORD_0 and indices are copied through byte for byte.
 * No geometry is moved, welded, decimated or re-indexed.
 *
 * Run: node scripts/build-robot-model.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const OIP = 'reference-sources/Open-Industry-Project-master/Open-Industry-Project-master/assets/3DModels';

const JOBS = [
  [`${OIP}/Six-axis/Six-Axis_01.glb`, 'public/asset/practice/robot/six-axis.glb'],
  [`${OIP}/EOATSuction/EOAT_Suction.glb`, 'public/asset/practice/robot/eoat-suction.glb'],
];

/** Attributes removed from every primitive. See the header for why each goes. */
const DROP = new Set(['TANGENT', 'TEXCOORD_1', 'COLOR_0', 'COLOR_1']);

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path} is not a GLB`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    if (type === CHUNK_BIN) bin = body;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error(`${path} has no JSON chunk`);
  return { json, bin: bin ?? Buffer.alloc(0) };
}

/** GLB requires both chunks to be 4-byte aligned; JSON pads with spaces. */
function writeGlb(path, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + (bin.length ? 8 + bin.length + binPad : 0);

  const out = Buffer.alloc(total);
  let cursor = 0;
  out.writeUInt32LE(GLB_MAGIC, cursor); cursor += 4;
  out.writeUInt32LE(2, cursor); cursor += 4;
  out.writeUInt32LE(total, cursor); cursor += 4;

  out.writeUInt32LE(jsonBytes.length + jsonPad, cursor); cursor += 4;
  out.writeUInt32LE(CHUNK_JSON, cursor); cursor += 4;
  jsonBytes.copy(out, cursor); cursor += jsonBytes.length;
  out.fill(0x20, cursor, cursor + jsonPad); cursor += jsonPad;

  if (bin.length) {
    out.writeUInt32LE(bin.length + binPad, cursor); cursor += 4;
    out.writeUInt32LE(CHUNK_BIN, cursor); cursor += 4;
    bin.copy(out, cursor); cursor += bin.length;
    out.fill(0, cursor, cursor + binPad);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out);
}

function strip(json, bin) {
  /* Drop the attributes first, so the reachability sweep below sees the real
     survivor set rather than the original one. */
  let dropped = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const name of Object.keys(primitive.attributes)) {
        if (!DROP.has(name)) continue;
        delete primitive.attributes[name];
        dropped += 1;
      }
    }
  }

  /*
   * Rebuild the buffer from the accessors that are still referenced, rather
   * than editing the old one in place. An orphaned bufferView is still bytes
   * in the file: the only way to actually shed them is to copy the survivors
   * into a fresh buffer and renumber.
   */
  const usedAccessors = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const index of Object.values(primitive.attributes)) usedAccessors.add(index);
      if (primitive.indices != null) usedAccessors.add(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const index of Object.values(target)) usedAccessors.add(index);
      }
    }
  }
  /* Anything else that can hold an accessor index. None of these appear in
     these two files, but a silent drop would be a corrupt file rather than a
     smaller one. */
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      usedAccessors.add(sampler.input);
      usedAccessors.add(sampler.output);
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices != null) usedAccessors.add(skin.inverseBindMatrices);
  }

  const accessorMap = new Map();
  const nextAccessors = [];
  const nextViews = [];
  const parts = [];
  let byteOffset = 0;

  for (const [index, accessor] of (json.accessors ?? []).entries()) {
    if (!usedAccessors.has(index)) continue;

    const copy = { ...accessor };
    if (accessor.bufferView != null) {
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      /* Interleaved views would need their stride preserved; these files are
         tightly packed, so a flat copy is exact. Assert rather than corrupt. */
      if (view.byteStride != null) {
        throw new Error('interleaved bufferView — this script only handles tightly packed accessors');
      }
      const size = ELEMENT_SIZE[accessor.type] * COMPONENT_SIZE[accessor.componentType] * accessor.count;
      const bytes = bin.subarray(start, start + size);

      /* Every accessor's component type must be aligned to its own size. */
      const alignment = COMPONENT_SIZE[accessor.componentType];
      const padding = (alignment - (byteOffset % alignment)) % alignment;
      if (padding) {
        parts.push(Buffer.alloc(padding));
        byteOffset += padding;
      }

      copy.bufferView = nextViews.length;
      copy.byteOffset = 0;
      nextViews.push({
        buffer: 0,
        byteOffset,
        byteLength: size,
        ...(view.target != null ? { target: view.target } : {}),
      });
      parts.push(Buffer.from(bytes));
      byteOffset += size;
    }

    accessorMap.set(index, nextAccessors.length);
    nextAccessors.push(copy);
  }

  const remap = (index) => {
    const next = accessorMap.get(index);
    if (next == null) throw new Error(`accessor ${index} survived a reference but not the copy`);
    return next;
  };
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const [name, index] of Object.entries(primitive.attributes)) {
        primitive.attributes[name] = remap(index);
      }
      if (primitive.indices != null) primitive.indices = remap(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const [name, index] of Object.entries(target)) target[name] = remap(index);
      }
    }
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      sampler.input = remap(sampler.input);
      sampler.output = remap(sampler.output);
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices != null) skin.inverseBindMatrices = remap(skin.inverseBindMatrices);
  }

  json.accessors = nextAccessors;
  json.bufferViews = nextViews;
  const nextBin = Buffer.concat(parts);
  json.buffers = nextBin.length ? [{ byteLength: nextBin.length }] : [];
  /* Images are external here; if that ever changes, the sweep above would need
     to carry image bufferViews too. Fail loudly rather than drop a texture. */
  if ((json.images ?? []).some((image) => image.bufferView != null)) {
    throw new Error('embedded image bufferView — not handled');
  }

  return { dropped, bin: nextBin };
}

const ELEMENT_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

const kb = (bytes) => Math.round(bytes / 1024);

for (const [from, to] of JOBS) {
  const { json, bin } = readGlb(from);
  const before = statSync(from).size;
  const { dropped, bin: nextBin } = strip(json, bin);
  writeGlb(to, json, nextBin);
  const after = statSync(to).size;
  console.log(
    `${to}  ${kb(before)} KB → ${kb(after)} KB  (${dropped} attributes dropped, `
    + `${Math.round((1 - after / before) * 100)}% smaller)`,
  );
}

/* ------------------------------------------------------------- textures --- */

/*
 * The upstream texture set is 4096² PNGs: 13.3 MB for the arm and 1.6 MB for
 * the tool. The arm never occupies more than ~450 px of stage height, at which
 * point a 1024 map is already being sampled below its top mip — so the extra
 * 12 MB buys nothing that can be seen.
 *
 * Normal maps get the higher quality setting. Lossy chroma subsampling on a
 * tangent-space normal shifts the encoded direction rather than the colour, and
 * on the arm's large flat castings that shows up as visible blotching in the
 * specular response long before it would be noticeable on the base colour.
 */
const TEXTURES = [
  ['Six-axis/Textures/Six-Axis_01_BaseColor.png', 'six-axis-basecolor', 1024, 82],
  ['Six-axis/Textures/Six-Axis_01_Normal.png', 'six-axis-normal', 1024, 90],
  ['Six-axis/Textures/Six-Axis_01_ORM.png', 'six-axis-orm', 1024, 84],
  ['EOATSuction/Textures/EOAT_Baked_BaseColor.png', 'eoat-basecolor', 512, 82],
  ['EOATSuction/Textures/EOAT_Baked_Normal.png', 'eoat-normal', 512, 90],
  ['EOATSuction/Textures/EOAT_Baked_ORM.png', 'eoat-orm', 512, 84],
];

const { default: sharp } = await import('sharp');

for (const [file, name, size, quality] of TEXTURES) {
  const from = `${OIP}/${file}`;
  const to = `public/asset/practice/robot/${name}.webp`;
  await sharp(from).resize({ width: size, height: size }).webp({ quality, effort: 6 }).toFile(to);
  console.log(`${to}  ${kb(statSync(from).size)} KB @4096 → ${kb(statSync(to).size)} KB @${size}`);
}
