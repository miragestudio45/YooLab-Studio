/**
 * Prepares the Open-Industry warehouse and its robot cell for the web.
 *
 * Everything the robot lab shows is an Open Industry Project asset: the building
 * shell, the concrete floor, the six-axis arm, its suction tool, the Euro pallet
 * and the AGV. They arrive as Godot import artifacts and all need the same two
 * things done before a browser can have them.
 *
 * **Geometry.** Four vertex attributes come off every mesh — see `DEFAULT_DROP`
 * in `lib/glb.mjs` for why each one goes, and note that dropping `COLOR_0` is a
 * correctness fix rather than a size one. Positions, normals, `TEXCOORD_0` and
 * indices are copied byte for byte. No vertex is moved, welded, decimated or
 * re-indexed.
 *
 * **Textures.** Two kinds, handled differently:
 *
 *   - *Embedded* — `Pallet.glb` is 13.7 MB for 3,144 triangles and `AGV.glb` is
 *     18.2 MB for 54,278, because both carry 4K PNGs inside the GLB. Those are
 *     re-encoded in place to WebP at 1024².
 *   - *External* — the wall, roof, framing and floor pieces reference `.tres`
 *     materials that live beside them, so their GLBs carry placeholder colours
 *     and no images at all. Those texture sets are exported separately below and
 *     bound by material name at runtime in `lib/robot/warehouse.ts`.
 *
 * Nothing is written back to the reference copies under `reference-sources/`.
 *
 * Run: node scripts/build-robot-model.mjs
 */

import { statSync } from 'node:fs';
import sharp from 'sharp';
import { readGlb, writeGlb, repackGlb, countTriangles } from './lib/glb.mjs';

const OIP = 'reference-sources/Open-Industry-Project-master/Open-Industry-Project-master/assets/3DModels';
const OUT = 'public/asset/practice/robot';

/**
 * Models copied through, as [source, destination, embedded-texture cap].
 *
 * The cap is the longest edge an embedded image is resampled to. `null` leaves
 * the file's images alone — the arm and its tool carry none, and the wall and
 * roof kit's images live outside the GLB.
 */
const MODELS = [
  // The cell.
  [`${OIP}/Six-axis/Six-Axis_01.glb`, 'six-axis.glb', null],
  [`${OIP}/EOATSuction/EOAT_Suction.glb`, 'eoat-suction.glb', null],
  // The building shell. `Wall_A` carries the X-bracing seen in the reference
  // screenshot; `Wall_D` is the same 10 × 12 m section with a plain frame, at a
  // sixth of the triangles, for the runs the camera never faces.
  [`${OIP}/WallsAndRoof/Wall_A.glb`, 'wall-braced.glb', null],
  [`${OIP}/WallsAndRoof/Wall_D.glb`, 'wall-plain.glb', null],
  [`${OIP}/WallsAndRoof/Roof_A.glb`, 'roof.glb', null],
  [`${OIP}/WallsAndRoof/Floor.glb`, 'floor-tile.glb', null],
  [`${OIP}/WallsAndRoof/Light_A.glb`, 'light.glb', null],
  // The furniture.
  [`${OIP}/Pallet.glb`, 'pallet.glb', 1024],
  [`${OIP}/AGV/AGV.glb`, 'agv.glb', 1024],
];

/**
 * External texture sets, as [material name in the GLB, source stem, size, maps].
 *
 * The material names are the join: the GLBs name their materials `Wall_01`,
 * `Framing_01` and so on, and the `.tres` files beside them are
 * `Building_Wall_01.tres`, `Building_Framing_01.tres`. One-to-one, so the
 * runtime can bind by name without a second mapping table to keep in sync.
 *
 * Normal maps are dropped for the steel framing: at the distance the camera
 * ever sees a roof truss from, a 1024 normal map on a girder is 100 kB spent on
 * something invisible. Base colour and ORM carry the read.
 */
const TEX = `${OIP}/WallsAndRoof/Textures`;
const TEXTURE_SETS = [
  ['Wall_01', 'BuildingPart_Wall_01', 1024, ['BaseColor', 'Normal', 'ORM']],
  ['Framing_01', 'BuildingPart_Framing_01', 512, ['BaseColor', 'ORM']],
  ['Framing_02', 'BuildingPart_Framing_02', 512, ['BaseColor', 'ORM']],
  ['Roof_01', 'BuildingPart_Roof_01', 1024, ['BaseColor', 'ORM']],
  ['Floor_A', 'BuildingPart_Floor_A', 1024, ['BaseColor', 'Normal', 'ORM']],
  ['Light_A', 'BuildingPart_Light_A', 256, ['BaseColor', 'Emissive']],
];

/** The arm's own set, which lives in its model directory rather than the kit's. */
const ARM_TEXTURES = [
  ['Six-axis/Textures/Six-Axis_01_BaseColor.png', 'six-axis-basecolor', 1024, 82],
  ['Six-axis/Textures/Six-Axis_01_Normal.png', 'six-axis-normal', 1024, 90],
  ['Six-axis/Textures/Six-Axis_01_ORM.png', 'six-axis-orm', 1024, 84],
  ['EOATSuction/Textures/EOAT_Baked_BaseColor.png', 'eoat-basecolor', 512, 82],
  ['EOATSuction/Textures/EOAT_Baked_Normal.png', 'eoat-normal', 512, 90],
  ['EOATSuction/Textures/EOAT_Baked_ORM.png', 'eoat-orm', 512, 84],
];

const kb = (bytes) => Math.round(bytes / 1024);

/*
 * Normal and ORM maps get the higher quality setting.
 *
 * Lossy chroma subsampling on a tangent-space normal shifts the encoded
 * *direction* rather than the colour, and on the arm's large flat castings that
 * shows up as visible blotching in the specular response long before it would be
 * noticeable on a base colour.
 */
const quality = (name) => (/normal|orm/i.test(name) ? 90 : 82);

let totalBefore = 0;
let totalAfter = 0;

for (const [from, name, imageCap] of MODELS) {
  const to = `${OUT}/${name}`;
  const { json, bin } = readGlb(from);
  const before = statSync(from).size;

  const { removed, bin: nextBin } = await repackGlb(json, bin, {
    encodeImage: imageCap
      ? async (data) => ({
        data: await sharp(data)
          .resize({ width: imageCap, height: imageCap, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84, effort: 6 })
          .toBuffer(),
        mimeType: 'image/webp',
      })
      : undefined,
  });

  const after = writeGlb(to, json, nextBin);
  totalBefore += before;
  totalAfter += after;
  console.log(
    `${name.padEnd(18)} ${String(kb(before)).padStart(6)} KB → ${String(kb(after)).padStart(5)} KB`
    + `  ${String(countTriangles(json)).padStart(6)} tris  (${removed} attributes dropped)`,
  );
}

console.log('');

for (const [material, stem, size, maps] of TEXTURE_SETS) {
  for (const map of maps) {
    const from = `${TEX}/${stem}_${map}.png`;
    const to = `${OUT}/${material.toLowerCase()}-${map.toLowerCase()}.webp`;
    await sharp(from)
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: quality(map), effort: 6 })
      .toFile(to);
    totalBefore += statSync(from).size;
    totalAfter += statSync(to).size;
    console.log(
      `${(material + '/' + map).padEnd(24)} ${String(kb(statSync(from).size)).padStart(6)} KB`
      + ` → ${String(kb(statSync(to).size)).padStart(5)} KB @${size}`,
    );
  }
}

console.log('');

for (const [file, name, size, q] of ARM_TEXTURES) {
  const from = `${OIP}/${file}`;
  const to = `${OUT}/${name}.webp`;
  await sharp(from).resize({ width: size, height: size }).webp({ quality: q, effort: 6 }).toFile(to);
  totalBefore += statSync(from).size;
  totalAfter += statSync(to).size;
  console.log(
    `${name.padEnd(24)} ${String(kb(statSync(from).size)).padStart(6)} KB`
    + ` → ${String(kb(statSync(to).size)).padStart(5)} KB @${size}`,
  );
}

console.log(
  `\ntotal ${(totalBefore / 1048576).toFixed(1)} MB → ${(totalAfter / 1048576).toFixed(2)} MB`
  + `  (${Math.round((1 - totalAfter / totalBefore) * 100)}% smaller)`,
);
