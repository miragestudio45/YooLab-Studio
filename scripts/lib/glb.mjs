/**
 * A small GLB reader/writer, shared by the asset scripts.
 *
 * Every model this project takes from the Open Industry Project arrives as a
 * Godot import artifact, and they all need the same two things done to them
 * before the web can have them: unused vertex attributes removed, and embedded
 * 4K PNGs re-encoded. Doing that twice in two scripts is how the two versions
 * drift, so it lives here once.
 *
 * Deliberately not `@gltf-transform/core`: this needs four operations on files
 * whose exact shape is known, and the assertions below — interleaved views,
 * sparse accessors, anything the copy path cannot reproduce byte for byte — are
 * more valuable than a general library's tolerance. A silent success that
 * corrupts a mesh is much worse here than a loud failure.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export const ELEMENT_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
export const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export function readGlb(path) {
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

/** GLB requires both chunks 4-byte aligned; JSON pads with spaces, BIN with zeroes. */
export function writeGlb(path, json, bin) {
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
  return total;
}

/**
 * Attributes dropped from every primitive, and why each one goes.
 *
 *   COLOR_0 / COLOR_1  Godot writes custom per-vertex data into these. glTF says
 *                      a `COLOR_n` slot is a vertex colour, so `GLTFLoader` sets
 *                      `vertexColors: true` and three.js *multiplies* the base
 *                      colour by whatever those channels hold — the model
 *                      renders in a colour nobody painted. A correctness fix
 *                      that happens to save bytes.
 *   TEXCOORD_1         A lightmap UV set. Nothing here bakes lightmaps.
 *   TANGENT            Explicit tangents for normal maps three.js is perfectly
 *                      happy to differentiate in the fragment shader.
 */
export const DEFAULT_DROP = ['TANGENT', 'TEXCOORD_1', 'COLOR_0', 'COLOR_1'];

/**
 * Removes attributes, re-encodes embedded images, and repacks the buffer.
 *
 * The buffer is rebuilt from the survivors rather than edited in place, because
 * an orphaned bufferView is still bytes in the file — the only way to actually
 * shed them is to copy what is still referenced into a fresh buffer and
 * renumber everything that points at it.
 *
 * `encodeImage(buffer, mimeType, index)` is awaited for each embedded image and
 * should return `{ data, mimeType }`; return the input unchanged to keep it.
 */
export async function repackGlb(json, bin, { drop = DEFAULT_DROP, encodeImage } = {}) {
  const dropped = new Set(drop);
  let removed = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const name of Object.keys(primitive.attributes)) {
        if (!dropped.has(name)) continue;
        delete primitive.attributes[name];
        removed += 1;
      }
    }
  }

  /* Everything that can still hold an accessor index. A silent drop here would
     be a corrupt file rather than a smaller one. */
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
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      usedAccessors.add(sampler.input);
      usedAccessors.add(sampler.output);
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices != null) usedAccessors.add(skin.inverseBindMatrices);
  }

  const parts = [];
  const nextViews = [];
  let byteOffset = 0;

  /** Appends `bytes` to the new buffer at `alignment`, returns the view index. */
  const pushView = (bytes, alignment, target) => {
    const padding = (alignment - (byteOffset % alignment)) % alignment;
    if (padding) {
      parts.push(Buffer.alloc(padding));
      byteOffset += padding;
    }
    const index = nextViews.length;
    nextViews.push({
      buffer: 0,
      byteOffset,
      byteLength: bytes.length,
      ...(target != null ? { target } : {}),
    });
    parts.push(bytes);
    byteOffset += bytes.length;
    return index;
  };

  /* Images first, so a re-encode that shrinks a 4 MB PNG to 40 kB of WebP does
     not leave the mesh data stranded behind a hole. */
  const imageViews = new Map();
  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView == null) continue;
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset ?? 0;
    const source = Buffer.from(bin.subarray(start, start + view.byteLength));
    const encoded = encodeImage
      ? await encodeImage(source, image.mimeType, index)
      : { data: source, mimeType: image.mimeType };
    imageViews.set(index, pushView(encoded.data, 4));
    image.mimeType = encoded.mimeType;
  }

  const accessorMap = new Map();
  const nextAccessors = [];
  for (const [index, accessor] of (json.accessors ?? []).entries()) {
    if (!usedAccessors.has(index)) continue;
    if (accessor.sparse) throw new Error('sparse accessor — not handled');

    const copy = { ...accessor };
    if (accessor.bufferView != null) {
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const element = ELEMENT_SIZE[accessor.type] * COMPONENT_SIZE[accessor.componentType];
      const size = element * accessor.count;

      /*
       * De-interleave.
       *
       * The Open-Industry models are tightly packed and copy in one slice; the
       * Mint models interleave position, normal and UV into a single strided
       * view, so each element has to be lifted out one at a time. Every byte
       * still arrives unchanged — this moves data, it does not transform it —
       * but the *layout* changes, which is why it is disclosed rather than left
       * as an implementation detail.
       *
       * Writing them out tightly is also what makes the repack worth doing at
       * all: a strided view cannot be split, so shrinking one attribute would
       * otherwise still drag the whole interleaved block along with it.
       */
      let bytes;
      if (view.byteStride != null && view.byteStride !== element) {
        bytes = Buffer.alloc(size);
        for (let element_ = 0; element_ < accessor.count; element_ += 1) {
          bin.copy(
            bytes,
            element_ * element,
            start + element_ * view.byteStride,
            start + element_ * view.byteStride + element,
          );
        }
      } else {
        bytes = Buffer.from(bin.subarray(start, start + size));
      }

      copy.bufferView = pushView(bytes, COMPONENT_SIZE[accessor.componentType], view.target);
      copy.byteOffset = 0;
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
  for (const [index, image] of (json.images ?? []).entries()) {
    if (imageViews.has(index)) image.bufferView = imageViews.get(index);
  }

  json.accessors = nextAccessors;
  json.bufferViews = nextViews;
  const nextBin = Buffer.concat(parts);
  json.buffers = nextBin.length ? [{ byteLength: nextBin.length }] : [];

  return { removed, bin: nextBin };
}

/** Triangle count across every primitive, for the size reports. */
export function countTriangles(json) {
  let total = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices != null) total += json.accessors[primitive.indices].count / 3;
    }
  }
  return Math.round(total);
}
