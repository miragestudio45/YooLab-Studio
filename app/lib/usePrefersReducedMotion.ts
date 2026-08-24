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

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
