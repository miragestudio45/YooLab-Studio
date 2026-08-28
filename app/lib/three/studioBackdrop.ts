import * as THREE from 'three';

/**
 * The three things a specimen needs behind and beneath it.
 *
 * **Backdrop.** The bee's shell is screen-space glass: it samples a capture of
 * the scene and refracts it. With a transparent canvas and nothing in the scene
 * behind the animal, that capture is empty, every refraction term resolves to
 * near-black, and the glass reads as a smudge — which is precisely why the hero
 * puts a full-frame plate behind the bee and the old Library viewer could not.
 * So the Library stage gets a real in-scene backdrop: one plane parented to the
 * camera, one small radial-gradient shader, three stops from the ivory tokens.
 * Deliberately *not* the hero's `liquid.ts` — that is a ping-pong fluid
 * simulation with its own render targets, and a Library panel that runs one per
 * specimen would cost more than the specimen does.
 *
 * **Contact shadow.** A single soft ellipse on the floor under the subject. It
 * is the difference between an object in a room and a cut-out pasted onto a
 * gradient, and it costs one alpha-blended quad.
 *
 * **Learning grid.** The measured floor the subject stands on. It was written
 * for the bridge's bee and lived inside `CreatureStage`, which meant the eleven
 * Library specimens that do not go through that component had no floor at all —
 * a T-rex and a jellyfish hanging in an empty white field beside a bee standing
 * in a room. It is here now because "what is beneath the specimen" is a property
 * of the stage, not of one loader.
 */

export type BackdropPalette = {
  /** Centre of the gradient — the brightest point, behind the subject. */
  center: THREE.ColorRepresentation;
  /** Mid stop, the body of the plate. */
  mid: THREE.ColorRepresentation;
  /** Edge stop, so the frame closes rather than fading to flat. */
  edge: THREE.ColorRepresentation;
};

/*
 * Ivory room, with a floor-to-corner ramp the eye can actually find.
 *
 * The first version was the surface tokens read literally — `#ffffff` centre,
 * `--color-surface #fffdf9` body, `--color-surface-2 #f7f2ea` rim. Two of those
 * three stops are within two units of white, so the plate was flat: a specimen
 * was not lit against a room, it was cut out and laid on paper. Every pale
 * subject in the Library paid for it at once — the fish, the jellyfish and the
 * T-rex's bleached hide all lost their own highlights into the ground behind
 * them, which is what "nhợt nhạt · cháy sáng" is.
 *
 * The ramp is still ivory and still warm; it just travels. Centre sits a shade
 * under white so a specular hit on the specimen is the brightest thing in the
 * frame — the one rule a studio plate has to obey — and the rim reaches
 * `--color-cream` territory, which is a tone this page already uses between
 * sections, so the room is deeper without becoming a different room.
 */
export const libraryBackdropPalette: BackdropPalette = {
  /*
   * Retuned once the plate was actually visible on every stage.
   *
   * The values below used to be `#fffcf6 / #f8f2ea / #e2dace`, and they were
   * chosen while the plate was only reaching two viewers — see `fitToCamera`.
   * On those two it read as caramel, and the note under `edge` had already
   * worked out why and written down the rule: *depth comes from value, caramel
   * comes from saturation.* The hexes never quite followed it. The old rim held
   * 20 units of red-over-blue before tone mapping, and ACES — which this rig
   * runs at 0.92 exposure — pushes chroma up as it rolls value off, so it landed
   * on screen at 30. That is a tan, and a tan behind a pink organ or a violet
   * jellyfish is a coloured room fighting the specimen.
   *
   * So the ramp keeps its travel and spends it all on value: centre to rim still
   * drops about 25 units, and the red-over-blue spread across the three stops is
   * roughly halved. It is the same room, lit the same way, without the colour
   * cast that made one stage look like a different product.
   */
  center: 0xfffdfa,
  mid: 0xf7f4ef,
  /*
   * Warm *grey*, not tan.
   *
   * The first attempt at giving this plate depth reached for a deeper version of
   * the same cream — `0xe7d9c6` — and the whole viewer went the colour of milky
   * coffee. The lesson is the one the bridge preset already knew: how far the rim
   * drops is not what makes a studio plate read as a room, and the bridge's rim
   * (`0xded7e7`) is *darker* than this while looking like clean light, because it
   * holds almost no chroma. Depth comes from value; caramel comes from saturation.
   */
  edge: 0xe5e0d9,
};

const backdropVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const backdropFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uCenter;
  uniform vec3 uMid;
  uniform vec3 uEdge;
  varying vec2 vUv;
  void main() {
    // Radius in "half-frame" units: 0 at the middle, 1 at the nearer edge, ~1.41
    // in the corners.
    float radius = length(vUv - 0.5) * 2.0;
    vec3 color = mix(uCenter, uMid, smoothstep(0.0, 0.66, radius));
    // The rim stop has to finish PAST the corners, and at 0.52-to-1.30 it did
    // not: a corner sits at radius 1.41, so the ramp completed inside the frame
    // and two thirds of the edge colour had already landed along the middle of
    // every side. The plate was a vignette and every Library stage wore a dark
    // band down both edges. Ending at 1.52 is what makes the rim a corner event.
    color = mix(color, uEdge, smoothstep(0.72, 1.52, radius));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export type StudioBackdrop = {
  mesh: THREE.Mesh;
  /**
   * Rescales the plate to cover the frustum. Must run whenever the viewport
   * aspect or the field of view changes, or the plate leaves a wedge of clear
   * colour in the corners of a wide panel.
   */
  resize(): void;
  dispose(): void;
};

/** Distance in front of the camera. Far enough to sit behind any fitted subject. */
const BACKDROP_DISTANCE = 24;

export function createStudioBackdrop(
  camera: THREE.PerspectiveCamera,
  palette: BackdropPalette = libraryBackdropPalette,
): StudioBackdrop {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    name: 'studio_backdrop',
    vertexShader: backdropVertex,
    fragmentShader: backdropFragment,
    uniforms: {
      uCenter: { value: new THREE.Color(palette.center) },
      uMid: { value: new THREE.Color(palette.mid) },
      uEdge: { value: new THREE.Color(palette.edge) },
    },
    // Never occludes anything, and never takes part in depth sorting: it is a
    // backdrop, not geometry.
    depthWrite: false,
    depthTest: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'studio_backdrop';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  // Parented to the camera so the plate stays a full-frame plate no matter where
  // the orbit puts the camera.
  camera.add(mesh);

  /**
   * Put the plate inside the frustum the camera actually has, then scale it to
   * fill that frame.
   *
   * `BACKDROP_DISTANCE` alone was a silent, scale-dependent bug, and it is the
   * reason this plate was tuned twice while being visible on two stages out of
   * twenty. `depthTest: false` stops the plate from *sorting* against geometry;
   * it does nothing about **clip space**, and a vertex further away than the far
   * plane is discarded before any depth test happens. The far plane here is
   * derived from the subject (`fitCamera` returns `distance * MAX_ZOOM + reach *
   * 3`), so it tracks how big the subject is — and only a subject of roughly
   * three world units or more produces a frustum deep enough to reach 24.
   *
   * The Library's specimens sit on both sides of that line by accident. The
   * jellyfish (3.6) and the bee (3.42) cleared it and showed the room; the fish
   * (3.15) did not, and neither did the T-rex, the cells, the gram wall or any
   * of the twelve organs — those are authored at true anatomical scale, so an
   * eyeball's far plane is under a metre. Every one of those stages was showing
   * `LIBRARY_CLEAR_COLOR` — flat `#fffdf9`, no gradient at all — while two
   * stages showed a warm room, which is exactly the "why is this one yellow"
   * that a viewer notices without being able to name.
   *
   * The distance is arbitrary: this is a camera-parented billboard, so any
   * distance looks identical as long as the scale follows it. So take the
   * authored distance when the frustum is deep enough and otherwise sit just
   * inside the far plane, and the plate is scale-independent.
   */
  const fitToCamera = (view: THREE.PerspectiveCamera) => {
    const distance = Math.max(
      Math.min(BACKDROP_DISTANCE, view.far * 0.92),
      view.near * 2,
    );
    mesh.position.z = -distance;
    // A 30% margin over the exact frustum half-height: cheap insurance against
    // the roll tilt rotating a corner of the plate into view.
    const half = Math.tan(THREE.MathUtils.degToRad(view.fov) * 0.5 * 1.3) * distance;
    mesh.scale.set(half * Math.max(view.aspect, 1e-3), half, 1);
    /*
     * `onBeforeRender` runs *after* the renderer has walked the graph, so a
     * transform written here is not in `matrixWorld` yet and would be a frame
     * late — and one frame late is what a fit re-solve looks like on screen.
     * Composing it by hand is cheaper than forcing a second graph update.
     */
    mesh.updateMatrix();
    mesh.matrixWorld.multiplyMatrices(view.matrixWorld, mesh.matrix);
  };

  /* Per frame, not per resize: `near` and `far` are re-solved every time the fit
     changes — a new specimen, a new panel width, a scroll-wheel zoom — and none
     of those fire a resize. */
  mesh.onBeforeRender = (_renderer, _scene, view) => {
    fitToCamera(view as THREE.PerspectiveCamera);
  };

  const resize = () => fitToCamera(camera);
  resize();

  return {
    mesh,
    resize,
    dispose: () => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

/* -------------------------------------------------------------------------- */

const shadowFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float radius = min(length(vUv - 0.5) * 2.0, 1.0);
    // Squared falloff on top of the smoothstep: a linear ramp reads as a grey
    // disc, and the extra bias is what turns it into a shadow with a core.
    float mass = 1.0 - smoothstep(0.0, 1.0, radius);
    gl_FragColor = vec4(uColor, mass * mass * uStrength);
  }
`;

export type ContactShadow = {
  mesh: THREE.Mesh;
  /** Positions and scales the ellipse from the subject's own footprint. */
  fit(box: THREE.Box3): void;
  dispose(): void;
};

export function createContactShadow(options?: {
  color?: THREE.ColorRepresentation;
  strength?: number;
}): ContactShadow {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    name: 'contact_shadow',
    vertexShader: backdropVertex,
    fragmentShader: shadowFragment,
    uniforms: {
      // Warm brown rather than black: the ground is ivory, and a neutral black
      // shadow on a warm surface is the classic tell of a composited render.
      uColor: { value: new THREE.Color(options?.color ?? 0x6d5b4e) },
      uStrength: { value: options?.strength ?? 0.16 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'contact_shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -900;
  mesh.frustumCulled = false;

  return {
    mesh,
    fit: (box) => {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // Slightly wider than the footprint, and dropped a little below the lowest
      // point: a shadow that starts exactly at the silhouette edge looks glued
      // on, and most specimens here are framed in mid-air rather than standing.
      mesh.scale.set(
        Math.max(size.x, size.z * 0.35) * 0.72,
        Math.max(size.z, size.x * 0.35) * 0.72,
        1,
      );
      mesh.position.set(center.x, box.min.y - size.y * 0.16, center.z);
    },
    dispose: () => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

/* -------------------------------------------------------------------------- */

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

/**
 * The span the grid's authored numbers are calibrated against.
 *
 * Every constant in the shader above — the 0.34 minor pitch, the 1.70 major, the
 * 2.7 → 4.55 fade — was tuned by eye under the bridge's bee, which
 * `CreatureStage` normalises to 3.42 world units. Those numbers are kept exactly
 * as they were and the *mesh* is scaled instead, so the bee's floor still renders
 * at scale 1.0 and is unchanged to the pixel, while a subject of any other size
 * gets the same floor in the same proportions.
 *
 * Scaling the mesh rather than the pitch is what makes that possible: the shader
 * reads `position.xy`, which is local geometry space and therefore immune to the
 * mesh transform, so a 5× mesh draws 5× larger cells rather than 25× as many of
 * them. Line *thickness* still comes out at roughly one pixel at any scale
 * because `fwidth` is a screen-space derivative.
 */
const GRID_REFERENCE_SPAN = 3.42;

export type LearningGrid = {
  mesh: THREE.Mesh;
  /**
   * Sizes and seats the floor from the subject's own fitted box.
   *
   * The reference is the box's largest dimension rather than its footprint,
   * because a vertical specimen still needs a floor it reads as a floor: the
   * jellyfish's footprint is a fifth of its height, and a grid scaled to that
   * would be a doily under a two-metre animal.
   */
  fit(box: THREE.Box3): void;
  setVisible(value: boolean): void;
  dispose(): void;
};

export function createLearningGrid(): LearningGrid {
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
    fit: (box) => {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z, 1e-4);
      mesh.scale.setScalar(span / GRID_REFERENCE_SPAN);
      // The drop below the lowest point scales with the subject too, so a cell
      // is not sitting on a floor a dinosaur's clearance away from it.
      const clearance = Math.max(span * 0.0175, size.y * 0.12);
      mesh.position.set(center.x, box.min.y - clearance, center.z);
      // Fitting is what reveals it. The stage creates the grid hidden, so a
      // caller that never measures a subject draws nothing rather than a
      // 9-unit plane sitting at the world origin.
      mesh.visible = true;
    },
    setVisible: (value) => { mesh.visible = value; },
    dispose: () => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
