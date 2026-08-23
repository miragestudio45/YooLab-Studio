'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createProceduralEnvironment } from '../../lib/three/environment';
import { libraryEnvironmentPalette } from '../../lib/three/libraryEnvironment';
import type { ModelFraming, ModelPreset } from '../../lib/library/types';

/**
 * The Library's centre viewer for a real GLB.
 *
 * One WebGL context, created when the stage first comes near the viewport and
 * torn down on unmount, so switching specimens re-uses the context instead of
 * leaking one per asset. Everything the workspace needs from a 3D viewer is
 * here and nothing else: drag to orbit, wheel to zoom, a slow idle turn when
 * untouched, and a hard pause when the canvas is off screen or the tab is
 * hidden — a Library with five specimens must not run five render loops.
 *
 * The presets are the same optical vocabulary the rest of the site uses, so a
 * specimen looks like itself whether it is in the hero, a thumbnail or here.
 */

type ModelStageProps = {
  url: string;
  preset: ModelPreset;
  framing?: ModelFraming;
  /** Announced to screen readers, since the canvas itself is decorative. */
  label: string;
};

type PresetSpec = {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  ior?: number;
  iridescence?: number;
  clearcoat?: number;
  sheen?: number;
  sheenColor?: number;
  /** Keep the glTF's own materials and only calibrate them. */
  keepOriginal?: boolean;
};

const PRESETS: Record<ModelPreset, PresetSpec> = {
  ruby: {
    color: 0x8c1226, emissive: 0x2c0008, emissiveIntensity: 0.3, roughness: 0.13,
    metalness: 0, ior: 1.74, iridescence: 0.38, clearcoat: 1, sheen: 0.5, sheenColor: 0xffb257,
  },
  opal: {
    color: 0x9d86f0, emissive: 0x3c2a8a, emissiveIntensity: 0.28, roughness: 0.14,
    metalness: 0, ior: 1.34, iridescence: 0.9, clearcoat: 1, sheen: 0.7, sheenColor: 0xffc6ec,
  },
  /* Soft biological tissue: matte, warm, slightly translucent at the edges.
     This is what the bacterial wall model needs — it arrives with no materials
     at all, and a glassy preset on a scientific mesh reads as a trinket. */
  tissue: {
    color: 0xe9a08a, emissive: 0x3a0f08, emissiveIntensity: 0.06, roughness: 0.62,
    metalness: 0, ior: 1.4, iridescence: 0, clearcoat: 0.18, sheen: 0.4, sheenColor: 0xffd8c4,
  },
  plastic: {
    color: 0xe7dccb, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.44,
    metalness: 0.04, ior: 1.5, iridescence: 0, clearcoat: 0.3, sheen: 0.2, sheenColor: 0xffffff,
  },
  natural: { keepOriginal: true },
};

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function applyPreset(root: THREE.Object3D, preset: ModelPreset) {
  const spec = PRESETS[preset];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (spec.keepOriginal) {
      for (const item of list) {
        const material = item as THREE.MeshStandardMaterial;
        if (!material) continue;
        material.envMapIntensity = 0.9;
        material.roughness = Math.max(material.roughness ?? 0.5, 0.34);
        if (material.emissive) material.emissiveIntensity = Math.min(material.emissiveIntensity ?? 0, 0.25);
        material.needsUpdate = true;
      }
      return;
    }
    const source = list[0] as THREE.MeshStandardMaterial | undefined;
    const physical = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      map: source?.map ?? null,
      normalMap: source?.normalMap ?? null,
      emissive: new THREE.Color(spec.emissive ?? 0x000000),
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      roughness: spec.roughness ?? 0.4,
      metalness: spec.metalness ?? 0,
      ior: spec.ior ?? 1.5,
      iridescence: spec.iridescence ?? 0,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [180, 720],
      clearcoat: spec.clearcoat ?? 0,
      clearcoatRoughness: 0.12,
      sheen: spec.sheen ?? 0,
      sheenColor: new THREE.Color(spec.sheenColor ?? 0xffffff),
      sheenRoughness: 0.4,
      specularIntensity: 1,
      envMapIntensity: 1.1,
      side: THREE.FrontSide,
    });
    mesh.material = physical;
    for (const item of list) item?.dispose?.();
  });
}

export function ModelStage({ url, preset, framing, label }: ModelStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  // Latest framing without restarting the scene: switching specimens replaces
  // the whole effect anyway, and a new object identity for an unchanged framing
  // must not tear down the context. Seeded at mount and then kept in an effect,
  // because writing a ref during render is not allowed.
  const framingRef = useRef(framing);
  useEffect(() => { framingRef.current = framing; }, [framing]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    setState('loading');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = window.matchMedia('(max-width: 900px)').matches;
    const shot = framingRef.current ?? {};

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: !compact, alpha: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    let pixelRatio = Math.min(window.devicePixelRatio, compact ? 1.4 : 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'model-stage-canvas';
    host.appendChild(renderer.domElement);

    const environment = createProceduralEnvironment(renderer, libraryEnvironmentPalette);
    scene.environment = environment.texture;

    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xe4d5c4, 1.25));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.5);
    key.position.set(-3.2, 4.4, 5.0);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9c6, 1.5);
    rim.position.set(4.0, -0.6, -4.0);
    scene.add(rim);
    const fill = new THREE.PointLight(0xe4d9f6, 5, 18, 2);
    fill.position.set(2.4, 1.6, 3.0);
    scene.add(fill);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const draco = new DRACOLoader();
    draco.setDecoderPath('/asset/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);

    let mixer: THREE.AnimationMixer | undefined;
    let distance = 6;
    let yaw = shot.yaw ?? 0.7;
    let pitch = shot.pitch ?? 0.2;
    let yawTarget = yaw;
    let pitchTarget = pitch;
    let distanceTarget = distance;
    let interacted = false;
    const aim = new THREE.Vector3();

    void loader
      .loadAsync(url)
      .then((gltf) => {
        if (disposed) return;
        const visual = gltf.scene;
        applyPreset(visual, preset);
        pivot.add(visual);
        visual.updateMatrixWorld(true);

        if (gltf.animations[0]) {
          mixer = new THREE.AnimationMixer(visual);
          mixer.clipAction(gltf.animations[0]).play();
          // A held pose for still specimens, a running clip for the animated
          // ones. Baking the pose first also fixes the framing: a T-posed bee
          // has a very different bounding box from a flying one.
          mixer.update(shot.poseTime ?? (shot.animate ? 0.6 : 0.4));
        }

        visual.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(visual);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        aim.copy(sphere.center);
        if (shot.targetY !== undefined) {
          aim.y = bounds.min.y + (bounds.max.y - bounds.min.y) * shot.targetY;
        }
        // Re-centre on the aim so orbiting turns around the interesting part
        // rather than around the centroid of a long tail of tentacles.
        visual.position.sub(aim);
        distance = (sphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) * (shot.zoom ?? 1.15);
        distanceTarget = distance;
        setState('ready');
      })
      .catch((error) => {
        console.error('Library model failed to load', url, error);
        if (!disposed) setState('failed');
      });

    /* ------------------------------------------------------------ input --- */
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      interacted = true;
      lastX = event.clientX;
      lastY = event.clientY;
      host.setPointerCapture(event.pointerId);
      host.dataset.grabbing = 'true';
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      yawTarget -= (event.clientX - lastX) * 0.008;
      pitchTarget = THREE.MathUtils.clamp(pitchTarget + (event.clientY - lastY) * 0.006, -1.2, 1.2);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const endDrag = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      delete host.dataset.grabbing;
    };
    const onWheel = (event: WheelEvent) => {
      // Only claims the wheel once the pointer is over the stage *and* the
      // gesture is clearly a zoom, so the page still scrolls past the viewer.
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      interacted = true;
      distanceTarget = THREE.MathUtils.clamp(distanceTarget * (1 + event.deltaY * 0.0012), distance * 0.45, distance * 2.4);
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('wheel', onWheel, { passive: false });

    /* ----------------------------------------------------------- resize --- */
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

    /* ------------------------------------------------- visibility gating --- */
    let onScreen = true;
    const visibility = new IntersectionObserver(
      ([entry]) => { onScreen = entry?.isIntersecting ?? true; },
      { rootMargin: '160px 0px' },
    );
    visibility.observe(host);
    let tabVisible = document.visibilityState !== 'hidden';
    const onVisibility = () => { tabVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    /* ------------------------------------------------------------- loop --- */
    const timer = new THREE.Timer();
    let slowFrames = 0;
    let downscaled = false;
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!onScreen || !tabVisible) return;
      // Idle turn, abandoned the moment the visitor takes over.
      if (!interacted && !reduceMotion) yawTarget += delta * 0.16;
      const ease = 1 - Math.pow(0.002, delta);
      yaw += (yawTarget - yaw) * ease;
      pitch += (pitchTarget - pitch) * ease;
      const currentDistance = THREE.MathUtils.lerp(camera.position.length() || distanceTarget, distanceTarget, ease);
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * currentDistance,
        Math.sin(pitch) * currentDistance,
        Math.cos(yaw) * Math.cos(pitch) * currentDistance,
      );
      camera.lookAt(0, 0, 0);
      if (mixer && shot.animate && !reduceMotion) mixer.update(delta);
      renderer.render(scene, camera);

      if (!downscaled) {
        slowFrames = delta > 0.028 ? slowFrames + 1 : 0;
        if (slowFrames > 40) {
          downscaled = true;
          pixelRatio = Math.max(0.85, pixelRatio - 0.35);
          renderer.setPixelRatio(pixelRatio);
          resize();
        }
      }
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      visibility.disconnect();
      mixer?.stopAllAction();
      disposeTree(pivot);
      environment.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, preset]);

  return (
    <div className="model-stage" ref={hostRef} role="img" aria-label={label}>
      {state !== 'ready' && (
        <p className={`model-stage-status${state === 'failed' ? ' is-error' : ''}`}>
          {state === 'failed' ? 'Không tải được mô hình 3D.' : 'Đang tải mô hình…'}
        </p>
      )}
      {state === 'ready' && <p className="model-stage-hint">Kéo để xoay · Cuộn để phóng</p>}
    </div>
  );
}
