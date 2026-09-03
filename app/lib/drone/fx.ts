import * as THREE from 'three';
import type { DroneState } from './flight';

/**
 * The two effects that make the flight readable rather than merely visible.
 *
 * Both adapted from the upstream sandbox's `fx/` directory (MIT). Neither is
 * decoration and it is worth being explicit about why, because "add a trail"
 * is exactly the kind of thing that gets added for the wrong reason:
 *
 *   **the trail** is a readout of the tune. A quad correcting badly leaves a
 *   visibly scalloped path; a well-flown line is smooth. It is the only way to
 *   see, after the fact, what the last four seconds of flying actually looked
 *   like — and on a course, the only way to see whether the line through a gate
 *   was the line you meant.
 *
 *   **the downwash** is the altitude cue. In a room with a flat floor and no
 *   texture, a hovering aircraft at 0.3 m and one at 2 m look nearly identical
 *   from the chase camera. Rotor wash on the floor solves it the way it does in
 *   real life: the ring is tight and hard close in, wide and faint high up, and
 *   gone above about three metres.
 */

/* ----------------------------------------------------------------- trail --- */

const TRAIL_CAPACITY = 640;
/** Minimum distance between recorded points, metres. */
const TRAIL_STEP = 0.055;

export type MotionTrail = {
  line: THREE.Line;
  push(position: THREE.Vector3): void;
  reset(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
};

/**
 * A ribbon tracing where the aircraft has been.
 *
 * Points are appended at a fixed *spatial* interval rather than every frame, so
 * the trail carries consistent detail whether the aircraft is hovering or moving
 * at 5 m/s — and a hover does not burn the whole buffer standing still, which is
 * what a per-frame append does and is why the naive version shows nothing after
 * ten seconds of holding station.
 */
export function createMotionTrail(): MotionTrail {
  const positions = new Float32Array(TRAIL_CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    color: 0x00aaab,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  /* The buffer's bounding sphere is stale the moment a point is appended, and
     recomputing it every frame to satisfy the culler is pure waste for one line
     that is almost always on screen. */
  line.frustumCulled = false;

  let count = 0;
  const last = new THREE.Vector3();
  let primed = false;

  return {
    line,
    push(position: THREE.Vector3) {
      if (primed && position.distanceToSquared(last) < TRAIL_STEP * TRAIL_STEP) return;
      last.copy(position);
      primed = true;

      if (count >= TRAIL_CAPACITY) {
        /*
         * Shift rather than wrap.
         *
         * A ring buffer is cheaper and draws a line straight across the room
         * from the newest point to the oldest one, because `THREE.Line` has no
         * notion of a break. Copying 640 points is 1,920 floats once every
         * 35 metres flown, which is nothing.
         */
        positions.copyWithin(0, 3);
        count = TRAIL_CAPACITY - 1;
      }
      positions[count * 3] = position.x;
      positions[count * 3 + 1] = position.y;
      positions[count * 3 + 2] = position.z;
      count += 1;
      geometry.setDrawRange(0, count);
      attribute.needsUpdate = true;
    },
    reset() {
      count = 0;
      primed = false;
      geometry.setDrawRange(0, 0);
    },
    setVisible(visible: boolean) {
      line.visible = visible;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      line.removeFromParent();
    },
  };
}

/* -------------------------------------------------------------- downwash --- */

export type Downwash = {
  mesh: THREE.Mesh;
  update(state: DroneState, load: number, groundY?: number): void;
  dispose(): void;
};

/**
 * Rotor wash on the floor under the aircraft.
 *
 * A radial-gradient sprite rather than particles: particles would need a
 * spawn/lifetime pass every frame to communicate exactly one number — height —
 * and a disc that scales and fades with that number says it more clearly.
 *
 * Drawn from a canvas because a shader for one soft ring is a shader to maintain,
 * and this texture is 128² and generated once.
 */
export function createDownwash(): Downwash {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 64);
    /* Brightest at a *radius*, not at the centre: rotor wash is an annulus —
       the air goes down through the discs and out along the floor, so the
       ground is scoured in a ring under the props rather than under the hub. */
    gradient.addColorStop(0, 'rgba(255,255,255,0.06)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0x9a8f86,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -20;

  /** Above this height the wash no longer reaches the floor, metres. */
  const CEILING = 3.2;

  return {
    mesh,
    update(state: DroneState, load: number, groundY = 0) {
      const height = Math.max(0, state.position.y - groundY);
      if (height > CEILING || load < 0.06) {
        material.opacity = 0;
        return;
      }
      const fade = 1 - height / CEILING;
      /* Spreads with height and thins with it — the two together are what make
         the disc read as distance rather than as a spotlight. */
      const spread = 0.9 + height * 0.62;
      mesh.position.set(state.position.x, groundY + 0.006, state.position.z);
      mesh.scale.set(spread, spread, 1);
      material.opacity = fade * fade * Math.min(1, load / 0.45) * 0.5;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      mesh.removeFromParent();
    },
  };
}
