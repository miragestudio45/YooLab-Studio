import type { ThumbnailRequest } from './thumbnails';

/**
 * Shared thumbnail requests.
 *
 * These live in their own module so every section that needs a picture of an
 * asset imports the *same object identity* and therefore the same cache key —
 * one bake serves the library card, the bridge, the education roles and the
 * sample-lesson proof layer. Keeping them out of `LibrarySection` also stops
 * lighter sections from pulling the Formula runtime into their chunk.
 */

export const JELLYFISH_THUMBNAIL: ThumbnailRequest = {
  /*
   * Tentacles dominate the bounding sphere, so the aim is high — but only a
   * little. Tuned for a 56 px rail chip, `zoom: 0.62` cropped the tentacles off
   * entirely, and the same bake is what the studio mock and the education
   * section show at 500 px, where a bell with its tentacles sliced off at the
   * frame edge reads as a broken render rather than as a close-up.
   */
  url: '/asset/fish/jellyfish.glb', preset: 'opal', yaw: 0.5, pitch: 0.1, poseTime: 1.4, zoom: 0.9, targetY: 0.58,
};

export const BEE_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/bee/bee_fixed.glb', preset: 'ruby', yaw: 0.9, pitch: 0.2, poseTime: 0.6, zoom: 1.26,
};

export const CLOWNFISH_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/fish/Fish.glb', preset: 'natural', yaw: 1.5, pitch: 0.12, poseTime: 0.9, zoom: 1.2,
};

/*
 * The T-rex, three quarters on and posed mid-bite.
 *
 * `natural`, because this is the one Library model that arrives with real
 * painted textures — a teal-and-rust hide over a normal and an occlusion map —
 * and any preset here would throw the skin away and bake a grey lizard. The
 * `poseTime` lands inside the first clip (`run`) rather than in the bind pose:
 * a T-posed theropod is a plank, and the rail chip has 56 px to say "dinosaur".
 * `targetY` aims high because the tail is half the bounding box and none of the
 * animal's identity is in it.
 */
export const TREX_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/T-rex/T-rex.glb',
  preset: 'natural',
  width: 224,
  height: 224,
  yaw: 1.02,
  pitch: 0.16,
  poseTime: 0.45,
  zoom: 1.04,
  targetY: 0.62,
};

/*
 * The two below are baked small on purpose.
 *
 * The three creature thumbnails above are also used at card size elsewhere on
 * the page, so they keep the default 560×420. These two only ever appear in the
 * Library rail (56 px) and in the knowledge panel (44 px), and the baker
 * serialises its queue — so every pixel baked past what is displayed delays the
 * next thumbnail in the rail rather than costing nothing.
 */

export const GRAM_WALL_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/Library/Biology/gram-positive-wall.glb',
  preset: 'tissue',
  width: 176,
  height: 176,
  yaw: 0.72,
  pitch: 0.2,
  zoom: 1.06,
};

export const TOOLKIT_THUMBNAIL: ThumbnailRequest = {
  // A screwdriver is a long thin diagonal. Looking down the shaft from above is
  // the only angle at which it still reads as a tool inside a 56 px circle.
  url: '/asset/Library/Car/screwdriver.glb',
  preset: 'steel',
  width: 176,
  height: 176,
  yaw: 1.15,
  pitch: 0.42,
  zoom: 1.02,
};

/*
 * The three robotics showcase models.
 *
 * `natural`, like the T-rex and for the same reason: all three arrive with real
 * painted texture sets — base colour, normal and an ORM pack, in WebP — and any
 * preset here would throw those away and bake three identical grey shapes. See
 * `app/lib/education/showcase.ts` for what they are and where they are used.
 *
 * Each carries one authored clip that runs for ten seconds or more, so
 * `poseTime` is not a detail: at t = 0 the drone's legs are folded flat against
 * the chassis, the spider is in its rest crouch and the whale is straight. The
 * values below land inside the moving part of each reel, where the machine is
 * doing the thing it is worth a picture of.
 */

export const WORK_DRONE_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/robotics/work-drone.glb',
  preset: 'natural',
  width: 224,
  height: 224,
  yaw: 0.92,
  pitch: 0.26,
  poseTime: 6,
  zoom: 1.04,
};

export const SPIDER_DRONE_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/robotics/spider-drone.glb',
  preset: 'natural',
  width: 224,
  height: 224,
  yaw: 1.1,
  pitch: 0.34,
  poseTime: 6.5,
  zoom: 1.04,
};

export const MECH_WHALE_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/robotics/mech-whale.glb',
  preset: 'natural',
  width: 224,
  height: 224,
  yaw: 1.24,
  pitch: 0.22,
  poseTime: 4.4,
  zoom: 1.02,
};
