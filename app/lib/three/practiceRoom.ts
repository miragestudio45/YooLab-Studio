import * as THREE from 'three';
import { createLibraryStage, type LibraryStage } from './libraryEnvironment';
import { createContactShadow, type ContactShadow } from './studioBackdrop';

/**
 * The room all three practice labs stand in.
 *
 * The brief for this section names the failure it is guarding against: a
 * Formula workshop that looks like YooLab, a drone lab that looks like the
 * sandbox it was adapted from, and a robot cell that looks like the industrial
 * project it was modelled on. Three renderers, three palettes, three lighting
 * rigs — one page. So there is exactly one room, and it is the Library's: the
 * same warm ivory backdrop, the same four-light rig, the same procedural
 * environment map, the same measured grid floor.
 *
 * This is a thin wrapper over `createLibraryStage` rather than a second stage.
 * Everything that makes the Library's viewers survive a real browser — the
 * self-healing visibility gate, the adaptive pixel-ratio governor, the pinned
 * canvas CSS size, the ordered teardown — is infrastructure this section needs
 * just as much and must not re-implement badly. What is added here is the two
 * things a *room with a floor* needs that a framed specimen does not:
 *
 *   - **a ground plane.** A specimen viewer draws a subject in mid-air over a
 *     camera-parented plate. A drone flying over a landing pad needs something
 *     under it, or "altitude" has nothing to be measured against.
 *   - **a fixed grid.** The Library fits its floor to the subject's own
 *     bounding box, because there the subject is the whole world. Here the
 *     *course* is the world and the subject moves through it, so the floor is
 *     sized once from the span the caller declares.
 */

export type PracticeRoom = {
  stage: LibraryStage;
  /** Opaque ivory floor. The grid is drawn just above it. */
  ground: THREE.Mesh;
  /** A soft ellipse the caller moves under whatever is currently in the air. */
  shadow: ContactShadow;
  dispose(): void;
};

export type PracticeRoomOptions = {
  /** Where the canvas is appended, if not `host`. */
  mount?: HTMLElement;
  fov?: number;
  /**
   * How wide the world is, in metres. The grid and the ground disc are sized
   * from this, and it is the one number that has to change when a course grows.
   */
  span: number;
  /** Floor height. Every lab here uses 0; kept explicit rather than assumed. */
  groundY?: number;
};

export function createPracticeRoom(host: HTMLElement, options: PracticeRoomOptions): PracticeRoom {
  const { span, groundY = 0 } = options;
  const stage = createLibraryStage(host, { mount: options.mount, fov: options.fov ?? 34 });

  /*
   * The floor.
   *
   * A disc rather than a plane, and unlit rather than shaded: the environment
   * map already carries the room's warmth, and a `MeshStandardMaterial` floor
   * this large picks up the directional key as a bright wash across one half of
   * it — which reads as a spotlight on an ivory page rather than as a floor. A
   * flat tone lets the grid and the contact shadows do all the spatial work.
   */
  /*
   * Wider than the grid, not narrower.
   *
   * The grid's own fade runs out at 4.55 reference units, which after the fit
   * below is about 1.33 × `span`. A disc sized to the span alone therefore ends
   * *inside* the last visible grid lines, and the floor reads as a plate lying
   * on a void with a hard circular edge — the exact artefact the Library's
   * backdrop notes call a vignette. 1.4 puts the disc's edge past the point
   * where the last line has already faded to nothing.
   */
  const groundGeometry = new THREE.CircleGeometry(span * 1.4, 96);
  const groundMaterial = new THREE.MeshBasicMaterial({ color: 0xf6f1e9 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY - 0.004;
  ground.renderOrder = -960;
  stage.scene.add(ground);

  /*
   * The grid, fitted once.
   *
   * `LearningGrid.fit` takes a box and scales the floor from its largest
   * dimension, so a cube of side `span` centred on the origin gives a grid whose
   * major lines land at a readable pitch for a course of that size. The box is
   * built rather than measured because the course is not the scene: measuring
   * would fold in the drone's own two-hundredth-of-a-metre propeller blades.
   */
  const half = span * 0.5;
  stage.grid.fit(new THREE.Box3(
    new THREE.Vector3(-half, groundY, -half),
    new THREE.Vector3(half, groundY, half),
  ));
  stage.grid.mesh.position.y = groundY + 0.002;

  const shadow = createContactShadow({ strength: 0.24 });
  shadow.mesh.position.y = groundY + 0.004;
  stage.scene.add(shadow.mesh);

  return {
    stage,
    ground,
    shadow,
    dispose() {
      shadow.dispose();
      ground.removeFromParent();
      groundGeometry.dispose();
      groundMaterial.dispose();
      stage.dispose();
    },
  };
}

/**
 * Seats and sizes the blob shadow under a subject at `position`.
 *
 * Separate from `ContactShadow.fit`, which takes a bounding box and is meant for
 * a specimen standing still. Here the subject is airborne and moving, so the
 * ellipse tracks its ground position and *fades and spreads with altitude* —
 * which is the only cue in the frame that says how high the aircraft is when it
 * is over open floor with nothing beside it.
 */
export function trackShadow(
  shadow: ContactShadow,
  position: THREE.Vector3,
  footprint: number,
  groundY = 0,
  maxHeight = 8,
) {
  const height = Math.max(0, position.y - groundY);
  const spread = 1 + Math.min(height / maxHeight, 1) * 1.6;
  shadow.mesh.position.set(position.x, groundY + 0.004, position.z);
  shadow.mesh.scale.set(footprint * spread, footprint * spread, 1);
  const material = shadow.mesh.material as THREE.ShaderMaterial;
  material.uniforms.uStrength.value = 0.3 * (1 - Math.min(height / maxHeight, 1) * 0.78);
}
