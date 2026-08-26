'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  createBeeCreature,
  createCreatureLoader,
  createFishCreature,
  createJellyfishCreature,
  loadBeeAssets,
  CREATURE_ASSETS,
  type CreatureHandle,
} from '../../lib/three/creatures';
import { createLibraryStage } from '../../lib/three/libraryEnvironment';
import { createOrbitRig, createSubjectFit, type OrbitRig, type SubjectFit } from '../../lib/three/framing';
import type { BeeMaterialSet } from '../../lib/three/beeOptics';
import type { CreatureId, ModelFraming } from '../../lib/library/types';

/**
 * The Library's viewer for the three hand-calibrated creatures.
 *
 * Same pipeline as the hero, different camera. The bee here is the bee there:
 * colourless refractive shell over a red inner body, screen-space refraction
 * with dispersion, thin-film wings, driven by the same `beeOptics` shaders and
 * the same mip-chained scene capture. Before this existed the Library rendered
 * the identical mesh through the generic GLB viewer with a solid ruby material
 * and opaque flat wings, which — on a page that also shows the hero — read as an
 * admission that the good version was a marketing render.
 *
 * Three things make it work that the generic viewer could not do:
 *
 *   1. an opaque canvas with a real in-scene backdrop, so the shell's screen
 *      capture has something in it to refract;
 *   2. the two-pass render (hide shell and wings, capture, restore, draw), with
 *      `uSceneResolution` and `uLightDir` refreshed every frame;
 *   3. an aspect-aware fit against the projected bounding box, so a long thin
 *      animal actually fills the panel instead of floating in a third of it.
 */

type CreatureStageProps = {
  creature: CreatureId;
  framing?: ModelFraming;
  /** Whether the stage begins its idle orbit. Defaults to the Library's on state. */
  initialSpin?: boolean;
  /** External lesson mode used by the bridge step controls. */
  mode?: CreatureStageMode;
  /** Controlled idle orbit for the bridge's 360° lesson. */
  autoSpin?: boolean;
  /** Controlled bee clip: 0 idle, 1 hover, 2 forward flight. */
  motionState?: number;
  /** Semantic region isolated by the bee shader; null keeps the whole model. */
  isolatedPart?: BeePartKey | null;
  /** The richer bridge room is opt-in; Library viewers keep their calibrated look. */
  appearance?: 'library' | 'bridge';
  /** A real world-space learning grid beneath the specimen. */
  floorGrid?: boolean;
  /** Lets the bridge toolbar toggle the real scene grid without rebuilding. */
  gridVisible?: boolean;
  /** Screen-space UI that needs the stage's projected anchor CSS variables. */
  children?: ReactNode;
  /** Announced to screen readers, since the canvas itself is decorative. */
  label: string;
};

export type CreatureStageMode = 'rotate' | 'structure' | 'motion' | 'annotation';
export type BeePartKey = 'head' | 'thorax' | 'wing' | 'abdomen';
type BeeAnchorKey = 'head' | 'thorax' | 'wing' | 'abdomen';

/* ------------------------------------------------------------------ icons --- */

/**
 * The control-rail glyph set, shared with `ModelStage`.
 *
 * It lives here rather than in a file of its own because the stage chrome is one
 * contract with two implementations, and both stages are in the same chunk: the
 * Library viewer imports them eagerly side by side, so there is nothing to gain
 * from splitting twenty lines of paths out.
 */
export type StageIconName = 'rotate' | 'zoomIn' | 'zoomOut' | 'reset' | 'rest' | 'hover' | 'fly' | 'spin';

const ICON_PATHS: Record<StageIconName, string> = {
  rotate: 'M13.2 8a5.2 5.2 0 1 1-1.7-3.85M13.4 1.9v3h-3',
  zoomIn: 'M7 2.7a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6M10.2 10.2 13.6 13.6M5.1 7h3.8M7 5.1v3.8',
  zoomOut: 'M7 2.7a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6M10.2 10.2 13.6 13.6M5.1 7h3.8',
  reset: 'M2.6 5.8V2.6h3.2M13.4 5.8V2.6h-3.2M2.6 10.2v3.2h3.2M13.4 10.2v3.2h-3.2M8 7v2M7 8h2',
  rest: 'M4.2 12.4h7.6M8 4.2v5.4M5.6 6.6 8 4.2l2.4 2.4',
  hover: 'M8 5.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4M8 1.9v2.2M6.7 3.1 8 1.8l1.3 1.3M8 14.1v-2.2M6.7 12.9 8 14.2l1.3-1.3',
  fly: 'M3.1 12.9 12.9 3.1M8.4 3.1h4.5v4.5',
  spin: 'M2.9 8a5.1 5.1 0 0 1 8.6-3.7M13.1 8a5.1 5.1 0 0 1-8.6 3.7M11.6 1.6v2.9h-2.9M4.4 14.4v-2.9h2.9',
};

export function StageIcon({ name }: { name: StageIconName }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={ICON_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** World size of the longest axis after normalisation — the hero's values, so
 *  the point-light falloff and the optical scale read identically. */
const CREATURE_SIZE: Record<CreatureId, number> = {
  bee: 3.42,
  fish: 3.15,
  jellyfish: 3.6,
};

/** Second line of the stage caption: what the render is actually doing. */
const CREATURE_NOTE: Record<CreatureId, string> = {
  bee: 'Vỏ thủy tinh · lõi đỏ · cánh giao thoa',
  fish: 'Vảy phản quang · vây bán trong suốt',
  jellyfish: 'Ba lớp màng truyền sáng',
};

/**
 * Clip order in `bee_fixed.glb`: 0 đứng yên, 1 bay tại chỗ, 2 bay đi.
 *
 * Short labels because they sit in a 50 px cell of the tool rail. "Bay tại chỗ"
 * wrapped to three lines there; the rail has an `aria-label` per button carrying
 * the full phrase, so nothing is lost to a screen reader.
 */
const FLIGHT_LABELS = ['Đứng yên', 'Tại chỗ', 'Bay đi'] as const;
const FLIGHT_TITLES = ['Đứng yên', 'Bay tại chỗ', 'Bay đi và ra khỏi khung'] as const;
const FLIGHT_ICONS = ['rest', 'hover', 'fly'] as const;
/** The specimen opens hovering: wings beating, body still, nothing leaving frame. */
const DEFAULT_FLIGHT = 1;

const gridVertex = /* glsl */ `
  varying vec2 vGridPosition;
  void main() {
    vGridPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gridFragment = /* glsl */ `
  precision highp float;
  varying vec2 vGridPosition;
  uniform vec3 uMinor;
  uniform vec3 uMajor;

  float gridLine(vec2 point, float spacing) {
    vec2 coordinate = point / spacing;
    vec2 width = max(fwidth(coordinate), vec2(0.0001));
    vec2 distanceToLine = abs(fract(coordinate - 0.5) - 0.5) / width;
    return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
  }

  void main() {
    float minor = gridLine(vGridPosition, 0.34);
    float major = gridLine(vGridPosition, 1.70);
    float fade = 1.0 - smoothstep(2.7, 4.55, length(vGridPosition));
    float alpha = max(minor * 0.16, major * 0.34) * fade;
    vec3 color = mix(uMinor, uMajor, major);
    gl_FragColor = vec4(color, alpha);
  }
`;

function createLearningGrid() {
  const geometry = new THREE.PlaneGeometry(9.2, 9.2);
  const material = new THREE.ShaderMaterial({
    name: 'yoolab_learning_grid',
    vertexShader: gridVertex,
    fragmentShader: gridFragment,
    uniforms: {
      uMinor: { value: new THREE.Color(0xbfa9d8) },
      uMajor: { value: new THREE.Color(0xe18f83) },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'yoolab_learning_grid';
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -940;
  mesh.frustumCulled = false;

  return {
    mesh,
    fit: (box: THREE.Box3) => {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      mesh.position.set(center.x, box.min.y - Math.max(0.06, size.y * 0.12), center.z);
    },
    dispose: () => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

export function CreatureStage({
  creature,
  framing,
  initialSpin = true,
  mode,
  autoSpin = true,
  motionState = DEFAULT_FLIGHT,
  isolatedPart = null,
  appearance = 'library',
  floorGrid = false,
  gridVisible = true,
  children,
  label,
}: CreatureStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitRig | null>(null);
  const flightRef = useRef<((next: number) => void) | null>(null);
  const opticsRef = useRef<BeeMaterialSet | null>(null);
  const learningGridRef = useRef<ReturnType<typeof createLearningGrid> | null>(null);
  const isolatedPartRef = useRef<BeePartKey | null>(isolatedPart);
  const gridVisibleRef = useRef(gridVisible);
  const canSpinRef = useRef(true);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [spinning, setSpinning] = useState(false);
  const [flight, setFlight] = useState(DEFAULT_FLIGHT);
  const [flightCount, setFlightCount] = useState(0);
  // Latest framing without restarting the scene: a new object identity for an
  // unchanged framing must not tear down the WebGL context. Seeded at mount and
  // then kept in an effect, because writing a ref during render is not allowed.
  const framingRef = useRef(framing);
  useEffect(() => { framingRef.current = framing; }, [framing]);
  useEffect(() => {
    isolatedPartRef.current = isolatedPart;
    const partIndex: Record<BeePartKey, number> = { head: 0, thorax: 1, wing: 2, abdomen: 3 };
    if (opticsRef.current) opticsRef.current.isolatePart.value = isolatedPart ? partIndex[isolatedPart] : -1;
    const orbit = orbitRef.current;
    if (orbit) {
      orbit.reset();
      if (isolatedPart) orbit.zoomBy(0.58);
    }
  }, [isolatedPart]);
  useEffect(() => {
    gridVisibleRef.current = gridVisible;
    if (learningGridRef.current) learningGridRef.current.mesh.visible = gridVisible;
  }, [gridVisible]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;
    let disposed = false;
    setState('loading');
    setFlight(DEFAULT_FLIGHT);
    setFlightCount(0);

    const shot = framingRef.current ?? {};
    const stage = createLibraryStage(host, { mount, appearance });
    canSpinRef.current = !stage.reduceMotion;
    const orbit = createOrbitRig(host, {
      yaw: shot.yaw ?? 0.7,
      pitch: shot.pitch ?? 0.2,
      roll: shot.roll ?? 0,
      spinning: initialSpin && !stage.reduceMotion,
      onSpinChange: (value) => { if (!disposed) setSpinning(value); },
    });
    orbitRef.current = orbit;
    setSpinning(initialSpin && !stage.reduceMotion);

    const loader = createCreatureLoader();
    let handle: CreatureHandle | null = null;
    let fit: SubjectFit | null = null;
    let optics: BeeMaterialSet | null = null;
    let opticalLayers: { shell: THREE.SkinnedMesh; wings: THREE.SkinnedMesh } | null = null;
    let sceneCapture: THREE.WebGLRenderTarget | null = null;
    let beeMaps: THREE.Texture[] = [];
    let flightState = DEFAULT_FLIGHT;
    let learningGrid: ReturnType<typeof createLearningGrid> | null = null;
    let beeAnchors: Array<{ key: BeeAnchorKey; candidates: THREE.Object3D[] }> = [];
    const anchorWorld = new THREE.Vector3();
    const projected = new THREE.Vector3();

    const syncAnchors = () => {
      if (!handle || !beeAnchors.length) return;
      handle.root.updateMatrixWorld(true);
      stage.camera.updateMatrixWorld(true);

      for (const anchor of beeAnchors) {
        let nearest: THREE.Object3D | null = null;
        let nearestDistance = Infinity;
        for (const candidate of anchor.candidates) {
          candidate.getWorldPosition(anchorWorld);
          const distance = stage.camera.position.distanceToSquared(anchorWorld);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = candidate;
          }
        }
        if (!nearest) continue;
        nearest.getWorldPosition(anchorWorld);
        projected.copy(anchorWorld).project(stage.camera);
        const visible = projected.z > -1 && projected.z < 1
          && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
        host.style.setProperty(`--anchor-${anchor.key}-x`, `${((projected.x + 1) * 50).toFixed(3)}%`);
        host.style.setProperty(`--anchor-${anchor.key}-y`, `${((1 - projected.y) * 50).toFixed(3)}%`);
        host.style.setProperty(`--anchor-${anchor.key}-visible`, visible ? '1' : '0');
      }
    };

    /* The shell reads its refraction from the capture with an explicit LOD, so
       the capture needs a mip chain: without it surface roughness cannot blur
       what is behind the glass and the term collapses to a sharp copy of the
       background, which is what makes screen-space glass look like a decal.
       Three quarters of the render size is plenty for a blurred sample. */
    const syncCapture = () => {
      if (!sceneCapture || !optics) return;
      optics.optical.uSceneResolution.value.set(stage.renderSize.x, stage.renderSize.y);
      sceneCapture.setSize(
        Math.max(1, Math.floor(stage.renderSize.x * 0.8)),
        Math.max(1, Math.floor(stage.renderSize.y * 0.8)),
      );
    };

    stage.onResize(() => {
      // The whole point of the projected-box fit: a 340px panel and a 1000px one
      // need different distances for the same `fill`, so every resize re-solves.
      if (fit) orbit.setFit(fit.refit());
      syncCapture();
    });

    const build = async (): Promise<CreatureHandle> => {
      if (creature === 'bee') {
        sceneCapture = new THREE.WebGLRenderTarget(1, 1, {
          minFilter: THREE.LinearMipmapLinearFilter,
          magFilter: THREE.LinearFilter,
          generateMipmaps: true,
          type: THREE.HalfFloatType,
          depthBuffer: true,
        });
        sceneCapture.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const assets = await loadBeeAssets(loader, stage.renderer.capabilities.getMaxAnisotropy());
        beeMaps = [assets.normalMap, assets.ormMap];
        const built = createBeeCreature(assets.gltf, {
          normalMap: assets.normalMap,
          ormMap: assets.ormMap,
          sceneTexture: sceneCapture.texture,
          resolution: new THREE.Vector2(stage.renderSize.x, stage.renderSize.y),
          targetSize: CREATURE_SIZE.bee,
          anchorRootMotion: true,
        });
        optics = built.materials ?? null;
        opticsRef.current = optics;
        if (optics) {
          const partIndex: Record<BeePartKey, number> = { head: 0, thorax: 1, wing: 2, abdomen: 3 };
          optics.isolatePart.value = isolatedPartRef.current ? partIndex[isolatedPartRef.current] : -1;
        }
        opticalLayers = built.opticalLayers ?? null;
        syncCapture();
        return built;
      }
      if (creature === 'fish') {
        const gltf = await loader.gltf.loadAsync(CREATURE_ASSETS.fish);
        return createFishCreature(gltf, { targetSize: CREATURE_SIZE.fish });
      }
      const gltf = await loader.gltf.loadAsync(CREATURE_ASSETS.jellyfish);
      return createJellyfishCreature(gltf, {
        targetSize: CREATURE_SIZE.jellyfish,
        transmissive: !stage.compact,
      });
    };

    void build()
      .then((built) => {
        if (disposed) {
          built.dispose();
          return;
        }
        handle = built;
        stage.scene.add(built.root);
        built.setPresence(1);

        if (built.actions?.length) {
          built.actions[DEFAULT_FLIGHT]?.reset().setEffectiveWeight(1).fadeIn(0.01).play();
          setFlightCount(built.actions.length);
        }
        // Bake the pose before measuring. A bee mid-beat has a very different
        // bounding box from the bind pose, and the fit is only as honest as the
        // box it was given.
        built.mixer?.update(shot.poseTime ?? (shot.animate ? 0.6 : 0.4));

        fit = createSubjectFit(built.root, stage.camera, {
          yaw: shot.yaw ?? 0.7,
          pitch: shot.pitch ?? 0.2,
          fill: shot.fill,
          targetY: shot.targetY,
        });
        // Re-centre on the aim so the orbit turns around the interesting part
        // rather than around the centroid of a long tail of tentacles.
        built.root.position.sub(fit.current.target);
        built.root.updateMatrixWorld(true);
        orbit.setFit(fit.current);
        const fittedBox = fit.box.clone().translate(fit.current.target.clone().negate());
        stage.shadow.fit(fittedBox);

        if (floorGrid) {
          learningGrid = createLearningGrid();
          learningGrid.fit(fittedBox);
          learningGrid.mesh.visible = gridVisibleRef.current;
          learningGridRef.current = learningGrid;
          stage.scene.add(learningGrid.mesh);
        }

        if (creature === 'bee') {
          const bones: THREE.Object3D[] = [];
          built.root.traverse((object) => {
            if ((object as THREE.Bone).isBone) bones.push(object);
          });
          // Blender/glTF exporters can append numeric suffixes to otherwise
          // stable joint names. Match the semantic stem so the callouts stay
          // attached across re-exports of the same YooLab bee rig.
          const candidates = (...stems: string[]) => bones.filter((bone) => {
            const name = bone.name.toLowerCase();
            return stems.some((stem) => name.includes(stem));
          });
          beeAnchors = [
            { key: 'head', candidates: candidates('antenna_jnt01', 'head_jnt') },
            { key: 'thorax', candidates: candidates('thorax_jnt') },
            { key: 'wing', candidates: candidates('wingroot_jnt') },
            { key: 'abdomen', candidates: candidates('abdomen_jnt04', 'abdomen_jnt03') },
          ].filter((anchor) => anchor.candidates.length > 0);
          syncAnchors();
        }
        setState('ready');
      })
      .catch((error) => {
        console.error('Library creature failed to load', creature, error);
        if (!disposed) setState('failed');
      });

    flightRef.current = (next: number) => {
      const actions = handle?.actions;
      const mixer = handle?.mixer;
      if (!actions || !mixer || !actions[next] || next === flightState) return;
      if (stage.reduceMotion) {
        // No transition to watch, so the buttons change the held pose instead of
        // animating into it: stop the old clip, start the new one, re-evaluate
        // the skeleton once.
        actions[flightState]?.stop();
        actions[next].reset().setEffectiveWeight(1).play();
        mixer.setTime(shot.poseTime ?? 0.4);
      } else {
        // The hero's crossfade, verbatim: a long fade out of the flight clip
        // because that one is the cinematic beat, short everywhere else so the
        // buttons feel like controls rather than transitions.
        const fade = flightState === 2 && next !== 2 ? 0.85 : 0.4;
        actions[flightState]?.fadeOut(fade);
        actions[next].reset().setEffectiveWeight(1).fadeIn(fade).play();
      }
      flightState = next;
      setFlight(next);
    };

    /* The bee always animates unless motion is reduced — its three flight states
       are the interaction, and a frozen bee under a "Bay đi" button would be a
       lie. The other two follow the manifest. */
    const animating = creature === 'bee'
      ? !stage.reduceMotion
      : (shot.animate ?? false) && !stage.reduceMotion;

    const timer = new THREE.Timer();
    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      const elapsed = timer.getElapsed();

      orbit.apply(stage.camera, delta);
      if (animating) handle?.mixer?.update(delta);
      syncAnchors();
      if (optics) {
        optics.optical.uTime.value = elapsed;
        // The glass and the inner body are lit analytically from one direction,
        // so they have to track the key light.
        optics.optical.uLightDir.value.copy(stage.keyLight.position).normalize();
      }

      if (sceneCapture && opticalLayers) {
        // Everything except the two outer layers, so the shell refracts the
        // backdrop *and* its own red core.
        opticalLayers.shell.visible = false;
        opticalLayers.wings.visible = false;
        stage.renderer.setRenderTarget(sceneCapture);
        stage.renderer.render(stage.scene, stage.camera);
        stage.renderer.setRenderTarget(null);
        opticalLayers.shell.visible = true;
        opticalLayers.wings.visible = true;
      }
      stage.renderer.render(stage.scene, stage.camera);
      stage.noteFrame(delta);
    });

    return () => {
      disposed = true;
      stage.renderer.setAnimationLoop(null);
      orbitRef.current = null;
      flightRef.current = null;
      opticsRef.current = null;
      learningGridRef.current = null;
      orbit.dispose();
      handle?.dispose();
      learningGrid?.dispose();
      sceneCapture?.dispose();
      for (const map of beeMaps) map.dispose();
      loader.dispose();
      stage.dispose();
      for (const key of ['head', 'thorax', 'wing', 'abdomen'] as BeeAnchorKey[]) {
        host.style.removeProperty(`--anchor-${key}-x`);
        host.style.removeProperty(`--anchor-${key}-y`);
        host.style.removeProperty(`--anchor-${key}-visible`);
      }
    };
  }, [appearance, creature, floorGrid, initialSpin]);

  useEffect(() => {
    if (state !== 'ready' || !mode) return;
    const orbit = orbitRef.current;
    if (!orbit) return;

    if (mode === 'rotate') {
      flightRef.current?.(1);
      orbit.setSpinning(autoSpin && canSpinRef.current);
      return;
    }

    orbit.reset();
    if (mode === 'motion') flightRef.current?.(motionState);
    else flightRef.current?.(0);
  }, [autoSpin, mode, motionState, state]);

  const ready = state === 'ready';

  return (
    <div className="stage" data-state={state} ref={hostRef}>
      {/*
        The canvas gets its own labelled box. An element with role="img" hides its
        whole subtree from assistive technology, so the control rail cannot live
        inside it — and the box is positioned here rather than in library.css
        because the stage class contract does not name a canvas wrapper.
      */}
      <div
        ref={viewRef}
        role="img"
        aria-label={label}
        style={{ position: 'absolute', inset: 0 }}
      />

      {state !== 'ready' && (
        <div className={`stage-status${state === 'failed' ? ' is-error' : ''}`}>
          <i />
          {state === 'failed' ? 'Không tải được mô hình 3D.' : 'Đang tải mô hình…'}
        </div>
      )}

      {children}

      {ready && (
        <>
          <div className="stage-tools">
            <button
              type="button"
              className="stage-tool"
              onClick={() => orbitRef.current?.nudgeYaw(Math.PI / 4)}
            >
              <StageIcon name="rotate" />
              <span>Xoay</span>
            </button>
            <button
              type="button"
              className="stage-tool"
              onClick={() => orbitRef.current?.zoomBy(0.82)}
            >
              <StageIcon name="zoomIn" />
              <span>Phóng to</span>
            </button>
            <button
              type="button"
              className="stage-tool"
              onClick={() => orbitRef.current?.zoomBy(1.22)}
            >
              <StageIcon name="zoomOut" />
              <span>Thu nhỏ</span>
            </button>
            <button
              type="button"
              className="stage-tool"
              onClick={() => orbitRef.current?.reset()}
            >
              <StageIcon name="reset" />
              <span>Đặt lại</span>
            </button>

            {/* Flight states, only when the asset really carries all three clips. */}
            {flightCount >= FLIGHT_LABELS.length && FLIGHT_LABELS.map((flightLabel, index) => (
              <button
                key={flightLabel}
                type="button"
                className={`stage-tool${flight === index ? ' is-active' : ''}`}
                aria-pressed={flight === index}
                aria-label={FLIGHT_TITLES[index]}
                title={FLIGHT_TITLES[index]}
                onClick={() => flightRef.current?.(index)}
              >
                <StageIcon name={FLIGHT_ICONS[index]} />
                <span>{flightLabel}</span>
              </button>
            ))}
          </div>

          <div className="stage-caption">
            <b>{label}</b>
            <span>{CREATURE_NOTE[creature]}</span>
          </div>

          <button
            type="button"
            className={`stage-spin${spinning ? ' is-active' : ''}`}
            aria-pressed={spinning}
            onClick={() => orbitRef.current?.setSpinning(!spinning)}
          >
            <StageIcon name="spin" />
            <span>Tự xoay</span>
          </button>

          <p className="stage-hint">Kéo để xoay · Cuộn để phóng</p>
        </>
      )}
    </div>
  );
}
