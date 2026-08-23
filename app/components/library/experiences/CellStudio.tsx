'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createProceduralEnvironment } from '../../../lib/three/environment';
import { libraryEnvironmentPalette } from '../../../lib/three/libraryEnvironment';

/**
 * Animal cell — built, not downloaded.
 *
 * The two NIH cell meshes that were on the table for this subject (3DPX-015797
 * and 3DPX-015796) both carry CC BY-NC-SA, which is a non-commercial licence and
 * therefore unusable on a product site; see SOURCE_AUDIT.md. Rather than ship a
 * licence problem or an empty subject, the cell is modelled here in geometry
 * YooLab owns outright.
 *
 * That turns out to be the better teaching object anyway. Every organelle is its
 * own object with its own name, so selecting one can physically lift it out of
 * the cell — which a single fused mesh from a print exchange cannot do.
 */

type OrganelleId = 'nucleus' | 'mitochondria' | 'er' | 'golgi' | 'ribosome' | 'membrane';

type Organelle = {
  id: OrganelleId;
  label: string;
  role: string;
  /** Direction the part travels when it is isolated. */
  offset: THREE.Vector3;
};

const ORGANELLES: Organelle[] = [
  { id: 'membrane', label: 'Màng sinh chất', role: 'Ranh giới chọn lọc chất vào và ra khỏi tế bào.', offset: new THREE.Vector3(0, 0, 0) },
  { id: 'nucleus', label: 'Nhân', role: 'Chứa vật chất di truyền, điều khiển mọi hoạt động của tế bào.', offset: new THREE.Vector3(0, 0.1, 1.6) },
  { id: 'mitochondria', label: 'Ti thể', role: 'Hô hấp tế bào — nơi tạo ra năng lượng ATP.', offset: new THREE.Vector3(1.7, 0.3, 0.4) },
  { id: 'er', label: 'Lưới nội chất', role: 'Hệ màng gấp nếp, tổng hợp và vận chuyển chất trong tế bào.', offset: new THREE.Vector3(-1.7, 0.2, 0.5) },
  { id: 'golgi', label: 'Bộ Golgi', role: 'Đóng gói và phân phối sản phẩm của tế bào.', offset: new THREE.Vector3(0.5, -1.6, 0.6) },
  { id: 'ribosome', label: 'Ribosome', role: 'Hạt nhỏ nằm rải rác, tổng hợp protein.', offset: new THREE.Vector3(-0.6, 1.6, 0.6) },
];

type Part = {
  id: OrganelleId;
  group: THREE.Group;
  home: THREE.Vector3;
  materials: THREE.Material[];
};

/** A lumpy sphere: cells are not billiard balls, and a perfect one looks CG. */
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

export function CellStudio() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<OrganelleId | null>(null);
  const [isolate, setIsolate] = useState(false);
  // Mirrored into refs so the render loop can read the current selection
  // without the scene effect depending on it — rebuilding the cell because a
  // label was clicked would throw away the whole scene. Written in an effect
  // rather than during render, which is a rule React now enforces.
  const selectedRef = useRef<OrganelleId | null>(null);
  const isolateRef = useRef(false);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { isolateRef.current = isolate; }, [isolate]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = window.matchMedia('(max-width: 900px)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: !compact, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.4 : 1.7));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'model-stage-canvas';
    host.appendChild(renderer.domElement);

    const environment = createProceduralEnvironment(renderer, libraryEnvironmentPalette);
    scene.environment = environment.texture;
    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xe0d0c0, 1.2));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.3);
    key.position.set(-3, 4.2, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd6c2, 1.3);
    rim.position.set(4, -1, -4);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    const parts: Part[] = [];
    const geometries: THREE.BufferGeometry[] = [];

    const track = (group: THREE.Group, id: OrganelleId, home: THREE.Vector3) => {
      const materials: THREE.Material[] = [];
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.userData.organelle = id;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of list) if (material) materials.push(material);
      });
      group.position.copy(home);
      pivot.add(group);
      parts.push({ id, group, home: home.clone(), materials });
    };

    /* ---------------------------------------------------------- cytoplasm --- */
    // The cell body: a translucent shell with a faint inner fill, so the
    // organelles read as being *inside* something.
    const membrane = new THREE.Group();
    const shellGeometry = organicSphere(2.6, 4, 0.045, 1.3);
    geometries.push(shellGeometry);
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf6d9c9,
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
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.renderOrder = 6;
    membrane.add(shell);
    // A thin bright edge so the boundary is legible against an ivory panel.
    const rimGeometry = organicSphere(2.63, 3, 0.045, 1.3);
    geometries.push(rimGeometry);
    const rimMaterial = new THREE.MeshBasicMaterial({
      color: 0xe87868, wireframe: true, transparent: true, opacity: 0.1,
    });
    membrane.add(new THREE.Mesh(rimGeometry, rimMaterial));
    track(membrane, 'membrane', new THREE.Vector3(0, 0, 0));

    /* ------------------------------------------------------------- nucleus --- */
    const nucleus = new THREE.Group();
    const nucleusGeometry = organicSphere(0.92, 4, 0.05, 4.2);
    geometries.push(nucleusGeometry);
    const nucleusMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8d6bcc, roughness: 0.3, metalness: 0, clearcoat: 0.7,
      clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new THREE.Color(0xddd2f2),
      envMapIntensity: 1, transparent: true, opacity: 0.94,
    });
    nucleus.add(new THREE.Mesh(nucleusGeometry, nucleusMaterial));
    // Nucleolus.
    const nucleolusGeometry = organicSphere(0.34, 3, 0.08, 8.1);
    geometries.push(nucleolusGeometry);
    const nucleolusMaterial = new THREE.MeshStandardMaterial({ color: 0x5d3fa0, roughness: 0.45 });
    const nucleolus = new THREE.Mesh(nucleolusGeometry, nucleolusMaterial);
    nucleolus.position.set(0.22, -0.12, 0.1);
    nucleus.add(nucleolus);
    track(nucleus, 'nucleus', new THREE.Vector3(-0.35, 0.25, 0.1));

    /* -------------------------------------------------------- mitochondria --- */
    const mitochondria = new THREE.Group();
    const mitoBody = new THREE.CapsuleGeometry(0.22, 0.5, 6, 14);
    const mitoCrista = new THREE.TorusGeometry(0.17, 0.035, 6, 14);
    geometries.push(mitoBody, mitoCrista);
    const mitoMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe87868, roughness: 0.38, metalness: 0, clearcoat: 0.4,
      sheen: 0.4, sheenColor: new THREE.Color(0xffd0bd), envMapIntensity: 1,
    });
    const cristaMaterial = new THREE.MeshStandardMaterial({ color: 0xc95f52, roughness: 0.5 });
    const mitoSpots: [number, number, number, number][] = [
      [1.35, 0.55, 0.5, 0.7], [-1.1, -0.75, 0.75, -1.1], [0.4, 1.35, -0.7, 2.1],
      [-1.4, 0.5, -0.8, 0.3], [0.9, -1.25, -0.35, -0.5],
    ];
    for (const [x, y, z, spin] of mitoSpots) {
      const unit = new THREE.Group();
      const body = new THREE.Mesh(mitoBody, mitoMaterial);
      unit.add(body);
      for (let index = 0; index < 3; index += 1) {
        const crista = new THREE.Mesh(mitoCrista, cristaMaterial);
        crista.position.y = -0.2 + index * 0.2;
        crista.rotation.x = Math.PI / 2;
        unit.add(crista);
      }
      unit.position.set(x, y, z);
      unit.rotation.set(spin, spin * 0.7, spin * 0.4);
      mitochondria.add(unit);
    }
    track(mitochondria, 'mitochondria', new THREE.Vector3(0, 0, 0));

    /* --------------------------------------------------- endoplasmic ret. --- */
    // Folded sheets around the nucleus, made from a ribbon of tube segments.
    const er = new THREE.Group();
    const erMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x5fb6c4, roughness: 0.34, metalness: 0, clearcoat: 0.5,
      sheen: 0.4, sheenColor: new THREE.Color(0xcfe9ee), envMapIntensity: 1,
      transparent: true, opacity: 0.95,
    });
    for (let sheet = 0; sheet < 4; sheet += 1) {
      const points: THREE.Vector3[] = [];
      const radius = 1.25 + sheet * 0.16;
      for (let step = 0; step <= 40; step += 1) {
        const t = step / 40;
        const angle = -0.9 + t * 2.5 + sheet * 0.5;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          -0.4 + Math.sin(t * Math.PI * 3 + sheet) * 0.28 + sheet * 0.22,
          Math.sin(angle) * radius * 0.72,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tube = new THREE.TubeGeometry(curve, 46, 0.055, 6, false);
      geometries.push(tube);
      er.add(new THREE.Mesh(tube, erMaterial));
    }
    track(er, 'er', new THREE.Vector3(0, 0, 0));

    /* --------------------------------------------------------------- golgi --- */
    const golgi = new THREE.Group();
    const golgiMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe0b45c, roughness: 0.36, metalness: 0.05, clearcoat: 0.45,
      sheen: 0.35, sheenColor: new THREE.Color(0xf7e3bc), envMapIntensity: 1,
    });
    for (let index = 0; index < 5; index += 1) {
      const width = 0.72 - index * 0.09;
      const disc = new THREE.TorusGeometry(width, 0.048, 6, 26, Math.PI * 1.35);
      geometries.push(disc);
      const cisterna = new THREE.Mesh(disc, golgiMaterial);
      cisterna.position.y = index * 0.14;
      cisterna.rotation.set(Math.PI / 2 - 0.24, 0, index * 0.14);
      golgi.add(cisterna);
    }
    track(golgi, 'golgi', new THREE.Vector3(0.55, -1.3, 0.5));

    /* ----------------------------------------------------------- ribosomes --- */
    // Instanced: there are a few hundred and they are all the same bead.
    const ribosomeGroup = new THREE.Group();
    const beadGeometry = new THREE.IcosahedronGeometry(0.045, 1);
    geometries.push(beadGeometry);
    const beadMaterial = new THREE.MeshStandardMaterial({ color: 0x769d74, roughness: 0.45, metalness: 0 });
    const beadCount = compact ? 150 : 300;
    const beads = new THREE.InstancedMesh(beadGeometry, beadMaterial, beadCount);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < beadCount; index += 1) {
      // Deterministic scatter in the cytoplasm shell: a golden-angle spiral in
      // spherical coordinates, so it never re-rolls between renders.
      const t = (index + 0.5) / beadCount;
      const radius = 1.15 + Math.sqrt(t) * 1.25;
      const theta = index * 2.399963;
      const phi = Math.acos(1 - 2 * t);
      dummy.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi) * 0.85,
        radius * Math.sin(phi) * Math.sin(theta),
      );
      dummy.scale.setScalar(0.7 + ((index * 37) % 11) / 22);
      dummy.updateMatrix();
      beads.setMatrixAt(index, dummy.matrix);
    }
    beads.instanceMatrix.needsUpdate = true;
    ribosomeGroup.add(beads);
    track(ribosomeGroup, 'ribosome', new THREE.Vector3(0, 0, 0));

    /* ----------------------------------------------------------- picking --- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let yaw = 0.5;
    let pitch = 0.18;
    let yawTarget = yaw;
    let pitchTarget = pitch;
    let interacted = false;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      host.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 5) interacted = true;
      yawTarget -= dx * 0.008;
      pitchTarget = THREE.MathUtils.clamp(pitchTarget + dy * 0.006, -1.1, 1.1);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      // A click, not the end of a drag.
      if (moved > 6) return;
      const rect = host.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pivot.children, true);
      const hit = hits.find((entry) => (entry.object.userData.organelle as OrganelleId | undefined));
      const id = hit?.object.userData.organelle as OrganelleId | undefined;
      setSelected((current) => (id && id !== current ? id : id ? null : current));
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let onScreen = true;
    const visibility = new IntersectionObserver(
      ([entry]) => { onScreen = entry?.isIntersecting ?? true; },
      { rootMargin: '160px 0px' },
    );
    visibility.observe(host);
    let tabVisible = document.visibilityState !== 'hidden';
    const onVisibility = () => { tabVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    const timer = new THREE.Timer();
    const scratch = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!onScreen || !tabVisible) return;
      if (!interacted && !reduceMotion) yawTarget += delta * 0.13;
      const ease = 1 - Math.pow(0.003, delta);
      yaw += (yawTarget - yaw) * ease;
      pitch += (pitchTarget - pitch) * ease;
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * 8.6,
        Math.sin(pitch) * 8.6,
        Math.cos(yaw) * Math.cos(pitch) * 8.6,
      );
      camera.lookAt(0, 0, 0);

      /* Selection state, resolved per part every frame.
         Isolating pulls the chosen part out along its own vector and fades the
         rest back; without isolation, selection only changes emphasis. */
      const active = selectedRef.current;
      const isolating = isolateRef.current && active !== null;
      for (const part of parts) {
        const chosen = part.id === active;
        const organelle = ORGANELLES.find((item) => item.id === part.id);
        scratch.copy(part.home);
        if (isolating && chosen && organelle) scratch.add(organelle.offset);
        part.group.position.lerp(scratch, ease);
        const dim = isolating && !chosen ? 0.12 : active && !chosen ? 0.55 : 1;
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
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      visibility.disconnect();
      for (const geometry of geometries) geometry.dispose();
      for (const part of parts) for (const material of part.materials) material.dispose();
      beads.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const current = ORGANELLES.find((item) => item.id === selected) ?? null;

  return (
    <div className="cell-studio">
      <div className="cell-stage" ref={hostRef} role="img" aria-label="Mô hình tế bào động vật 3D" />

      <div className="cell-controls">
        <div className="cell-organelles" role="group" aria-label="Bào quan">
          {ORGANELLES.map((organelle) => (
            <button
              type="button"
              key={organelle.id}
              className={selected === organelle.id ? 'is-active' : ''}
              aria-pressed={selected === organelle.id}
              onClick={() => setSelected((value) => (value === organelle.id ? null : organelle.id))}
            >
              {organelle.label}
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

      <p className="cell-readout" role="status">
        {current
          ? <><b>{current.label}</b> {current.role}</>
          : 'Nhấp vào một bào quan trong mô hình, hoặc chọn tên bên dưới.'}
      </p>
    </div>
  );
}
