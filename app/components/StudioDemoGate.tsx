'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

/**
 * Holds YooStudio's code back until the visitor is heading for it.
 *
 * The editor is the third stop on the page and the single most expensive thing
 * on it to *download*: `StudioDemo` itself, plus `EditorIcons` — sixty-five
 * Figma exports, 136 KB of inline SVG. Because `page.tsx` rendered it directly,
 * that geometry shipped twice for a visitor still reading the hero: once
 * server-rendered into the document, and again in the hydration bundle. It was
 * the largest share of a 327 KB HTML response of which 227 KB was inline SVG.
 *
 * The runway is deliberately two viewports rather than the 1.6 that
 * `contextRegistry` uses for GPU contexts. That number was measured for a
 * canvas whose bytes are already cached; this gate is also paying for the
 * fetch, so it needs to start earlier. A visitor who jumps straight to
 * `#cong-cu` from the header still gets the editor's own loading line, which is
 * the same line the car shows while it decodes — not a new state.
 *
 * What this does NOT change: once mounted, `StudioDemo` owns its WebGL context
 * exactly as before, and `contextRegistry` still decides when to acquire and
 * release it. This gate only decides when the module arrives.
 */
const StudioDemo = lazy(() =>
  import('./StudioDemo').then((module) => ({ default: module.StudioDemo })));

const RUNWAY = '200% 0px';

export function StudioDemoGate() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    /* No IntersectionObserver means no runway to compute, and an editor that
       never arrives is worse than one that arrives early. Scheduled rather than
       set inline: a synchronous flip here would render twice in one commit, and
       this branch is not urgent — nothing is waiting on it but a browser that
       cannot observe anything. */
    if (!('IntersectionObserver' in window)) {
      const timer = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNear(true);
      observer.disconnect();
    }, { rootMargin: RUNWAY });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  if (!near) {
    /*
     * The sentinel carries the placeholder rather than sitting beside it, so
     * there is exactly one element in the grid cell before and after the swap.
     * `.tool-workspace` takes its height from `.tool-stage`'s grid, so nothing
     * here can move the page — this is a fill, not a reserved box.
     */
    return <div className="studio-gate" ref={sentinelRef} aria-hidden="true" />;
  }

  return (
    <Suspense fallback={<div className="studio-gate"><div className="studio-loader"><i />Đang mở không gian biên soạn…</div></div>}>
      <StudioDemo />
    </Suspense>
  );
}
