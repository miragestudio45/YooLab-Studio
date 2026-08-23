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
  // Tentacles dominate the bounding sphere, so aim high and move in close.
  url: '/asset/fish/jellyfish.glb', preset: 'opal', yaw: 0.5, pitch: 0.1, poseTime: 1.4, zoom: 0.62, targetY: 0.74,
};

export const BEE_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/bee/bee_fixed.glb', preset: 'ruby', yaw: 0.9, pitch: 0.2, poseTime: 0.6, zoom: 1.26,
};

export const CLOWNFISH_THUMBNAIL: ThumbnailRequest = {
  url: '/asset/fish/Fish.glb', preset: 'natural', yaw: 1.5, pitch: 0.12, poseTime: 0.9, zoom: 1.2,
};
