import type { EnvironmentPalette } from './environment';

/**
 * Library viewer environment — a warm ivory room.
 *
 * The Library panels are ivory and the borders are warm brown, so the room the
 * specimens reflect has to be the same room. Reusing the Explore palette here
 * put a cool blue cast in every highlight, which read as a specimen photographed
 * somewhere else and pasted in.
 */
export const libraryEnvironmentPalette: EnvironmentPalette = {
  zenith: 0xfffdf9,
  horizon: 0xf6efe6,
  ground: 0xece0d2,
  keyColor: 0xfff8ef,
  keyStrength: 5.2,
  rimColor: 0xffe0cf,
  rimStrength: 1.9,
  fillColor: 0xf1e6f4,
  fillStrength: 1.1,
};
