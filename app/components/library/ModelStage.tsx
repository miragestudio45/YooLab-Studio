'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createCreatureLoader,
  disposeObject,
  loadLibraryGltf,
  refreshSkinnedBounds,
} from '../../lib/three/creatures';
import { createLibraryStage } from '../../lib/three/libraryEnvironment';
import { createOrbitRig, createSubjectFit, type OrbitRig, type SubjectFit } from '../../lib/three/framing';
import type { ModelAnchor, ModelClip, ModelFraming, ModelPreset } from '../../lib/library/types';
import { StageChrome, StageClipRow, StageRail, StageRailGroup, StageToolButton } from './StageChrome';
import { LibraryIcon } from './LibraryIcons';

/**
 * The Library's centre viewer for a plain GLB with a material preset.
 *
 * Everything structural — the single context, the ivory room, the four-light rig,
 * the backdrop, the contact shadow, the resize plumbing, the hard pause when off
 * screen or backgrounded, the adaptive pixel ratio — comes from
 * `createLibraryStage`, which `CreatureStage` builds on too. What is left here is
 * the part that is genuinely different: the preset materials, the fact that there
 * is no refraction capture pass to run, and two features the creatures do not
 * need.
 *
 * **Named clips.** A rigged specimen is a set of behaviours, not one animation,
 * and which behaviour is running *is* the lesson — a T-rex biting and a T-rex
 * standing still answer different questions about the same skull. Clips are
 * resolved by their glTF name rather than by index, so re-exporting the asset
 * cannot silently swap "gầm" for "chạy", and switching between them crossfades
 * on the same curve the hero's bee uses.
 *
 * **Anatomy pins.** An anchor names a *joint*, so its label travels with the
 * animation: the jaw pin stays on the jaw through a bite. The projection is
 * written to CSS custom properties every frame rather than to React state, so
 * tracking six pins on a moving skeleton costs no renders at all — the same
 * technique `CreatureStage` uses for the bee's callouts.
 */

type ModelStageProps = {
  url: string;
  preset: ModelPreset;
  framing?: ModelFraming;
  clips?: ModelClip[];
  defaultClip?: string;
  lockRoot?: string;
  /** Material name stems rendered as a translucent envelope. See `makeShell`. */
  shell?: string[];
  anchors?: ModelAnchor[];
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
  /**
   * Keep the original colours, but re-make each material as physical so the
   * surface can be wet. See the `organ` preset.
   */
  keepOriginalWet?: boolean;
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
  /*
   * Deepened, because the room it stands in is ivory.
   *
   * `steel` and `rubber` were split out of this preset for exactly this reason
   * and then this one was left at `0xe7dccb` — within about seven units of the
   * backdrop. On the paint jar that survives, because a cylinder has a silhouette
   * and a shadow doing the work. On the **ruler** it does not: a flat slab has no
   * form to shade, so value contrast is the only thing that can separate it, and
   * at seven units the tool disappeared into the plate. The original note under
   * `steel` already wrote the rule down — "against an ivory backdrop a white
   * ruler is a blank plank" — this preset just never took it.
   *
   * Still matte plastic, still warm, just far enough below the plate to have an
   * edge.
   */
  plastic: {
    color: 0xd6cec0, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.44,
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
  /* No `color`: every value here is a *modifier*, and the base colour comes from
     whichever of the mesh's own materials is being converted. */
  organ: {
    keepOriginalWet: true,
    roughness: 0.44, clearcoat: 0.5, sheen: 0.34, sheenColor: 0xffd9cf,
  },
};

/*
 * The two things `natural` can honestly mean.
 *
 * `natural` keeps whatever the glTF shipped, and across this Library that is two
 * very different things. The T-rex arrives with a hand-painted skin and a normal
 * map, so "da gốc · bản đồ pháp tuyến" is a true description of what is on
 * screen. The eight toolkit meshes arrive with **no textures at all** — one flat
 * `baseColorFactor` each and nothing else — so the same caption under the pencil
 * was telling a visitor to look for a normal map that is not in the file.
 *
 * That is the kind of error this stage caption exists to prevent rather than
 * commit: it is the line that says what they are looking at is real. So the
 * wording is chosen from the materials that actually loaded.
 */
const NATURAL_TEXTURED = 'Da gốc của mô hình · bản đồ pháp tuyến';
const NATURAL_FLAT = 'Màu vật liệu gốc của mô hình';

/**
 * Second line of the stage caption: what the surface is made of.
 *
 * `natural` is the one entry that cannot be answered by the preset alone, so it
 * is resolved against the loaded model in `naturalNote` instead of here.
 */
const PRESET_NOTE: Record<ModelPreset, string> = {
  ruby: 'Vật liệu: hồng ngọc',
  opal: 'Vật liệu: opal',
  tissue: 'Vật liệu: mô mềm',
  organ: 'Màu mô theo Human Reference Atlas · bề mặt ẩm',
  plastic: 'Vật liệu: nhựa mờ',
  steel: 'Vật liệu: thép dụng cụ',
  rubber: 'Vật liệu: cao su · nhựa mềm',
  natural: NATURAL_TEXTURED,
};

/**
 * Does this mesh or material's name start with one of the given stems?
 *
 * Stem-matched rather than compared whole, so `VH_M_sclera` keeps finding
 * `VH_M_sclera_L` across a re-export that decorates the suffix — the same rule
 * `lockRoot` uses on joints, and for the same reason.
 *
 * Both names are tested because the HRA set identifies a part in whichever of
 * the two the exporter happened to keep. The kidney's capsule owns a material
 * named for it (`kidneycapsule_mat`); the eye's sclera does not — its three
 * materials are `PaletteMaterial001..003`, share a palette atlas between
 * unrelated parts, and carry no anatomy in their names at all. Only the *mesh*
 * there is called `VH_M_sclera_L`. Matching material names alone would have
 * forced the manifest to name the eye's shell `PaletteMaterial003`, which is a
 * magic string that says nothing and would survive no re-export.
 */
function isShell(name: string | undefined, stems: string[]) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return stems.some((stem) => lower.startsWith(stem.toLowerCase()));
}

/**
 * The most chroma any real tissue surface is allowed to carry.
 *
 * Ten of the twelve Human Reference Atlas organs are authored in colours a
 * pathologist would recognise — a near-black liver, a dusty spleen, two pale
 * pinks through the gut — and every one of those sits well under this ceiling,
 * so this rule never touches them. Two are not tissue colours at all, they are
 * *diagram* colours: the gallbladder is `rgb(0,136,0)`, a fully saturated
 * primary green with the red and blue channels at exactly zero, and the optic
 * chiasm inside `brain.glb` is a highlighter yellow. Nothing in a body cavity
 * has a dead channel; that value is a key on a chart, not bile.
 *
 * Rendered literally, and lit and made wet like everything else on this shelf,
 * the gallbladder came out as a boiled sweet next to eleven organs — the exact
 * "ugly default glTF" failure this preset exists to prevent, and the one entry
 * that broke the shelf's coherence.
 *
 * So the ceiling is on chroma (`max − min` of the sRGB channels) rather than on
 * HSL saturation, because saturation is meaningless at the light end: the colon
 * is a pale pink that measures 0.93 "saturated" and is perfectly plausible, and
 * an HSL clamp would have drained it while leaving the real offender alone.
 * Hue is preserved exactly — the gallbladder stays green, it stops being neon.
 */
const TISSUE_CHROMA = 0.34;

/**
 * Pull a colour toward its own grey until it is within `TISSUE_CHROMA`.
 *
 * Done in sRGB, not in the linear working space, because the ceiling is a
 * judgement about how the colour *reads* and linear values compress the light
 * end past the point where a threshold means anything.
 */
function temperTissue(color: THREE.Color) {
  const hex = color.getHex(THREE.SRGBColorSpace);
  const channels = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const high = Math.max(...channels);
  const low = Math.min(...channels);
  const chroma = high - low;
  if (chroma <= TISSUE_CHROMA) return color;
  const grey = (high + low) / 2;
  const pull = TISSUE_CHROMA / chroma;
  const [r, g, b] = channels.map((value) => grey + (value - grey) * pull);
  color.setRGB(r, g, b, THREE.SRGBColorSpace);
  return color;
}

/**
 * Turn one material into a translucent envelope over the parts inside it.
 *
 * `depthWrite: false` plus a late `renderOrder` on the *mesh* is what makes this
 * read as a capsule rather than as fog: the opaque interior draws first and
 * fills the depth buffer, then the shell blends over it without occluding it and
 * without fighting itself where the bag folds. `DoubleSide` because a capsule
 * seen through its own far wall is what gives the volume — with front faces only
 * the organ loses its back and the interior appears to float.
 */
function makeShell(material: THREE.MeshPhysicalMaterial) {
  material.transparent = true;
  material.opacity = 0.26;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  /* A wet *film* rather than a wet solid: at a quarter opacity the sheen is most
     of what is left of the surface, so it carries the highlight on its own. */
  material.clearcoat = 0.85;
  material.roughness = 0.3;
  material.envMapIntensity = 0.5;
  material.needsUpdate = true;
}

function applyPreset(root: THREE.Object3D, preset: ModelPreset, shell: string[] = []) {
  const spec = PRESETS[preset];
  /* Reported back so the caption can describe this model rather than its
     preset. See `NATURAL_TEXTURED`. */
  let textured = false;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (spec.keepOriginal) {
      for (const item of list) {
        const material = item as THREE.MeshStandardMaterial;
        if (!material) continue;
        if (material.map || material.normalMap) textured = true;
        material.envMapIntensity = 0.9;
        material.roughness = Math.max(material.roughness ?? 0.5, 0.34);
        if (material.emissive) material.emissiveIntensity = Math.min(material.emissiveIntensity ?? 0, 0.25);
        material.needsUpdate = true;
      }
      return;
    }
    /*
     * Per-material conversion, not one replacement material for the mesh.
     *
     * This is the branch that separates a kidney from a bean. A single organ can
     * carry three authored materials across three sub-meshes — capsule, renal
     * column, pyramids — and the whole reason to keep the HRA's colours is that
     * those three are different colours. So each material is converted in place
     * and keeps its own `color`, `map` and `normalMap`; only the *surface*
     * qualities come from the preset.
     */
    if (spec.keepOriginalWet) {
      /* Resolved once per mesh: a shell named by its mesh fades every material
         on it, which is what "this part is the envelope" means. */
      const meshIsShell = shell.length > 0 && isShell(mesh.name, shell);
      const converted = list.map((item) => {
        const source = item as THREE.MeshStandardMaterial | undefined;
        const wet = new THREE.MeshPhysicalMaterial({
          color: temperTissue(source?.color?.clone() ?? new THREE.Color(0xffffff)),
          map: source?.map ?? null,
          normalMap: source?.normalMap ?? null,
          /*
           * Carry `COLOR_0`, or four of the twelve organs lose their colour.
           *
           * The HRA set stores anatomy two different ways and this branch has to
           * honour both. Most meshes carry it as `baseColorFactor` — one flat
           * value per material — but the heart, lungs, thymus and eye carry a
           * **per-vertex** tint instead, and the eye carries *only* that plus a
           * shared palette texture: all three of its materials leave
           * `baseColorFactor` unset, so dropping the attribute rendered the whole
           * eyeball as one blank white ball with its five layers invisible.
           * three.js sets this flag from the attribute at load; re-making the
           * material has to set it again, because a flag that is not copied is
           * the same as a flag that is off.
           */
          vertexColors: source?.vertexColors ?? false,
          roughness: Math.min(Math.max(source?.roughness ?? 0.4, 0.3), spec.roughness ?? 0.44),
          metalness: 0,
          ior: 1.4,
          clearcoat: spec.clearcoat ?? 0,
          clearcoatRoughness: 0.3,
          sheen: spec.sheen ?? 0,
          sheenColor: new THREE.Color(spec.sheenColor ?? 0xffffff),
          sheenRoughness: 0.5,
          /* Below 1: these meshes are inside a body, not on a showroom floor, and
             a full environment reflection on a wet surface reads as porcelain. */
          envMapIntensity: 0.72,
          side: THREE.FrontSide,
        });
        if (meshIsShell || (shell.length > 0 && isShell(source?.name, shell))) {
          makeShell(wet);
          /* After every opaque sibling. The interiors are separate meshes, so
             ordering has to happen on the object, not on the material. */
          mesh.renderOrder = 2;
        }
        source?.dispose?.();
        return wet;
      });
      /* Hand back exactly the shape that arrived. A one-element array is not the
         same thing as a single material to three's multi-material draw path. */
      mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
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
  return { textured };
}

/**
 * Strip root motion, so a specimen performs on the spot.
 *
 * Every one of the T-rex's five clips animates `bn_Spine.translation`, which is
 * how a games-pipeline clip is built: the run cycle *travels*, the bite *lunges*,
 * and the engine is expected to move the character. A viewer has no such engine —
 * the camera is fitted once at load and does not follow — so what the visitor
 * actually saw was a dinosaur walking out of the left edge of its own panel
 * within two seconds of the section arriving, and a different part of it cropped
 * every time a screenshot was taken.
 *
 * The fix is the one the hero's bee already uses on its flight clips, generalised:
 * take the position of the root joint at one instant and write it over every
 * keyframe of that track in every clip. Nothing else is touched, so the legs still
 * stride, the neck still lunges and the tail still counterweights — the animal
 * just does all of it in place.
 *
 * The anchor comes from the clip the specimen *opens* on rather than from the
 * first clip in the file, because that is the pose the camera was fitted against.
 */
function lockRootMotion(
  clips: THREE.AnimationClip[],
  root: THREE.Object3D,
  stem: string,
  anchorClip?: string,
) {
  /*
   * Resolving the joint took three attempts, and the two failed ones are worth
   * recording because both looked correct and both silently locked nothing.
   *
   * three's `PropertyBinding` **sanitises** names by deleting `[ ] . : /`, and
   * `GLTFLoader` runs every node name through it at load. So the joint the
   * exporter called `bn_Spine.4_4` arrives as an `Object3D` named `bn_Spine4_4`
   * and is addressed by tracks as `bn_Spine4_4.position`. Matching the authored
   * stem against the track name fails (the dot is gone); matching it against
   * `object.name` fails for the same reason. And matching the sanitised stem as a
   * prefix is ambiguous, because `bn_Spine.4_4` and `bn_Spine1.5_5` both become
   * `bn_Spine` followed by digits.
   *
   * The hierarchy settles it without any string cleverness. Of the joints whose
   * name starts with the stem, the root of the chain is the one nearest the scene
   * root — `bn_Spine` is the parent of `bn_Spine1` — so depth is the tiebreak, and
   * a mis-sanitised name cannot pick the wrong joint.
   */
  const wanted = THREE.PropertyBinding.sanitizeNodeName(stem);
  const depthOf = (object: THREE.Object3D) => {
    let depth = 0;
    for (let node = object.parent; node; node = node.parent) depth += 1;
    return depth;
  };
  let joint: THREE.Object3D | null = null;
  let jointDepth = Infinity;
  root.traverse((object) => {
    if (!object.name.startsWith(wanted)) return;
    const depth = depthOf(object);
    if (depth >= jointDepth) return;
    joint = object;
    jointDepth = depth;
  });
  if (!joint) {
    console.warn('lockRoot names a joint this model does not have:', stem);
    return;
  }
  const key = `${(joint as THREE.Object3D).name}.position`;

  const ordered = anchorClip
    ? [...clips].sort((a, b) => Number(b.name === anchorClip) - Number(a.name === anchorClip))
    : clips;

  let anchor: [number, number, number] | null = null;
  for (const clip of ordered) {
    const track = clip.tracks.find((entry) => entry.name === key);
    if (!track || track.values.length < 3) continue;
    if (!anchor) anchor = [track.values[0], track.values[1], track.values[2]];
    for (let index = 0; index + 2 < track.values.length; index += 3) {
      track.values[index] = anchor[0];
      track.values[index + 1] = anchor[1];
      track.values[index + 2] = anchor[2];
    }
  }
}

/**
 * The joints an anchor may attach to, matched as a name *stem*.
 *
 * Exporters append numeric suffixes — the T-rex's head joint ships as
 * `bn_Head.10_10` — so an exact-name lookup breaks on the next re-export of the
 * same rig. Matching the stem and then picking the joint nearest the camera is
 * what keeps a pin on the near side of a symmetrical animal.
 */
function collectAnchorJoints(root: THREE.Object3D, anchors: ModelAnchor[]) {
  const joints: THREE.Object3D[] = [];
  root.traverse((object) => {
    if ((object as THREE.Bone).isBone) joints.push(object);
  });
  return anchors.map((anchor) => ({
    anchor,
    candidates: joints.filter((joint) => joint.name.toLowerCase().includes(anchor.bone.toLowerCase())),
  }));
}

export function ModelStage({ url, preset, framing, clips, defaultClip, lockRoot, shell, anchors, label }: ModelStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitRig | null>(null);
  const clipRef = useRef<((name: string) => void) | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [spinning, setSpinning] = useState(false);
  /** Which authored clips the asset actually carries, so the rail cannot lie. */
  const [available, setAvailable] = useState<string[]>([]);
  const [clip, setClip] = useState<string>(() => defaultClip ?? clips?.[0]?.name ?? '');
  const [openPin, setOpenPin] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  /* Whether the loaded materials actually carry maps. Only `natural` reads it. */
  const [textured, setTextured] = useState(false);
  // Latest framing without restarting the scene: switching specimens replaces
  // the whole effect anyway, and a new object identity for an unchanged framing
  // must not tear down the context. Seeded at mount and then kept in an effect,
  // because writing a ref during render is not allowed.
  const framingRef = useRef(framing);
  const clipsRef = useRef(clips);
  const anchorsRef = useRef(anchors);
  const defaultClipRef = useRef(defaultClip);
  const lockRootRef = useRef(lockRoot);
  const shellRef = useRef(shell);
  useEffect(() => { framingRef.current = framing; }, [framing]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { anchorsRef.current = anchors; }, [anchors]);
  useEffect(() => { defaultClipRef.current = defaultClip; }, [defaultClip]);
  useEffect(() => { lockRootRef.current = lockRoot; }, [lockRoot]);
  useEffect(() => { shellRef.current = shell; }, [shell]);

  /** The guide card is spent once the visitor has actually driven the model. */
  const markTouched = useCallback(() => setTouched(true), []);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;
    let disposed = false;
    setState('loading');
    setOpenPin(null);
    setTouched(false);

    const shot = framingRef.current ?? {};
    const authoredClips = clipsRef.current ?? [];
    const authoredAnchors = anchorsRef.current ?? [];
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
    let actions = new Map<string, THREE.AnimationAction>();
    let playing = '';
    let pins: ReturnType<typeof collectAnchorJoints> = [];
    const jointWorld = new THREE.Vector3();
    const projected = new THREE.Vector3();

    /*
     * Pin projection, written straight to CSS.
     *
     * Six pins on a running skeleton at 60 fps is 360 state writes a second if
     * this goes through React. It goes through custom properties instead, and
     * `--pin-N-events` carries the hit-testing decision with the position — a
     * pin that has rotated behind the animal must stop being clickable, and
     * `opacity: 0` alone does not do that.
     */
    const forward = new THREE.Vector3();
    const syncPins = () => {
      if (!pins.length) return;
      pivot.updateMatrixWorld(true);
      stage.camera.updateMatrixWorld(true);
      // The camera orbits the origin and the subject was re-centred on its own
      // aim point, so "past the origin along the view axis" is exactly "on the
      // far side of the animal". See the dimming note below.
      forward.copy(stage.camera.position).normalize().negate();
      pins.forEach((pin, index) => {
        let nearest: THREE.Object3D | null = null;
        let nearestDistance = Infinity;
        for (const candidate of pin.candidates) {
          candidate.getWorldPosition(jointWorld);
          const distance = stage.camera.position.distanceToSquared(jointWorld);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = candidate;
          }
        }
        if (!nearest) return;
        nearest.getWorldPosition(jointWorld);
        projected.copy(jointWorld).project(stage.camera);
        const inFrame = projected.z > -1 && projected.z < 1
          && Math.abs(projected.x) < 0.97 && Math.abs(projected.y) < 0.95;
        /*
         * A pin on the far side of the animal fades rather than vanishing.
         *
         * The projection is honest but a screen position is not a line of sight:
         * while the specimen turns, half the joints are behind several tonnes of
         * it, and a solid "Hàm dưới" label sitting on the animal's flank claims
         * the jaw is there. Hiding those pins outright is worse — a set of six
         * that keeps dropping to three reads as a bug — so a far-side pin drops to
         * a third opacity and stops taking clicks: still countable, no longer
         * making a claim about where you are looking.
         */
        const behind = jointWorld.dot(forward) > 0;
        const shown = inFrame ? (behind ? '0.32' : '1') : '0';
        host.style.setProperty(`--pin-${index}-x`, `${((projected.x + 1) * 50).toFixed(3)}%`);
        host.style.setProperty(`--pin-${index}-y`, `${((1 - projected.y) * 50).toFixed(3)}%`);
        host.style.setProperty(`--pin-${index}-on`, shown);
        // Clickable whenever it is on screen, dimmed or not: a faded pin is still
        // a deliberate target, and a pin that stopped taking clicks while its own
        // card was open could not be dismissed.
        host.style.setProperty(`--pin-${index}-hit`, inFrame ? 'auto' : 'none');
      });
    };

    stage.onResize(() => {
      // A 340px panel and a 1000px one need different distances for the same
      // `fill`, which is why the fit is re-solved rather than baked at load.
      if (fit) orbit.setFit(fit.refit());
      syncPins();
    });

    void loadLibraryGltf(loader.gltf, url)
      .then((gltf) => {
        if (disposed) return;
        const visual = gltf.scene;
        setTextured(applyPreset(visual, preset, shellRef.current).textured);
        /* Before the fit, so the bounding box measures the pose that is actually
           framed. See `orient` — this is what lays a mesh authored on end onto
           the floor without tilting the camera and the room with it. */
        if (shot.orient) visual.rotation.set(shot.orient[0], shot.orient[1], shot.orient[2]);
        pivot.add(visual);

        if (gltf.animations.length) {
          // Before anything binds a clip: the tracks are mutated in place, so
          // this has to happen while nothing is playing them.
          if (lockRootRef.current) {
            lockRootMotion(gltf.animations, visual, lockRootRef.current, defaultClipRef.current);
          }
          mixer = new THREE.AnimationMixer(visual);
          if (authoredClips.length) {
            /*
             * Only the clips that are really in the file.
             *
             * The rail is built from `available`, not from the manifest, so a
             * renamed clip loses its button instead of shipping a control that
             * does nothing when pressed. This is the same rule as `status:
             * 'ready'` one level down: the interface may not offer what the
             * asset cannot do.
             */
            const found: string[] = [];
            for (const authored of authoredClips) {
              const source = gltf.animations.find((animation) => animation.name === authored.name);
              if (!source) continue;
              actions.set(authored.name, mixer.clipAction(source));
              found.push(authored.name);
            }
            setAvailable(found);
            const wanted = defaultClipRef.current && found.includes(defaultClipRef.current)
              ? defaultClipRef.current
              : found[0] ?? '';
            if (wanted) {
              actions.get(wanted)?.reset().setEffectiveWeight(1).play();
              playing = wanted;
              setClip(wanted);
            }
          } else {
            mixer.clipAction(gltf.animations[0]).play();
          }
          // A held pose for still specimens, a running clip for the animated
          // ones. Baking the pose first also fixes the framing: a T-posed model
          // has a very different bounding box from a moving one.
          mixer.update(shot.poseTime ?? (shot.animate || authoredClips.length ? 0.6 : 0.4));
          // The pose is only real to `Box3` once the skeleton has been evaluated.
          // See `refreshSkinnedBounds`.
          refreshSkinnedBounds(visual);
        }

        fit = createSubjectFit(visual, stage.camera, {
          yaw: shot.yaw ?? 0.7,
          pitch: shot.pitch ?? 0.2,
          fill: shot.fill,
          targetY: shot.targetY,
        }, shot.spinSafe ?? false);
        // Re-centre on the aim so orbiting turns around the interesting part
        // rather than around the centroid of the whole mesh.
        visual.position.sub(fit.current.target);
        visual.updateMatrixWorld(true);
        orbit.setFit(fit.current);
        const fittedBox = fit.box.clone().translate(fit.current.target.clone().negate());
        stage.shadow.fit(fittedBox);
        // Same box as the shadow, so the floor and the mark the specimen casts on
        // it agree about where the ground is.
        stage.grid.fit(fittedBox);

        if (authoredAnchors.length) {
          pins = collectAnchorJoints(visual, authoredAnchors).filter((pin) => pin.candidates.length > 0);
          syncPins();
        }
        setState('ready');
      })
      .catch((error) => {
        console.error('Library model failed to load', url, error);
        if (!disposed) setState('failed');
      });

    clipRef.current = (next: string) => {
      if (!mixer || next === playing) return;
      const target = actions.get(next);
      if (!target) return;
      const current = playing ? actions.get(playing) : undefined;
      if (stage.reduceMotion) {
        // No transition to watch, so the buttons change the held pose instead of
        // animating into it: stop the old clip, start the new one, re-evaluate
        // the skeleton once.
        current?.stop();
        target.reset().setEffectiveWeight(1).play();
        mixer.setTime(shot.poseTime ?? 0.5);
      } else {
        current?.fadeOut(0.34);
        target.reset().setEffectiveWeight(1).fadeIn(0.34).play();
      }
      playing = next;
      setClip(next);
    };

    /* A rigged specimen with authored clips always animates: a frozen T-rex
       under a "Ngoạm" button would be a lie. Everything else follows the
       manifest. */
    const animating = (authoredClips.length > 0 || (shot.animate ?? false)) && !stage.reduceMotion;
    const timer = new THREE.Timer();
    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      orbit.apply(stage.camera, delta);
      if (animating) mixer?.update(delta);
      syncPins();
      stage.renderer.render(stage.scene, stage.camera);
      stage.noteFrame(delta);
    });

    return () => {
      disposed = true;
      stage.renderer.setAnimationLoop(null);
      orbitRef.current = null;
      clipRef.current = null;
      mixer?.stopAllAction();
      actions = new Map();
      disposeObject(pivot);
      loader.dispose();
      stage.dispose();
      for (let index = 0; index < 12; index += 1) {
        host.style.removeProperty(`--pin-${index}-x`);
        host.style.removeProperty(`--pin-${index}-y`);
        host.style.removeProperty(`--pin-${index}-on`);
        host.style.removeProperty(`--pin-${index}-hit`);
      }
    };
  }, [url, preset]);

  const ready = state === 'ready';
  const listedClips = (clips ?? []).filter((entry) => available.includes(entry.name));

  return (
    <div
      className="stage"
      data-state={state}
      ref={hostRef}
      onPointerDown={markTouched}
      onWheel={markTouched}
    >
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
          <StageRail>
            <StageRailGroup>
              <StageToolButton glyph="rotate" label="Xoay" onClick={() => orbitRef.current?.nudgeYaw(Math.PI / 4)} />
              <StageToolButton glyph="zoomIn" label="Gần" title="Phóng to" onClick={() => orbitRef.current?.zoomBy(0.82)} />
              <StageToolButton glyph="zoomOut" label="Xa" title="Thu nhỏ" onClick={() => orbitRef.current?.zoomBy(1.22)} />
              <StageToolButton glyph="reset" label="Về khung" title="Đặt lại khung nhìn" onClick={() => orbitRef.current?.reset()} />
            </StageRailGroup>
          </StageRail>

          {listedClips.length > 1 && (
            <StageClipRow title="Trạng thái">
              {listedClips.map((entry) => (
                <StageToolButton
                  key={entry.name}
                  glyph={entry.icon}
                  label={entry.label}
                  title={entry.title}
                  active={clip === entry.name}
                  onClick={() => { markTouched(); clipRef.current?.(entry.name); }}
                />
              ))}
            </StageClipRow>
          )}

          {/* ------------------------------------------------ anatomy pins --- */}
          {!!anchors?.length && (
            <div className="stage-pins">
              {anchors.map((anchor, index) => (
                <div
                  className="stage-pin"
                  key={anchor.bone}
                  data-open={openPin === index || undefined}
                  data-side={anchor.side ?? 'right'}
                  /*
                    Position is set inline because it changes every frame; the
                    *appearance* is not. `--on` and `--hit` are forwarded as
                    custom properties so `library.css` owns `opacity` and
                    `pointer-events` — which is what lets an open card override the
                    far-side dimming. An inline `opacity` could not be overridden
                    by any stylesheet rule.
                  */
                  style={{
                    left: `var(--pin-${index}-x, 50%)`,
                    top: `var(--pin-${index}-y, 50%)`,
                    '--on': `var(--pin-${index}-on, 0)`,
                    '--hit': `var(--pin-${index}-hit, none)`,
                  } as React.CSSProperties}
                >
                  <button
                    type="button"
                    className="stage-pin-dot"
                    aria-expanded={openPin === index}
                    aria-label={`${anchor.label} — ${anchor.detail}`}
                    onClick={() => { markTouched(); setOpenPin(openPin === index ? null : index); }}
                  >
                    <i aria-hidden="true" />
                  </button>
                  {openPin === index && (
                    <span className="stage-pin-card" role="presentation">
                      <b>{anchor.label}</b>
                      <small>{anchor.detail}</small>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <StageChrome
            name={label}
            note={preset === 'natural' && !textured ? NATURAL_FLAT : PRESET_NOTE[preset]}
            spinning={spinning}
            onSpin={() => { markTouched(); orbitRef.current?.setSpinning(!spinning); }}
            guide={touched ? null : (
              <>
                <li><LibraryIcon name="drag" /> Kéo để xoay</li>
                <li><LibraryIcon name="scroll" /> Cuộn để phóng</li>
                {!!anchors?.length && <li><LibraryIcon name="tap" /> Nhấp điểm để đọc</li>}
              </>
            )}
          />
        </>
      )}
    </div>
  );
}
