'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createCarLoaders,
  createCarMaterials,
  disposeScene,
  loadCarTextures,
  prepareCarVisual,
} from '../lib/formula/carRuntime';
import { createProceduralEnvironment, studioEnvironmentPalette } from '../lib/three/environment';

/**
 * Live Formula preview for the library card.
 *
 * The card shows the real `formulaCar.glb` in its assembled pose with the same
 * material set and the same tobacco-neutralised body texture as the full
 * experience — no CSS stand-in. The context is created only once the card is on
 * screen, renders at a capped pixel ratio, pauses the moment it scrolls away,
 * and warms the exact assets the full-screen experience will need. Devices that
 * ask for reduced data, and viewports too small to justify the download, get the
 * pre-rendered poster instead.
 */

const POSTER = '/asset/Library/Car/formula-preview.jpg';

export function FormulaPreview({ onOpen }: { onOpen: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'live' | 'poster'>('idle');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cleanup: (() => void) | undefined;
    let started = false;

    const isLightweight = () => {
      const connection = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
      return Boolean(connection?.saveData) || window.innerWidth < 700;
    };

    const start = () => {
      if (started) return;
      started = true;
      // Reduced-data clients and viewports too small to justify a ~4 MB model
      // download keep the pre-rendered poster.
      if (isLightweight()) {
        setState('poster');
        return;
      }
      setState('loading');

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      host.insertBefore(renderer.domElement, host.firstChild);
      renderer.domElement.className = 'formula-preview-canvas';

      const environment = createProceduralEnvironment(renderer, studioEnvironmentPalette);
      scene.environment = environment.texture;

      // Light stage. The card behind this canvas is white now, so the two
      // saturated rim lights that used to carve the car out of a black frame
      // just read as neon; they are kept only as a faint cool/warm separation.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dcea, 2.0));
      const key = new THREE.DirectionalLight(0xfff6ee, 3.4);
      key.position.set(-4, 5.5, 5);
      scene.add(key);
      const rim = new THREE.PointLight(0x9fe6ff, 9, 16, 2);
      rim.position.set(3.6, 1.6, -2.6);
      scene.add(rim);
      const warm = new THREE.PointLight(0xffb0cf, 6, 14, 2);
      warm.position.set(-3.2, 0.8, 2.4);
      scene.add(warm);

      const world = new THREE.Group();
      scene.add(world);
      const carRoot = new THREE.Group();
      world.add(carRoot);

      const loaders = createCarLoaders(renderer);
      let disposed = false;
      let visible = true;
      let ready = false;

      void (async () => {
        try {
          const [gltf, textures] = await Promise.all([
            loaders.loadProtected('formulaCar.glb'),
            loadCarTextures(loaders),
          ]);
          if (disposed) return;
          const { materials } = createCarMaterials(textures, { initialKitProgress: 0, envMapIntensity: 0.8 });
          const carVisual = gltf.scene;
          const pieces = prepareCarVisual(carVisual, materials, 4.2);
          // Preview always shows the finished car.
          for (const piece of pieces) {
            piece.object.position.copy(piece.assembledPosition);
            piece.object.quaternion.copy(piece.assembledQuaternion);
          }
          carRoot.add(carVisual);
          carRoot.position.y = -0.15;
          ready = true;
          setState('live');
        } catch (error) {
          console.error('Formula preview failed to load', error);
          if (!disposed) setState('poster');
        }
      })();

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

      const visibilityObserver = new IntersectionObserver(
        ([entry]) => { visible = entry?.isIntersecting ?? true; },
        { rootMargin: '80px 0px' },
      );
      visibilityObserver.observe(host);
      let documentVisible = document.visibilityState !== 'hidden';
      const onDocumentVisibility = () => { documentVisible = document.visibilityState !== 'hidden'; };
      document.addEventListener('visibilitychange', onDocumentVisibility);

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const timer = new THREE.Timer();
      renderer.setAnimationLoop(() => {
        // Advanced before the visibility gate so a preview that scrolls back
        // into view resumes from where it was rather than jumping.
        timer.update();
        if (!visible || !documentVisible || !ready) return;
        // The camera sweeps a limited arc instead of spinning the car through a
        // full turn: a 360 spin passes through head-on and tail-on angles where
        // the silhouette reads as a jumble of parts.
        const time = reduceMotion ? 0 : timer.getElapsed();
        const azimuth = 2.24 + Math.sin(time * 0.17) * 0.42;
        const radius = 6.1;
        const elevation = 0.34 + Math.sin(time * 0.11) * 0.05;
        camera.position.set(
          Math.sin(azimuth) * Math.cos(elevation) * radius,
          Math.sin(elevation) * radius,
          Math.cos(azimuth) * Math.cos(elevation) * radius,
        );
        camera.lookAt(0, -0.08, 0);
        renderer.render(scene, camera);
      });

      cleanup = () => {
        disposed = true;
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange', onDocumentVisibility);
        disposeScene(world);
        environment.dispose();
        loaders.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    const trigger = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { start(); trigger.disconnect(); } },
      { rootMargin: '260px 0px' },
    );
    trigger.observe(host);

    return () => {
      trigger.disconnect();
      cleanup?.();
    };
  }, []);

  return (
    <div className="formula-preview" ref={hostRef}>
      <div className={`formula-preview-poster${state === 'live' ? ' is-hidden' : ''}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={POSTER} alt="" loading="lazy" decoding="async" />
      </div>
      {state === 'loading' && <span className="formula-preview-status">Đang tải mô hình…</span>}
      <button type="button" className="formula-preview-open" onClick={onOpen}>
        Mở trải nghiệm <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
