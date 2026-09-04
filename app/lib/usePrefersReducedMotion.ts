'use client';

import { useSyncExternalStore } from 'react';

/**
 * `prefers-reduced-motion`, as a subscription rather than as an effect.
 *
 * Reading a media query in `useEffect` and calling `setState` from the body is
 * the pattern React 19's lint rule warns about, and it is warning about a real
 * cost: every component that did it rendered once with the wrong answer and
 * then re-rendered. `useSyncExternalStore` reads the query during render on the
 * client and subscribes for changes, so there is one render and one truth.
 *
 * The server snapshot is `true` — reduced. The server cannot know, and of the
 * two possible wrong answers, "do not animate yet" is the one that cannot
 * produce a burst of motion the visitor asked not to see.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The same answer, for code that is already past render.
 *
 * An effect that mounts a long-lived renderer needs the current value once, at
 * mount, and must not take it as a dependency — passing the hook's value in
 * would make hydration's `true` -> `false` correction a remount key, which is
 * exactly the bug that made `FlowerValleyLayer` fetch its atlas twice. Reading
 * the query here instead keeps one definition of the question.
 *
 * Client only: there is no media query to read on the server, and no effect
 * runs there to ask.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    prefersReducedMotion,
    () => true,
  );
}
