'use client';

import { ModelThumbnail } from '../ModelThumbnail';
import { LibraryMark } from './LibraryMark';
import {
  BEE_THUMBNAIL,
  CLOWNFISH_THUMBNAIL,
  GRAM_WALL_THUMBNAIL,
  JELLYFISH_THUMBNAIL,
  TOOLKIT_THUMBNAIL,
  TREX_THUMBNAIL,
} from '../../lib/three/thumbnailRequests';
import type { ThumbnailRequest } from '../../lib/three/thumbnails';
import type { RailVisual as RailVisualSpec, ThumbnailKey } from '../../lib/library/types';

/**
 * One row's picture, resolved from the manifest's `rail` field.
 *
 * Anything with a real mesh gets a real render of that mesh; everything else
 * gets a drawn diagram. The split is what keeps the rail honest — a picture in
 * the rail is either the object itself or visibly a diagram of it, never a
 * decorative stand-in for an asset that does not exist.
 *
 * The requests come from the shared module rather than being built here, because
 * object identity is the bake cache key: the rail's bee is the *same* request
 * object as the bridge's and the proof layer's, so the second and third uses are
 * free. That is also why the Formula entry is a photograph — the workshop is a
 * full scene, and a 56 px bake of a car would show a grey smudge.
 */

const FORMULA_POSTER = '/asset/Library/Car/formula-preview.jpg';

const BAKED: Record<Exclude<ThumbnailKey, 'formula'>, ThumbnailRequest> = {
  bee: BEE_THUMBNAIL,
  fish: CLOWNFISH_THUMBNAIL,
  jellyfish: JELLYFISH_THUMBNAIL,
  trex: TREX_THUMBNAIL,
  'gram-wall': GRAM_WALL_THUMBNAIL,
  toolkit: TOOLKIT_THUMBNAIL,
};

/**
 * Decorative by construction: every place this is used, the row, card or panel
 * beside it already carries the specimen's name as text, so an alt string here
 * would only make a screen reader read the title twice.
 */
export function RailVisual({ visual }: { visual: RailVisualSpec }) {
  if (visual.kind === 'mark') return <LibraryMark mark={visual.mark} />;
  if (visual.thumb === 'formula') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="rail-visual-photo" src={FORMULA_POSTER} alt="" loading="lazy" decoding="async" />
    );
  }
  return <ModelThumbnail request={BAKED[visual.thumb]} alt="" />;
}
