'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createCreatureLoader, disposeObject, loadLibraryGltf } from '../../lib/three/creatures';
import { createLibraryStage } from '../../lib/three/libraryEnvironment';
import { createOrbitRig, createSubjectFit, type OrbitRig, type SubjectFit } from '../../lib/three/framing';
import type { ModelFraming, ModelPreset } from '../../lib/library/types';
import { StageIcon } from './CreatureStage';

/**
 * The Library's centre viewer for a plain GLB with a material preset.
 *
 * Everything structural — the single context, the ivory room, the four-light rig,
 * the backdrop, the contact shadow, the resize plumbing, the hard pause when off
 * screen or backgrounded, the adaptive pixel ratio — comes from
 * `createLibraryStage`, which `CreatureStage` builds on too. What is left here is
 * the part that is genuinely different: the preset materials and the fact that
 * there is no refraction capture pass to run.
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
  /*
   * The two below exist for the toolkit.
   *
   * Every one of the eight tool meshes ships with the same default material — a
   * flat 0.8 grey, no texture, no map of any kind — so `natural` renders all
   * eight as the same white object, and against an ivory backdrop a white ruler
   * is a blank plank. Splitting them by what the tool is actually made of is
   * both more honest and the only way the silhouettes read: steel takes a
   * specular highlight down its edge, rubber does not.
   */
  steel: {
    color: 0x9ba3ab, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.24,
    metalness: 0.86, ior: 2.2, iridescence: 0, clearcoat: 0.2, sheen: 0, sheenColor: 0xffffff,
  },
  rubber: {
    color: 0x6f6a63, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.86,
    metalness: 0, ior: 1.44, iridescence: 0, clearcoat: 0, sheen: 0.3, sheenColor: 0xd8cfc4,
  },
  natural: { keepOriginal: true },
};

/** Second line of the stage caption: what the surface is made of. */
const PRESET_NOTE: Record<ModelPreset, string> = {
  ruby: 'Vật liệu: hồng ngọc',
  opal: 'Vật liệu: opal',
  tissue: 'Vật liệu: mô mềm',
  plastic: 'Vật liệu: nhựa mờ',
  steel: 'Vật liệu: thép dụng cụ',
  rubber: 'Vật liệu: cao su · nhựa mềm',
  natural: 'Vật liệu gốc của mô hình',
};

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
  const viewRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitRig | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [spinning, setSpinning] = useState(false);
  // Latest framing without restarting the scene: switching specimens replaces
  // the whole effect anyway, and a new object identity for an unchanged framing
  // must not tear down the context. Seeded at mount and then kept in an effect,
  // because writing a ref during render is not allowed.
  const framingRef = useRef(framing);
  useEffect(() => { framingRef.current = framing; }, [framing]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;
    let disposed = false;
    setState('loading');

    const shot = framingRef.current ?? {};
    const stage = createLibraryStage(host, { mount });
    const orbit = createOrbitRig(host, {
      yaw: shot.yaw ?? 0.7,
      pitch: shot.pitch ?? 0.2,
      roll: shot.roll ?? 0,
      spinning: !stage.reduceMotion,
      onSpinChange: (value) => { if (!disposed) setSpinning(value); },
    });
    orbitRef.current = orbit;
    setSpinning(!stage.reduceMotion);

    const loader = createCreatureLoader();
    const pivot = new THREE.Group();
    stage.scene.add(pivot);
    let mixer: THREE.AnimationMixer | undefined;
    let fit: SubjectFit | null = null;

    stage.onResize(() => {
      // A 340px panel and a 1000px one need different distances for the same
      // `fill`, which is why the fit is re-solved rather than baked at load.
      if (fit) orbit.setFit(fit.refit());
    });

    void loadLibraryGltf(loader.gltf, url)
      .then((gltf) => {
        if (disposed) return;
        const visual = gltf.scene;
        applyPreset(visual, preset);
        pivot.add(visual);

        if (gltf.animations[0]) {
          mixer = new THREE.AnimationMixer(visual);
          mixer.clipAction(gltf.animations[0]).play();
          // A held pose for still specimens, a running clip for the animated
          // ones. Baking the pose first also fixes the framing: a T-posed model
          // has a very different bounding box from a moving one.
          mixer.update(shot.poseTime ?? (shot.animate ? 0.6 : 0.4));
        }

        fit = createSubjectFit(visual, stage.camera, {
          yaw: shot.yaw ?? 0.7,
          pitch: shot.pitch ?? 0.2,
          fill: shot.fill,
          targetY: shot.targetY,
        });
        // Re-centre on the aim so orbiting turns around the interesting part
        // rather than around the centroid of the whole mesh.
        visual.position.sub(fit.current.target);
        visual.updateMatrixWorld(true);
        orbit.setFit(fit.current);
        stage.shadow.fit(fit.box.clone().translate(fit.current.target.clone().negate()));
        setState('ready');
      })
      .catch((error) => {
        console.error('Library model failed to load', url, error);
        if (!disposed) setState('failed');
      });

    const animating = (shot.animate ?? false) && !stage.reduceMotion;
    const timer = new THREE.Timer();
    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      orbit.apply(stage.camera, delta);
      if (animating) mixer?.update(delta);
      stage.renderer.render(stage.scene, stage.camera);
      stage.noteFrame(delta);
    });

    return () => {
      disposed = true;
      stage.renderer.setAnimationLoop(null);
      orbitRef.current = null;
      orbit.dispose();
      mixer?.stopAllAction();
      disposeObject(pivot);
      loader.dispose();
      stage.dispose();
    };
  }, [url, preset]);

  const ready = state === 'ready';

  return (
    <div className="stage" ref={hostRef}>
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
          </div>

          <div className="stage-caption">
            <b>{label}</b>
            <span>{PRESET_NOTE[preset]}</span>
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
