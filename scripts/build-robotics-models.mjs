/**
 * Prepares the three robotics models the Education panel runs.
 *
 * The sources are in `reference-sources/Model -robot/`. They arrive already
 * optimised — glTF-Transform has meshopt-compressed the geometry and animation,
 * quantized the attributes and re-encoded every texture to WebP — so there is no
 * geometry work to do here and this script deliberately does none. `repackGlb`
 * in `lib/glb.mjs` cannot be used on them for exactly that reason: it rebuilds
 * accessors by copying their bufferViews verbatim, which for a meshopt-packed
 * view copies compressed bytes into a slot the loader will read as raw floats.
 *
 * All three are therefore copied byte for byte, and this file is a manifest with
 * a `cp` in it. It is worth keeping as a script rather than as three checked-in
 * copies because it records *which* source produced which shipped file, and
 * because the history below is the reason the drone renders at all.
 *
 * ## The four-skin set, and the bug that came out of subsetting it
 *
 * `Dv2 Animated 4 Skins Set.glb` is not one drone. It is FOUR — Cybertech,
 * RedManga, SciFi and Wood — as four sibling subtrees under the same root, all
 * at the origin, at scales three orders of magnitude apart (1.5708, 0.0069,
 * 0.00035, 0.0069).
 *
 * That scale spread is not sloppy authoring. **It is the skin switch.** Each
 * `Dummy00N` carries a `scale` track that holds its drone at 1.5708 for one
 * window of the 19.33 s reel and at its own near-zero value for the rest:
 *
 * | Window | Full size |
 * | --- | --- |
 * | 0.04 – 5.00 s | Cybertech |
 * | 5.04 – 9.63 s | RedManga |
 * | 9.67 – 13.71 s | SciFi |
 * | 13.75 – 18.67 s | Wood |
 * | 18.71 – 19.33 s | Cybertech again |
 *
 * So the reel *is* the livery change: one drone is on stage at a time and the
 * next one grows into its place over a single frame.
 *
 * This script used to subset the file down to the Cybertech subtree, to save the
 * 901 KB of texture data belonging to skins nothing drew. The subset was correct
 * about every table it renumbered and wrong about the one thing that mattered:
 * it kept `Dummy001`'s scale track while deleting the three siblings that track
 * exists to take turns with. What shipped was a drone that is **full size for
 * 5.0 s of every 19.33 s and 218 times too small for the other 13.7** — and,
 * worse, `showcase.ts` fits the camera at `poseTime: 6`, which lands inside the
 * collapsed window, so the camera distance, the near and far planes, the contact
 * shadow and the learning grid were all solved against a bounding box measured
 * at 0.015 × 0.010 × 0.030 instead of roughly 3.3 × 2.0 × 6.5. Measured in the
 * real browser: `Dummy001` at scale 0.0072 with the mixer held at t = 6.
 *
 * Two things had to be true for the fix, and copying the file whole is what
 * makes both true at once:
 *
 *   1. **Nothing hides.** At every instant exactly one of the four is at 1.5708,
 *      so the box the camera is fitted against is always a whole drone.
 *   2. **The livery change is the feature.** The panel now shows the machine in
 *      all four finishes, which is what the asset was authored to do.
 *
 * The one runtime adaptation still needed is the root translation. Every skin's
 * root travels — up to 1.66 units on Wood, ten times the drift of the two quiet
 * ones — because a games-pipeline reel expects an engine to carry the aircraft.
 * `ModelStage`'s `lockRoot` flattens that track on **all four** roots (they are
 * the four shallowest nodes whose name starts with `Drone v2 WorkMachine`), so
 * each livery performs in place. Rotation is left alone: it reads as pure yaw
 * plus a mild bank — the drone turning to show itself off — not as a tumble.
 *
 * Cost of shipping the whole file: 337 KB → 1,158 KB, of which the 12 extra
 * images are the three liveries' own maps. They are no longer dead weight, and
 * the stage is behind `lazy` plus the context budget, so nothing is fetched
 * until a visitor is within 1.6 viewports of the Education section.
 *
 * ## THIS IS NOT A LICENCE
 *
 * All three came from Sketchfab per the hand-off, and that is a marketplace
 * rather than a licence: entries there ship under anything from CC0 to
 * "editorial use only". Until the specific entry and its terms are recorded in
 * THIRD_PARTY_ASSETS.md, these carry no `credits` block and stay out of the
 * Library manifest — see `app/lib/education/showcase.ts`.
 *
 * Run: node scripts/build-robotics-models.mjs
 */

import { copyFileSync, mkdirSync, statSync } from 'node:fs';

const SRC = 'reference-sources/Model -robot';
const OUT = 'public/asset/robotics';

/** [source, destination]. */
const MODELS = [
  ['Dv2 Animated 4 Skins Set.glb', 'work-drone.glb'],
  ['Spider Drone Animations Reel.glb', 'spider-drone.glb'],
  ['Biomechanical Whale Animated.glb', 'mech-whale.glb'],
];

mkdirSync(OUT, { recursive: true });

for (const [from, to] of MODELS) {
  const source = `${SRC}/${from}`;
  const destination = `${OUT}/${to}`;
  copyFileSync(source, destination);
  console.log(`  ${destination}  ${(statSync(destination).size / 1024).toFixed(0)} KB  (copied)`);
}
