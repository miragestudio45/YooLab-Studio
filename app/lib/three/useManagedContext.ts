'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { registerManagedContext } from './contextRegistry';

/**
 * Puts one component's GPU work under the page's context budget.
 *
 * ## Why it returns a boolean instead of doing the work
 *
 * The tempting shape for this is a pair of `acquire` / `release` callbacks that
 * build and tear down a renderer. It is the wrong shape here, and the reason is
 * worth writing down: every surface this manages already has a complete, tested
 * setup-and-teardown pair — the body and the cleanup of its own `useEffect` —
 * and a second, parallel teardown path written by hand is a second thing that
 * can be wrong. `createLibraryStage` in particular hands its renderer out to six
 * consumers that call `setRenderTarget`, `setClearColor`, `capabilities` and
 * `setAnimationLoop` on it directly, and one of them passes it to a workshop
 * builder; swapping that renderer underneath them is not a safe operation.
 *
 * So this returns whether the surface is admitted, and the consumer's existing
 * effect gates on it:
 *
 * ```ts
 * const held = useManagedContext(hostRef, 'studio-car', 2);
 * useEffect(() => {
 *   if (!held) return;
 *   // ... the effect exactly as it was ...
 *   return () => { /* ... the cleanup exactly as it was ... *␘/ };
 * }, [held, ...]);
 * ```
 *
 * React then runs the real cleanup on release and the real setup on acquire.
 * There is no second code path to keep in sync, and nothing new to get wrong.
 *
 * ## The host element stays mounted
 *
 * The `ref` must point at an element that exists whether or not the surface is
 * held, because that element is what the registry measures the distance to — and
 * a surface that unmounted its own measuring stick could never be re-admitted.
 * That is also what keeps the layout stable: the box stays, only the canvas
 * inside it comes and goes, so nothing reflows and the section's own background
 * is what shows through in the meantime.
 *
 * ## It starts released
 *
 * Deliberately. Starting held would mean every managed surface on the page
 * builds a context during hydration and the ones that are three sections down
 * tear it straight back off — a burst of context creation and destruction at
 * exactly the moment the page is busiest. Starting released costs a surface that
 * is genuinely on screen one extra frame before it mounts.
 */
export function useManagedContext(
  ref: RefObject<HTMLElement | null>,
  label: string,
  priority: number,
  /** See `ManagedContext.releaseViewports` — scale this to rebuild cost. */
  releaseViewports?: number,
): boolean {
  const [held, setHeld] = useState(false);
  /* The registry asks synchronously, inside its own evaluation pass, so the
     answer cannot come from React state — that has not been committed yet. */
  const heldRef = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return registerManagedContext({
      element,
      label,
      priority,
      releaseViewports,
      isHeld: () => heldRef.current,
      acquire: () => { heldRef.current = true; setHeld(true); },
      release: () => { heldRef.current = false; setHeld(false); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, priority, releaseViewports]);

  return held;
}
