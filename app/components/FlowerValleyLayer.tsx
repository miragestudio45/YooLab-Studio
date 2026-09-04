'use client';

import { useEffect, useRef } from 'react';
import { createFlowerValley, type FlowerValley } from '../lib/flowerValley/renderer';
import { prefersReducedMotion, usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';

type FlowerValleyLayerProps = {
  /**
   * The same continuous Explore panel position the bee's camera reads, 0 to 3.
   *
   * A ref, and deliberately the *same* ref rather than a copy: the valley's
   * travel, its fade and the creature choreography have to be one timeline or
   * they drift, and the only way to guarantee that is for both to read the number
   * `ExploreStory` writes on each scroll frame. There is no second scroll
   * controller here, no extra listener and no added page height.
   */
  progressRef: { current: number };
};

/**
 * The flower valley, as one canvas inside the existing hero stage.
 *
 * It sits between the bee's WebGL canvas (`z-index: -4`) and the hero grain
 * (`-2`), inside the `.explore-stage` sticky frame the bee already uses — so it
 * inherits that frame's size, its sticky behaviour and its `overflow: hidden`,
 * and it needs no scroll spacer of its own.
 *
 * Why one canvas above the bee rather than a layer behind it and a layer in
 * front: the bee's renderer is `alpha: false` and paints its own ivory backdrop
 * plate at `renderOrder: -50`, so nothing behind that canvas can ever be seen,
 * and making it transparent would mean rebuilding the backdrop the whole hero's
 * light is balanced against. The depth read is recovered instead by depth-gated
 * zone attenuation in the renderer: plants beyond the foreground plane lose their
 * alpha across the creature's head, thorax and abdomen — so the field reads as
 * being *behind* it — while foreground plants at the frame edges keep full alpha
 * and are free to cross a wing tip or a trailing leg. One canvas, one loop, and
 * the sandwich the brief asks for without a second full-frame composite.
 */
export function FlowerValleyLayer({ progressRef }: FlowerValleyLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const valleyRef = useRef<FlowerValley | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  /*
   * Mount once.
   *
   * `reduceMotion` used to be in this dep array, and because
   * `usePrefersReducedMotion` answers `true` on the server and the truth on the
   * client, hydration always changed it — so the valley was built, disposed and
   * built again, refetching `pool_summer.png` (243 KB) and re-slicing every
   * tile through `createImageBitmap` while the hero was still loading. The
   * second effect pushes the value in instead.
   *
   * The initial value is read from the query rather than taken from the hook,
   * so it is the truth at mount without becoming a dependency.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const valley = createFlowerValley(host, {
      progress: progressRef,
      reduceMotion: prefersReducedMotion(),
    });
    valleyRef.current = valley;
    return () => {
      valleyRef.current = null;
      valley.dispose();
    };
  }, [progressRef]);

  useEffect(() => {
    valleyRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  return <div className="flower-valley" ref={hostRef} aria-hidden="true" />;
}
