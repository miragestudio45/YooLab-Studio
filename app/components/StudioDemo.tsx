'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import {
  IconAi, IconAudio, IconBell, IconCamera, IconChevronDown, IconClock, IconClose, IconCollapse,
  IconComponents, IconCopy, IconCreate, IconCube3d, IconDecor, IconDuplicate, IconEffects,
  IconFitRange, IconFrame, IconFullscreen, IconGear, IconGlobe, IconGrip, IconHeightAxis,
  IconHotspot, IconInfo, IconLabels, IconMedia, IconMenu, IconMinus, IconMirror, IconModel,
  IconPause, IconPencil, IconPlay, IconPlus, IconPositionAxis, IconProjectInfo, IconProjects,
  IconQuiz, IconRedo, IconReset, IconRotateAxis, IconScaleAxis, IconSettings, IconShare,
  IconShareNodes, IconSilent, IconSpace, IconStepBack, IconStepForward, IconSteps, IconSticker,
  IconTemplates, IconText, IconToEnd, IconToStart, IconTrackEffects, IconTrackText, IconTrash,
  IconUndo, IconUpload, IconViewpoint, IconVolume, IconVr, IconVrLab, IconWidthAxis,
} from './studio/EditorIcons';

type StudioMode = 'assemble' | 'inspect' | 'drive';
type TrackId = 'model' | 'text' | 'audio' | 'effect';
type Glyph = (props: { className?: string }) => React.ReactElement;
type EditorTool = { id: string; label: string; Icon: Glyph };
type Clip = { start: number; length: number; title: string; sub: string };

const EDITOR_ASSET_ROOT = '/asset/ui/yoolab-editor';
const FIGMA_ASSET_ROOT = `${EDITOR_ASSET_ROOT}/figma`;

/*
 * The tab cut out of the canvas's top edge, traced from the source frame's
 * `Union` layer (48980:6239, 193.182 x 34). It was two radial-gradient fillets
 * before; that read as a pill stuck on the viewport rather than as a shoulder
 * the dark surface curves up into, because the real shape has straight flared
 * sides between the two fillets, not a constant radius.
 */
const CANVAS_TAB_PATH =
  'M193.182 0C186.717 0.000403192 180.514 3.0378 175.924 8.45117L161.424 25.5488C156.834 30.9622 150.631 33.9996 144.166 34H49.0166C42.5518 33.9997 36.3488 30.9622 31.7588 25.5488L17.2578 8.45117C12.6678 3.03789 6.46474 0.000269294 0 0H193.182Z';

const MAIN_TOOLS: EditorTool[] = [
  { id: 'create', label: 'Tạo mới\nDự án', Icon: IconCreate },
  { id: 'templates', label: 'Mẫu', Icon: IconTemplates },
  { id: 'components', label: 'Thành phần', Icon: IconComponents },
  { id: 'projectInfo', label: 'Thông tin\nDự án', Icon: IconProjectInfo },
  { id: 'decor', label: 'Decor', Icon: IconDecor },
  { id: 'settings', label: 'Thiết lập', Icon: IconSettings },
  { id: 'projects', label: 'Dự án', Icon: IconProjects },
  { id: 'vrLab', label: 'VR Lab', Icon: IconVrLab },
];

const DETAIL_TOOLS: EditorTool[] = [
  { id: 'labels', label: 'Quản lý nhãn', Icon: IconLabels },
  { id: 'space', label: 'Không gian', Icon: IconSpace },
  { id: 'steps', label: 'Bước', Icon: IconSteps },
  { id: 'text', label: 'Văn bản', Icon: IconText },
  { id: 'audio', label: 'Âm thanh', Icon: IconAudio },
  { id: 'media', label: 'Media', Icon: IconMedia },
  { id: 'hotspot', label: 'Hotspot', Icon: IconHotspot },
  { id: 'info', label: 'Icon info', Icon: IconInfo },
  { id: 'sticker', label: 'Sticker', Icon: IconSticker },
  { id: 'effect', label: 'Hiệu ứng', Icon: IconEffects },
  { id: 'quiz', label: 'Tạo Quiz', Icon: IconQuiz },
];

/* Track colours are read off the source frame, not invented. */
const TRACKS: { id: TrackId; label: string; color: string; Icon: Glyph }[] = [
  { id: 'model', label: 'Model', color: '#a852fc', Icon: IconModel },
  { id: 'text', label: 'Văn bản', color: '#2b7fff', Icon: IconTrackText },
  { id: 'audio', label: 'Âm thanh', color: '#00c950', Icon: IconAudio },
  { id: 'effect', label: 'Hiệu ứng', color: '#f6339a', Icon: IconTrackEffects },
];

/*
 * A space is one animation of the car, and the timeline under it is that
 * animation's own score.
 *
 * The review asked for exactly this — "các phần space 1 2 3 chỗ timeline tương
 * ứng với từng anim của car" — and it is also how the editor actually behaves:
 * switching space switches what is on stage, so the four lanes have to switch
 * with it. Space 1 holds the assembled car on its turntable, Space 2 pulls the
 * kit apart, Space 3 puts it on the road. The clip geometry of Space 1 is the
 * source frame's (1148 / 585 / 712 / 945 over a 1148-wide lane); the other two
 * are that same score re-cut for a shorter and a longer step.
 */
const SPACES: { id: StudioMode; label: string; step: string; duration: number; clips: Record<TrackId, Clip> }[] = [
  {
    id: 'inspect',
    label: 'Space 1: Car',
    step: 'Bước 1 (Step - 1) - Giới thiệu xe',
    duration: 10.3,
    clips: {
      model: { start: 0, length: 1, title: 'Xe F1', sub: 'Xoay 360°' },
      text: { start: 0, length: 0.50958, title: 'Tiêu đề', sub: 'Tên từng bộ phận' },
      audio: { start: 0, length: 0.62021, title: 'Lời dẫn', sub: 'Giới thiệu' },
      effect: { start: 0, length: 0.82317, title: 'Ánh sáng', sub: 'Đèn studio' },
    },
  },
  {
    id: 'assemble',
    label: 'Space 2: Cấu tạo',
    step: 'Bước 2 (Step - 2) - Tách cụm chi tiết',
    duration: 8.4,
    clips: {
      model: { start: 0, length: 1, title: 'Tách cụm', sub: '9 bộ phận' },
      text: { start: 0.24, length: 0.7, title: 'Ghi chú', sub: 'Cánh gió · Lốp' },
      audio: { start: 0.1, length: 0.55, title: 'Thuyết minh', sub: 'Cấu tạo' },
      effect: { start: 0.36, length: 0.58, title: 'Hotspot', sub: 'Điểm chạm' },
    },
  },
  {
    id: 'drive',
    label: 'Space: Lái xe',
    step: 'Bước 3 (Step - 3) - Chạy thử',
    duration: 12.6,
    clips: {
      model: { start: 0, length: 1, title: 'Vào vòng', sub: 'Bánh lăn' },
      text: { start: 0.46, length: 0.42, title: 'Vận tốc', sub: '312 km/h' },
      audio: { start: 0, length: 0.88, title: 'Tiếng máy', sub: 'V6 Turbo' },
      effect: { start: 0.12, length: 0.74, title: 'Vệt tốc độ', sub: 'Motion blur' },
    },
  },
];

const TIMELINE_TOOLS: { id: string; label: string; Icon: Glyph }[] = [
  { id: 'undo', label: 'Hoàn tác', Icon: IconUndo },
  { id: 'redo', label: 'Làm lại', Icon: IconRedo },
  { id: 'delete', label: 'Xóa đối tượng', Icon: IconTrash },
  { id: 'fit', label: 'Khớp thời lượng', Icon: IconFitRange },
  { id: 'copy', label: 'Sao chép đối tượng', Icon: IconCopy },
  { id: 'duplicate', label: 'Nhân bản đối tượng', Icon: IconDuplicate },
  { id: 'mirror', label: 'Lật đối tượng', Icon: IconMirror },
];

const RULER = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];

/*
 * "Hướng hiển thị" — the six leader-line shapes.
 *
 * The frame draws each one as the same elbow (`M0.5 0.5H8.5L16.5 6.5`) under a
 * different flip, plus a 4 px `#00AAAB` dot at the end the note attaches to; the
 * first and last are the straight run. Redrawn here on one 20x10 grid so the six
 * buttons share a baseline — the previous set was six unrelated curves.
 */
const NOTE_DIRECTIONS: { path: string; dot: [number, number] }[] = [
  { path: 'M2 5H18', dot: [2, 5] },
  { path: 'M2 2L10 8H18', dot: [2, 2] },
  { path: 'M2 8L10 2H18', dot: [2, 8] },
  { path: 'M2 8H10L18 2', dot: [18, 2] },
  { path: 'M2 2H10L18 8', dot: [18, 8] },
  { path: 'M2 5H18', dot: [18, 5] },
];

/* --------------------------------------------------------------- 3D stage --- */

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
    const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 90);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /*
     * Khronos PBR Neutral, not ACES.
     *
     * The reference Formula viewer photographs this car on a #f8f8f8 sweep under
     * a studio HDR, and the thing that makes its paint read as paint is that
     * saturated reds stay red at high exposure. ACES desaturates its highlights
     * by design — it is a film look — and on the Marlboro flank that turned the
     * orange to a chalky salmon wherever the key hit it. Neutral was written for
     * exactly this case: product colour preserved, highlights rolled off.
     */
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    /*
     * A cyclorama, not a flat clear colour.
     *
     * The editor viewport has to stay dark — it is a panel inside a light page
     * and the source frame paints it near-black — but a single flat #292b2c
     * behind a white car gives the bodywork no edge to sit against: the silhouette
     * dissolves at the top and the shadow has nothing to fall on. This is the
     * photographic answer instead: a sphere with a vertical ramp, lighter behind
     * the car and falling off to the corners, so the car is lit *against*
     * something. It is background only — `scene.environment` still does the
     * reflections.
     */
    const backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(46, 40, 28),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uLift: { value: 0.58 } },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform float uLift;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = smoothstep(-0.42, 0.62, d.y);
            vec3 low  = vec3(0.043, 0.049, 0.055);
            vec3 mid  = vec3(0.128, 0.145, 0.156);
            vec3 high = vec3(0.055, 0.063, 0.071);
            vec3 c = mix(low, mid, smoothstep(0.0, 0.55, h));
            c = mix(c, high, smoothstep(0.55, 1.0, h));
            /* A soft pool of light behind the subject, centred on -Z. */
            float pool = smoothstep(0.55, 1.0, dot(d, normalize(vec3(0.0, 0.12, -1.0))));
            c += vec3(0.075, 0.088, 0.092) * pool * uLift;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    backdrop.frustumCulled = false;
    scene.add(backdrop);

    const environment = createProceduralEnvironment(renderer, studioEnvironmentPalette);
    scene.environment = environment.texture;
    scene.environmentIntensity = 1.05;

    const hemi = new THREE.HemisphereLight(0xdff0f4, 0x14181c, 1.05);
    scene.add(hemi);
    /* Key: a large soft box light above and slightly camera-left, the classic
       three-quarter automotive set-up. It is the only caster. */
    const key = new THREE.DirectionalLight(0xfff4e9, 3.1);
    key.position.set(-5.4, 8.2, 5.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 22;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.022;
    scene.add(key);
    /* Rim from behind-right: this is what draws the line along the sidepod and
       the rear wing against the backdrop. */
    const rim = new THREE.DirectionalLight(0xbfe9ff, 2.5);
    rim.position.set(6.6, 3.4, -6.2);
    scene.add(rim);
    /* Warm bounce off the floor, so the underside is not a black hole. */
    const bounce = new THREE.DirectionalLight(0xffd7bd, 0.75);
    bounce.position.set(2.2, -3.4, 3.6);
    scene.add(bounce);
    const spark = new THREE.PointLight(0x7fe4de, 9, 16, 2);
    spark.position.set(4.4, 1.6, -2.4);
    scene.add(spark);

    const world = new THREE.Group();
    scene.add(world);
    const floorY = -1.22;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 96),
      new THREE.MeshStandardMaterial({ color: 0x0d1113, roughness: 0.62, metalness: 0.06, envMapIntensity: 0.42 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    world.add(floor);

    /* Contact shadow: a painted radial under the car. The directional light gives
       a correct cast shadow, but a 2048 map over a 14-unit frustum cannot resolve
       the tyre contact patches, and without them the car floats. */
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 5),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uOpacity: { value: 0.62 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float d = length((vUv - 0.5) * vec2(2.05, 2.35));
            float a = smoothstep(1.0, 0.06, d);
            gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uOpacity);
          }`,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = floorY + 0.006;
    world.add(contact);

    const grid = new THREE.GridHelper(26, 34, 0x59a09c, 0x39464a);
    grid.position.y = floorY + 0.012;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => { material.transparent = true; material.opacity = 0.19; material.depthWrite = false; });
    world.add(grid);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.62, 3.66, 160),
      new THREE.MeshBasicMaterial({ color: 0x69c6c0, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = floorY + 0.02;
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
        const carMaterials = createCarMaterials(textures, { initialKitProgress: 0, envMapIntensity: 1.02 });
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
    let orbitRadius = 6.8;
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
      orbitRadius = THREE.MathUtils.clamp(orbitRadius + event.deltaY * 0.006, 5.0, 10.5);
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
      contact.position.x = carRoot.position.x;
      contact.scale.set(modeRef.current === 'drive' ? 0.62 : 1, modeRef.current === 'drive' ? 1.7 : 1, 1);

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
        orbitRadius = 6.8;
      }
      grid.visible = gridRef.current;
      ring.visible = gridRef.current;
      const luminance = lightRef.current / 100;
      key.intensity = 2.1 + luminance * 2.1;
      rim.intensity = 1.5 + luminance * 2.0;
      spark.intensity = 4 + luminance * 9;
      scene.environmentIntensity = 0.72 + luminance * 0.62;

      /*
       * The camera pulls back on a tall plate, not just a narrow one.
       *
       * A perspective camera holds its VERTICAL field of view, so the shorter
       * the plate is relative to its width, the more of the car fits across it.
       * The old guard only fired below 1.16:1, which was fine while the canvas
       * was always letterboxed — then the timeline became collapsible, the plate
       * went to 1.34:1, and the front wing ran off the right edge. 1.72 is the
       * aspect at which this framing is composed, so anything squarer than that
       * gets exactly enough extra distance to keep the whole car on the plate.
       * This is real camera work, not a responsive CSS scale.
       */
      const frameRadius = orbitRadius * Math.max(1, 1.72 / camera.aspect);
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
      backdrop.geometry.dispose();
      (backdrop.material as THREE.Material).dispose();
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

/* ------------------------------------------------------------------ shell --- */

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
  const [noteTab, setNoteTab] = useState<'text' | 'note'>('note');
  const [noteDirection, setNoteDirection] = useState(2);
  const [noteLength, setNoteLength] = useState(100);
  const [noteWidth, setNoteWidth] = useState(50);
  const [noteOpacity, setNoteOpacity] = useState(100);
  const [noteHeight, setNoteHeight] = useState(0);
  const [noteBoxWidth, setNoteBoxWidth] = useState(0);
  /* Request from the last review: the timeline is a panel you can put away.
     Both the canvas chip and the rail's collapse button drive this one flag. */
  const [timelineOpen, setTimelineOpen] = useState(true);
  const space = useMemo(() => SPACES.find((entry) => entry.id === mode) ?? SPACES[0], [mode]);
  const duration = space.duration;
  const progress = (Math.min(time, duration) / duration) * 100;
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
  }, [playing, duration]);

  const chooseMode = (next: StudioMode) => {
    setMode(next);
    setPlaying(next === 'drive');
    /* Each space owns its own length, so the playhead has to land inside the new
       one rather than keeping a position that belonged to the previous score. */
    setTime((current) => Math.min(current, (SPACES.find((entry) => entry.id === next) ?? SPACES[0]).duration * 0.5));
    if (next === 'assemble') setTrack('model');
  };

  const scrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setTime(ratio * duration);
    setPlaying(false);
  };

  return (
    <div className="studio" data-mode={mode} data-timeline={timelineOpen ? 'open' : 'closed'}>
      {/* ------------------------------------------------------- main rail --- */}
      <aside className="studio-main-rail" aria-label="Điều hướng chính YooLab">
        {/* The rail mark is the frame's own `Logo YooStudio` (48980:166621): the
            teal blob, the bird and the wordmark are three exported layers, not a
            rounded square with a gradient poured into it. */}
        <button className="studio-brand" aria-label="Trang chủ YooLab" onClick={() => setActiveMain('create')} type="button">
          <img alt="" className="studio-brand-blob" src={`${FIGMA_ASSET_ROOT}/rail-logo-blob.svg`} />
          <img alt="" className="studio-brand-bird" src={`${FIGMA_ASSET_ROOT}/rail-logo-bird.svg`} />
          <span>YooLab</span>
        </button>

        <div className="studio-main-tools">
          {MAIN_TOOLS.map(({ id, label, Icon }) => (
            <button
              className={`studio-rail-item${activeMain === id ? ' is-active' : ''}${id === 'create' ? ' studio-rail-item--create' : ''}`}
              key={id}
              onClick={() => setActiveMain(id)}
              type="button"
              aria-pressed={activeMain === id}
            >
              <span className="studio-rail-glyph"><Icon /></span>
              <span className="studio-rail-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="studio-main-footer" aria-label="Tài khoản và ngôn ngữ">
          <button className="studio-rail-mini" aria-label="Thông báo: 10 mới" type="button">
            <IconBell /><i>10</i>
          </button>
          <button className="studio-rail-mini" aria-label="Ngôn ngữ: Tiếng Việt" type="button">
            <IconGlobe /><small>VNI</small>
          </button>
          <span className="studio-avatar" aria-hidden="true">
            <img alt="" src={`${FIGMA_ASSET_ROOT}/avatar.png`} />
            <i><img alt="" src={`${FIGMA_ASSET_ROOT}/rail-avatar-crown.svg`} /></i>
          </span>
        </div>
      </aside>

      {/* ------------------------------------------------------- workspace --- */}
      <main className="studio-workspace">
        <header className="studio-topbar">
          <span className="studio-doc-title">
            <b>Giới thiệu về loài Ong</b>
            <button aria-label="Đổi tên bài học" type="button"><IconPencil /></button>
          </span>
          <span className="studio-sync" role="status" aria-label="Đang đồng bộ">
            <img alt="" src={`${FIGMA_ASSET_ROOT}/loading.svg`} />
          </span>
          <div className="studio-topbar-actions" aria-label="Hành động dự án">
            <button className="studio-chip studio-chip--violet" aria-label="Mô hình 3D" onClick={() => setTrack('model')} type="button">
              <IconCube3d />
            </button>
            <button className="studio-chip studio-chip--peach studio-chip--wide" aria-label="Công cụ AI" type="button">
              <IconAi /><IconChevronDown className="studio-chip-caret" />
            </button>
            <button className="studio-chip studio-chip--sky" aria-label="Toàn màn hình" onClick={() => setShowGrid((value) => !value)} type="button">
              <IconFullscreen />
            </button>
            <span className="studio-topbar-divider" aria-hidden="true" />
            <button className="studio-chip studio-chip--teal" aria-label="Chia sẻ" aria-pressed={shared} onClick={() => setShared((value) => !value)} type="button">
              <IconShare />
            </button>
          </div>
        </header>

        <section className="studio-viewport" aria-label="Không gian dựng bài học">
          <div className="studio-canvas">
            <CarViewport
              explode={mode === 'assemble' ? 68 : 0}
              light={58}
              mode={mode}
              onError={handleError}
              onReady={handleReady}
              playing={playing}
              resetKey={resetKey}
              showGrid={showGrid}
            />

            <button className="studio-canvas-menu" onClick={() => setActiveMain('decor')} type="button">
              <IconMenu /><span>Menu</span>
            </button>

            <div className="studio-canvas-brand" aria-label="YooLab">
              <svg className="studio-canvas-tab" viewBox="0 0 193.182 34" aria-hidden="true" focusable="false">
                <path d={CANVAS_TAB_PATH} fill="#fff" />
              </svg>
              <img alt="" src={`${FIGMA_ASSET_ROOT}/canvas-logo-bird.svg`} />
              <img alt="YooLab" src={`${FIGMA_ASSET_ROOT}/canvas-logo-word.svg`} />
            </div>

            <div className="studio-canvas-tools" role="group" aria-label="Điều khiển khung nhìn">
              <button aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'} aria-pressed={muted} onClick={() => setMuted((value) => !value)} type="button"><IconSilent /></button>
              <button aria-label="Âm lượng" onClick={() => setMuted((value) => !value)} type="button"><IconVolume /></button>
              <button aria-label="Đặt lại góc nhìn" onClick={() => setResetKey((value) => value + 1)} type="button"><IconReset /></button>
              <button aria-label="Khung lưới" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)} type="button"><IconFrame /></button>
              <button aria-label="Chế độ VR" onClick={() => chooseMode('drive')} type="button"><IconVr /></button>
              <button aria-label="Chia sẻ khung nhìn" onClick={() => setShared((value) => !value)} type="button"><IconShareNodes /></button>
              <button className="studio-canvas-close" aria-label="Đóng chế độ xem" onClick={() => chooseMode('inspect')} type="button"><IconClose /></button>
            </div>

            <div className="studio-canvas-side">
              <button type="button"><IconUpload /><span>Upload</span></button>
              <button onClick={() => setResetKey((value) => value + 1)} type="button"><IconCamera /><span>Set view</span></button>
            </div>

            {!ready && !failed && <div className="studio-loader"><i />Đang tải mô hình xe thật…</div>}
            {failed && <div className="studio-loader studio-loader--error">Không thể tải mô hình xe.</div>}

            <div className="studio-playbar" aria-label="Điều khiển phát">
              <button className="studio-playbar-play" aria-label={playing ? 'Tạm dừng' : 'Phát'} onClick={() => setPlaying((value) => !value)} type="button">
                {playing ? <IconPause /> : <IconPlay />}
              </button>
              <b>{formatTime(Math.min(time, duration))}<small> / {formatTime(duration)}</small></b>
              <div
                className="studio-playbar-scrub"
                onPointerDown={scrub}
                role="slider"
                aria-label="Tiến trình phát"
                aria-valuemax={duration}
                aria-valuemin={0}
                aria-valuenow={Number(time.toFixed(2))}
                tabIndex={0}
              >
                <span style={{ width: `${progress}%` }} /><i style={{ left: `${progress}%` }} />
              </div>
            </div>

            <span className="studio-rail-handle" aria-hidden="true" />

            <button
              className="studio-timeline-chip"
              aria-expanded={timelineOpen}
              aria-controls="studio-timeline-panel"
              onClick={() => setTimelineOpen((value) => !value)}
              type="button"
            >
              <IconGrip /><span>Timeline</span><IconChevronDown className="studio-timeline-chip-caret" />
            </button>
          </div>
        </section>

        {/* -------------------------------------------------------- timeline --- */}
        <section className="studio-timeline" aria-label="Timeline bài học">
          <div className="studio-spaces">
            {SPACES.map((entry) => (
              <button
                aria-pressed={mode === entry.id}
                className={mode === entry.id ? 'is-active' : ''}
                key={entry.id}
                onClick={() => chooseMode(entry.id)}
                type="button"
              >
                {entry.label}
              </button>
            ))}
            <button className="studio-space-add" aria-label="Thêm không gian" onClick={() => chooseMode('inspect')} type="button"><IconPlus /></button>
          </div>

          <div className="studio-stepbar">
            <button className="studio-step-create" onClick={() => setPlaying((value) => !value)} type="button">Tạo Step</button>
            <button className="studio-step-customize" type="button"><IconGear />Tùy chỉnh</button>
          </div>

          <div className="studio-timeline-panel" id="studio-timeline-panel" hidden={!timelineOpen}>
            <aside className="studio-timeline-tools" aria-label="Công cụ timeline">
              {TIMELINE_TOOLS.map(({ id, label, Icon }) => (
                <button aria-label={label} key={id} title={label} type="button"><Icon /></button>
              ))}
              <button
                aria-label="Thu gọn timeline"
                className="studio-timeline-collapse"
                onClick={() => setTimelineOpen(false)}
                title="Thu gọn timeline"
                type="button"
              >
                <IconCollapse />
              </button>
            </aside>

            <div className="studio-timeline-body">
              <div className="studio-commandbar">
                <button className="studio-command-pill" type="button">Timeline hiển thị</button>
                <div className="studio-range-readout">
                  <IconClock /><span>Start</span><b>0</b><span>End</span><b>0</b>
                </div>
                <div className="studio-transport" aria-label="Điều khiển timeline">
                  <button aria-label="Về đầu" onClick={() => { setTime(0); setPlaying(false); }} type="button"><IconToStart /></button>
                  <button aria-label={playing ? 'Tạm dừng' : 'Phát'} onClick={() => setPlaying((value) => !value)} type="button">{playing ? <IconPause /> : <IconPlay />}</button>
                  <button aria-label="Tới cuối" onClick={() => { setTime(duration); setPlaying(false); }} type="button"><IconToEnd /></button>
                  <span className="studio-transport-gap" aria-hidden="true" />
                  <button aria-label="Lùi một giây" onClick={() => setTime((value) => Math.max(0, value - 1))} type="button"><IconStepBack /></button>
                  <button aria-label="Tiến một giây" onClick={() => setTime((value) => Math.min(duration, value + 1))} type="button"><IconStepForward /></button>
                </div>
                <button className="studio-step-select" type="button">
                  <span>{space.step}</span><IconChevronDown />
                </button>
              </div>

              <div className="studio-timeline-grid">
                <div className="studio-timeline-ruler">
                  <button className="studio-ruler-head" type="button">Đối tượng<IconChevronDown /></button>
                  <div className="studio-ruler-scale">
                    {RULER.map((value) => <i key={value}><em>{value}</em></i>)}
                  </div>
                </div>

                {TRACKS.map(({ id, label, color, Icon }) => {
                  const clip = space.clips[id];
                  return (
                    <div className={`studio-track${track === id ? ' is-active' : ''}`} key={id}>
                      <button
                        className="studio-track-name"
                        onClick={() => { setTrack(id); setActiveDetail(id === 'model' ? 'space' : id); }}
                        type="button"
                      >
                        <Icon /><span>{label}</span><IconChevronDown className="studio-track-caret" />
                      </button>
                      <div
                        className="studio-track-lane"
                        onPointerDown={scrub}
                        role="slider"
                        aria-label={`Timeline ${label} — ${space.label}`}
                        aria-valuemax={duration}
                        aria-valuemin={0}
                        aria-valuenow={Number(time.toFixed(2))}
                        tabIndex={0}
                      >
                        <span
                          className={`studio-clip studio-clip--${id}`}
                          style={{ background: color, left: `${clip.start * 100}%`, width: `${clip.length * 100}%` }}
                        >
                          <i className="studio-clip-handle" aria-hidden="true" />
                          <b>{clip.title}</b><small>{clip.sub}</small>
                          {id === 'audio' && <img alt="" src={`${FIGMA_ASSET_ROOT}/timeline-wave.svg`} />}
                          <i className="studio-clip-handle studio-clip-handle--end" aria-hidden="true" />
                        </span>
                        <span className="studio-playhead" style={{ left: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ----------------------------------------------------- content rail --- */}
      <aside className="studio-detail-rail" aria-label="Công cụ nội dung">
        {DETAIL_TOOLS.map(({ id, label, Icon }) => (
          <button
            className={`studio-rail-item${activeDetail === id ? ' is-active' : ''}`}
            key={id}
            onClick={() => setActiveDetail(id)}
            type="button"
            aria-pressed={activeDetail === id}
          >
            <span className="studio-rail-glyph"><Icon /></span>
            <span className="studio-rail-label">{label}</span>
          </button>
        ))}
      </aside>

      {/* ------------------------------------------------------- properties --- */}
      <aside className="studio-properties" aria-label="Thiết lập văn bản">
        <h4>Thiết lập văn bản</h4>

        <section className="studio-prop-block">
          <h5>Chuyển đổi tỷ lệ</h5>
          <div className="studio-vector"><IconPositionAxis /><span>Vị trí</span><i>0<small>X</small></i><i>0<small>Y</small></i><i>0<small>Z</small></i></div>
          <div className="studio-vector"><IconRotateAxis /><span>Xoay</span><i>0°<small>X</small></i><i>0°<small>Y</small></i><i>0°<small>Z</small></i></div>
          <div className="studio-vector"><IconScaleAxis /><span>Tỷ lệ</span><i>1.00<small>X</small></i><i>1.00<small>Y</small></i><i>1.00<small>Z</small></i></div>
        </section>

        <div className="studio-segment" role="group" aria-label="Loại nội dung">
          <button className={noteTab === 'text' ? 'is-active' : ''} onClick={() => setNoteTab('text')} type="button">Văn Bản</button>
          <button className={noteTab === 'note' ? 'is-active' : ''} onClick={() => setNoteTab('note')} type="button">Ghi Chú</button>
        </div>

        <section className="studio-prop-block">
          <h5>Tùy chỉnh phong cách</h5>

          <p className="studio-field-label">Hướng hiển thị</p>
          <div className="studio-note-directions" role="group" aria-label="Hướng đường ghi chú">
            {NOTE_DIRECTIONS.map(({ path, dot }, index) => (
              <button
                aria-label={`Hướng ghi chú ${index + 1}`}
                aria-pressed={noteDirection === index}
                className={noteDirection === index ? 'is-active' : ''}
                key={path + dot.join()}
                onClick={() => setNoteDirection(index)}
                type="button"
              >
                <svg viewBox="0 0 20 10" fill="none" aria-hidden="true" focusable="false">
                  <path d={path} stroke="currentColor" strokeLinecap="round" />
                  <circle cx={dot[0]} cy={dot[1]} r="2" fill="#00AAAB" />
                </svg>
              </button>
            ))}
          </div>

          <div className="studio-prop-row">
            <span>Màu sắc đường ghi chú</span>
            <button className="studio-color-well" aria-label="Chọn màu đường ghi chú" type="button" />
          </div>

          <label className="studio-slider">
            <span>Độ dài đường chú thích</span><b>{noteLength}</b>
            <input aria-label="Độ dài đường chú thích" max="160" min="20" onChange={(event) => setNoteLength(Number(event.target.value))} type="range" value={noteLength} />
          </label>
          <label className="studio-slider">
            <span>Độ dày đường chú thích</span><b>{noteWidth} px</b>
            <input aria-label="Độ dày đường chú thích" max="100" min="1" onChange={(event) => setNoteWidth(Number(event.target.value))} type="range" value={noteWidth} />
          </label>
          <label className="studio-slider studio-slider--swatch">
            <span>Opacity đường chú thích</span><b>{noteOpacity}%</b>
            <input aria-label="Độ trong đường chú thích" max="100" min="10" onChange={(event) => setNoteOpacity(Number(event.target.value))} type="range" value={noteOpacity} />
            <i className="studio-alpha-well" style={{ '--alpha': noteOpacity / 100 } as React.CSSProperties} aria-hidden="true" />
          </label>
        </section>

        <section className="studio-prop-block">
          <p className="studio-field-label">Thiết lập kích thước</p>
          <div className="studio-steppers">
            <span className="studio-stepper"><IconHeightAxis /><em>Cao</em>
              <i>
                <button aria-label="Giảm chiều cao" onClick={() => setNoteHeight((v) => Math.max(0, v - 1))} type="button"><IconMinus /></button>
                <b>{noteHeight}</b>
                <button aria-label="Tăng chiều cao" onClick={() => setNoteHeight((v) => v + 1)} type="button"><IconPlus /></button>
              </i>
            </span>
            <span className="studio-stepper"><IconWidthAxis /><em>Rộng</em>
              <i>
                <button aria-label="Giảm chiều rộng" onClick={() => setNoteBoxWidth((v) => Math.max(0, v - 1))} type="button"><IconMinus /></button>
                <b>{noteBoxWidth}</b>
                <button aria-label="Tăng chiều rộng" onClick={() => setNoteBoxWidth((v) => v + 1)} type="button"><IconPlus /></button>
              </i>
            </span>
          </div>

          <p className="studio-field-label">Thiết lập góc nhìn</p>
          <button className="studio-primary-button" onClick={() => setResetKey((value) => value + 1)} type="button">
            <IconViewpoint />Thiết lập góc nhìn
          </button>
        </section>

        <section className="studio-prop-block">
          <h5>Hiển thị theo Animation</h5>
          <label className="studio-select"><span>Chế độ hiển thị</span>
            <i><select defaultValue="step" aria-label="Chế độ hiển thị"><option value="step">Theo Bước (Step)</option></select><IconChevronDown /></i>
          </label>
          <label className="studio-select"><span>Animation áp dụng</span>
            <i><select defaultValue="choose" aria-label="Animation áp dụng"><option value="choose">Chọn Bước (Step)</option></select><IconChevronDown /></i>
          </label>
        </section>

        <section className="studio-prop-block">
          <h5>Cách hiển thị</h5>
          <label className="studio-select"><span>Bắt đầu từ bước</span>
            <i><select defaultValue="first" aria-label="Bắt đầu từ bước"><option value="first">Chọn bước</option></select><IconChevronDown /></i>
          </label>
        </section>
      </aside>
    </div>
  );
}
