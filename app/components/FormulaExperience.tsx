'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAR_BASE, disposeScene } from '../lib/formula/carRuntime';
import { createCarWorkshop, type CarWorkshop } from '../lib/formula/carScene';
import { createProceduralEnvironment, studioEnvironmentPalette } from '../lib/three/environment';
import { pixelRatioCap } from '../lib/three/deviceTier';

/**
 * The full-screen Formula workshop.
 *
 * The car, the sprue frame and the desk tools are no longer built here — they
 * live in `lib/formula/carScene.ts`, because the practice hub renders the same
 * workshop inside the Library's ivory room and two copies of four hundred lines
 * of texture-channel conventions is how one model becomes two models. What is
 * left in this file is what actually belongs to the *overlay*: its dark studio,
 * its neon rig, its drive floor, and the three modes.
 */

export type FormulaMode = 'KIT' | 'STUDIO' | 'DRIVE';

const MODE_COPY: Record<FormulaMode, { eyebrow: string; title: string; hint: string }> = {
  KIT: {
    eyebrow: 'Bàn lắp ráp',
    title: 'Từng chi tiết một.',
    hint: 'Kéo để quan sát bàn lắp ráp, khung nhựa và bộ dụng cụ.',
  },
  STUDIO: {
    eyebrow: 'Quan sát mô hình',
    title: 'Xem trọn hình khối.',
    hint: 'Kéo để quay quanh xe. Thân, bánh, khoang lái và kính đều tách lớp riêng.',
  },
  DRIVE: {
    eyebrow: 'Điều khiển',
    title: 'Tự tay cầm lái.',
    hint: 'Nhấp vào khung 3D rồi dùng WASD hoặc phím mũi tên để lái.',
  },
};

function FormulaCanvas({
  mode,
  onReady,
  onError,
  onSpeed,
}: {
  mode: FormulaMode;
  onReady: () => void;
  onError: () => void;
  onSpeed: (speed: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<FormulaMode>(mode);
  const onSpeedRef = useRef(onSpeed);
  useEffect(() => {
    modeRef.current = mode;
    if (mode === 'DRIVE') requestAnimationFrame(() => hostRef.current?.focus());
  }, [mode]);
  useEffect(() => { onSpeedRef.current = onSpeed; }, [onSpeed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12101f);
    scene.fog = new THREE.FogExp2(0x12101f, 0.015);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 160);
    camera.position.set(5.8, 3.2, 6.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    renderer.setPixelRatio(pixelRatioCap('panel'));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.insertBefore(renderer.domElement, host.firstChild);

    const environment = createProceduralEnvironment(renderer, studioEnvironmentPalette);
    scene.environment = environment.texture;

    scene.add(new THREE.HemisphereLight(0xd8e1ff, 0x2c1b38, 1.72));
    const key = new THREE.DirectionalLight(0xfff2e9, 6.2);
    key.position.set(-5, 7, 6);
    key.castShadow = true;
    scene.add(key);
    const cyan = new THREE.PointLight(0x55dfff, 32, 18, 2);
    cyan.position.set(4, 2, -3);
    scene.add(cyan);
    const magenta = new THREE.PointLight(0xff3e97, 22, 16, 2);
    magenta.position.set(-4, 1, 2);
    scene.add(magenta);

    const world = new THREE.Group();
    scene.add(world);
    const driveRoot = new THREE.Group();
    world.add(driveRoot);

    const studioFloor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 96),
      new THREE.MeshStandardMaterial({ color: 0x231e31, roughness: 0.48, metalness: 0.08 }),
    );
    studioFloor.rotation.x = -Math.PI / 2;
    studioFloor.position.y = -1.18;
    studioFloor.receiveShadow = true;
    world.add(studioFloor);
    const studioRing = new THREE.Mesh(
      new THREE.RingGeometry(3.8, 3.83, 128),
      new THREE.MeshBasicMaterial({ color: 0x00aaab, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    studioRing.rotation.x = -Math.PI / 2;
    studioRing.position.y = -1.165;
    world.add(studioRing);

    const grid = new THREE.GridHelper(120, 120, 0x00aaab, 0x29243f);
    grid.position.y = -1.14;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => { material.transparent = true; material.opacity = 0.42; });
    driveRoot.add(grid);

    let workshop: CarWorkshop | null = null;
    let kitProgress = 1;
    let lastMode: FormulaMode | '' = '';

    createCarWorkshop(renderer, world, { initialKitProgress: kitProgress })
      .then((built) => {
        if (disposed) {
          built.dispose();
          return;
        }
        workshop = built;
        built.carRoot.position.y = -0.4;
        onReady();
      })
      .catch((error) => {
        console.error('Formula experience failed to load', error);
        host.dataset.error = 'true';
        onError();
      });

    const keys = new Set<string>();
    const relevantKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
    const onKeyDown = (event: KeyboardEvent) => {
      if (modeRef.current !== 'DRIVE' || !relevantKeys.has(event.code)) return;
      event.preventDefault();
      keys.add(event.code);
      if (!event.repeat) {
        if (event.code === 'KeyW' || event.code === 'ArrowUp') speed = Math.min(8.5, speed + 0.42);
        if (event.code === 'KeyS' || event.code === 'ArrowDown') speed = Math.max(-2.6, speed - 0.28);
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') heading += 0.035;
        if (event.code === 'KeyD' || event.code === 'ArrowRight') heading -= 0.035;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('keyup', onKeyUp);
    const focusCanvas = () => host.focus();
    renderer.domElement.addEventListener('pointerdown', focusCanvas);

    let orbitYaw = 0.72;
    let orbitPitch = 0.38;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true; previousX = event.clientX; previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || modeRef.current === 'DRIVE') return;
      orbitYaw -= (event.clientX - previousX) * 0.005;
      orbitPitch = THREE.MathUtils.clamp(orbitPitch + (event.clientY - previousY) * 0.003, 0.12, 0.9);
      previousX = event.clientX; previousY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let speed = 0;
    let heading = 0;
    let studioYaw = 0.72;
    let wheelRoll = 0;
    const drivePosition = new THREE.Vector3();
    const targetCamera = new THREE.Vector3();
    const carTarget = new THREE.Vector3();
    let hudElapsed = 0;
    const timer = new THREE.Timer();
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const activeMode = modeRef.current;
      if (activeMode !== lastMode) {
        lastMode = activeMode;
        keys.clear();
      }
      const kitTarget = activeMode === 'KIT' ? 1 : 0;
      kitProgress += (kitTarget - kitProgress) * Math.min(1, delta * 3.2);
      const built = workshop;
      if (built) built.kitRoot.visible = activeMode === 'KIT';
      studioFloor.visible = activeMode !== 'DRIVE';
      studioRing.visible = activeMode === 'STUDIO';
      driveRoot.visible = activeMode === 'DRIVE';

      if (activeMode === 'DRIVE') {
        const throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : keys.has('KeyS') || keys.has('ArrowDown') ? -0.62 : 0;
        const steering = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0;
        speed += throttle * delta * 6.5;
        speed *= Math.pow(throttle === 0 ? 0.975 : 0.986, delta * 60);
        speed = THREE.MathUtils.clamp(speed, -2.6, 8.5);
        heading += steering * delta * (0.7 + Math.abs(speed) * 0.105) * Math.sign(speed || 1);
        drivePosition.x += Math.sin(heading) * speed * delta;
        drivePosition.z += Math.cos(heading) * speed * delta;
        if (built) {
          carTarget.set(drivePosition.x, -0.42, drivePosition.z);
          built.carRoot.position.lerp(carTarget, 0.2);
          // The authored Formula points along local +X; heading zero drives toward +Z.
          built.carRoot.rotation.y = heading - Math.PI / 2;
        }
        wheelRoll -= speed * delta * 1.8;
        targetCamera.set(
          drivePosition.x - Math.sin(heading) * 7.2,
          3.0,
          drivePosition.z - Math.cos(heading) * 7.2,
        );
        camera.position.lerp(targetCamera, 1 - Math.pow(0.035, delta));
        camera.lookAt(drivePosition.x, -0.15, drivePosition.z);
        grid.position.x = Math.round(drivePosition.x / 10) * 10;
        grid.position.z = Math.round(drivePosition.z / 10) * 10;
      } else {
        speed *= Math.pow(0.9, delta * 60);
        if (activeMode === 'STUDIO' && !dragging && !reduceMotion) studioYaw += delta * 0.16;
        if (built) {
          carTarget.set(0, activeMode === 'KIT' ? -0.3 : -0.36, 0);
          built.carRoot.position.lerp(carTarget, 1 - Math.pow(0.012, delta));
          built.carRoot.rotation.y = activeMode === 'STUDIO' ? studioYaw : 0;
        }
        const radius = activeMode === 'KIT' ? 8.8 : 7.2;
        targetCamera.set(
          Math.sin(orbitYaw) * radius,
          Math.sin(orbitPitch) * radius * (activeMode === 'KIT' ? 0.72 : 0.5),
          Math.cos(orbitYaw) * radius,
        );
        camera.position.lerp(targetCamera, 1 - Math.pow(0.025, delta));
        camera.lookAt(0, activeMode === 'KIT' ? -0.6 : -0.22, 0);
      }

      if (built) {
        const steering = activeMode === 'DRIVE'
          ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 0.16 : keys.has('KeyD') || keys.has('ArrowRight') ? -0.16 : 0)
          : 0;
        built.update(kitProgress, wheelRoll, steering);
      }
      hudElapsed += delta;
      if (hudElapsed > 0.12) {
        onSpeedRef.current(Math.round(Math.abs(speed) * 21));
        hudElapsed = 0;
      }
      cyan.intensity = activeMode === 'STUDIO' ? 32 : activeMode === 'DRIVE' ? 18 : 13;
      magenta.intensity = activeMode === 'STUDIO' ? 22 : 11;
      key.intensity = activeMode === 'KIT' ? 7 : 5.4;
      if (built && activeMode === 'KIT') built.kitRoot.rotation.y = reduceMotion ? 0 : Math.sin(elapsed * 0.12) * 0.015;
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      host.removeEventListener('keydown', onKeyDown);
      host.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('pointerdown', focusCanvas);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      workshop?.dispose();
      disposeScene(world);
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onError, onReady]);

  return <div className="formula-canvas" ref={hostRef} tabIndex={mode === 'DRIVE' ? 0 : -1} aria-label="Khung điều khiển Formula 3D" />;
}

export function FormulaExperience({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<FormulaMode>('KIT');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const readyHandler = useCallback(() => setReady(true), []);
  const errorHandler = useCallback(() => setError(true), []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [onClose]);

  const driveKey = (code: string, pressed: boolean) => {
    const canvas = dialogRef.current?.querySelector<HTMLElement>('.formula-canvas');
    canvas?.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { code, bubbles: true }));
  };

  const copy = MODE_COPY[mode];

  return (
    <div className="formula-overlay" role="dialog" aria-modal="true" aria-label="Trải nghiệm xe Formula" ref={dialogRef}>
      <FormulaCanvas mode={mode} onReady={readyHandler} onError={errorHandler} onSpeed={setSpeed} />
      <header className="formula-header">
        <div className="formula-brand"><span>YOO</span> Mô hình xe đua / 01</div>
        <div className="formula-mode-tabs" role="group" aria-label="Chế độ trải nghiệm">
          {(['KIT', 'STUDIO', 'DRIVE'] as FormulaMode[]).map((item) => (
            <button
              type="button"
              aria-pressed={mode === item}
              className={mode === item ? 'is-active' : ''}
              onClick={() => setMode(item)}
              key={item}
            >{item}</button>
          ))}
        </div>
        <button className="formula-close" type="button" onClick={onClose} aria-label="Đóng trải nghiệm" ref={closeRef}>×</button>
      </header>
      {!ready && !error && <div className="formula-loader"><i />Đang mở xưởng mô hình…</div>}
      {error && <div className="formula-loader formula-loader--error">Không thể tải xưởng mô hình. Hãy tải lại trang để thử lại.</div>}
      <div className="formula-panel">
        <p>{copy.eyebrow}</p>
        <h2>{mode === 'DRIVE' ? `${speed} km/h` : copy.title}</h2>
        <span>{copy.hint}</span>
      </div>
      {mode === 'DRIVE' && (
        <div className="formula-drive-controls" aria-label="Điều khiển lái xe cảm ứng">
          {[
            ['KeyA', '←', 'Rẽ trái'],
            ['KeyW', '↑', 'Tăng tốc'],
            ['KeyS', '↓', 'Phanh hoặc lùi'],
            ['KeyD', '→', 'Rẽ phải'],
          ].map(([code, glyph, label]) => (
            <button
              type="button"
              aria-label={label}
              key={code}
              onPointerDown={(event) => { event.preventDefault(); driveKey(code, true); }}
              onPointerUp={() => driveKey(code, false)}
              onPointerCancel={() => driveKey(code, false)}
              onPointerLeave={() => driveKey(code, false)}
            >{glyph}</button>
          ))}
        </div>
      )}
      <div className="formula-footer">
        <span>Chế độ / {mode}</span>
        <span>{mode === 'DRIVE' ? 'WASD hoặc phím mũi tên' : 'Kéo để quay mô hình'}</span>
      </div>
    </div>
  );
}

export { CAR_BASE };
