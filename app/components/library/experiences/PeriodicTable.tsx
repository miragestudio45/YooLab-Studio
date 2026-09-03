'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createVisibilityGate } from '../../../lib/three/visibility';
import { pixelRatioCap } from '../../../lib/three/deviceTier';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  PHASE_LABEL,
  VI_NAME,
  formatNumber,
  formatTemperature,
  loadElements,
  type CategoryKey,
  type ElementData,
} from '../../../lib/chemistry/elements';

/**
 * YooLab periodic table.
 *
 * Two views in one experience: the table, and the atom inside a chosen element.
 *
 * The table is DOM, not 3D. The reference implementation draws its tiles as
 * textured planes in a WebGL scene, which looks striking and costs you crisp
 * Vietnamese type, text selection, keyboard focus and screen-reader access on
 * 118 controls. A CSS grid gives all of that back and still animates.
 *
 * The atom *is* 3D, because that is the part where three dimensions carry
 * meaning: the shells have real radii and real occupancies from the element's
 * own configuration, so nitrogen and neon are visibly different objects.
 */

const COLUMNS = 18;
const ROWS = 10;

export function PeriodicTable() {
  const [elements, setElements] = useState<ElementData[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ElementData | null>(null);
  const [filter, setFilter] = useState<CategoryKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadElements()
      .then((data) => { if (!cancelled) setElements(data); })
      .catch((error) => {
        console.error('Periodic table data failed to load', error);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => {
    if (!elements) return [] as CategoryKey[];
    const seen: CategoryKey[] = [];
    for (const element of elements) if (!seen.includes(element.category)) seen.push(element.category);
    return seen;
  }, [elements]);

  if (failed) {
    return (
      <div className="periodic">
        <p className="model-stage-status is-error">Không tải được dữ liệu nguyên tố.</p>
      </div>
    );
  }

  if (!elements) {
    return (
      <div className="periodic">
        <p className="model-stage-status">Đang tải 118 nguyên tố…</p>
      </div>
    );
  }

  if (selected) {
    return <AtomView element={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="periodic">
      <div className="periodic-legend" role="group" aria-label="Nhóm nguyên tố">
        {categories.map((category) => (
          <button
            type="button"
            key={category}
            className={`periodic-chip${filter === category ? ' is-active' : ''}`}
            aria-pressed={filter === category}
            onClick={() => setFilter((value) => (value === category ? null : category))}
          >
            <i style={{ background: CATEGORY_COLOR[category] }} />
            {CATEGORY_LABEL[category]}
          </button>
        ))}
      </div>

      <div
        className="periodic-grid"
        style={{ '--pt-cols': COLUMNS, '--pt-rows': ROWS } as React.CSSProperties}
        role="grid"
        aria-label="Bảng tuần hoàn các nguyên tố"
      >
        {elements.map((element) => {
          const dimmed = filter !== null && element.category !== filter;
          return (
            <button
              type="button"
              key={element.z}
              className={`periodic-cell${dimmed ? ' is-dim' : ''}`}
              style={{
                gridColumn: element.xpos,
                gridRow: element.ypos,
                // The tint is the category colour at low alpha over ivory, with
                // the full-strength colour kept for the left edge, so 118 tiles
                // stay readable instead of turning into a colour chart.
                borderLeftColor: CATEGORY_COLOR[element.category],
              }}
              onClick={() => setSelected(element)}
              aria-label={`${element.name} — số hiệu ${element.z}`}
            >
              <small>{element.z}</small>
              <b>{element.symbol}</b>
              <span>{element.name}</span>
            </button>
          );
        })}
        {/* The two f-block rows sit outside the main body; these mark where they
            belong so the table reads correctly rather than looking broken. */}
        <span className="periodic-note" style={{ gridColumn: 3, gridRow: 6 }}>57–71</span>
        <span className="periodic-note" style={{ gridColumn: 3, gridRow: 7 }}>89–103</span>
      </div>

      <p className="periodic-hint">Chọn một nguyên tố để mở mô hình nguyên tử.</p>
    </div>
  );
}

/* ========================================================================== */

/**
 * The atom.
 *
 * Nucleus plus one ring per electron shell, with the electrons instanced and
 * distributed around each ring at the element's real occupancy. Shell radii grow
 * sub-linearly so a shell-7 element still fits the frame.
 */
function AtomView({ element, onBack }: { element: ElementData; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const accent = CATEGORY_COLOR[element.category];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(pixelRatioCap('panel'));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'model-stage-canvas';
    host.appendChild(renderer.domElement);

    const accentColor = new THREE.Color(accent);
    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xe0d2c4, 1.5));
    const key = new THREE.DirectionalLight(0xfff5ea, 2.2);
    key.position.set(-2.5, 3.5, 4.5);
    scene.add(key);

    const disposables: { dispose(): void }[] = [];
    const root = new THREE.Group();
    scene.add(root);

    /* --------------------------------------------------------- nucleus --- */
    const nucleusGeometry = new THREE.IcosahedronGeometry(0.5, 3);
    const nucleusMaterial = new THREE.MeshPhysicalMaterial({
      color: accentColor,
      roughness: 0.28,
      metalness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      emissive: accentColor.clone().multiplyScalar(0.18),
    });
    disposables.push(nucleusGeometry, nucleusMaterial);
    root.add(new THREE.Mesh(nucleusGeometry, nucleusMaterial));

    /* ----------------------------------------------------------- shells --- */
    const shells = element.shells.length ? element.shells : [1];
    const ringGeometry = new THREE.TorusGeometry(1, 0.004, 3, 128);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x8a7466), transparent: true, opacity: 0.4,
    });
    const electronGeometry = new THREE.SphereGeometry(0.06, 12, 10);
    const electronMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b3540, roughness: 0.3, metalness: 0.2,
      emissive: accentColor.clone().multiplyScalar(0.25),
    });
    disposables.push(ringGeometry, ringMaterial, electronGeometry, electronMaterial);

    const totalElectrons = shells.reduce((sum, count) => sum + count, 0);
    const electrons = new THREE.InstancedMesh(electronGeometry, electronMaterial, Math.max(1, totalElectrons));
    root.add(electrons);
    const dummy = new THREE.Object3D();

    type Ring = { radius: number; count: number; offset: number; speed: number; tilt: number; phase: number };
    const rings: Ring[] = [];
    let cursor = 0;
    shells.forEach((count, index) => {
      // sqrt growth: shell 7 lands at ~2.6 rather than at 7.
      const radius = 0.95 + Math.sqrt(index) * 0.72;
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.scale.setScalar(radius);
      // Each shell tilted a little differently so seven rings read as a volume
      // and not as seven concentric circles on one plane.
      ring.rotation.set(Math.PI / 2 + index * 0.22, index * 0.5, index * 0.16);
      root.add(ring);
      rings.push({
        radius,
        count,
        offset: cursor,
        speed: 0.9 / (1 + index * 0.55),
        tilt: index * 0.22,
        phase: index * 0.5,
      });
      cursor += count;
    });

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      // Pull back far enough for the outermost shell plus a margin.
      const outer = rings.length ? rings[rings.length - 1].radius : 1;
      const span = outer + 0.5;
      camera.position.set(0, span * 0.32, span / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.02);
      camera.lookAt(0, 0, 0);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const gate = createVisibilityGate(host, 160);
    const onScreen = () => gate.visible();

    const timer = new THREE.Timer();
    const axis = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!onScreen()) return;
      const time = reduceMotion ? 0 : timer.getElapsed();
      root.rotation.y += reduceMotion ? 0 : delta * 0.1;
      for (const ring of rings) {
        for (let index = 0; index < ring.count; index += 1) {
          const angle = ring.phase + time * ring.speed + (index / ring.count) * Math.PI * 2;
          // Place on the ring's own plane by rotating the flat position by the
          // same tilt the ring mesh got.
          axis.set(Math.cos(angle) * ring.radius, 0, Math.sin(angle) * ring.radius);
          axis.applyAxisAngle(new THREE.Vector3(1, 0, 0), ring.tilt);
          axis.applyAxisAngle(new THREE.Vector3(0, 1, 0), ring.phase);
          dummy.position.copy(axis);
          dummy.updateMatrix();
          electrons.setMatrixAt(ring.offset + index, dummy.matrix);
        }
      }
      electrons.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      gate.dispose();
      electrons.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [element, accent]);

  const viName = VI_NAME[element.symbol];

  return (
    <div className="atom-view">
      <div className="atom-head">
        <button type="button" className="atom-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Bảng tuần hoàn
        </button>
        <div className="atom-title">
          <i style={{ background: accent }} aria-hidden="true" />
          <b>{element.symbol}</b>
          <span>{viName ?? element.name} · Z = {element.z}</span>
        </div>
      </div>

      <div className="atom-stage" ref={hostRef} role="img" aria-label={`Mô hình nguyên tử ${element.name}`} />

      <dl className="atom-facts">
        <div><dt>Nhóm</dt><dd>{CATEGORY_LABEL[element.category]}</dd></div>
        <div><dt>Chu kỳ · Nhóm</dt><dd>{element.period ?? '—'} · {element.group ?? '—'}</dd></div>
        <div><dt>Cấu hình</dt><dd>{element.ecSemantic ?? '—'}</dd></div>
        <div><dt>Lớp electron</dt><dd>{element.shells.join(' · ')}</dd></div>
        <div><dt>Khối lượng</dt><dd>{formatNumber(element.mass, 'u')}</dd></div>
        <div><dt>Trạng thái</dt><dd>{element.phase ? PHASE_LABEL[element.phase] ?? element.phase : '—'}</dd></div>
        <div><dt>Độ âm điện</dt><dd>{formatNumber(element.electronegativity)}</dd></div>
        <div><dt>Bán kính nguyên tử</dt><dd>{formatNumber(element.atomicRadius, 'pm', 0)}</dd></div>
        <div><dt>Nóng chảy</dt><dd>{formatTemperature(element.melt)}</dd></div>
        <div><dt>Sôi</dt><dd>{formatTemperature(element.boil)}</dd></div>
        <div><dt>Số oxi hoá</dt><dd>{element.oxidationStates ?? '—'}</dd></div>
        <div><dt>Phát hiện</dt><dd>{element.yearDiscovered ?? '—'}{element.discoveredBy ? ` · ${element.discoveredBy}` : ''}</dd></div>
      </dl>
    </div>
  );
}
