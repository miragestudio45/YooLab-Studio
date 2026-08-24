'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createLibraryStage } from '../../../lib/three/libraryEnvironment';
import { createOrbitRig, fitBox, type OrbitRig } from '../../../lib/three/framing';
import { CELLS, cellById, type CellContent, type CellId, type Organelle } from '../../../lib/biology/cells';

/**
 * Xưởng tế bào — sáu loại tế bào, một component.
 *
 * Toàn bộ chữ nghĩa (tên bào quan, chức năng, số đo, ghi chú) nằm trong
 * `lib/biology/cells.ts`; file này chỉ dựng hình và xử lý tương tác. Nhờ vậy
 * bảng kiến thức của Thư viện và nhãn trên mô hình đọc từ cùng một nguồn, không
 * thể lệch nhau — và một giáo viên soát nội dung sinh học chỉ phải đọc một file
 * dữ liệu chứ không phải đọc code dựng hình.
 *
 * Hình học là hình học thủ tục do YooLab dựng, không phải mesh tải về. Hai bản
 * quét tế bào của NIH đều mang giấy phép CC BY-NC-SA — phi thương mại — nên
 * không dùng được trên một sản phẩm; xem SOURCE_AUDIT.md. Dựng lại bằng
 * primitive lại cho một thứ mà mesh liền khối không cho: mỗi bào quan là một
 * vật thể riêng, chọn được, gọi tên được, và tách ra khỏi tế bào được.
 *
 * Hai hành vi khác nhau khi tách lớp, và sự khác nhau đó là chủ ý:
 *
 *   - bào quan rời thì dịch ra theo `offset` của nó trong dữ liệu;
 *   - lớp bao kín (`shell: true`) thì phình ra và mờ đi, vì một cái màng không
 *     thể "dịch sang bên" mà vẫn còn là màng của tế bào đó.
 *
 * Khung hình lấy từ `cell.frame` chứ không đo lại từ cảnh. Một tế bào cơ dài
 * gấp bốn lần chiều cao của nó, và đo bao ngoài lúc chạy thì bao ngoài sẽ đổi
 * theo trạng thái tách lớp — khung hình sẽ thở ra thở vào mỗi lần bấm nhãn.
 */

/* ========================================================== hình học chung === */

/** Cầu méo: tế bào không phải hòn bi, và một hình cầu hoàn hảo trông rất CG. */
function organicSphere(radius: number, detail: number, wobble: number, seed: number) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const noise =
      Math.sin(vertex.x * 2.1 + seed) * Math.cos(vertex.y * 1.7 - seed) * Math.sin(vertex.z * 2.4 + seed * 0.5);
    vertex.multiplyScalar(1 + noise * wobble);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Hộp bo góc, cho tế bào có thành cứng hoặc tế bào hình khối.
 *
 * Dựng bằng cách kéo một hình cầu đơn vị ra theo từng trục với hàm luỹ thừa
 * cao — tức là một siêu cầu. Cách này cho mặt liền, pháp tuyến mượt, và một
 * tham số duy nhất (`sharp`) đi từ hình cầu đến gần như hình hộp.
 */
function roundedBox(half: readonly [number, number, number], sharp: number, detail = 4) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const norm =
      Math.pow(Math.abs(vertex.x), sharp) + Math.pow(Math.abs(vertex.y), sharp) + Math.pow(Math.abs(vertex.z), sharp);
    const scale = Math.pow(norm, -1 / sharp);
    position.setXYZ(index, vertex.x * scale * half[0], vertex.y * scale * half[1], vertex.z * scale * half[2]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Dải tán xạ tất định: cùng chỉ số cho cùng vị trí, không đổi giữa hai lần vẽ. */
function scatter(index: number, seed: number) {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/* ============================================================== vật liệu === */

type Surface = 'soft' | 'shell' | 'wall' | 'dense' | 'fluid';

/**
 * Một bảng vật liệu cho cả sáu tế bào.
 *
 * Màu đến từ dữ liệu (`organelle.color`), độ bóng đến từ vai trò của bề mặt.
 * Giữ hai thứ đó tách nhau là lý do sáu tế bào trông như cùng một bộ mô hình
 * chứ như sáu bài tập dựng hình khác nhau.
 */
function makeMaterial(color: string, surface: Surface, compact: boolean): THREE.MeshPhysicalMaterial {
  const base = new THREE.Color(color);
  if (surface === 'shell') {
    return new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.22,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      transmission: compact ? 0 : 0.5,
      thickness: 1.2,
      ior: 1.36,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
      sheen: 0.8,
      sheenColor: new THREE.Color(0xffd8c4),
      envMapIntensity: 1.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  if (surface === 'wall') {
    return new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.66,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      clearcoat: 0.1,
      sheen: 0.2,
      envMapIntensity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  if (surface === 'fluid') {
    return new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.14,
      metalness: 0,
      transparent: true,
      opacity: 0.4,
      transmission: compact ? 0 : 0.62,
      thickness: 1.6,
      ior: 1.33,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.15,
      depthWrite: false,
    });
  }
  if (surface === 'dense') {
    return new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.46,
      metalness: 0.02,
      clearcoat: 0.25,
      envMapIntensity: 0.95,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffe4d6),
    envMapIntensity: 1,
    transparent: true,
    opacity: 0.96,
  });
}

/* ========================================================= khung dựng hình === */

type BuildContext = {
  compact: boolean;
  /** Bào quan theo id, để builder lấy màu và cờ `shell` từ dữ liệu. */
  organelle: (id: string) => Organelle;
  /** Ghi nhận geometry để giải phóng khi tháo cảnh. */
  keep: <T extends THREE.BufferGeometry>(geometry: T) => T;
  /** Gắn một nhóm vào cảnh dưới tên một bào quan. */
  attach: (id: string, group: THREE.Group) => void;
  material: (id: string, surface: Surface) => THREE.MeshPhysicalMaterial;
};

type Builder = (context: BuildContext) => void;

/* ------------------------------------------------------- các khối dùng lại --- */

/** Cụm ti thể: viên nang có mào bên trong, rải ở các vị trí đặt tay. */
function mitochondriaCluster(
  context: BuildContext,
  id: string,
  spots: readonly (readonly [number, number, number, number])[],
  size = 1,
) {
  const group = new THREE.Group();
  const body = context.keep(new THREE.CapsuleGeometry(0.22 * size, 0.5 * size, 6, 14));
  const crista = context.keep(new THREE.TorusGeometry(0.17 * size, 0.035 * size, 6, 14));
  const skin = context.material(id, 'soft');
  const inner = new THREE.MeshStandardMaterial({
    color: new THREE.Color(context.organelle(id).color).multiplyScalar(0.72),
    roughness: 0.5,
  });
  for (const [x, y, z, spin] of spots) {
    const unit = new THREE.Group();
    unit.add(new THREE.Mesh(body, skin));
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(crista, inner);
      ring.position.y = (-0.2 + index * 0.2) * size;
      ring.rotation.x = Math.PI / 2;
      unit.add(ring);
    }
    unit.position.set(x, y, z);
    unit.rotation.set(spin, spin * 0.7, spin * 0.4);
    group.add(unit);
  }
  context.attach(id, group);
}

/** Lưới nội chất: bốn dải ống gấp nếp quanh một tâm. */
function reticulumSheets(
  context: BuildContext,
  id: string,
  radius: number,
  centre: readonly [number, number, number],
  flatten = 0.72,
) {
  const group = new THREE.Group();
  const skin = context.material(id, 'soft');
  for (let sheet = 0; sheet < 4; sheet += 1) {
    const points: THREE.Vector3[] = [];
    const ring = radius + sheet * 0.16;
    for (let step = 0; step <= 40; step += 1) {
      const t = step / 40;
      const angle = -0.9 + t * 2.5 + sheet * 0.5;
      points.push(new THREE.Vector3(
        Math.cos(angle) * ring,
        -0.4 + Math.sin(t * Math.PI * 3 + sheet) * 0.28 + sheet * 0.22,
        Math.sin(angle) * ring * flatten,
      ));
    }
    const tube = context.keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 46, 0.055, 6, false));
    group.add(new THREE.Mesh(tube, skin));
  }
  group.position.set(centre[0], centre[1], centre[2]);
  context.attach(id, group);
}

/** Nhân có nhân con. Bán kính nhân con là 0,37 bán kính nhân — tỉ lệ hiển vi thật. */
function nucleusBall(
  context: BuildContext,
  id: string,
  radius: number,
  at: readonly [number, number, number],
  squash = 1,
) {
  const group = new THREE.Group();
  const shell = context.keep(organicSphere(radius, 4, 0.05, 4.2));
  const mesh = new THREE.Mesh(shell, context.material(id, 'soft'));
  mesh.scale.y = squash;
  group.add(mesh);
  const core = context.keep(organicSphere(radius * 0.37, 3, 0.08, 8.1));
  const nucleolus = new THREE.Mesh(core, new THREE.MeshStandardMaterial({
    color: new THREE.Color(context.organelle(id).color).multiplyScalar(0.66),
    roughness: 0.45,
  }));
  nucleolus.position.set(radius * 0.24, -radius * 0.13 * squash, radius * 0.1);
  group.add(nucleolus);
  group.position.set(at[0], at[1], at[2]);
  context.attach(id, group);
}

/** Vỏ bao: lớp trong suốt cộng một lưới viền mảnh, để ranh giới đọc được trên nền ivory. */
function shellLayer(
  context: BuildContext,
  id: string,
  geometry: THREE.BufferGeometry,
  rimGeometry: THREE.BufferGeometry,
  surface: Surface = 'shell',
) {
  const group = new THREE.Group();
  const skin = new THREE.Mesh(geometry, context.material(id, surface));
  skin.renderOrder = 6;
  group.add(skin);
  group.add(new THREE.Mesh(rimGeometry, new THREE.MeshBasicMaterial({
    color: 0xe87868, wireframe: true, transparent: true, opacity: 0.1,
  })));
  context.attach(id, group);
}

/** Hạt rải: một InstancedMesh cho hàng trăm hạt giống nhau. */
function beadField(
  context: BuildContext,
  id: string,
  options: {
    count: number;
    radius: number;
    spread: number;
    bead: number;
    seed: number;
    flattenY?: number;
  },
) {
  const group = new THREE.Group();
  const geometry = context.keep(new THREE.IcosahedronGeometry(options.bead, 1));
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(context.organelle(id).color),
    roughness: 0.45,
    metalness: 0,
  });
  const count = context.compact ? Math.round(options.count * 0.5) : options.count;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    // Xoắn theo góc vàng trong toạ độ cầu: phủ đều, tất định, không bao giờ
    // gieo lại giữa hai lần dựng.
    const t = (index + 0.5) / count;
    const radius = options.radius + Math.sqrt(t) * options.spread;
    const theta = index * 2.399963;
    const phi = Math.acos(1 - 2 * t);
    dummy.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * (options.flattenY ?? 0.85),
      radius * Math.sin(phi) * Math.sin(theta),
    );
    dummy.scale.setScalar(0.7 + scatter(index, options.seed) * 0.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  context.attach(id, group);
}

/* --------------------------------------------------------------- builders --- */

const BUILDERS: Record<CellId, Builder> = {
  /* ------------------------------------------------------ tế bào động vật --- */
  animal: (context) => {
    shellLayer(
      context, 'membrane',
      context.keep(organicSphere(2.6, 4, 0.045, 1.3)),
      context.keep(organicSphere(2.63, 3, 0.045, 1.3)),
    );
    nucleusBall(context, 'nucleus', 0.92, [-0.35, 0.25, 0.1]);
    mitochondriaCluster(context, 'mitochondria', [
      [1.35, 0.55, 0.5, 0.7], [-1.1, -0.75, 0.75, -1.1], [0.4, 1.35, -0.7, 2.1],
      [-1.4, 0.5, -0.8, 0.3], [0.9, -1.25, -0.35, -0.5],
    ]);
    reticulumSheets(context, 'er', 1.25, [0, 0, 0]);
    golgiStack(context, 'golgi', [0.55, -1.3, 0.5], 0.72);
    beadField(context, 'ribosome', { count: 300, radius: 1.15, spread: 1.25, bead: 0.045, seed: 3 });
  },

  /* ------------------------------------------------------ tế bào thực vật --- */
  /* Hộp chứ không phải cầu, và không bào chiếm gần hết thể tích — hai điều đó là
     toàn bộ khác biệt hình thái mà học sinh phải nhận ra. */
  plant: (context) => {
    shellLayer(
      context, 'wall',
      context.keep(roundedBox([2.9, 1.9, 1.4], 5.5)),
      context.keep(roundedBox([2.94, 1.93, 1.43], 5.5, 3)),
      'wall',
    );
    // Không bào trung tâm: to đến mức mọi bào quan khác bị ép ra sát thành.
    const vacuole = new THREE.Group();
    vacuole.add(new THREE.Mesh(
      context.keep(roundedBox([1.95, 1.28, 0.92], 3.4)),
      context.material('vacuole', 'fluid'),
    ));
    context.attach('vacuole', vacuole);

    // Lục lạp: đĩa dẹt có các chồng thylakoid bên trong.
    const chloroplasts = new THREE.Group();
    const lens = context.keep(new THREE.SphereGeometry(0.34, 18, 12));
    const stack = context.keep(new THREE.CylinderGeometry(0.09, 0.09, 0.055, 12));
    const skin = context.material('chloroplast', 'soft');
    const grana = new THREE.MeshStandardMaterial({
      color: new THREE.Color(context.organelle('chloroplast').color).multiplyScalar(0.6),
      roughness: 0.5,
    });
    const chloroSpots: [number, number, number, number][] = [
      [-2.1, 1.35, 0.5, 0.4], [-0.7, -1.45, 0.6, -0.8], [1.4, 1.42, -0.5, 1.2],
      [2.3, -1.3, 0.45, 0.2], [0.3, 1.5, 0.75, -0.5], [-2.35, -1.2, -0.5, 0.9],
    ];
    for (const [x, y, z, spin] of chloroSpots) {
      const unit = new THREE.Group();
      const body = new THREE.Mesh(lens, skin);
      body.scale.set(1.5, 0.62, 1);
      unit.add(body);
      for (let index = 0; index < 3; index += 1) {
        const granum = new THREE.Mesh(stack, grana);
        granum.position.set(-0.18 + index * 0.18, 0, 0);
        unit.add(granum);
      }
      unit.position.set(x, y, z);
      unit.rotation.set(spin * 0.4, spin, spin * 0.3);
      chloroplasts.add(unit);
    }
    context.attach('chloroplast', chloroplasts);

    nucleusBall(context, 'nucleus', 0.62, [2.05, 0.9, 0.55], 0.9);
    mitochondriaCluster(context, 'mitochondria', [
      [-1.5, -1.5, -0.6, 0.6], [1.9, -1.42, -0.5, -0.9], [-2.5, 0.35, 0.6, 1.4],
    ], 0.85);
    reticulumSheets(context, 'er', 0.9, [1.1, -0.2, -0.75], 0.5);
  },

  /* ------------------------------------------------------- bạch cầu hạt --- */
  /* Nhân chia múi là dấu nhận biết của bạch cầu trung tính, nên nó được dựng
     đúng là bốn múi nối nhau chứ không phải một hình cầu. */
  'white-blood': (context) => {
    shellLayer(
      context, 'membrane',
      context.keep(organicSphere(2.7, 4, 0.075, 5.1)),
      context.keep(organicSphere(2.74, 3, 0.075, 5.1)),
    );

    const nucleus = new THREE.Group();
    const lobe = context.keep(organicSphere(0.62, 3, 0.09, 2.4));
    const nucleusSkin = context.material('nucleus', 'soft');
    const lobes: [number, number, number, number][] = [
      [-0.85, 0.35, 0.1, 1], [-0.1, 0.72, -0.15, 0.86],
      [0.62, 0.25, 0.2, 0.94], [0.35, -0.5, -0.1, 0.78],
    ];
    for (const [x, y, z, size] of lobes) {
      const mesh = new THREE.Mesh(lobe, nucleusSkin);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(size);
      nucleus.add(mesh);
    }
    // Eo nối giữa các múi: không có nó, bốn múi trông như bốn hạt rời.
    const bridge = context.keep(new THREE.CapsuleGeometry(0.16, 0.5, 5, 10));
    for (let index = 0; index < lobes.length - 1; index += 1) {
      const from = new THREE.Vector3(lobes[index][0], lobes[index][1], lobes[index][2]);
      const to = new THREE.Vector3(lobes[index + 1][0], lobes[index + 1][1], lobes[index + 1][2]);
      const link = new THREE.Mesh(bridge, nucleusSkin);
      link.position.copy(from).add(to).multiplyScalar(0.5);
      link.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        to.clone().sub(from).normalize(),
      );
      nucleus.add(link);
    }
    nucleus.position.set(-0.15, 0.15, 0.1);
    context.attach('nucleus', nucleus);

    beadField(context, 'granules', { count: 260, radius: 1.1, spread: 1.35, bead: 0.075, seed: 7 });

    const lysosomes = new THREE.Group();
    const sac = context.keep(organicSphere(0.2, 2, 0.12, 9.4));
    const sacSkin = context.material('lysosome', 'dense');
    for (let index = 0; index < 7; index += 1) {
      const mesh = new THREE.Mesh(sac, sacSkin);
      const angle = index * 2.399963;
      const radius = 1.35 + scatter(index, 11) * 0.7;
      mesh.position.set(
        Math.cos(angle) * radius,
        -0.6 - scatter(index, 13) * 0.9,
        Math.sin(angle) * radius * 0.8,
      );
      mesh.scale.setScalar(0.8 + scatter(index, 17) * 0.5);
      lysosomes.add(mesh);
    }
    context.attach('lysosome', lysosomes);

    // Túi thực bào: một bọng lớn, bên trong có "con vi khuẩn" đã bị bắt.
    const phagosome = new THREE.Group();
    const bag = new THREE.Mesh(
      context.keep(organicSphere(0.66, 3, 0.07, 6.3)),
      context.material('phagosome', 'fluid'),
    );
    bag.renderOrder = 4;
    phagosome.add(bag);
    const prey = new THREE.Mesh(
      context.keep(new THREE.CapsuleGeometry(0.14, 0.34, 6, 12)),
      new THREE.MeshStandardMaterial({ color: 0x8fae8d, roughness: 0.5 }),
    );
    prey.rotation.set(0.5, 0, 0.8);
    phagosome.add(prey);
    phagosome.position.set(1.35, -1.15, 0.55);
    context.attach('phagosome', phagosome);
  },

  /* ---------------------------------------------------- tế bào biểu mô --- */
  /* Có mặt trên và mặt dưới, không đối xứng: vi nhung mao chỉ ở mặt tự do, liên
     kết chỉ ở vành trên. Tính phân cực đó là điều làm nên biểu mô. */
  epithelial: (context) => {
    shellLayer(
      context, 'membrane',
      context.keep(roundedBox([1.42, 2.7, 1.22], 4.2)),
      context.keep(roundedBox([1.45, 2.74, 1.25], 4.2, 3)),
    );

    const villi = new THREE.Group();
    const finger = context.keep(new THREE.CapsuleGeometry(0.07, 0.42, 5, 10));
    const villiSkin = context.material('microvilli', 'soft');
    for (let index = 0; index < 46; index += 1) {
      const mesh = new THREE.Mesh(finger, villiSkin);
      const gridX = (index % 7) / 6 - 0.5;
      const gridZ = Math.floor(index / 7) / 6 - 0.5;
      mesh.position.set(
        gridX * 2.1 + (scatter(index, 21) - 0.5) * 0.12,
        2.72 + scatter(index, 23) * 0.12,
        gridZ * 1.8 + (scatter(index, 27) - 0.5) * 0.12,
      );
      mesh.rotation.set((scatter(index, 29) - 0.5) * 0.22, 0, (scatter(index, 31) - 0.5) * 0.22);
      villi.add(mesh);
    }
    context.attach('microvilli', villi);

    // Liên kết chặt: một vành quanh mép trên, nơi hai tế bào cạnh nhau khoá vào nhau.
    const junction = new THREE.Group();
    const band = context.keep(new THREE.TorusGeometry(1.3, 0.075, 8, 40));
    const bandSkin = context.material('junction', 'dense');
    for (let index = 0; index < 2; index += 1) {
      const ring = new THREE.Mesh(band, bandSkin);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1, 0.88, 1);
      ring.position.y = 2.24 - index * 0.34;
      junction.add(ring);
    }
    context.attach('junction', junction);

    nucleusBall(context, 'nucleus', 0.72, [0, -1.28, 0.06], 0.92);
    mitochondriaCluster(context, 'mitochondria', [
      [0.72, 1.15, 0.35, 1.3], [-0.75, 0.55, -0.4, 0.4],
      [0.5, -0.15, -0.55, 2.2], [-0.6, 1.75, 0.3, -0.6],
    ], 0.85);
    reticulumSheets(context, 'er', 0.82, [0, 0.05, 0.2], 0.55);
  },

  /* --------------------------------------------------------- tế bào cơ --- */
  /* Rất dài, nhiều nhân, và bên trong là các sợi có vân ngang. Cả ba đặc điểm
     đó đều hiện ra trên hình chứ không chỉ nằm trong bảng chữ. */
  muscle: (context) => {
    shellLayer(
      context, 'sarcolemma',
      context.keep(new THREE.CapsuleGeometry(1.1, 7.2, 8, 28)),
      context.keep(new THREE.CapsuleGeometry(1.12, 7.24, 6, 20)),
    );
    // Viên nang của three nằm dọc trục Y; tế bào cơ nằm ngang, nên quay vỏ đi.
    // (Cả hai mesh nằm trong cùng một nhóm nên chỉ cần quay nhóm.)
    const shells = context.organelle('sarcolemma');
    void shells;

    const fibrils = new THREE.Group();
    const rod = context.keep(new THREE.CylinderGeometry(0.17, 0.17, 7.6, 14, 1, true));
    const disc = context.keep(new THREE.TorusGeometry(0.185, 0.032, 6, 16));
    const rodSkin = context.material('myofibril', 'soft');
    const discSkin = new THREE.MeshStandardMaterial({
      color: new THREE.Color(context.organelle('myofibril').color).multiplyScalar(0.68),
      roughness: 0.48,
    });
    const fibrilSpots: [number, number][] = [
      [0.45, 0.3], [-0.42, 0.34], [0.05, -0.5], [-0.5, -0.3], [0.5, -0.15], [0, 0.55],
    ];
    for (const [y, z] of fibrilSpots) {
      const unit = new THREE.Group();
      const body = new THREE.Mesh(rod, rodSkin);
      body.rotation.z = Math.PI / 2;
      unit.add(body);
      // Vân ngang: đĩa Z cách nhau 0,62 đơn vị — đó là cái tạo ra sọc dưới kính.
      for (let index = -5; index <= 5; index += 1) {
        const zDisc = new THREE.Mesh(disc, discSkin);
        zDisc.position.x = index * 0.62;
        zDisc.rotation.y = Math.PI / 2;
        unit.add(zDisc);
      }
      unit.position.set(0, y, z);
      fibrils.add(unit);
    }
    context.attach('myofibril', fibrils);

    // Nhiều nhân, và tất cả đều nằm sát màng — chỗ duy nhất còn trống.
    const nuclei = new THREE.Group();
    const nucleusGeometry = context.keep(organicSphere(0.34, 3, 0.06, 3.7));
    const nucleusSkin = context.material('nucleus', 'soft');
    const nucleusSpots: [number, number, number][] = [
      [-2.6, 0.82, 0.2], [-0.5, -0.86, 0.15], [1.7, 0.8, -0.25], [3.2, -0.8, 0.2],
    ];
    for (const [x, y, z] of nucleusSpots) {
      const mesh = new THREE.Mesh(nucleusGeometry, nucleusSkin);
      mesh.position.set(x, y, z);
      mesh.scale.set(1.5, 0.78, 0.78);
      nuclei.add(mesh);
    }
    context.attach('nucleus', nuclei);

    mitochondriaCluster(context, 'mitochondria', [
      [-3.2, 0, 0.62, 1.57], [-1.5, 0.15, -0.66, 1.57], [0.6, -0.1, 0.68, 1.57],
      [2.4, 0.2, -0.6, 1.57], [3.7, -0.15, 0.55, 1.57],
    ], 0.8);

    // Lưới cơ tương: ống bọc quanh các sợi, chứ không phải một cụm ở góc.
    const reticulum = new THREE.Group();
    const reticulumSkin = context.material('reticulum', 'soft');
    for (let sheet = 0; sheet < 3; sheet += 1) {
      const points: THREE.Vector3[] = [];
      for (let step = 0; step <= 60; step += 1) {
        const t = step / 60;
        const angle = t * Math.PI * 6 + sheet * 2.1;
        points.push(new THREE.Vector3(
          -3.4 + t * 6.8,
          Math.sin(angle) * 0.78,
          Math.cos(angle) * 0.78,
        ));
      }
      const tube = context.keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 90, 0.042, 6, false));
      reticulum.add(new THREE.Mesh(tube, reticulumSkin));
    }
    context.attach('reticulum', reticulum);
  },

  /* ----------------------------------------------------------- tế bào thần kinh --- */
  /* Không có lớp bao kín nào (`crossSection: false` trong dữ liệu): neuron được
     nhìn từ ngoài, vì hình dạng ngoài của nó CHÍNH LÀ nội dung — thân, nhánh
     nhận, sợi trục dài, và bao myelin có khoảng ngắt. */
  neuron: (context) => {
    const soma = new THREE.Group();
    soma.add(new THREE.Mesh(
      context.keep(organicSphere(1.15, 4, 0.09, 2.2)),
      context.material('soma', 'soft'),
    ));
    soma.position.set(-4.6, 0, 0);
    context.attach('soma', soma);

    nucleusBall(context, 'nucleus', 0.5, [-4.75, 0.08, 0.12]);

    // Nhánh nhận: bốn cành chia đôi, toả về phía trái.
    const dendrites = new THREE.Group();
    const dendriteSkin = context.material('dendrite', 'soft');
    const branch = (from: THREE.Vector3, direction: THREE.Vector3, length: number, depth: number) => {
      const to = from.clone().add(direction.clone().multiplyScalar(length));
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, direction.y * 0.18, direction.z * 0.12));
      const curve = new THREE.CatmullRomCurve3([from, mid, to]);
      const radius = 0.055 + depth * 0.028;
      const tube = context.keep(new THREE.TubeGeometry(curve, 18, radius, 6, false));
      dendrites.add(new THREE.Mesh(tube, dendriteSkin));
      if (depth <= 0) return;
      for (const spin of [-0.62, 0.62]) {
        const next = direction.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), spin);
        next.z += (spin > 0 ? 0.22 : -0.22);
        branch(to, next.normalize(), length * 0.66, depth - 1);
      }
    };
    for (const angle of [2.35, 2.95, 3.5, 4.05]) {
      branch(
        new THREE.Vector3(-4.6, 0, 0),
        new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.1).normalize(),
        1.05,
        1,
      );
    }
    context.attach('dendrite', dendrites);

    // Sợi trục: một ống dài chạy sang phải. Đây là bào quan dài nhất trong bộ
    // sáu tế bào, và tỉ lệ đó là chủ ý — sợi trục thật dài tới một mét.
    const axon = new THREE.Group();
    const axonPoints: THREE.Vector3[] = [];
    for (let step = 0; step <= 40; step += 1) {
      const t = step / 40;
      axonPoints.push(new THREE.Vector3(-3.5 + t * 9.6, Math.sin(t * 2.2) * 0.16, Math.sin(t * 1.4) * 0.1));
    }
    const axonCurve = new THREE.CatmullRomCurve3(axonPoints);
    axon.add(new THREE.Mesh(
      context.keep(new THREE.TubeGeometry(axonCurve, 90, 0.115, 10, false)),
      context.material('axon', 'soft'),
    ));
    context.attach('axon', axon);

    // Bao myelin: đoạn có, đoạn không. Khoảng ngắt (eo Ranvier) là chỗ xung
    // điện nhảy qua, nên nó phải nhìn ra được là khoảng trống thật.
    const myelin = new THREE.Group();
    const sleeve = context.keep(new THREE.CylinderGeometry(0.27, 0.27, 0.86, 16, 1, true));
    const myelinSkin = context.material('myelin', 'soft');
    const up = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < 8; index += 1) {
      const t = 0.07 + index * 0.118;
      const at = axonCurve.getPointAt(Math.min(t, 1));
      const tangent = axonCurve.getTangentAt(Math.min(t, 1));
      const mesh = new THREE.Mesh(sleeve, myelinSkin);
      mesh.position.copy(at);
      mesh.quaternion.setFromUnitVectors(up, tangent);
      myelin.add(mesh);
    }
    context.attach('myelin', myelin);

    // Cúc xináp ở đầu sợi trục.
    const terminals = new THREE.Group();
    const knob = context.keep(organicSphere(0.19, 2, 0.1, 7.7));
    const stalk = context.keep(new THREE.CapsuleGeometry(0.05, 0.34, 5, 8));
    const terminalSkin = context.material('terminal', 'soft');
    const tip = axonCurve.getPointAt(1);
    for (let index = 0; index < 5; index += 1) {
      const angle = -1.1 + index * 0.55;
      const direction = new THREE.Vector3(Math.cos(angle) * 0.7 + 0.5, Math.sin(angle), (index - 2) * 0.16).normalize();
      const arm = new THREE.Mesh(stalk, terminalSkin);
      arm.position.copy(tip).add(direction.clone().multiplyScalar(0.24));
      arm.quaternion.setFromUnitVectors(up, direction);
      terminals.add(arm);
      const bulb = new THREE.Mesh(knob, terminalSkin);
      bulb.position.copy(tip).add(direction.clone().multiplyScalar(0.52));
      terminals.add(bulb);
    }
    context.attach('terminal', terminals);
  },
};

/** Chồng túi dẹt của bộ máy Golgi. Chỉ tế bào động vật dùng, nên để riêng. */
function golgiStack(
  context: BuildContext,
  id: string,
  at: readonly [number, number, number],
  width: number,
) {
  const group = new THREE.Group();
  const skin = context.material(id, 'soft');
  for (let index = 0; index < 5; index += 1) {
    const ring = context.keep(new THREE.TorusGeometry(width - index * 0.09, 0.048, 6, 26, Math.PI * 1.35));
    const cisterna = new THREE.Mesh(ring, skin);
    cisterna.position.y = index * 0.14;
    cisterna.rotation.set(Math.PI / 2 - 0.24, 0, index * 0.14);
    group.add(cisterna);
  }
  group.position.set(at[0], at[1], at[2]);
  context.attach(id, group);
}

/* ================================================================ component === */

type Part = {
  id: string;
  group: THREE.Group;
  home: THREE.Vector3;
  offset: THREE.Vector3;
  shell: boolean;
  materials: THREE.Material[];
};

export function CellStudio({ params }: { params?: Record<string, string> }) {
  const cell = useMemo<CellContent>(() => cellById(params?.cell), [params?.cell]);
  const [selected, setSelected] = useState<string | null>(cell.defaultOrganelle);
  const [isolate, setIsolate] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitRig | null>(null);

  /*
   * Lựa chọn và trạng thái tách lớp đi qua ref, không qua dependency của effect
   * dựng cảnh. Dựng lại cả tế bào vì một cái nhãn vừa được bấm là cách chắc
   * chắn nhất để đánh mất WebGL context.
   */
  const selectedRef = useRef<string | null>(cell.defaultOrganelle);
  const isolateRef = useRef(false);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { isolateRef.current = isolate; }, [isolate]);

  /*
   * Đổi loại tế bào là đổi mẫu vật: quay về bào quan mở sẵn của loại mới.
   *
   * Chỉnh ngay trong lúc render chứ không qua `useEffect`. Làm bằng effect thì
   * React render một lần với bào quan của tế bào *cũ* rồi mới render lại — trên
   * màn hình là một nháy sai dữ liệu, và bảng số đo bên dưới đọc nhầm một nhịp.
   * Đây đúng là mẫu React khuyến nghị cho "state phải đặt lại khi prop đổi".
   */
  const [cellKey, setCellKey] = useState(cell.id);
  if (cellKey !== cell.id) {
    setCellKey(cell.id);
    setSelected(cell.defaultOrganelle);
    setIsolate(false);
  }

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;

    const stage = createLibraryStage(host, { mount, fov: 32 });
    const orbit = createOrbitRig(host, {
      yaw: cell.frame.yaw,
      pitch: cell.frame.pitch,
      spinning: !stage.reduceMotion,
    });
    orbitRef.current = orbit;

    const pivot = new THREE.Group();
    stage.scene.add(pivot);

    const geometries: THREE.BufferGeometry[] = [];
    const parts: Part[] = [];
    const lookup = new Map(cell.organelles.map((entry) => [entry.id, entry] as const));

    const context: BuildContext = {
      compact: stage.compact,
      organelle: (id) => lookup.get(id) ?? cell.organelles[0],
      keep: (geometry) => { geometries.push(geometry); return geometry; },
      material: (id, surface) => makeMaterial(context.organelle(id).color, surface, stage.compact),
      attach: (id, group) => {
        const data = context.organelle(id);
        const materials: THREE.Material[] = [];
        group.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.userData.organelle = id;
          mesh.frustumCulled = false;
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of list) if (material) materials.push(material);
        });
        pivot.add(group);
        parts.push({
          id,
          group,
          home: group.position.clone(),
          offset: new THREE.Vector3(data.offset[0], data.offset[1], data.offset[2]),
          shell: data.shell === true,
          materials,
        });
      },
    };

    BUILDERS[cell.id](context);

    /* Tế bào cơ được dựng dọc trục Y bởi CapsuleGeometry rồi quay ngang ở đây,
       vì quay một nhóm là một dòng còn quay từng geometry là sáu. */
    if (cell.id === 'muscle') {
      const sarcolemma = parts.find((part) => part.id === 'sarcolemma');
      if (sarcolemma) sarcolemma.group.rotation.z = Math.PI / 2;
    }

    /* Khung hình từ dữ liệu, không đo lại từ cảnh: bao ngoài đổi theo trạng thái
       tách lớp, nên đo lúc chạy sẽ làm khung hình thở. */
    const half = new THREE.Vector3(
      cell.frame.size[0] / 2, cell.frame.size[1] / 2, cell.frame.size[2] / 2,
    );
    const centre = new THREE.Vector3(cell.frame.center[0], cell.frame.center[1], cell.frame.center[2]);
    const box = new THREE.Box3(centre.clone().sub(half), centre.clone().add(half));
    // Quay quanh tâm mẫu vật, không quanh gốc toạ độ của hình học.
    pivot.position.sub(centre);
    pivot.updateMatrixWorld(true);
    const applyFit = () => orbit.setFit(fitBox(
      box.clone().translate(centre.clone().negate()),
      stage.camera,
      { yaw: cell.frame.yaw, pitch: cell.frame.pitch, fill: cell.frame.fill },
    ));
    applyFit();
    stage.onResize(applyFit);
    stage.shadow.fit(box.clone().translate(centre.clone().negate()));

    /* -------------------------------------------------------------- chọn --- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      // Một cú nhấp, không phải cuối một cú kéo. Vòng orbit đã lo phần kéo.
      if (Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY) > 6) return;
      if ((event.target as Element | null)?.closest('button, a, input, label')) return;
      const rect = host.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, stage.camera);
      const hits = raycaster.intersectObjects(pivot.children, true);
      const id = hits.find((entry) => entry.object.userData.organelle)?.object.userData.organelle as
        | string
        | undefined;
      if (id) setSelected((current) => (current === id ? null : id));
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointerup', onPointerUp);

    const timer = new THREE.Timer();
    const scratch = new THREE.Vector3();
    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      orbit.apply(stage.camera, delta);

      const ease = 1 - Math.pow(0.003, delta);
      const active = selectedRef.current;
      const isolating = isolateRef.current && active !== null;
      for (const part of parts) {
        const chosen = part.id === active;
        scratch.copy(part.home);
        if (isolating && chosen && !part.shell) scratch.add(part.offset);
        part.group.position.lerp(scratch, ease);
        // Lớp bao phình ra khi tách, để nhìn được vào trong.
        const wantedScale = isolating && part.shell ? 1.18 : 1;
        part.group.scale.lerp(scratch.set(wantedScale, wantedScale, wantedScale), ease);

        const dim = isolating
          ? chosen ? 1 : part.shell ? 0.1 : 0.12
          : active ? (chosen ? 1 : 0.55) : 1;
        for (const material of part.materials) {
          const target = material as THREE.Material & { opacity: number; userData: { baseOpacity?: number } };
          if (target.userData.baseOpacity === undefined) target.userData.baseOpacity = target.opacity;
          const base = target.userData.baseOpacity ?? 1;
          const wanted = base * dim;
          target.opacity += (wanted - target.opacity) * ease;
          const needsBlend = target.opacity < 0.995;
          if (target.transparent !== needsBlend) {
            target.transparent = needsBlend;
            target.needsUpdate = true;
          }
        }
      }
      stage.renderer.render(stage.scene, stage.camera);
      stage.noteFrame(delta);
    });

    return () => {
      stage.renderer.setAnimationLoop(null);
      orbitRef.current = null;
      orbit.dispose();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointerup', onPointerUp);
      for (const geometry of geometries) geometry.dispose();
      for (const part of parts) {
        for (const material of part.materials) material.dispose();
        part.group.traverse((child) => {
          const instanced = child as THREE.InstancedMesh;
          if (instanced.isInstancedMesh) instanced.dispose();
        });
      }
      stage.dispose();
    };
  }, [cell]);

  const current = selected ? cell.organelles.find((entry) => entry.id === selected) ?? null : null;

  return (
    <div className="cell-studio">
      <div className="cell-stage" ref={hostRef}>
        <div
          ref={viewRef}
          role="img"
          aria-label={`Mô hình 3D ${cell.name}`}
          style={{ position: 'absolute', inset: 0 }}
        />
        {/*
          The cell class, and only the cell class.
          The viewer bar directly above already carries the specimen's name and
          its subtitle, so repeating them here spent a corner of the stage saying
          what the frame had just said. "Tế bào nhân thực" is the one label that
          is not up there and that a student needs while looking at the model.
        */}
        <div className="cell-badge">{cell.cellClass}</div>
        <p className="stage-hint">Kéo để xoay · Cuộn để phóng · Nhấp một bào quan để xem</p>
      </div>

      <div className="cell-controls">
        <div className="cell-organelles" role="group" aria-label="Bào quan">
          {cell.organelles.map((organelle) => (
            <button
              type="button"
              key={organelle.id}
              className={selected === organelle.id ? 'is-active' : ''}
              aria-pressed={selected === organelle.id}
              onClick={() => setSelected((value) => (value === organelle.id ? null : organelle.id))}
            >
              <i style={{ background: organelle.color }} aria-hidden="true" />
              {organelle.name}
            </button>
          ))}
        </div>
        <label className={`cell-isolate${isolate ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={isolate}
            onChange={(event) => setIsolate(event.target.checked)}
            disabled={!selected}
          />
          Tách bào quan
        </label>
      </div>

      <div className="cell-readout" role="status">
        {current ? (
          <>
            <p className="cell-readout-lead">
              <b>{current.name}</b>
              {current.role}
            </p>
            <dl className="cell-readout-facts">
              {current.attributes.map((attribute) => (
                <div key={attribute.label}>
                  <dt>{attribute.label}</dt>
                  <dd>{attribute.value}</dd>
                </div>
              ))}
            </dl>
            <p className="cell-readout-note">{current.note}</p>
          </>
        ) : (
          <p className="cell-readout-lead">
            <b>{cell.where}</b>
            {cell.comparison}
          </p>
        )}
      </div>
    </div>
  );
}

/** Sáu loại tế bào, để bảng kê học liệu không phải nhắc lại danh sách. */
export const CELL_IDS = CELLS.map((entry) => entry.id);
