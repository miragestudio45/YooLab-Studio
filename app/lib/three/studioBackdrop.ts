import * as THREE from 'three';

/**
 * The two things a specimen needs behind and beneath it.
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
 */

export type BackdropPalette = {
  /** Centre of the gradient — the brightest point, behind the subject. */
  center: THREE.ColorRepresentation;
  /** Mid stop, the body of the plate. */
  mid: THREE.ColorRepresentation;
  /** Edge stop, so the frame closes rather than fading to flat. */
  edge: THREE.ColorRepresentation;
};

/* Ivory room, straight off the surface tokens: --color-surface-raised in the
   middle, --color-surface through the body, --color-surface-2 at the rim. */
export const libraryBackdropPalette: BackdropPalette = {
  center: 0xffffff,
  mid: 0xfffdf9,
  edge: 0xf3ebe0,
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
    // in the corners. The second stop therefore only lands in the corners, which
    // is what keeps the plate from looking like a vignette.
    float radius = length(vUv - 0.5) * 2.0;
    vec3 color = mix(uCenter, uMid, smoothstep(0.0, 0.66, radius));
    color = mix(color, uEdge, smoothstep(0.52, 1.30, radius));
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
  mesh.position.set(0, 0, -BACKDROP_DISTANCE);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  // Parented to the camera so the plate stays a full-frame plate no matter where
  // the orbit puts the camera.
  camera.add(mesh);

  const resize = () => {
    // A 30% margin over the exact frustum half-height: cheap insurance against
    // the roll tilt rotating a corner of the plate into view.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5 * 1.3) * BACKDROP_DISTANCE;
    mesh.scale.set(half * Math.max(camera.aspect, 1e-3), half, 1);
  };
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
