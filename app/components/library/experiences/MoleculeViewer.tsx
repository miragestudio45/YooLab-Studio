'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { LibraryIcon } from '../LibraryIcons';
import { usePrefersReducedMotion } from '../../../lib/usePrefersReducedMotion';
import { createVisibilityGate } from '../../../lib/three/visibility';
import { createProceduralEnvironment } from '../../../lib/three/environment';
import { libraryEnvironmentPalette } from '../../../lib/three/libraryEnvironment';
import { createContactShadow, createLearningGrid } from '../../../lib/three/studioBackdrop';
import {
  VI_NAME,
  formatNumber,
  loadElements,
  type ElementData,
} from '../../../lib/chemistry/elements';
import {
  elementRender,
  elementTally,
  getMolecule,
  type Molecule,
} from '../../../lib/chemistry/molecules';

/**
 * YooLab molecule viewer.
 *
 * One component serves all seven molecules through `params.molecule`, which is
 * the point of the manifest's `params`: the rail shows seven specimens and the
 * bundle carries one viewer.
 *
 * Two decisions are worth stating, because both were tempting to get wrong.
 *
 * The whole molecule is two draw calls. Atoms are one InstancedMesh and every
 * bond cylinder is another, so the 24-atom caffeine and the 27-ion salt block
 * cost exactly what water costs. Changing render mode rewrites instance matrices
 * rather than rebuilding the scene, so switching between Que–cầu and Đặc is a
 * transition rather than a reload.
 *
 * World units are Ångström, and nothing scales the model. That is what lets
 * "Đo" mean something: the number it prints is measured off the same coordinates
 * the fact card quotes, so a student can check the textbook against the object.
 * Framing happens in the camera only.
 */

export type MoleculeViewerProps = { params?: Record<string, string> };

type RenderMode = 'ball' | 'space' | 'wire';

const MODE_LIST: { id: RenderMode; label: string; hint: string }[] = [
  { id: 'ball', label: 'Que–cầu', hint: 'Cầu theo bán kính cộng hoá trị, que là liên kết' },
  { id: 'space', label: 'Đặc', hint: 'Cầu theo bán kính van der Waals — thể tích thật của phân tử' },
  { id: 'wire', label: 'Khung', hint: 'Chỉ khung liên kết, thấy rõ hình dạng bộ xương' },
];

/** Cylinder radius in Å per mode; 0 means the mode draws no bonds at all. */
const BOND_RADIUS: Record<RenderMode, number> = { ball: 0.07, space: 0, wire: 0.05 };

/** Highlight for the selected atom and for the atoms being measured. */
const HIGHLIGHT = new THREE.Color('#00AAAB');

const UNIT_X = new THREE.Vector3(1, 0, 0);
const UNIT_Y = new THREE.Vector3(0, 1, 0);

const BOND_NAME: Record<number, string> = {
  1: 'liên kết đơn',
  2: 'liên kết đôi',
  3: 'liên kết ba',
};

/**
 * Sphere radius for one atom, in Å.
 *
 * Space-filling uses ionic radii inside a lattice rather than van der Waals
 * radii, because in rock salt the ionic pair sums to the lattice spacing and the
 * ions come out touching — which is the whole lesson. Wireframe gives every atom
 * the same small joint, the way a real stick model does.
 */
function atomRadius(symbol: string, mode: RenderMode, isLattice: boolean): number {
  const render = elementRender(symbol);
  if (mode === 'space') return isLattice ? render.ionic ?? render.vdw : render.vdw;
  if (mode === 'wire') return 0.075;
  return render.covalent * 0.42;
}

const atomLabel = (molecule: Molecule, index: number) =>
  `${molecule.atoms[index].element}${index + 1}`;

const atomVector = (molecule: Molecule, index: number) => {
  const atom = molecule.atoms[index];
  return new THREE.Vector3(atom.x, atom.y, atom.z);
};

const bondBetween = (molecule: Molecule, a: number, b: number) =>
  molecule.bonds.find(
    (bond) => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a),
  );

/* ========================================================================== */

export function MoleculeViewer({ params }: MoleculeViewerProps) {
  const molecule = getMolecule(params?.molecule);
  const [elements, setElements] = useState<Map<string, ElementData> | null>(null);
  const [failed, setFailed] = useState(false);

  /*
   * The element table is the same 74 kB file the periodic table loads, cached for
   * the session, so opening a molecule after the table is instant. The viewer
   * waits for it rather than showing an atom whose properties are blank: the
   * promise this experience makes is that clicking an atom tells you about the
   * element, and half of that is not worth shipping.
   */
  useEffect(() => {
    let cancelled = false;
    loadElements()
      .then((data) => {
        if (cancelled) return;
        setElements(new Map(data.map((element) => [element.symbol, element])));
      })
      .catch((error) => {
        console.error('Molecule viewer: element data failed to load', error);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <div className="mol">
        <div className="stage">
          <div className="stage-status is-error"><i />Không tải được dữ liệu nguyên tố.</div>
        </div>
      </div>
    );
  }

  if (!elements) {
    return (
      <div className="mol">
        <div className="stage">
          <div className="stage-status"><i />Đang tải dữ liệu nguyên tố…</div>
        </div>
      </div>
    );
  }

  // Keyed on the molecule so switching entries in the rail gets a clean scene
  // and a clean set of controls instead of a rebuilt one.
  return <MoleculeStage key={molecule.id} molecule={molecule} elements={elements} />;
}

/* ========================================================================== */

type SceneApi = {
  applyMode: (mode: RenderMode) => void;
  applyHighlight: (selected: number | null, picks: number[]) => void;
  zoomBy: (factor: number) => void;
  reset: () => void;
};

function MoleculeStage({
  molecule,
  elements,
}: {
  molecule: Molecule;
  elements: Map<string, ElementData>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const labelNodes = useRef<(HTMLSpanElement | null)[]>([]);
  const tagRef = useRef<HTMLSpanElement>(null);

  const [mode, setMode] = useState<RenderMode>('ball');
  const [labels, setLabels] = useState(false);
  const [measure, setMeasure] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  /*
   * Spin follows the motion preference until the visitor touches the switch.
   *
   * `null` means "nobody has decided", which is not the same as "off": a
   * reduced-motion visitor gets a still molecule and everyone else gets a
   * turning one, and either can override it, without the extra render an
   * effect-then-setState would cost.
   */
  const reducedMotion = usePrefersReducedMotion();
  const [spinChoice, setSpinChoice] = useState<boolean | null>(null);
  const spin = spinChoice ?? !reducedMotion;

  // The render loop and the canvas pointer handler read these, and neither may
  // rebuild the scene when a button is pressed. Written in effects, which is
  // what React now requires of a ref that mirrors state.
  const labelsRef = useRef(labels);
  const picksRef = useRef(picks);
  const measureRef = useRef(measure);
  const spinRef = useRef(spin);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { picksRef.current = picks; }, [picks]);
  useEffect(() => { measureRef.current = measure; }, [measure]);
  useEffect(() => { spinRef.current = spin; }, [spin]);

  /**
   * One click on an atom, from the canvas or from the atom strip.
   *
   * Outside measure mode a click selects. Inside it, clicks accumulate: two give
   * a bond length, three give an angle whose vertex is the second click, and a
   * fourth starts over — which is easier to explain than a modal "clear first".
   */
  const pickAtom = useCallback((index: number) => {
    setSelected(index);
    if (!measureRef.current) return;
    setPicks((current) => {
      if (current.length >= 3) return [index];
      if (current.includes(index)) return current;
      return [...current, index];
    });
  }, []);

  /* ------------------------------------------------------------- the scene --- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const compact = window.matchMedia('(max-width: 900px)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: !compact, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    /* The same exposure the shared stage runs at. This viewer builds its own
       renderer — it keeps a transparent canvas so the ten-control bar and the
       projected measurement guides do not have to fight an opaque buffer — but
       "its own renderer" was quietly becoming "its own look". */
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.4 : 1.7));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'stage-canvas';
    host.appendChild(renderer.domElement);

    const environment = createProceduralEnvironment(renderer, libraryEnvironmentPalette);
    scene.environment = environment.texture;
    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xdccbb6, 0.86));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.15);
    key.position.set(-3, 4.2, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd6c2, 1.42);
    rim.position.set(4, -1.2, -4);
    scene.add(rim);

    /*
     * The floor, and the mark the molecule leaves on it.
     *
     * Both blend over a transparent canvas, so they work here without the opaque
     * backdrop plate the model stages need — the CSS gradient on
     * `.library-viewer-stage` is this viewer's plate, and it carries the same
     * three tones. A measured floor is not decoration under a molecule: this is
     * the one viewer in the Library whose whole subject is distance, and the grid
     * is the only thing in the frame that says how big an ångström is.
     */
    const shadow = createContactShadow();
    scene.add(shadow.mesh);
    const grid = createLearningGrid();
    scene.add(grid.mesh);

    const root = new THREE.Group();
    scene.add(root);

    /* --------------------------------------------------------- coordinates --- */
    // Translated onto the centroid so orbiting turns the molecule in place.
    // Translation preserves every distance and angle, so the measurements are
    // still the ones in the data file.
    const positions = molecule.atoms.map((atom) => new THREE.Vector3(atom.x, atom.y, atom.z));
    const centroid = new THREE.Vector3();
    for (const position of positions) centroid.add(position);
    centroid.divideScalar(Math.max(positions.length, 1));
    for (const position of positions) position.sub(centroid);

    const isLattice = molecule.isLattice ?? false;
    const baseColors = molecule.atoms.map((atom) => new THREE.Color(elementRender(atom.element).color));

    /* --------------------------------------------------------------- atoms --- */
    const sphere = new THREE.SphereGeometry(1, compact ? 20 : 30, compact ? 14 : 20);
    const atomMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.28,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.05,
    });
    const atoms = new THREE.InstancedMesh(sphere, atomMaterial, positions.length);
    atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Created explicitly rather than through setColorAt so the attribute is a
    // value this closure owns and can flag dirty without a null check.
    const atomColor = new THREE.InstancedBufferAttribute(new Float32Array(positions.length * 3), 3);
    atoms.instanceColor = atomColor;
    atoms.frustumCulled = false;
    root.add(atoms);

    /*
     * A second, invisible sphere set for picking.
     *
     * In Khung mode the drawn atoms are 0.075 Å joints, which is a two-pixel
     * target; in Đặc mode they are larger than the pick target would otherwise
     * be. Raycasting a hidden mesh sized at max(drawn, 0.34 Å) makes every atom
     * clickable in every mode, and an invisible object costs no draw call.
     */
    const pickMesh = new THREE.InstancedMesh(sphere, atomMaterial, positions.length);
    pickMesh.visible = false;
    pickMesh.frustumCulled = false;
    root.add(pickMesh);

    /* --------------------------------------------------------------- bonds --- */
    /*
     * Every cylinder is split in two so each half takes the colour of the atom
     * it grows out of — the CPK convention — and a double bond is two parallel
     * cylinders offset across the bond axis. All of it lives in one InstancedMesh
     * whose `count` shrinks to zero in space-filling mode.
     */
    type Segment = {
      a: number;
      b: number;
      axis: THREE.Vector3;
      offsetAxis: THREE.Vector3;
      shift: number;
      half: 0 | 1;
    };
    const segments: Segment[] = [];
    for (const bond of molecule.bonds) {
      const from = positions[bond.a];
      const to = positions[bond.b];
      if (!from || !to) continue;
      const axis = new THREE.Vector3().subVectors(to, from);
      if (axis.length() < 1e-4) continue;
      axis.normalize();
      const across = Math.abs(axis.y) > 0.9 ? UNIT_X : UNIT_Y;
      const offsetAxis = new THREE.Vector3().crossVectors(axis, across).normalize();
      for (let order = 0; order < bond.order; order += 1) {
        const shift = order - (bond.order - 1) / 2;
        segments.push({ a: bond.a, b: bond.b, axis, offsetAxis, shift, half: 0 });
        segments.push({ a: bond.a, b: bond.b, axis, offsetAxis, shift, half: 1 });
      }
    }

    const cylinder = new THREE.CylinderGeometry(1, 1, 1, compact ? 10 : 14, 1, false);
    const bondMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.36,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1,
    });
    const bonds = new THREE.InstancedMesh(cylinder, bondMaterial, Math.max(segments.length, 1));
    bonds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const bondColor = new THREE.InstancedBufferAttribute(
      new Float32Array(Math.max(segments.length, 1) * 3),
      3,
    );
    bonds.instanceColor = bondColor;
    bonds.frustumCulled = false;
    root.add(bonds);

    /* --------------------------------------------------- measurement guide --- */
    const guideGeometry = new THREE.BufferGeometry();
    const guidePoints = new THREE.BufferAttribute(new Float32Array(9), 3);
    guideGeometry.setAttribute('position', guidePoints);
    const guideMaterial = new THREE.LineBasicMaterial({
      color: 0x008c8d, transparent: true, opacity: 0.85,
    });
    const guide = new THREE.Line(guideGeometry, guideMaterial);
    guide.visible = false;
    guide.frustumCulled = false;
    root.add(guide);

    /* ---------------------------------------------------------- the layout --- */
    const dummy = new THREE.Object3D();
    const midpoint = new THREE.Vector3();
    const centre = new THREE.Vector3();
    let currentMode: RenderMode = 'ball';
    let highlighted: number[] = [];
    /** Radius of the sphere that has to fit in frame, in Å. */
    let frame = 1;

    const layoutAtoms = () => {
      frame = 0.35;
      for (let index = 0; index < positions.length; index += 1) {
        const symbol = molecule.atoms[index].element;
        const radius = atomRadius(symbol, currentMode, isLattice);
        const lit = highlighted.includes(index);
        dummy.position.copy(positions[index]);
        dummy.quaternion.identity();
        dummy.scale.setScalar(radius * (lit ? 1.16 : 1));
        dummy.updateMatrix();
        atoms.setMatrixAt(index, dummy.matrix);
        dummy.scale.setScalar(Math.max(radius, 0.34));
        dummy.updateMatrix();
        pickMesh.setMatrixAt(index, dummy.matrix);

        const colour = lit ? HIGHLIGHT : baseColors[index];
        atomColor.setXYZ(index, colour.r, colour.g, colour.b);
        frame = Math.max(frame, positions[index].length() + radius);
      }
      atoms.instanceMatrix.needsUpdate = true;
      atomColor.needsUpdate = true;
      pickMesh.instanceMatrix.needsUpdate = true;
      atoms.computeBoundingSphere();
      pickMesh.computeBoundingSphere();
      // `frame` is the radius that has to fit, and it changes with the mode:
      // space-fill spheres are van der Waals radii, ball-and-stick ones are a
      // third of that. The floor follows, or it belongs to the previous mode.
      const extent = new THREE.Vector3(frame, frame, frame);
      const bounds = new THREE.Box3(extent.clone().negate(), extent);
      shadow.fit(bounds);
      grid.fit(bounds);
    };

    const layoutBonds = () => {
      const radius = BOND_RADIUS[currentMode];
      if (radius <= 0 || segments.length === 0) {
        bonds.count = 0;
        return;
      }
      const gap = radius * 2.6;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const from = positions[segment.a];
        const to = positions[segment.b];
        midpoint.lerpVectors(from, to, 0.5);
        const start = segment.half === 0 ? from : midpoint;
        const end = segment.half === 0 ? midpoint : to;
        centre.addVectors(start, end).multiplyScalar(0.5)
          .addScaledVector(segment.offsetAxis, segment.shift * gap);
        dummy.position.copy(centre);
        dummy.quaternion.setFromUnitVectors(UNIT_Y, segment.axis);
        dummy.scale.set(radius, start.distanceTo(end), radius);
        dummy.updateMatrix();
        bonds.setMatrixAt(index, dummy.matrix);
        const colour = baseColors[segment.half === 0 ? segment.a : segment.b];
        bondColor.setXYZ(index, colour.r, colour.g, colour.b);
      }
      bonds.count = segments.length;
      bonds.instanceMatrix.needsUpdate = true;
      bondColor.needsUpdate = true;
      bonds.computeBoundingSphere();
    };

    /* ------------------------------------------------------------- framing --- */
    let yaw = 0.62;
    let pitch = 0.2;
    let yawTarget = yaw;
    let pitchTarget = pitch;
    let zoom = 1;
    let distance = 6;
    let distanceTarget = distance;

    const fittedDistance = () => {
      const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
      return Math.max(frame / Math.sin(vertical), frame / Math.sin(horizontal)) * 1.12;
    };

    /* -------------------------------------------------------------- resize --- */
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      distanceTarget = fittedDistance() * zoom;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    layoutAtoms();
    layoutBonds();
    resize();
    distance = distanceTarget;

    /* ----------------------------------------------------- imperative API --- */
    apiRef.current = {
      applyMode: (next) => {
        currentMode = next;
        layoutAtoms();
        layoutBonds();
        // Lerped rather than snapped: the space-filling model needs a lot more
        // room than the wireframe, and a jump cut between them loses the fact
        // that it is the same object.
        distanceTarget = fittedDistance() * zoom;
      },
      applyHighlight: (selection, marks) => {
        highlighted = selection === null ? [...marks] : [...new Set([...marks, selection])];
        layoutAtoms();
        if (marks.length >= 2) {
          for (let index = 0; index < marks.length; index += 1) {
            const point = positions[marks[index]];
            guidePoints.setXYZ(index, point.x, point.y, point.z);
          }
          guideGeometry.setDrawRange(0, marks.length);
          guidePoints.needsUpdate = true;
          guide.visible = true;
        } else {
          guide.visible = false;
        }
      },
      zoomBy: (factor) => {
        zoom = THREE.MathUtils.clamp(zoom * factor, 0.42, 2.6);
        distanceTarget = fittedDistance() * zoom;
      },
      reset: () => {
        yawTarget = 0.62;
        pitchTarget = 0.2;
        zoom = 1;
        distanceTarget = fittedDistance();
      },
    };

    /* --------------------------------------------------------------- input --- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let travelled = 0;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      travelled = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      host.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      travelled += Math.abs(dx) + Math.abs(dy);
      yawTarget -= dx * 0.008;
      pitchTarget = THREE.MathUtils.clamp(pitchTarget + dy * 0.006, -1.25, 1.25);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      if (travelled > 6) return;
      const rect = host.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const instanceId = raycaster.intersectObject(pickMesh, false)[0]?.instanceId;
      if (instanceId !== undefined) pickAtom(instanceId);
    };
    const onWheel = (event: WheelEvent) => {
      // Claims the wheel only for a clear zoom gesture, so the page still
      // scrolls past the viewer.
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom * (1 + event.deltaY * 0.0012), 0.42, 2.6);
      distanceTarget = fittedDistance() * zoom;
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);
    host.addEventListener('wheel', onWheel, { passive: false });

    /* ----------------------------------------------------- pause when idle --- */
    const gate = createVisibilityGate(host, 160);
    const onScreen = () => gate.visible();
    let tabVisible = document.visibilityState !== 'hidden';
    const onVisibility = () => { tabVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    /* ----------------------------------------------------------- overlays --- */
    /*
     * Atom labels are DOM, not sprites.
     *
     * Projecting the atom positions and moving spans keeps crisp Vietnamese type
     * and costs no texture, no extra draw call and no disposal. Far atoms fade so
     * a label on the back of caffeine does not compete with the one in front.
     */
    const projected = new THREE.Vector3();
    const updateOverlays = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const place = (node: HTMLSpanElement, point: THREE.Vector3) => {
        projected.copy(point).project(camera);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      };

      if (labelsRef.current) {
        for (let index = 0; index < positions.length; index += 1) {
          const node = labelNodes.current[index];
          if (!node) continue;
          const point = positions[index];
          place(node, point);
          const depth = (camera.position.distanceTo(point) - (distance - frame)) / (frame * 2);
          node.style.opacity = String(THREE.MathUtils.clamp(1 - depth * 0.72, 0.26, 1));
        }
      }

      const tag = tagRef.current;
      const marks = picksRef.current;
      if (tag && marks.length >= 2) {
        // Two picks read at the midpoint of the span being measured; three read
        // at the vertex, which is where the angle actually is.
        if (marks.length === 2) midpoint.lerpVectors(positions[marks[0]], positions[marks[1]], 0.5);
        else midpoint.copy(positions[marks[1]]);
        place(tag, midpoint);
      }
    };

    /* --------------------------------------------------------------- frame --- */
    const timer = new THREE.Timer();
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!onScreen() || !tabVisible) return;
      if (spinRef.current && !dragging) yawTarget += delta * 0.24;
      const ease = 1 - Math.pow(0.0025, delta);
      yaw += (yawTarget - yaw) * ease;
      pitch += (pitchTarget - pitch) * ease;
      distance += (distanceTarget - distance) * ease;
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      updateOverlays();
    });

    return () => {
      renderer.setAnimationLoop(null);
      apiRef.current = null;
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      host.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      gate.dispose();
      shadow.dispose();
      grid.dispose();
      atoms.dispose();
      pickMesh.dispose();
      bonds.dispose();
      sphere.dispose();
      cylinder.dispose();
      guideGeometry.dispose();
      atomMaterial.dispose();
      bondMaterial.dispose();
      guideMaterial.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [molecule, pickAtom]);

  /* --------------------------------------------------- state into the scene --- */
  useEffect(() => { apiRef.current?.applyMode(mode); }, [mode]);
  useEffect(() => { apiRef.current?.applyHighlight(selected, picks); }, [selected, picks]);

  /* ------------------------------------------------------------- readouts --- */
  const tally = useMemo(() => elementTally(molecule), [molecule]);

  const measurement = useMemo(() => {
    if (picks.length === 2) {
      const [first, second] = picks;
      const bond = bondBetween(molecule, first, second);
      const gap = atomVector(molecule, first).distanceTo(atomVector(molecule, second));
      return {
        label: `${atomLabel(molecule, first)}–${atomLabel(molecule, second)}`,
        value: `${gap.toFixed(3)} Å`,
        note: bond
          ? molecule.isLattice
            ? 'tiếp xúc ion gần nhất'
            : BOND_NAME[bond.order] ?? 'liên kết'
          : 'hai nguyên tử không nối trực tiếp',
      };
    }
    if (picks.length === 3) {
      const [first, vertex, third] = picks;
      const centre = atomVector(molecule, vertex);
      const left = atomVector(molecule, first).sub(centre);
      const right = atomVector(molecule, third).sub(centre);
      const angle = THREE.MathUtils.radToDeg(left.angleTo(right));
      return {
        label: `${atomLabel(molecule, first)}–${atomLabel(molecule, vertex)}–${atomLabel(molecule, third)}`,
        value: `${angle.toFixed(1)}°`,
        note: `đỉnh góc là ${atomLabel(molecule, vertex)}`,
      };
    }
    return null;
  }, [molecule, picks]);

  const selectedElement =
    selected === null ? undefined : elements.get(molecule.atoms[selected].element);

  return (
    <div className="mol">
      <div className="stage">
        {/*
          The canvas lives in its own labelled `role="img"` box rather than in the
          stage itself. A `role="img"` element replaces its whole subtree with its
          label, so putting the control bar inside one would hide every button
          from a screen reader.
        */}
        <div
          className="mol-canvas"
          ref={hostRef}
          role="img"
          aria-label={`Mô hình phân tử ${molecule.nameVi} — ${molecule.formula}, ${molecule.geometry}`}
        />

        <div className="mol-bar">
          <div className="mol-group" role="group" aria-label="Kiểu hiển thị">
            {MODE_LIST.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={`mol-chip${mode === entry.id ? ' is-active' : ''}`}
                aria-pressed={mode === entry.id}
                title={entry.hint}
                onClick={() => setMode(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mol-group" role="group" aria-label="Công cụ">
            <button
              type="button"
              className={`mol-chip${labels ? ' is-active' : ''}`}
              aria-pressed={labels}
              onClick={() => setLabels((value) => !value)}
            >
              Nhãn nguyên tử
            </button>
            <button
              type="button"
              className={`mol-chip${measure ? ' is-active' : ''}`}
              aria-pressed={measure}
              onClick={() => {
                setMeasure((value) => !value);
                setPicks([]);
              }}
            >
              Đo
            </button>
            <button
              type="button"
              className="mol-chip mol-chip-icon"
              aria-label="Phóng to"
              onClick={() => apiRef.current?.zoomBy(0.82)}
            >
              <span aria-hidden="true">+</span>
            </button>
            <button
              type="button"
              className="mol-chip mol-chip-icon"
              aria-label="Thu nhỏ"
              onClick={() => apiRef.current?.zoomBy(1.22)}
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              type="button"
              className="mol-chip"
              onClick={() => apiRef.current?.reset()}
            >
              Đặt lại góc nhìn
            </button>
          </div>
        </div>

        <div className="mol-overlay" aria-hidden="true">
          {labels
            ? molecule.atoms.map((atom, index) => (
                <span
                  key={index}
                  className="mol-label"
                  ref={(node) => { labelNodes.current[index] = node; }}
                >
                  {atom.element}
                  <i>{index + 1}</i>
                </span>
              ))
            : null}
          {measurement ? <span className="mol-tag" ref={tagRef}>{measurement.value}</span> : null}
        </div>

        <div className="stage-caption">
          <b>{molecule.nameVi}</b>
          <span>
            {molecule.formula} · {molecule.geometry}
            {molecule.bondAngle ? ` · ${molecule.bondAngle}` : ''}
          </span>
        </div>

        <p className="stage-hint">
          {measure
            ? 'Nhấp hai nguyên tử để đo độ dài · ba nguyên tử để đo góc'
            : 'Kéo để quay · lăn chuột để phóng · nhấp một nguyên tử để xem'}
        </p>

        <button
          type="button"
          className={`stage-spin${spin ? ' is-active' : ''}`}
          aria-pressed={spin}
          onClick={() => setSpinChoice(!spin)}
        >
          {/* The section's one auto-rotate control, shared with both model
              stages: same mark, same two-line label, same switch. This used to
              be a bespoke arrow and the word "Tự quay", which made the molecule
              viewer the only specimen on the page whose rotation toggle looked
              like a different product's. */}
          <LibraryIcon name="spin" className="stage-spin-mark" />
          <span>Tự động<br />xoay</span>
          <i className="stage-switch" aria-hidden="true"><em /></i>
        </button>
      </div>

      <div className="mol-panel">
        <div className="mol-legend">
          <ul>
            {tally.map((entry) => {
              const element = elements.get(entry.symbol);
              return (
                <li key={entry.symbol}>
                  <i style={{ background: elementRender(entry.symbol).color }} aria-hidden="true" />
                  <b>{entry.symbol}</b>
                  <span>{element ? VI_NAME[entry.symbol] ?? element.name : entry.symbol}</span>
                  <em>×{entry.count}</em>
                </li>
              );
            })}
          </ul>
          {molecule.formulaWeight !== undefined ? (
            <p className="mol-mass">
              {molecule.isLattice ? 'Khối lượng mol công thức' : 'Khối lượng mol'}
              <b>{molecule.formulaWeight.toFixed(2)} g/mol</b>
            </p>
          ) : null}
        </div>

        {/*
          The atom strip is the keyboard path into the model. Picking atoms by
          clicking the canvas is the natural gesture, but "Đo" is the feature that
          makes this a lesson, and a lesson that only works with a mouse is not
          finished.
        */}
        <div className="mol-atoms" role="group" aria-label="Chọn nguyên tử trong mô hình">
          {molecule.atoms.map((atom, index) => {
            const active = picks.includes(index) || selected === index;
            const element = elements.get(atom.element);
            return (
              <button
                type="button"
                key={index}
                className={`mol-atom${active ? ' is-active' : ''}`}
                aria-pressed={active}
                aria-label={`${atomLabel(molecule, index)} — ${element ? VI_NAME[atom.element] ?? element.name : atom.element}`}
                onClick={() => pickAtom(index)}
              >
                <i style={{ background: elementRender(atom.element).color }} aria-hidden="true" />
                {atomLabel(molecule, index)}
              </button>
            );
          })}
        </div>

        <div className="mol-readout">
          <p role="status">
            {measure && measurement ? (
              <>
                <b>{measurement.label}</b>
                <em>{measurement.value}</em>
                <span>{measurement.note}</span>
              </>
            ) : measure && picks.length === 1 ? (
              <>
                <b>{atomLabel(molecule, picks[0])}</b>
                <span>Chọn thêm một nguyên tử để đo độ dài, hai để đo góc.</span>
              </>
            ) : measure ? (
              <span>
                Nhấp hai nguyên tử để đọc độ dài liên kết theo Å. Nhấp ba nguyên tử để đọc góc — nguyên
                tử thứ hai là đỉnh góc.
              </span>
            ) : selectedElement && selected !== null ? (
              <>
                <b>{atomLabel(molecule, selected)}</b>
                <span>{VI_NAME[selectedElement.symbol] ?? selectedElement.name}</span>
                <span className="mol-fact">Số hiệu <i>{selectedElement.z}</i></span>
                <span className="mol-fact">Khối lượng <i>{formatNumber(selectedElement.mass, 'u')}</i></span>
                <span className="mol-fact">
                  Độ âm điện <i>{formatNumber(selectedElement.electronegativity)}</i>
                </span>
              </>
            ) : molecule.isLattice ? (
              <span>
                Đây là một mảnh mạng tinh thể, không phải một phân tử: NaCl chỉ là tỉ lệ số ion. Các đoạn
                nối là tiếp xúc Na⁺–Cl⁻ gần nhất, không phải liên kết cộng hoá trị.
              </span>
            ) : (
              <span>
                Nhấp một nguyên tử để xem nguyên tố của nó. Bật “Đo” để đọc độ dài và góc liên kết.
              </span>
            )}
          </p>
          {picks.length > 0 ? (
            <button type="button" className="mol-clear" onClick={() => setPicks([])}>
              Xoá phép đo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
