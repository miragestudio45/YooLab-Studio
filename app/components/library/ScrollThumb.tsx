'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * The Library's own scroll indicator, for a scroller whose native bar is hidden.
 *
 * ### Why the native bar could not be styled
 *
 * `library.css` used to ask for a 6 px bar the way most stylesheets do — set
 * `scrollbar-width: thin` and `scrollbar-color` for the standard engines, then
 * size `::-webkit-scrollbar` for the legacy ones, and let each take the rule it
 * understands. **Chromium takes neither.** It treats the two as mutually
 * exclusive: set either standard property to anything but `auto` and the entire
 * `::-webkit-scrollbar-*` block is discarded. So the 6 px was thrown away and
 * Chromium drew its own idea of "thin" instead — a ~12 px channel, hard against
 * the panel's inside edge, carrying a thumb as tall as the ratio demanded, which
 * on the asset rail is most of the panel. Two grey slabs down the inside of two
 * ivory cards, in the one section of this page that is judged as an application.
 *
 * `studio.css` had already learned this and written it down, and the editor's
 * answer was to hide the bar and draw nothing. That was right *there* — the
 * properties panel is a dense column and one more mark in it is a cost with no
 * benefit. It is wrong here, because these two scrollers are the section's whole
 * navigation: the rail holds twenty-four specimens and the knowledge panel is
 * three screens of reading. "There is more below" is information in the Library
 * and noise in the editor.
 *
 * ### What is drawn instead
 *
 * A 3 px thumb, inset from the edge, **length-capped**. The cap is the reason
 * this is not just a thinner native bar: a proportional thumb on a rail holding
 * twenty-four rows is a 400 px bar, and the length is telling the visitor
 * something they can already see by looking at the list. Capped, it stays a
 * position marker — which is the only thing anyone reads it for — and the panel
 * keeps its edge.
 *
 * It rests at a third opacity, comes fully up while the scroller is actually
 * moving, and settles back. A scrollbar that is always at full strength is a
 * frame around the content; one that only exists while you scroll cannot be
 * found when you want it.
 *
 * ### How it is driven
 *
 * Position and length go out as CSS custom properties on the thumb itself,
 * written straight from the scroll handler, so a 60 fps scroll costs no React
 * renders. That is the same technique the anatomy pins use in `ModelStage` and
 * for the same reason. Appearance stays in `library.css`; only the two
 * measurements are set here.
 */

/** Distance from the panel's top, bottom and right edges. */
const INSET = 5;
/** Length clamp. Below `MIN` the thumb reads as a dot; above `MAX` it reads as a rule. */
const MIN_LENGTH = 26;
const MAX_LENGTH = 74;
/** How long the thumb stays at full strength after the last scroll event. */
const SETTLE_MS = 720;

export function ScrollThumb({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLSpanElement>(null);
  /* Held in a ref so the render-time re-sync below can reach the *wired* copy
     without re-running the wiring effect and dropping the listeners. */
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const thumb = ref.current;
    const view = scroller.current;
    if (!thumb || !view) return;

    let settle: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const span = view.scrollHeight - view.clientHeight;
      /* Not "is there overflow" but "is there enough of it to be worth a mark".
         A one-pixel rounding overflow is not news. */
      if (span <= 3) {
        thumb.style.setProperty('--sb-shown', '0');
        return;
      }
      const rail = Math.max(view.clientHeight - INSET * 2, 0);
      const length = Math.min(
        Math.max(rail * (view.clientHeight / view.scrollHeight), MIN_LENGTH),
        Math.min(MAX_LENGTH, rail),
      );
      const offset = INSET + (rail - length) * (view.scrollTop / span);
      thumb.style.setProperty('--sb-length', `${length.toFixed(1)}px`);
      thumb.style.setProperty('--sb-offset', `${offset.toFixed(1)}px`);
      thumb.style.setProperty('--sb-shown', '1');
    };
    syncRef.current = sync;

    const onScroll = () => {
      sync();
      thumb.dataset.moving = 'true';
      clearTimeout(settle);
      settle = setTimeout(() => { delete thumb.dataset.moving; }, SETTLE_MS);
    };

    sync();
    view.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(view);

    return () => {
      syncRef.current = null;
      clearTimeout(settle);
      view.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [scroller]);

  /*
   * Re-measure after every render, with no dependency array on purpose.
   *
   * `ResizeObserver` watches the scroller's *box*, and the thing that actually
   * changes here is its `scrollHeight`: choosing another subject replaces all
   * twelve rows, choosing another specimen replaces three screens of knowledge
   * panel, and the box is the same size through both. Every one of those is a
   * React state change, so running on each commit catches all of them, and it is
   * cheaper and far more predictable than a subtree MutationObserver on a panel
   * whose pins rewrite custom properties every frame.
   */
  useEffect(() => { syncRef.current?.(); });

  return <span className="scroll-thumb" ref={ref} aria-hidden="true" />;
}
