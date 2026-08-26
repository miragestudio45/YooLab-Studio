'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import {
  createCarLoaders,
  createCarMaterials,
  disposeScene,
  loadCarTextures,
  prepareCarVisual,
  type CarPieceState,
  type MaterialShader,
} from '../lib/formula/carRuntime';
import { createProceduralEnvironment, studioEnvironmentPalette } from '../lib/three/environment';

type StudioMode = 'assemble' | 'inspect' | 'drive';
type TrackId = 'model' | 'text' | 'audio' | 'effect';
type EditorTool = { id: string; label: string; asset: string };

const EDITOR_ASSET_ROOT = '/asset/ui/yoolab-editor';
const FIGMA_ASSET_ROOT = `${EDITOR_ASSET_ROOT}/figma`;

const MAIN_TOOLS: EditorTool[] = [
  { id: 'create', label: 'Tạo mới Dự án', asset: 'create.svg' },
  { id: 'templates', label: 'Mẫu', asset: 'templates.svg' },
  { id: 'components', label: 'Thành phần', asset: 'components.svg' },
  { id: 'projectInfo', label: 'Thông tin dự án', asset: 'project-info.svg' },
  { id: 'decor', label: 'Decor', asset: 'decor.svg' },
  { id: 'settings', label: 'Thiết lập', asset: 'settings.svg' },
  { id: 'projects', label: 'Dự án', asset: 'projects.svg' },
  { id: 'vrLab', label: 'VR Lab', asset: 'vr-lab.svg' },
];

const DETAIL_TOOLS: EditorTool[] = [
  { id: 'labels', label: 'Quản lý nhãn', asset: 'info.svg' },
  { id: 'space', label: 'Không gian', asset: 'space.svg' },
  { id: 'steps', label: 'Bước', asset: 'steps.svg' },
  { id: 'text', label: 'Văn bản', asset: 'text.svg' },
  { id: 'audio', label: 'Âm thanh', asset: 'sound.svg' },
  { id: 'media', label: 'Media', asset: 'media.svg' },
  { id: 'hotspot', label: 'Hotspot', asset: 'scene-tool.svg' },
  { id: 'info', label: 'Icon info', asset: 'info.svg' },
  { id: 'sticker', label: 'Sticker', asset: 'sticker.svg' },
  { id: 'effect', label: 'Hiệu ứng', asset: 'effects.svg' },
  { id: 'quiz', label: 'Tạo Quiz', asset: 'quiz.svg' },
];

const TRACKS: { id: TrackId; label: string; color: string; asset: string; start: number; length: number }[] = [
  { id: 'model', label: 'Model', color: '#a852fc', asset: 'space.svg', start: 0, length: 1 },
  { id: 'text', label: 'Văn bản', color: '#2b7fff', asset: 'text.svg', start: 0, length: 0.50958 },
  { id: 'audio', label: 'Âm thanh', color: '#00c950', asset: 'sound.svg', start: 0, length: 0.62021 },
  { id: 'effect', label: 'Hiệu ứng', color: '#f6339a', asset: 'effects.svg', start: 0, length: 0.82317 },
];

function CarViewport({ mode, explode, playing, light, showGrid, resetKey, onReady, onError }: {
  mode: StudioMode;
  explode: number;
  playing: boolean;
  light: number;
  showGrid: boolean;
  resetKey: number;
  onReady: () => void;
  onError: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const explodeRef = useRef(explode);
  const playingRef = useRef(playing);
  const lightRef = useRef(light);
  const gridRef = useRef(showGrid);
  const resetRef = useRef(resetKey);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { explodeRef.current = explode; }, [explode]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { lightRef.current = light; }, [light]);
  useEffect(() => { gridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { resetRef.current = resetKey; }, [resetKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x292b2c);
    scene.fog = new THREE.Fog(0x292b2c, 13, 29);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 70);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const environment = createProceduralEnvironment(renderer, studioEnvironmentPalette);
    scene.environment = environment.texture;
    const hemi = new THREE.HemisphereLight(0xe8f4f2, 0x171c22, 1.75);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff6ef, 5.8);
    key.position.set(-5, 7, 5);
    key.castShadow = true;
    scene.add(key);
    const teal = new THREE.PointLight(0x60d5d0, 16, 18, 2);
    teal.position.set(5, 2, -3);
    scene.add(teal);
    const coral = new THREE.PointLight(0xff7f6b, 11, 15, 2);
    coral.position.set(-4, 1.5, 4);
    scene.add(coral);

    const world = new THREE.Group();
    scene.add(world);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 96),
      new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.94, metalness: 0.02, envMapIntensity: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.22;
    floor.receiveShadow = true;
    world.add(floor);
    const grid = new THREE.GridHelper(24, 32, 0x4a817f, 0x3b4243);
    grid.position.y = -1.205;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => { material.transparent = true; material.opacity = 0.16; material.depthWrite = false; });
    world.add(grid);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 3.63, 128),
      new THREE.MeshBasicMaterial({ color: 0x568f8c, transparent: true, opacity: 0.24, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.19;
    world.add(ring);

    const carRoot = new THREE.Group();
    carRoot.position.y = -0.38;
    world.add(carRoot);
    const loaders = createCarLoaders(renderer);
    const carPieces: CarPieceState[] = [];
    const shaderGroups: MaterialShader[][] = [];
    let carVisual: THREE.Object3D | undefined;
    let disposed = false;
    let kitProgress = 0;

    Promise.all([loaders.loadProtected('formulaCar.glb'), loadCarTextures(loaders)])
      .then(([gltf, textures]) => {
        if (disposed) return;
        const carMaterials = createCarMaterials(textures, { initialKitProgress: 0, envMapIntensity: 0.76 });
        shaderGroups.push(carMaterials.shaders);
        carVisual = gltf.scene;
        carPieces.push(...prepareCarVisual(carVisual, carMaterials.materials, 4.7));
        carRoot.add(carVisual);
        host.dataset.ready = 'true';
        onReady();
      })
      .catch((error) => {
        console.error('YooLab car workspace failed to load', error);
        if (!disposed) onError();
      });

    let orbitYaw = 0.75;
    let orbitPitch = 0.31;
    let orbitRadius = 7.2;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    let lastReset = resetRef.current;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      orbitYaw -= (event.clientX - previousX) * 0.006;
      orbitPitch = THREE.MathUtils.clamp(orbitPitch + (event.clientY - previousY) * 0.004, 0.1, 0.82);
      previousX = event.clientX;
      previousY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbitRadius = THREE.MathUtils.clamp(orbitRadius + event.deltaY * 0.006, 5.2, 10.5);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

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

    let driveDistance = 0;
    let wheelRoll = 0;
    const rollAxis = new THREE.Vector3(1, 0, 0);
    const rollQuaternion = new THREE.Quaternion();
    const cameraTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const timer = new THREE.Timer();
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      const targetKit = modeRef.current === 'assemble' ? explodeRef.current / 100 : 0;
      kitProgress += (targetKit - kitProgress) * Math.min(1, delta * 4.8);
      for (const group of shaderGroups) {
        for (const shader of group) shader.uniforms.uKitProgress.value = kitProgress;
      }

      if (modeRef.current === 'drive' && playingRef.current && !reduceMotion) {
        driveDistance += delta * 2.25;
        wheelRoll -= delta * 5.9;
      }
      const driveX = modeRef.current === 'drive' ? Math.sin(driveDistance * 0.42) * 0.8 : 0;
      carRoot.position.x += (driveX - carRoot.position.x) * Math.min(1, delta * 3.5);
      carRoot.rotation.y = modeRef.current === 'drive' ? -Math.PI / 2 : 0;

      if (carVisual) {
        rollQuaternion.setFromAxisAngle(rollAxis, wheelRoll);
        for (const piece of carPieces) {
          piece.object.position.lerpVectors(piece.assembledPosition, piece.kitPosition, kitProgress);
          piece.object.quaternion.slerpQuaternions(piece.assembledQuaternion, piece.kitQuaternion, kitProgress);
          if (piece.isWheel && kitProgress < 0.015) {
            // The authored wheel is rotated 90° around Y, so its axle is local X.
            // Rolling around local Z made the wheel wobble sideways in the old viewer.
            piece.object.quaternion.multiply(rollQuaternion);
          }
        }
      }

      if (lastReset !== resetRef.current) {
        lastReset = resetRef.current;
        orbitYaw = 0.75;
        orbitPitch = 0.31;
        orbitRadius = 7.2;
      }
      grid.visible = gridRef.current;
      ring.visible = gridRef.current;
      const luminance = lightRef.current / 100;
      key.intensity = 3.6 + luminance * 4.4;
      teal.intensity = 8 + luminance * 17;
      coral.intensity = 5 + luminance * 14;

      // A narrow editor canvas needs more distance to preserve the whole car;
      // this is real camera framing, not a responsive CSS scale.
      const frameRadius = orbitRadius * Math.max(1, 1.16 / camera.aspect);
      cameraTarget.set(
        carRoot.position.x + Math.sin(orbitYaw) * frameRadius,
        Math.sin(orbitPitch) * frameRadius * 0.5,
        Math.cos(orbitYaw) * frameRadius,
      );
      camera.position.lerp(cameraTarget, 1 - Math.pow(0.025, delta));
      lookTarget.set(carRoot.position.x, -0.26, 0);
      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      disposeScene(world);
      environment.dispose();
      loaders.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onError, onReady]);

  return <div className="studio-car-viewport" ref={hostRef} aria-label="Mô hình xe Formula 3D tương tác" />;
}

function formatTime(seconds: number) {
  const whole = Math.max(0, seconds);
  const mm = Math.floor(whole / 60);
  const ss = Math.floor(whole % 60);
  const cs = Math.floor((whole % 1) * 100);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function StudioDemo() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<StudioMode>('inspect');
  const [activeMain, setActiveMain] = useState('decor');
  const [activeDetail, setActiveDetail] = useState('text');
  const [showGrid, setShowGrid] = useState(true);
  const [muted, setMuted] = useState(false);
  const [shared, setShared] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(5.2);
  const [track, setTrack] = useState<TrackId>('text');
  const [resetKey, setResetKey] = useState(0);
  const [noteLength, setNoteLength] = useState(100);
  const [noteWidth, setNoteWidth] = useState(50);
  const [noteOpacity, setNoteOpacity] = useState(100);
  const duration = 10.3;
  const progress = (time / duration) * 100;
  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      setTime((current) => (current + delta) % duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const chooseMode = (next: StudioMode) => {
    setMode(next);
    setPlaying(next === 'drive');
    if (next === 'assemble') setTrack('model');
  };

  const scrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setTime(ratio * duration);
    setPlaying(false);
  };

  return (
    <div className="studio studio--figma" data-mode={mode}>
      <aside className="studio-main-rail" aria-label="Điều hướng chính YooLab">
        <button className="studio-main-logo" aria-label="Trang chủ YooLab" onClick={() => setActiveMain('create')} type="button">
          <img alt="" src={`${EDITOR_ASSET_ROOT}/logo.svg`} />
          <img alt="" className="studio-main-logo-mark" src={`${EDITOR_ASSET_ROOT}/canvas-logo-mark.svg`} />
          <span>YooLab</span>
        </button>
        <div className="studio-main-tools">
          {MAIN_TOOLS.map((item) => (
            <button className={activeMain === item.id ? 'is-active' : ''} key={item.id} onClick={() => setActiveMain(item.id)} type="button">
              <span className="studio-tool-icon" aria-hidden="true"><img alt="" src={`${EDITOR_ASSET_ROOT}/${item.asset}`} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="studio-main-footer" aria-label="Tài khoản và ngôn ngữ">
          <button aria-label="Thông báo" type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/bell.svg`} /><i>10</i></button>
          <button aria-label="Ngôn ngữ: Tiếng Việt" type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/language.svg`} /><span>VNI</span></button>
          <button className="studio-avatar" aria-label="Tài khoản" type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/avatar.png`} /></button>
        </div>
      </aside>

      <main className="studio-workspace">
        <header className="studio-editor-topbar">
          <div className="studio-document-title">
            <b>Giới thiệu về loài Ong</b>
            <button aria-label="Đổi tên bài học" type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/edit.svg`} /></button>
          </div>
          <img alt="Đang đồng bộ" className="studio-sync" src={`${FIGMA_ASSET_ROOT}/loading.svg`} />
          <div className="studio-editor-actions" aria-label="Hành động dự án">
            <button className="is-purple" aria-label="Mô hình 3D" onClick={() => setTrack('model')} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/ar.svg`} /></button>
            <button className="is-peach" aria-label="Công cụ AI" type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/ai.svg`} /><img alt="" className="studio-chevron" src={`${FIGMA_ASSET_ROOT}/chevron.svg`} /></button>
            <button className="is-blue" aria-label="Toàn màn hình" onClick={() => setShowGrid((value) => !value)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/fullscreen.svg`} /></button>
            <button className="is-teal" aria-label="Chia sẻ" aria-pressed={shared} onClick={() => setShared((value) => !value)} type="button"><img alt="" src={`${EDITOR_ASSET_ROOT}/share.svg`} /></button>
          </div>
        </header>

        <section className="studio-viewport" aria-label="Không gian dựng bài học">
          <div className="studio-canvas">
            <CarViewport explode={mode === 'assemble' ? 68 : 0} light={58} mode={mode} onError={handleError} onReady={handleReady} playing={playing} resetKey={resetKey} showGrid={showGrid} />
            <button className="studio-canvas-menu" onClick={() => setActiveMain('decor')} type="button">
              <img alt="" src={`${EDITOR_ASSET_ROOT}/menu.svg`} /><span>Menu</span>
            </button>
            <div className="studio-canvas-brand" aria-label="YooLab">
              <img alt="" src={`${EDITOR_ASSET_ROOT}/canvas-logo-mark.svg`} />
              <img alt="YooLab" src={`${EDITOR_ASSET_ROOT}/canvas-logo-word.svg`} />
            </div>
            <div className="studio-canvas-actions" role="group" aria-label="Điều khiển khung nhìn">
              <button aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'} aria-pressed={muted} onClick={() => setMuted((value) => !value)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-silent.svg`} /></button>
              <button aria-label="Âm lượng" onClick={() => setMuted((value) => !value)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-volume.svg`} /></button>
              <button aria-label="Đặt lại góc nhìn" onClick={() => setResetKey((value) => value + 1)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-reset.svg`} /></button>
              <button aria-label="Khung chọn" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-frame.svg`} /></button>
              <button aria-label="Chế độ VR" onClick={() => chooseMode('drive')} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-vr.svg`} /></button>
              <button aria-label="Chia sẻ khung nhìn" onClick={() => setShared((value) => !value)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-share.svg`} /></button>
              <button aria-label="Đóng chế độ xem" onClick={() => chooseMode('inspect')} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-close.svg`} /></button>
            </div>
            <div className="studio-canvas-side-actions">
              <button type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/upload.svg`} /><span>Upload</span></button>
              <button onClick={() => setResetKey((value) => value + 1)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/set-view.svg`} /><span>SET VIEW</span></button>
            </div>
            {!ready && !failed && <div className="studio-loader"><i />Đang tải mô hình xe thật…</div>}
            {failed && <div className="studio-loader studio-loader--error">Không thể tải mô hình xe.</div>}
            <div className="studio-canvas-playback" aria-label="Điều khiển phát">
              <button className="studio-play" aria-label={playing ? 'Tạm dừng timeline' : 'Phát timeline'} onClick={() => setPlaying((value) => !value)} type="button">
                {playing ? <span className="studio-pause-bars" aria-hidden="true" /> : <img alt="" src={`${EDITOR_ASSET_ROOT}/play.svg`} />}
              </button>
              <b>{formatTime(time)}</b><small>/ 00:10.30</small>
              <div className="studio-playback-scrub" onPointerDown={scrub} role="slider" aria-label="Tiến trình phát" aria-valuemax={duration} aria-valuemin={0} aria-valuenow={time} tabIndex={0}>
                <span style={{ width: `${progress}%` }} /><i style={{ left: `${progress}%` }} />
              </div>
            </div>
            <button className="studio-canvas-timeline-toggle" type="button"><span aria-hidden="true" />Timeline<i aria-hidden="true" /></button>
          </div>
        </section>

        <section className="studio-timeline" aria-label="Timeline bài học">
          <div className="studio-timeline-side" aria-label="Công cụ timeline">
            <button aria-label="Hoàn tác" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--undo" /></button>
            <button aria-label="Làm lại" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--redo" /></button>
            <button aria-label="Xóa đối tượng" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--delete" /></button>
            <button aria-label="Khớp thời lượng" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--fit" /></button>
            <button aria-label="Nhóm đối tượng" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--folder" /></button>
            <button aria-label="Sao chép đối tượng" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--copy" /></button>
            <button aria-label="Thu gọn timeline" type="button"><span className="studio-timeline-glyph studio-timeline-glyph--collapse" /></button>
          </div>
          <div className="studio-timeline-tabs">
            <div>
              <button className={mode === 'inspect' ? 'is-active' : ''} onClick={() => chooseMode('inspect')} type="button">Space 1: Bee</button>
              <button className={mode === 'assemble' ? 'is-active' : ''} onClick={() => chooseMode('assemble')} type="button">Space 2: Cấu tạo</button>
              <button className="studio-add-space" aria-label="Thêm không gian" onClick={() => chooseMode('drive')} type="button"><span aria-hidden="true" /></button>
            </div>
          </div>
          <div className="studio-stepbar">
            <button onClick={() => chooseMode('drive')} type="button">Tạo Step</button>
            <button className="studio-timeline-customize" type="button"><img alt="" src={`${EDITOR_ASSET_ROOT}/settings.svg`} />Tùy chỉnh</button>
          </div>
          <div className="studio-timeline-commandbar">
            <button className="studio-timeline-display" type="button">Timeline hiển thị</button>
            <div className="studio-range-readout"><span>Start</span><b>0</b><span>End</span><b>0</b></div>
            <div className="studio-transport" aria-label="Điều khiển timeline">
              <button aria-label="Về đầu" onClick={() => setTime(0)} type="button"><span className="to-start" /></button>
              <button aria-label="Phát" onClick={() => setPlaying(true)} type="button"><span className="play-forward" /></button>
              <button aria-label="Tới cuối" onClick={() => setTime(duration)} type="button"><span className="to-end" /></button>
              <button aria-label="Lùi một bước" onClick={() => setTime((value) => Math.max(0, value - 1))} type="button"><span className="step-back" /></button>
              <button aria-label="Tiến một bước" onClick={() => setTime((value) => Math.min(duration, value + 1))} type="button"><span className="step-forward" /></button>
            </div>
            <button className="studio-step-select" type="button">Bước 1 (Step - 1) · Mở cửa<span aria-hidden="true" /></button>
          </div>
          <div className="studio-timeline-grid">
            <div className="studio-timeline-ruler"><span>Đối tượng</span><div>{[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150].map((value) => <i key={value}>{value}</i>)}</div></div>
            {TRACKS.map((item) => (
              <div className={`studio-track${track === item.id ? ' is-active' : ''}`} key={item.id}>
                <button className="studio-track-name" onClick={() => { setTrack(item.id); setActiveDetail(item.id === 'model' ? 'space' : item.id); }} type="button"><img alt="" src={`${EDITOR_ASSET_ROOT}/${item.asset}`} /><span>{item.label}</span><em aria-hidden="true" /></button>
                <div className="studio-track-lane" onPointerDown={scrub} role="slider" aria-label={`Timeline ${item.label}`} aria-valuemax={duration} aria-valuemin={0} aria-valuenow={time} tabIndex={0}>
                  <span className={`studio-clip studio-clip--${item.id}`} style={{ background: item.color, left: `${item.start * 100}%`, width: `${item.length * 100}%` }}><b>Title</b><small>Sub-title</small>{item.id === 'audio' && <img alt="" src={`${FIGMA_ASSET_ROOT}/timeline-wave.svg`} />}</span>
                  <span className="studio-playhead" style={{ left: `${progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <aside className="studio-detail-rail" aria-label="Công cụ nội dung">
        {DETAIL_TOOLS.map((item) => (
          <button className={activeDetail === item.id ? 'is-active' : ''} key={item.id} onClick={() => setActiveDetail(item.id)} type="button">
            <span className="studio-tool-icon" aria-hidden="true"><img alt="" src={`${EDITOR_ASSET_ROOT}/${item.asset}`} /></span><span>{item.label}</span>
          </button>
        ))}
      </aside>

      <aside className="studio-properties" aria-label="Thiết lập văn bản">
        <h4>Thiết lập văn bản</h4>
        <section className="studio-property-section studio-transform-group">
          <h5>Chuyển đổi tỷ lệ</h5>
          <div className="studio-vector"><span>Vị trí</span><i>0<small>X</small></i><i>0<small>Y</small></i><i>0<small>Z</small></i></div>
          <div className="studio-vector"><span>Xoay</span><i>0<small>X</small></i><i>0<small>Y</small></i><i>0<small>Z</small></i></div>
          <div className="studio-vector"><span>Tỷ lệ</span><i>0<small>X</small></i><i>0<small>Y</small></i><i>0<small>Z</small></i></div>
        </section>
        <div className="studio-note-tabs"><button type="button">Văn Bản</button><button className="is-active" type="button">Ghi Chú</button></div>
        <section className="studio-property-section">
          <h5>Tùy chỉnh phong cách</h5>
          <label className="studio-field-label">Hướng hiển thị</label>
          <div className="studio-note-directions">{Array.from({ length: 6 }, (_, index) => <button className={index === 2 ? 'is-active' : ''} aria-label={`Hướng ghi chú ${index + 1}`} key={index} type="button"><span /></button>)}</div>
          <div className="studio-property-row"><span>Màu sắc đường ghi chú</span><button className="studio-color-well" aria-label="Chọn màu" type="button" /></div>
          <label className="studio-slider studio-slider--figma">Độ dài đường ghi chú <span>{noteLength}</span><input aria-label="Độ dài đường ghi chú" max="160" min="20" onChange={(event) => setNoteLength(Number(event.target.value))} type="range" value={noteLength} /></label>
          <label className="studio-slider studio-slider--figma">Độ dày đường chú thích <span>{noteWidth} px</span><input aria-label="Độ dày đường chú thích" max="100" min="1" onChange={(event) => setNoteWidth(Number(event.target.value))} type="range" value={noteWidth} /></label>
          <label className="studio-slider studio-slider--figma">Opacity đường chú thích <span>{noteOpacity}%</span><input aria-label="Độ trong đường chú thích" max="100" min="10" onChange={(event) => setNoteOpacity(Number(event.target.value))} type="range" value={noteOpacity} /></label>
          <div className="studio-size-settings"><b>Thiết lập kích thước</b><div><span>Cao</span><i><button aria-label="Giảm chiều cao" type="button" /><b>0</b><button aria-label="Tăng chiều cao" type="button" /></i><span>Rộng</span><i><button aria-label="Giảm chiều rộng" type="button" /><b>0</b><button aria-label="Tăng chiều rộng" type="button" /></i></div></div>
          <div className="studio-view-settings"><b>Thiết lập góc nhìn</b><button onClick={() => setResetKey((value) => value + 1)} type="button"><img alt="" src={`${FIGMA_ASSET_ROOT}/set-view.svg`} />Thiết lập góc nhìn</button></div>
        </section>
        <section className="studio-property-section studio-animation-settings">
          <h5>Hiển thị theo Animation</h5>
          <label>Chế độ hiển thị<select defaultValue="step"><option value="step">Theo Bước (Step)</option></select></label>
          <label>Animation áp dụng<select defaultValue="choose"><option value="choose">Chọn Bước (Step)</option></select></label>
          <h5>Cách hiển thị</h5>
          <label>Bắt đầu từ bước<select defaultValue="first"><option value="first">Chọn bước</option></select></label>
        </section>
      </aside>
    </div>
  );
}
