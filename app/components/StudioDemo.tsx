'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createProceduralEnvironment, studioEnvironmentPalette } from '../lib/three/environment';

/**
 * YooStudio workspace.
 *
 * This is the product surface, so nothing here is a picture of an editor: the
 * viewport is the real `jellyfish.glb`, selection is a raycast against its three
 * meshes, the transform handles move the object they are attached to, the
 * material and effect sliders write straight into the live materials, and the
 * timeline drives the actual AnimationMixer. Layout and track colours follow the
 * shipped YooStudio UI (`reference-audit/design/figma.png`).
 */

type Tool = 'select' | 'move' | 'rotate' | 'scale' | 'annotate';
type TrackId = 'model' | 'text' | 'audio' | 'effect';

type Vector3Tuple = [number, number, number];

type TransformReadout = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

type Annotation = {
  id: string;
  label: string;
  target: string;
};

type ViewportApi = {
  setTool: (tool: Tool) => void;
  select: (name: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setTime: (time: number) => void;
  setOpacity: (value: number) => void;
  setGlow: (value: number) => void;
  setAnnotationsVisible: (visible: boolean) => void;
  removeAnnotation: (id: string) => void;
  bindAnnotationElement: (id: string, element: HTMLElement | null) => void;
  frameSelection: () => void;
};

const LAYERS: { name: string; label: string; note: string }[] = [
  { name: 'JF_skin_out', label: 'Màng ngoài', note: 'Lớp keo trong suốt' },
  { name: 'JF_skin_in', label: 'Tầng mô giữa', note: 'Cơ co bóp' },
  { name: 'JF_heart', label: 'Khoang tiêu hoá', note: 'Lõi bên trong' },
];

const TRACKS: { id: TrackId; label: string; color: string; start: number; length: number }[] = [
  { id: 'model', label: 'Model', color: '#A852FC', start: 0, length: 1 },
  { id: 'text', label: 'Văn bản', color: '#2B7FFF', start: 0.06, length: 0.62 },
  { id: 'audio', label: 'Âm thanh', color: '#00C950', start: 0.12, length: 0.5 },
  { id: 'effect', label: 'Hiệu ứng', color: '#F6339A', start: 0.3, length: 0.66 },
];

const MODULES: { id: string; label: string; glyph: string }[] = [
  { id: 'space', label: 'Không gian', glyph: '◫' },
  { id: 'step', label: 'Bước', glyph: '⌘' },
  { id: 'model', label: 'Mô hình', glyph: '◇' },
  { id: 'text', label: 'Văn bản', glyph: 'T' },
  { id: 'audio', label: 'Âm thanh', glyph: '♪' },
  { id: 'media', label: 'Media', glyph: '▣' },
  { id: 'hotspot', label: 'Hotspot', glyph: '✥' },
  { id: 'effect', label: 'Hiệu ứng', glyph: '✧' },
  { id: 'quiz', label: 'Tạo Quiz', glyph: '?' },
];

const labelFor = (name: string) => LAYERS.find((layer) => layer.name === name)?.label ?? name;

function formatTime(seconds: number) {
  const whole = Math.max(0, seconds);
  const mm = Math.floor(whole / 60);
  const ss = Math.floor(whole % 60);
  const cs = Math.floor((whole % 1) * 100);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function StudioDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewportApi | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [activeModule, setActiveModule] = useState('model');
  const [selected, setSelected] = useState<string | null>('JF_skin_out');
  const [transform, setTransform] = useState<TransformReadout>({
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
  });
  const [opacity, setOpacity] = useState(80);
  const [glow, setGlow] = useState(45);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(4.25);
  const [track, setTrack] = useState<TrackId>('model');

  const annotationCounter = useRef(0);

  /* ------------------------------------------------------------------ scene --- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    // A light viewport. The editor chrome around it is light now, and a
    // near-black stage inside a white panel reads as a hole punched in the page.
    scene.background = new THREE.Color(0xedf1f8);
    scene.fog = new THREE.Fog(0xedf1f8, 10, 24);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    host.insertBefore(renderer.domElement, host.firstChild);

    const environment = createProceduralEnvironment(renderer, studioEnvironmentPalette);
    scene.environment = environment.texture;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d4e6, 1.6));
    const keyLight = new THREE.DirectionalLight(0xfff6fb, 2.1);
    keyLight.position.set(-3.2, 4.4, 4.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9fe9ff, 1.1);
    rimLight.position.set(3.6, -0.8, -3.4);
    scene.add(rimLight);
    const accentLight = new THREE.PointLight(0x00aaab, 6, 16, 2);
    accentLight.position.set(2.4, 1.4, 2.6);
    scene.add(accentLight);

    // Ground grid, matching the shipped viewport's perspective floor. Dark
    // lines on a light floor, which is how the real editor draws it.
    const grid = new THREE.GridHelper(26, 26, 0x00aaab, 0x9aa6bd);
    grid.position.y = -1.6;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.34;
      material.depthWrite = false;
    }
    scene.add(grid);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    /* ------------------------------------------------------------- gizmo --- */
    const gizmo = new THREE.Group();
    gizmo.visible = false;
    gizmo.renderOrder = 20;
    scene.add(gizmo);
    const axisColors = [0xff5f7a, 0x63e08a, 0x53b9ff];
    const axisVectors = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    const handles: THREE.Mesh[] = [];
    for (let index = 0; index < 3; index += 1) {
      const handle = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({
        color: axisColors[index],
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8), material);
      shaft.position.y = 0.31;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 10), material);
      tip.position.y = 0.68;
      // Invisible fat cylinder so the handle is comfortable to grab.
      const picker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      picker.position.y = 0.4;
      picker.userData.axis = index;
      handle.add(shaft, tip, picker);
      if (index === 0) handle.rotation.z = -Math.PI / 2;
      if (index === 2) handle.rotation.x = Math.PI / 2;
      handle.renderOrder = 20;
      gizmo.add(handle);
      handles.push(picker);
      shaft.renderOrder = 20;
      tip.renderOrder = 20;
    }

    const selectionBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x00d0d1));
    (selectionBox.material as THREE.LineBasicMaterial).transparent = true;
    (selectionBox.material as THREE.LineBasicMaterial).opacity = 0.62;
    selectionBox.visible = false;
    scene.add(selectionBox);

    /* ------------------------------------------------------------- model --- */
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const meshes = new Map<string, THREE.Mesh>();
    const baseOpacity = new Map<string, number>();
    let mixer: THREE.AnimationMixer | undefined;
    let action: THREE.AnimationAction | undefined;
    let clipDuration = 4.25;

    const annotationPoints = new Map<string, { local: THREE.Vector3; host: THREE.Object3D }>();
    const annotationElements = new Map<string, HTMLElement>();
    let annotationsShown = true;

    let currentTool: Tool = 'select';
    let currentSelection: string | null = null;
    let opacityValue = 0.8;
    let glowValue = 0.45;

    let orbitYaw = 0.62;
    let orbitPitch = 0.2;
    let orbitRadius = 6.4;
    const orbitTarget = new THREE.Vector3(0, 0, 0);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    const dragStart = new THREE.Vector3();
    const objectStartPosition = new THREE.Vector3();
    const objectStartScale = new THREE.Vector3();
    const objectStartQuaternion = new THREE.Quaternion();
    let dragAxis = -1;
    let dragging = false;
    let orbiting = false;
    let pointerPrevious = { x: 0, y: 0 };
    let transformSignalTimer = 0;

    const emitTransform = () => {
      const target = currentSelection ? meshes.get(currentSelection) : undefined;
      if (!target) return;
      setTransform({
        position: [target.position.x, target.position.y, target.position.z],
        rotation: [
          THREE.MathUtils.radToDeg(target.rotation.x),
          THREE.MathUtils.radToDeg(target.rotation.y),
          THREE.MathUtils.radToDeg(target.rotation.z),
        ],
        scale: [target.scale.x, target.scale.y, target.scale.z],
      });
    };

    const applySelection = (name: string | null) => {
      currentSelection = name;
      const target = name ? meshes.get(name) : undefined;
      gizmo.visible = Boolean(target) && currentTool !== 'select' && currentTool !== 'annotate';
      selectionBox.visible = Boolean(target);
      if (target) emitTransform();
    };

    const applyOpacity = () => {
      const target = currentSelection ? meshes.get(currentSelection) : undefined;
      if (!target) return;
      const material = target.material as THREE.MeshPhysicalMaterial;
      const base = baseOpacity.get(currentSelection ?? '') ?? 1;
      material.opacity = base * opacityValue;
      material.transparent = true;
      material.needsUpdate = false;
    };

    const applyGlow = () => {
      accentLight.intensity = 3 + glowValue * 22;
      rimLight.intensity = 0.6 + glowValue * 2.4;
      for (const mesh of meshes.values()) {
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        material.emissiveIntensity = 0.1 + glowValue * 0.8;
      }
    };

    loader.loadAsync('/asset/fish/jellyfish.glb').then((gltf) => {
      if (disposed) return;
      const visual = gltf.scene;
      visual.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        const source = mesh.material as THREE.MeshStandardMaterial;
        const physical = new THREE.MeshPhysicalMaterial({
          name: source.name,
          map: source.map,
          emissive: new THREE.Color(source.name === 'JF_heart' ? 0x3a2280 : 0x7a5ce6),
          emissiveMap: source.emissiveMap,
          emissiveIntensity: 0.45,
          roughnessMap: source.roughnessMap,
          metalnessMap: source.metalnessMap,
          color: source.name === 'JF_heart' ? 0x7d9aff : source.name === 'JF_skin_in' ? 0xaa9dff : 0xc0b2ff,
          roughness: 0.12,
          metalness: 0,
          transmission: 0.6,
          thickness: 0.8,
          ior: 1.32,
          attenuationColor: new THREE.Color(0x8d5cff),
          attenuationDistance: 2,
          iridescence: 0.7,
          iridescenceIOR: 1.3,
          clearcoat: 1,
          clearcoatRoughness: 0.09,
          sheen: 0.9,
          sheenColor: new THREE.Color(0xffc6ec),
          transparent: true,
          opacity: source.name === 'JF_skin_out' ? 0.72 : source.name === 'JF_skin_in' ? 0.86 : 1,
          depthWrite: source.name === 'JF_heart',
          envMapIntensity: 1,
          side: THREE.FrontSide,
        });
        mesh.material = physical;
        mesh.name = source.name || mesh.name;
        meshes.set(mesh.name, mesh);
        baseOpacity.set(mesh.name, physical.opacity);
        mesh.renderOrder = mesh.name === 'JF_heart' ? 1 : mesh.name === 'JF_skin_in' ? 2 : 3;
        source.dispose();
      });

      const bounds = new THREE.Box3().setFromObject(visual);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 3.1 / Math.max(size.x, size.y, size.z);
      visual.scale.setScalar(scale);
      visual.position.sub(center.multiplyScalar(scale));
      modelRoot.add(visual);

      if (gltf.animations[0]) {
        mixer = new THREE.AnimationMixer(visual);
        action = mixer.clipAction(gltf.animations[0]);
        action.play();
        clipDuration = gltf.animations[0].duration;
      }
      applySelection('JF_skin_out');
      applyOpacity();
      applyGlow();
      setDuration(clipDuration);
      setReady(true);
    }).catch((error) => {
      console.error('YooStudio viewport failed to load', error);
      if (!disposed) setFailed(true);
    });

    /* ------------------------------------------------------------ pointer --- */
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';

    const updateNdc = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const pickMesh = () => {
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects([...meshes.values()], false);
      return hits[0];
    };

    const onPointerDown = (event: PointerEvent) => {
      updateNdc(event);
      canvas.setPointerCapture(event.pointerId);
      pointerPrevious = { x: event.clientX, y: event.clientY };

      if (currentTool === 'annotate') {
        const hit = pickMesh();
        if (hit) {
          const local = hit.object.worldToLocal(hit.point.clone());
          annotationCounter.current += 1;
          const id = `note-${annotationCounter.current}`;
          annotationPoints.set(id, { local, host: hit.object });
          setAnnotations((current) => [
            ...current,
            { id, label: `Ghi chú ${current.length + 1}`, target: hit.object.name },
          ]);
          applySelection(hit.object.name);
          setSelected(hit.object.name);
        }
        return;
      }

      if (currentSelection && currentTool !== 'select') {
        raycaster.setFromCamera(pointerNdc, camera);
        const handleHits = raycaster.intersectObjects(handles, false);
        if (handleHits[0]) {
          const target = meshes.get(currentSelection);
          if (target) {
            dragAxis = handleHits[0].object.userData.axis as number;
            dragging = true;
            objectStartPosition.copy(target.position);
            objectStartScale.copy(target.scale);
            objectStartQuaternion.copy(target.quaternion);
            dragPlane.setFromNormalAndCoplanarPoint(
              camera.getWorldDirection(new THREE.Vector3()).negate(),
              gizmo.position,
            );
            raycaster.ray.intersectPlane(dragPlane, dragStart);
            return;
          }
        }
      }

      const hit = pickMesh();
      if (hit) {
        applySelection(hit.object.name);
        setSelected(hit.object.name);
        return;
      }
      orbiting = true;
      applySelection(null);
      setSelected(null);
    };

    const onPointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - pointerPrevious.x;
      const deltaY = event.clientY - pointerPrevious.y;
      pointerPrevious = { x: event.clientX, y: event.clientY };
      updateNdc(event);

      if (dragging && currentSelection) {
        const target = meshes.get(currentSelection);
        if (!target) return;
        const axis = axisVectors[dragAxis];
        if (currentTool === 'move') {
          raycaster.setFromCamera(pointerNdc, camera);
          if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
            const travel = dragPoint.clone().sub(dragStart).dot(axis);
            target.position.copy(objectStartPosition).addScaledVector(axis, travel);
          }
        } else if (currentTool === 'rotate') {
          const amount = (deltaX + deltaY) * 0.01;
          target.quaternion.copy(objectStartQuaternion);
          objectStartQuaternion.copy(target.quaternion);
          target.rotateOnAxis(axis, amount);
        } else if (currentTool === 'scale') {
          const amount = 1 + (deltaX - deltaY) * 0.006;
          const next = objectStartScale.clone();
          next.setComponent(dragAxis, Math.max(0.15, next.getComponent(dragAxis) * amount));
          objectStartScale.copy(next);
          target.scale.copy(next);
        }
        return;
      }

      if (orbiting || event.buttons === 1) {
        orbitYaw -= deltaX * 0.006;
        orbitPitch = THREE.MathUtils.clamp(orbitPitch + deltaY * 0.004, -0.55, 1.05);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      dragging = false;
      orbiting = false;
      dragAxis = -1;
      emitTransform();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbitRadius = THREE.MathUtils.clamp(orbitRadius + event.deltaY * 0.0045, 3.2, 12);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    /* ------------------------------------------------------------- resize --- */
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

    let visible = true;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => { visible = entry?.isIntersecting ?? true; },
      { rootMargin: '160px 0px' },
    );
    visibilityObserver.observe(host);
    let documentVisible = document.visibilityState !== 'hidden';
    const onDocumentVisibility = () => { documentVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onDocumentVisibility);

    /* --------------------------------------------------------------- loop --- */
    let playingNow = true;
    let requestedTime: number | null = null;
    const projected = new THREE.Vector3();
    const timer = new THREE.Timer();

    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!visible || !documentVisible) return;

      camera.position.set(
        orbitTarget.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitRadius,
        orbitTarget.y + Math.sin(orbitPitch) * orbitRadius,
        orbitTarget.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitRadius,
      );
      camera.lookAt(orbitTarget);

      if (mixer) {
        if (requestedTime !== null) {
          mixer.setTime(requestedTime);
          requestedTime = null;
        } else if (playingNow && !reduceMotion) {
          mixer.update(delta);
        }
        transformSignalTimer += delta;
        if (transformSignalTimer > 0.1) {
          transformSignalTimer = 0;
          setTime(action ? action.time : 0);
        }
      }

      const target = currentSelection ? meshes.get(currentSelection) : undefined;
      if (target) {
        target.updateWorldMatrix(true, false);
        const worldPosition = new THREE.Vector3().setFromMatrixPosition(target.matrixWorld);
        gizmo.position.copy(worldPosition);
        const gizmoScale = camera.position.distanceTo(worldPosition) * 0.26;
        gizmo.scale.setScalar(gizmoScale);
        selectionBox.box.setFromObject(target);
        selectionBox.updateMatrixWorld(true);
      }

      if (annotationPoints.size) {
        const rect = renderer.domElement.getBoundingClientRect();
        for (const [id, point] of annotationPoints) {
          const element = annotationElements.get(id);
          if (!element) continue;
          if (!annotationsShown) {
            element.style.opacity = '0';
            continue;
          }
          projected.copy(point.local);
          point.host.updateWorldMatrix(true, false);
          projected.applyMatrix4(point.host.matrixWorld).project(camera);
          const x = (projected.x * 0.5 + 0.5) * rect.width;
          const y = (-projected.y * 0.5 + 0.5) * rect.height;
          element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          element.style.opacity = projected.z > 1 ? '0' : '1';
        }
      }

      renderer.render(scene, camera);
    });

    apiRef.current = {
      setTool: (next) => {
        currentTool = next;
        gizmo.visible = Boolean(currentSelection) && next !== 'select' && next !== 'annotate';
        canvas.style.cursor = next === 'annotate' ? 'crosshair' : next === 'select' ? 'default' : 'move';
      },
      select: (name) => { applySelection(name); },
      setPlaying: (value) => { playingNow = value; },
      setTime: (value) => { requestedTime = value; },
      setOpacity: (value) => { opacityValue = value; applyOpacity(); },
      setGlow: (value) => { glowValue = value; applyGlow(); },
      setAnnotationsVisible: (value) => { annotationsShown = value; },
      removeAnnotation: (id) => {
        annotationPoints.delete(id);
        const element = annotationElements.get(id);
        if (element) element.style.opacity = '0';
        annotationElements.delete(id);
      },
      bindAnnotationElement: (id, element) => {
        if (element) annotationElements.set(id, element);
        else annotationElements.delete(id);
      },
      frameSelection: () => {
        orbitYaw = 0.62;
        orbitPitch = 0.2;
        orbitRadius = 6.4;
      },
    };

    return () => {
      disposed = true;
      apiRef.current = null;
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onDocumentVisibility);
      mixer?.stopAllAction();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh || (child as THREE.Line).isLine) {
          if (mesh.geometry) geometries.add(mesh.geometry);
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of list) if (material) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  /* ------------------------------------------------------- state -> engine --- */
  useEffect(() => { apiRef.current?.setTool(tool); }, [tool]);
  useEffect(() => { apiRef.current?.select(selected); }, [selected]);
  useEffect(() => { apiRef.current?.setPlaying(playing); }, [playing]);
  useEffect(() => { apiRef.current?.setOpacity(opacity / 100); }, [opacity]);
  useEffect(() => { apiRef.current?.setGlow(glow / 100); }, [glow]);
  useEffect(() => { apiRef.current?.setAnnotationsVisible(annotationsVisible); }, [annotationsVisible]);

  const scrub = useCallback((ratio: number) => {
    const next = THREE.MathUtils.clamp(ratio, 0, 1) * duration;
    setPlaying(false);
    setTime(next);
    apiRef.current?.setTime(next);
  }, [duration]);

  const trackPointer = useRef(false);
  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    trackPointer.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    scrub((event.clientX - rect.left) / rect.width);
  };
  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trackPointer.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    scrub((event.clientX - rect.left) / rect.width);
  };
  const onTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    trackPointer.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const removeAnnotation = (id: string) => {
    apiRef.current?.removeAnnotation(id);
    setAnnotations((current) => current.filter((item) => item.id !== id));
  };

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  const selectedLayer = useMemo(() => LAYERS.find((layer) => layer.name === selected), [selected]);

  return (
    <div className="studio" id="yoostudio">
      <div className="studio-topbar">
        <div className="studio-doc">
          <span className="studio-doc-mark" aria-hidden="true">Y</span>
          <b>Sinh học 6 · Cấu tạo con sứa</b>
          <small>Đã lưu</small>
        </div>
        <div className="studio-steps" role="group" aria-label="Không gian bài học">
          <button type="button" className="is-active">Space 1: Sứa</button>
          <button type="button">Space 2: Cấu tạo</button>
        </div>
        <div className="studio-actions">
          <button type="button" onClick={() => apiRef.current?.frameSelection()}>Đặt góc nhìn</button>
          <button type="button" className="is-primary">Xem trước</button>
        </div>
      </div>

      <div className="studio-body">
        <aside className="studio-rail" aria-label="Bộ công cụ YooStudio">
          {MODULES.map((module) => (
            <button
              type="button"
              key={module.id}
              className={activeModule === module.id ? 'is-active' : ''}
              aria-pressed={activeModule === module.id}
              onClick={() => {
                setActiveModule(module.id);
                if (module.id === 'text') setTool('annotate');
                else if (module.id === 'model') setTool('move');
                else if (module.id === 'hotspot') setTool('annotate');
                else setTool('select');
              }}
            >
              <span aria-hidden="true">{module.glyph}</span>
              {module.label}
            </button>
          ))}
        </aside>

        <div className="studio-tree">
          <div className="studio-panel-label"><span>Đối tượng</span><b>{annotations.length ? `${annotations.length} ghi chú` : '3 lớp'}</b></div>
          <button
            type="button"
            className={`studio-tree-row studio-tree-row--group${selected === null ? ' is-selected' : ''}`}
            onClick={() => setSelected(null)}
          >
            <i className="studio-swatch studio-swatch--group" />Jellyfish_group
          </button>
          {LAYERS.map((layer) => (
            <button
              type="button"
              key={layer.name}
              className={`studio-tree-row${selected === layer.name ? ' is-selected' : ''}`}
              onClick={() => setSelected(layer.name)}
            >
              <i className="studio-swatch" />
              <span>{layer.label}<small>{layer.note}</small></span>
            </button>
          ))}
          {annotations.map((item) => (
            <div className="studio-tree-row studio-tree-row--note" key={item.id}>
              <i className="studio-swatch studio-swatch--note" />
              <span>{item.label}<small>{labelFor(item.target)}</small></span>
              <button type="button" onClick={() => removeAnnotation(item.id)} aria-label={`Xoá ${item.label}`}>×</button>
            </div>
          ))}
        </div>

        <div className="studio-viewport">
          <div className="studio-viewport-bar">
            <div className="studio-tools" role="group" aria-label="Công cụ biến đổi">
              {([
                ['select', 'Chọn', '➤'],
                ['move', 'Di chuyển', '✥'],
                ['rotate', 'Xoay', '⟳'],
                ['scale', 'Tỷ lệ', '⤢'],
                ['annotate', 'Ghi chú', '＋'],
              ] as const).map(([id, label, glyph]) => (
                <button
                  type="button"
                  key={id}
                  className={tool === id ? 'is-active' : ''}
                  aria-pressed={tool === id}
                  title={label}
                  onClick={() => setTool(id)}
                >
                  <span aria-hidden="true">{glyph}</span>{label}
                </button>
              ))}
            </div>
            <div className="studio-viewport-meta">
              <span>Phối cảnh</span>
              <span>{selectedLayer ? selectedLayer.label : 'Toàn bộ mô hình'}</span>
            </div>
          </div>

          <div className="studio-canvas" ref={hostRef}>
            {annotations.map((item) => (
              <div
                className="studio-annotation"
                key={item.id}
                ref={(element) => { apiRef.current?.bindAnnotationElement(item.id, element); }}
              >
                <i />
                <b>{item.label}</b>
                <small>{labelFor(item.target)}</small>
              </div>
            ))}
            {!ready && !failed && <div className="studio-loader"><i />Đang mở không gian 3D…</div>}
            {failed && <div className="studio-loader studio-loader--error">Không tải được mô hình 3D.</div>}
          </div>

          <p className="studio-hint">
            {tool === 'annotate'
              ? 'Nhấp lên mô hình để đặt ghi chú.'
              : tool === 'select'
                ? 'Nhấp để chọn một lớp, kéo nền để xoay, cuộn để phóng.'
                : 'Kéo mũi neo màu để biến đổi lớp đang chọn.'}
          </p>
        </div>

        <aside className="studio-properties">
          <div className="studio-panel-label"><span>Thuộc tính</span><b>{track === 'model' ? 'Model' : TRACKS.find((item) => item.id === track)?.label}</b></div>

          {track === 'model' && (
            <>
              <h4>{selectedLayer ? selectedLayer.label : 'Chưa chọn lớp'}</h4>
              <small>{selectedLayer ? selectedLayer.note : 'Nhấp vào mô hình trong khung 3D'}</small>
              <div className="studio-group">
                <b>Chuyển đổi tỷ lệ</b>
                <div className="studio-vector">
                  <span>Vị trí</span>
                  {transform.position.map((value, index) => (
                    <i key={`p${index}`}>{value.toFixed(2)}</i>
                  ))}
                </div>
                <div className="studio-vector">
                  <span>Xoay</span>
                  {transform.rotation.map((value, index) => (
                    <i key={`r${index}`}>{value.toFixed(0)}°</i>
                  ))}
                </div>
                <div className="studio-vector">
                  <span>Tỷ lệ</span>
                  {transform.scale.map((value, index) => (
                    <i key={`s${index}`}>{value.toFixed(2)}</i>
                  ))}
                </div>
              </div>
              <div className="studio-group">
                <b>Vật liệu</b>
                <label className="studio-slider">
                  Độ trong <span>{opacity}%</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={opacity}
                    onChange={(event) => setOpacity(Number(event.target.value))}
                    disabled={!selectedLayer}
                    aria-label="Độ trong của lớp đang chọn"
                  />
                </label>
              </div>
            </>
          )}

          {track === 'text' && (
            <>
              <h4>Ghi chú trên mô hình</h4>
              <small>{annotations.length ? `${annotations.length} ghi chú đang gắn` : 'Chưa có ghi chú nào'}</small>
              <div className="studio-group">
                <b>Hiển thị</b>
                <label className="studio-toggle">
                  <input
                    type="checkbox"
                    checked={annotationsVisible}
                    onChange={(event) => setAnnotationsVisible(event.target.checked)}
                  />
                  Hiện ghi chú trong khung 3D
                </label>
                <button type="button" className="studio-inline-button" onClick={() => setTool('annotate')}>
                  Thêm ghi chú mới
                </button>
              </div>
            </>
          )}

          {track === 'audio' && (
            <>
              <h4>Âm thanh</h4>
              <small>Bản demo này chưa kèm tệp âm thanh.</small>
              <div className="studio-group is-empty">
                <b>Nguồn</b>
                <p>Trong YooStudio, lớp âm thanh nhận tệp thu sẵn hoặc thuyết minh trực tiếp.</p>
              </div>
            </>
          )}

          {track === 'effect' && (
            <>
              <h4>Hiệu ứng ánh sáng</h4>
              <small>Điều chỉnh ngay trên khung 3D bên cạnh.</small>
              <div className="studio-group">
                <b>Cường độ</b>
                <label className="studio-slider">
                  Ánh sáng nhấn <span>{glow}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={glow}
                    onChange={(event) => setGlow(Number(event.target.value))}
                    aria-label="Cường độ ánh sáng nhấn"
                  />
                </label>
              </div>
            </>
          )}
        </aside>
      </div>

      <div className="studio-timeline">
        <div className="studio-timeline-head">
          <button
            type="button"
            className="studio-play"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? 'Tạm dừng' : 'Phát'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <b>{formatTime(time)}</b>
          <small>/ {formatTime(duration)}</small>
        </div>
        <div className="studio-timeline-tracks">
          {TRACKS.map((item) => (
            <div className={`studio-track${track === item.id ? ' is-active' : ''}`} key={item.id}>
              <button type="button" className="studio-track-name" onClick={() => setTrack(item.id)}>
                <i style={{ background: item.color }} />{item.label}
              </button>
              <div
                className="studio-track-lane"
                onPointerDown={onTrackPointerDown}
                onPointerMove={onTrackPointerMove}
                onPointerUp={onTrackPointerUp}
                onPointerCancel={onTrackPointerUp}
              >
                <span
                  className="studio-clip"
                  style={{
                    background: item.color,
                    left: `${item.start * 100}%`,
                    width: `${item.length * 100}%`,
                  }}
                >
                  {item.label}
                </span>
                <i className="studio-playhead" style={{ left: `${progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
