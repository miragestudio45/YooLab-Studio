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
