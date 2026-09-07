'use client';

import { useSyncExternalStore } from 'react';
import { zoomModifierLabel } from './three/wheelZoom';

/**
 * The modifier key the zoom hints should name, resolved after mount.
 *
 * `attachWheelZoom` accepts `ctrl` and `⌘` interchangeably — see
 * `lib/three/wheelZoom.ts` — so this decides nothing about behaviour. It exists
 * because the *copy* has to be right: a hint that says "Ctrl + cuộn" is wrong on
 * every Mac and iPad in the room, and telling a teacher to press a key their
 * keyboard does not have in that position is the kind of small wrongness that
 * makes a control look broken.
 *
 * It cannot be a straight read. These stages are server rendered before they
 * hydrate, the server has no `navigator`, and a value that differs between the
 * two renders is a hydration mismatch — React would discard the tree rather than
 * the string.
 *
 * `useSyncExternalStore` is the tool for exactly this and not a workaround for
 * it: its third argument is a *server* snapshot, so React is told up front that
 * the first render is deliberately the fallback and re-renders past it once
 * hydration is done. It is also why this is not `useEffect` + `setState`, which
 * expresses the same thing as a cascading render and is what
 * `react-hooks/set-state-in-effect` exists to reject.
 *
 * The store never changes, so `subscribe` returns an unsubscribe and does
 * nothing else; `zoomModifierLabel` is pure and returns one of two literals, so
 * it satisfies the snapshot-stability contract by value.
 *
 * Four of the five hints that use this are behind a stage's `ready` state and
 * appear long after hydration, so nothing visibly changes; the bridge's is the
 * one that renders immediately, and on a Mac it settles within a frame.
 */
const subscribe = () => () => {};
const serverSnapshot = () => 'Ctrl';

export function useZoomModifier() {
  return useSyncExternalStore(subscribe, zoomModifierLabel, serverSnapshot);
}
