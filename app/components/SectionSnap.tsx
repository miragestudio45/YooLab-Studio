'use client';

import { useEffect } from 'react';
import { createSectionSnap } from '../lib/story/snap';

/**
 * Mounts the one chapter-snap controller.
 *
 * A component rather than a hook inside `ExploreStory` because the anchors span
 * more than the Explore section — the bridge is the exit — and because keeping
 * the page's single scroll *writer* visible at the top level is worth more than
 * the one file it costs. See `lib/story/snap.ts`.
 */
export function SectionSnap() {
  useEffect(() => {
    const controller = createSectionSnap();
    return () => controller.dispose();
  }, []);
  return null;
}
